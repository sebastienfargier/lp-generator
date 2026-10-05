import { z } from "zod"

import { generateEmailWithClaude, type EmailEngineResult, type EmailGenerationErrorKind } from "./anthropic"
import { emailDemoObjectives, emailDemoVisuals } from "./demo-generator"
import type { EmailGenerationSuccess } from "./generation"
import { emailFactsLimits } from "./generator-form"
import type { EmailGenerationRequest } from "./generation-request"
import { EmailPreviewError, toPreviewHtml } from "./preview"
import { EmailTemplateError, renderEmail } from "./renderer"

/**
 * Logique de `POST /api/generate-email`, hors du fichier de route (Next n'y
 * autorise que les exports de méthodes HTTP). Serveur uniquement.
 *
 * Corps du formulaire → validation → refus des demandes que la V1 ne génère
 * pas → UN appel au moteur Claude → rendu → réponse publique. Pas de relance,
 * et surtout pas de repli sur le mode démo : une erreur du moteur est une
 * erreur publique, jamais un faux succès déterministe. Le navigateur ne reçoit
 * que l'email rendu ou une erreur courte : sortie brute, brouillon,
 * configuration résolue, tokens, identifiant de requête et détails du SDK
 * restent sur le serveur.
 *
 * Le moteur déterministe (`demo-generator.ts`, `generation.ts`) reste
 * importable et testé à part ; cette route ne l'utilise plus.
 *
 * La forme de la réponse est celle que le client lit déjà (`status`, `title`,
 * `issues`), avec un `code` stable en plus pour une erreur.
 */

/** Taille maximale du corps, en caractères : bien au-delà d'un brief valide. */
const maxBodyLength = 100_000

/**
 * Corps accepté par la route. L'objet est facultatif (vide, Claude le propose ;
 * rempli, il reste l'objet final) ; les informations à reprendre sont des
 * lignes de texte, converties en faits `{ statement }` du contrat existant.
 * Aucun disclaimer ne se choisit ici. `promotion` et `visual` (jeu d'essai)
 * restent acceptés par le schéma pour être refusés explicitement plus bas,
 * jamais traités : l'interface ne les propose plus, le serveur les refuse.
 */
const required = (label: string) => z.string().trim().min(1, `${label} est requis.`)

const EmailGenerateBodySchema = z.strictObject({
  campaignName: required("Le nom de campagne"),
  subject: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  brief: required("Le brief"),
  audience: required("L'audience"),
  objective: z.enum(emailDemoObjectives.map((objective) => objective.value) as [string, ...string[]], { error: "Objectif inconnu." }),
  visual: z.enum(emailDemoVisuals, { error: "Campagne visuelle inconnue." }).optional(),
  facts: z
    .array(z.string().trim().min(1, "Une information ne peut pas être vide.").max(emailFactsLimits.maxLength, `Une information tient en ${emailFactsLimits.maxLength} caractères au maximum.`))
    .max(emailFactsLimits.maxCount, `${emailFactsLimits.maxCount} informations au maximum.`)
    .optional(),
})

export type EmailPublicErrorCode =
  | "invalid-request"
  | "unsupported"
  | "configuration"
  | "rate-limit"
  | "provider-error"
  | "timeout"
  | "refused"
  | "invalid-output"
  | "invalid-draft"
  | "unresolvable"
  | "invalid-email"
  | "validation-failed"
  | "rendering"
  | "internal"

export type EmailPublicError = {
  status: "error"
  code: EmailPublicErrorCode
  title: string
  issues: { path: string; message: string }[]
}

export type EmailGenerateResponse = EmailGenerationSuccess | EmailPublicError

export type EmailEngine = (request: EmailGenerationRequest) => Promise<EmailEngineResult>

export type EmailHandlerOptions = {
  /** Moteur de génération ; par défaut Claude. Injecté par les tests. */
  engine?: EmailEngine
  /** Journal serveur des échecs : type, statut et identifiant de requête, jamais le contenu. */
  log?: (entry: { kind: string; status?: number; requestId?: string }) => void
}

type PublicMapping = { status: number; code: EmailPublicErrorCode; title: string; message: string }

const failed = "Génération impossible"
const mapping = (status: number, code: EmailPublicErrorCode, message: string, title = failed): PublicMapping => ({ status, code, title, message })

const invalidRequest = mapping(400, "invalid-request", "Le brief est incomplet ou invalide : vérifiez les informations du formulaire.", "Brief incomplet")
const unsupported = mapping(422, "unsupported", "Cette demande n'est pas encore prise en charge par la génération.", "Demande non prise en charge")
const configuration = mapping(500, "configuration", "Le service de génération n'est pas configuré. Contactez l'équipe.")
const providerError = mapping(502, "provider-error", "Le service de génération est temporairement indisponible. Réessayez dans un instant.")
const internal = mapping(500, "internal", "La génération a rencontré une erreur interne. Réessayez plus tard.")
const rendering = mapping(500, "rendering", "L'email généré n'a pas pu être affiché. Réessayez.", "Rendu impossible")

/**
 * Erreur du moteur → erreur publique. Le `Record` est exhaustif : un nouveau
 * type d'erreur du moteur ne compile pas tant qu'on n'a pas décidé de ce que
 * voit le navigateur.
 */
export const emailPublicErrors: Record<EmailGenerationErrorKind, PublicMapping> = {
  "invalid-request": invalidRequest,
  unsupported,
  "missing-api-key": configuration,
  authentication: configuration,
  "rate-limit": mapping(429, "rate-limit", "Trop de demandes pour le moment. Réessayez dans un instant."),
  rejected: providerError,
  server: { ...providerError, status: 503 },
  "api-error": providerError,
  network: mapping(502, "provider-error", "La génération a été interrompue. Réessayez."),
  timeout: mapping(504, "timeout", "La génération a pris trop de temps et a été interrompue. Réessayez."),
  refusal: mapping(422, "refused", "La demande n'a pas pu être traitée. Reformulez votre brief."),
  truncated: mapping(422, "invalid-output", "La réponse générée est incomplète. Réessayez."),
  interrupted: mapping(422, "invalid-output", "La réponse générée est incomplète. Réessayez."),
  "empty-output": mapping(422, "invalid-output", "La réponse générée est incomplète. Réessayez."),
  "invalid-json": mapping(422, "invalid-output", "La réponse générée est incomplète. Réessayez."),
  "invalid-draft": mapping(422, "invalid-draft", "Le contenu généré ne respecte pas le format attendu. Réessayez."),
  "draft-resolution": mapping(422, "unresolvable", "Le contenu généré n'a pas pu être assemblé en email. Réessayez."),
  "invalid-config": mapping(422, "invalid-email", "L'email généré est invalide. Réessayez."),
  "validation-failed": mapping(422, "validation-failed", "L'email généré ne respecte pas les règles de contenu. Réessayez."),
  unexpected: internal,
}

/** Corps validé → requête du contrat existant : l'objet seulement s'il est rempli, les informations en `{ statement }`. */
function toGenerationRequest(body: z.output<typeof EmailGenerateBodySchema>): EmailGenerationRequest {
  return {
    campaignName: body.campaignName,
    ...(body.subject ? { subject: body.subject } : {}),
    brief: body.brief,
    audience: body.audience,
    // Promotion est refusée avant : seuls les trois objectifs du contrat arrivent ici.
    objective: body.objective as EmailGenerationRequest["objective"],
    ...(body.facts && body.facts.length > 0 ? { facts: body.facts.map((statement) => ({ statement })) } : {}),
  }
}

const headers = { "Cache-Control": "no-store" }

function fail(error: PublicMapping, issues: EmailPublicError["issues"] = []) {
  const body: EmailPublicError = { status: "error", code: error.code, title: error.title, issues: issues.length > 0 ? issues : [{ path: "génération", message: error.message }] }
  return Response.json(body, { status: error.status, headers })
}

const defaultLog: NonNullable<EmailHandlerOptions["log"]> = (entry) => console.error("[email-generation]", JSON.stringify(entry))

export async function handleEmailGeneration(request: Request, options: EmailHandlerOptions = {}): Promise<Response> {
  const engine = options.engine ?? ((input: EmailGenerationRequest) => generateEmailWithClaude(input))
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

  // 2. Le brief du formulaire : le serveur reste l'autorité, aucun appel s'il est invalide.
  const brief = EmailGenerateBodySchema.safeParse(body)
  if (!brief.success) {
    return fail(invalidRequest, brief.error.issues.map((issue) => ({ path: issue.path.join(".") || "brief", message: issue.message })))
  }

  // 3. Hors périmètre de la V1 : refusé ici, jamais fabriqué ni ignoré en silence.
  if (brief.data.objective === "promotion") {
    return fail(unsupported, [{ path: "objective", message: "Les emails promotionnels ne sont pas encore générés par l'IA : ils exigent une offre validée." }])
  }
  if (brief.data.visual) {
    return fail(unsupported, [{ path: "visual", message: "Les campagnes visuelles de démonstration ne sont pas générées par l'IA." }])
  }

  // 4. Un seul appel au moteur.
  let result: EmailEngineResult
  try {
    result = await engine(toGenerationRequest(brief.data))
  } catch {
    log({ kind: "engine-threw" })
    return fail(internal)
  }

  if (result.status === "error") {
    const { kind, status, requestId } = result.error
    log({ kind, ...(status ? { status } : {}), ...(requestId ? { requestId } : {}) })
    // Aucun détail du moteur ne sort : ni issues, ni sortie brute, ni message du SDK.
    return fail(emailPublicErrors[kind] ?? internal)
  }

  // 5. Le rendu réel du moteur Email : l'EmailConfig est déjà validé.
  try {
    const html = renderEmail(result.config)
    const success: EmailGenerationSuccess = {
      status: "success",
      subject: result.config.subject,
      preheader: result.config.preheader,
      blockCount: result.config.blocks.length,
      html,
      previewHtml: toPreviewHtml(html),
    }
    return Response.json(success, { headers })
  } catch (error) {
    if (!(error instanceof EmailTemplateError || error instanceof EmailPreviewError)) throw error
    log({ kind: error instanceof EmailPreviewError ? "preview" : "renderer" })
    return fail(rendering)
  }
}
