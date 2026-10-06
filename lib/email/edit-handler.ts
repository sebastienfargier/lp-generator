import { z } from "zod"

import type { EmailGenerationSuccess } from "./generation"
import { editEmailV2, type EmailEditInput, type EmailEditResult } from "./edit-engine"
import { emailPublicErrors, EmailGenerateBodySchema, toEmailEngineRequest, type EmailPublicErrorCode } from "./generate-handler"
import { EmailPreviewError, toPreviewHtml } from "./preview"
import { EmailTemplateError, renderEmail } from "./renderer"

/**
 * Logique de `POST /api/edit-email`, hors du fichier de route. Serveur
 * uniquement. Endpoint séparé de `/api/generate-email` : il ne génère pas, il
 * MODIFIE l'email courant.
 *
 * Corps : { instruction, generation, draft }
 * - `instruction` : la demande de modification, en texte libre ;
 * - `generation` : le corps qui a servi à générer (même contrat que
 *   `/api/generate-email`) : il redonne au serveur la recette, la cible, les
 *   Promotion Facts, les informations : toutes les valeurs protégées ;
 * - `draft` : le Draft éditable de la version courante, tel que la génération
 *   l'a renvoyé (textes éditoriaux seulement). NON FIABLE : revalidé,
 *   recomposé par le resolver de la famille, puis comparé avant / après.
 *
 * Le serveur ne garde rien : pas de session, pas de base. Le navigateur tient
 * l'historique ; chaque édition recompose l'email depuis la demande et le Draft.
 *
 * Un seul appel de modèle par édition, jamais de relance, jamais de repli. Une
 * erreur ne change rien : le navigateur garde sa dernière version valide. Le
 * navigateur ne reçoit que l'email rendu, son Draft éditable, un résumé et les
 * champs modifiés : ni prompt, ni contexte, ni sortie brute, ni EmailConfig,
 * ni jetons, ni identifiant de requête.
 */

/** Taille maximale du corps, en caractères : bien au-delà d'un email et d'une instruction valides. */
const maxBodyLength = 100_000

const EmailEditBodySchema = z.strictObject({
  instruction: z.string({ error: "L'instruction est requise." }),
  generation: EmailGenerateBodySchema,
  draft: z.custom<Record<string, unknown>>((value) => typeof value === "object" && value !== null && !Array.isArray(value), "Le brouillon de l'email est requis."),
})

export type EmailEditPublicErrorCode = EmailPublicErrorCode | "edit-refused" | "protected-mutation" | "no-change"

export type EmailEditPublicError = {
  status: "error"
  code: EmailEditPublicErrorCode
  title: string
  issues: { path: string; message: string }[]
}

export type EmailEditSuccess = EmailGenerationSuccess & {
  /** Draft éditable de la nouvelle version. */
  draft: unknown
  /** Une phrase : ce qui a changé. */
  summary: string
  /** Champs de texte modifiés (chemins du Draft). */
  changed: string[]
}

export type EmailEditResponse = EmailEditSuccess | EmailEditPublicError

export type EmailEditHandlerOptions = {
  /** Moteur d'édition ; par défaut Claude. Injecté par les tests. */
  engine?: (input: EmailEditInput) => Promise<EmailEditResult>
  /** Journal serveur des échecs : type, statut et identifiant de requête, jamais le contenu. */
  log?: (entry: { kind: string; status?: number; requestId?: string }) => void
}

type PublicMapping = { status: number; code: EmailEditPublicCode; title: string; message: string }
type EmailEditPublicCode = EmailEditPublicErrorCode

const mapping = (status: number, code: EmailEditPublicCode, message: string, title = "Modification impossible"): PublicMapping => ({ status, code, title, message })

const invalidRequest = mapping(400, "invalid-request", "La modification est incomplète ou invalide.", "Modification incomplète")
const internal = mapping(500, "internal", "La modification a rencontré une erreur interne. Réessayez plus tard.")
const rendering = mapping(500, "rendering", "L'email modifié n'a pas pu être affiché. Votre version précédente est conservée.", "Rendu impossible")
const protectedMutation = mapping(422, "protected-mutation", "La modification touche des éléments protégés (valeur, code, date, lien, image, mention légale ou preuve) : l'email est resté tel quel.")
const noChange = mapping(422, "no-change", "Aucune modification n'a été proposée : l'email est resté tel quel.", "Aucun changement")

const headers = { "Cache-Control": "no-store" }

function fail(error: PublicMapping, issues: EmailEditPublicError["issues"] = []) {
  const body: EmailEditPublicError = { status: "error", code: error.code, title: error.title, issues: issues.length > 0 ? issues : [{ path: "modification", message: error.message }] }
  return Response.json(body, { status: error.status, headers })
}

const defaultLog: NonNullable<EmailEditHandlerOptions["log"]> = (entry) => console.error("[email-edit]", JSON.stringify(entry))

export async function handleEmailEdit(request: Request, options: EmailEditHandlerOptions = {}): Promise<Response> {
  const engine = options.engine ?? ((input: EmailEditInput) => editEmailV2(input))
  const log = options.log ?? defaultLog

  // 1. Le corps : borné, JSON.
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > maxBodyLength) return fail(invalidRequest, [{ path: "(racine)", message: "Le corps est trop volumineux." }])
    body = JSON.parse(text)
  } catch {
    return fail(invalidRequest, [{ path: "(racine)", message: "Le corps doit être du JSON." }])
  }
  const parsed = EmailEditBodySchema.safeParse(body)
  if (!parsed.success) {
    return fail(invalidRequest, parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "modification", message: issue.message })))
  }

  // 2. Un seul appel au moteur d'édition ; les refus évidents partent avant tout appel de modèle.
  let result: EmailEditResult
  try {
    result = await engine({ request: toEmailEngineRequest(parsed.data.generation), draft: parsed.data.draft, instruction: parsed.data.instruction })
  } catch {
    log({ kind: "engine-threw" })
    return fail(internal)
  }

  if (result.status === "error") {
    const { kind, status, requestId, reason } = result.error
    log({ kind, ...(status ? { status } : {}), ...(requestId ? { requestId } : {}) })
    // Aucun détail du moteur ne sort : ni issues, ni sortie brute, ni message du SDK ; seul le motif d'un refus avant appel est pour l'utilisateur.
    if (kind === "edit-refused") return fail(mapping(422, "edit-refused", reason ?? "Cette modification n'est pas possible.", "Modification refusée"), [{ path: "instruction", message: reason ?? "Cette modification n'est pas possible." }])
    if (kind === "protected-mutation") return fail(protectedMutation)
    if (kind === "no-change") return fail(noChange)
    const known = emailPublicErrors[kind as keyof typeof emailPublicErrors] ?? internal
    return fail({ ...known, title: known.title === "Génération impossible" ? "Modification impossible" : known.title })
  }

  // 3. Le rendu réel du moteur Email : l'EmailConfig est déjà validé.
  try {
    const html = renderEmail(result.config)
    const success: EmailEditSuccess = {
      status: "success",
      subject: result.config.subject,
      preheader: result.config.preheader,
      blockCount: result.config.blocks.length,
      html,
      previewHtml: toPreviewHtml(html),
      draft: result.draft,
      summary: result.summary,
      changed: result.changed,
    }
    return Response.json(success, { headers })
  } catch (error) {
    if (!(error instanceof EmailTemplateError || error instanceof EmailPreviewError)) throw error
    log({ kind: error instanceof EmailPreviewError ? "preview" : "renderer" })
    return fail(rendering)
  }
}
