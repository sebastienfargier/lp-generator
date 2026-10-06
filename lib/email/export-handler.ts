import { z } from "zod"

import { safeParseEmailComposition } from "./composition"
import { prepareEmailRequest, resolveEmailFamilyDraft, visibleEmail } from "./edit-engine"
import { buildExportableEmailHtml, EmailExportError, exportFilename, resolveExportAssetsBase, validateExportHtml } from "./export-html"
import { EmailGenerateBodySchema, toEmailEngineRequest } from "./generate-handler"
import { EmailTemplateError, renderEmail } from "./renderer"

/**
 * Logique de `POST /api/export-email`, hors du fichier de route. Serveur
 * uniquement. Aucun appel de modèle : l'export est une transformation
 * déterministe d'un email déjà validé.
 *
 * Corps : { generation, draft }
 * - `generation` : le corps de la génération d'origine (même contrat que
 *   `/api/generate-email`) : il redonne au serveur la recette, la cible et les
 *   valeurs protégées (Promotion Facts, informations) ;
 * - `draft` : le Draft de la VERSION AFFICHÉE (génération, modification,
 *   annulation ou rétablissement : le navigateur envoie celui qu'il montre) ;
 * - `composition` : les opérations de structure et de visuel de cette version
 *   (V1.5), rejouées par le serveur sur l'email recomposé.
 *
 * Le serveur NE REÇOIT PAS de HTML et n'accepte aucune URL : il recompose
 * l'email avec les resolvers de la famille (EmailConfig validée, valeurs
 * contrôlées recalculées), le rend (`renderEmail`), puis le transforme
 * (`export-html.ts`) avec la base d'assets de SA configuration. Le client ne
 * peut donc ni ajouter du HTML, ni un lien, ni une image, ni modifier une
 * valeur protégée : un Draft falsifié est refusé comme à la génération.
 *
 * Le fichier est renvoyé dans un JSON { filename, html, placeholders,
 * warnings } ; le navigateur le télécharge. Rien n'est stocké.
 */

const maxBodyLength = 100_000

const EmailExportBodySchema = z.strictObject({
  generation: EmailGenerateBodySchema,
  draft: z.custom<Record<string, unknown>>((value) => typeof value === "object" && value !== null && !Array.isArray(value), "Le brouillon de l'email est requis."),
  /** Composition (V1.5) de la version affichée : revalidée et rejouée par le serveur. Absente : aucune. */
  composition: z.unknown().optional(),
})

export type EmailExportPublicErrorCode = "invalid-request" | "configuration" | "unresolvable" | "rendering" | "export-invalid" | "internal"

export type EmailExportPublicError = {
  status: "error"
  code: EmailExportPublicErrorCode
  title: string
  issues: { path: string; message: string }[]
}

/** Avertissements du fichier : codes stables, le navigateur les traduit. */
export type EmailExportWarning = "assets-local"

export type EmailExportSuccess = {
  status: "success"
  filename: string
  /** Document HTML complet de l'email. */
  html: string
  /** Jetons laissés à la plateforme d'envoi (désabonnement, préférences). */
  placeholders: string[]
  warnings: EmailExportWarning[]
}

export type EmailExportResponse = EmailExportSuccess | EmailExportPublicError

export type EmailExportHandlerOptions = {
  /** Environnement serveur (la base d'assets) ; par défaut `process.env`. Injecté par les tests. */
  env?: Readonly<Record<string, string | undefined>>
  /** Journal serveur des échecs : type seulement, jamais le contenu. */
  log?: (entry: { kind: string }) => void
}

type PublicMapping = { status: number; code: EmailExportPublicErrorCode; title: string; message: string }
const mapping = (status: number, code: EmailExportPublicErrorCode, message: string, title = "Export impossible"): PublicMapping => ({ status, code, title, message })

const invalidRequest = mapping(400, "invalid-request", "L'export est incomplet ou invalide.", "Export incomplet")
const unavailable = mapping(503, "configuration", "L'export HTML n'est pas disponible : l'origine publique des images n'est pas configurée. Contactez l'équipe.", "Service indisponible")
const unresolvable = mapping(422, "unresolvable", "L'email affiché ne peut pas être reconstruit : régénérez-le.")
const rendering = mapping(500, "rendering", "L'email n'a pas pu être préparé pour l'export.", "Rendu impossible")
const exportInvalid = mapping(500, "export-invalid", "Le fichier exporté n'a pas passé les contrôles : il n'est pas fourni.")
const internal = mapping(500, "internal", "L'export a rencontré une erreur interne. Réessayez plus tard.")

const headers = { "Cache-Control": "no-store" }

function fail(error: PublicMapping, issues: EmailExportPublicError["issues"] = []) {
  const body: EmailExportPublicError = { status: "error", code: error.code, title: error.title, issues: issues.length > 0 ? issues : [{ path: "export", message: error.message }] }
  return Response.json(body, { status: error.status, headers })
}

const defaultLog: NonNullable<EmailExportHandlerOptions["log"]> = (entry) => console.error("[email-export]", JSON.stringify(entry))

export async function handleEmailExport(request: Request, options: EmailExportHandlerOptions = {}): Promise<Response> {
  const env = options.env ?? process.env
  const log = options.log ?? defaultLog

  // 1. Le corps : borné, JSON, strict.
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > maxBodyLength) return fail(invalidRequest, [{ path: "(racine)", message: "Le corps est trop volumineux." }])
    body = JSON.parse(text)
  } catch {
    return fail(invalidRequest, [{ path: "(racine)", message: "Le corps doit être du JSON." }])
  }
  const parsed = EmailExportBodySchema.safeParse(body)
  if (!parsed.success) return fail(invalidRequest, parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "export", message: issue.message })))

  // 2. La base des assets : celle du serveur, jamais celle du client. Sans elle, pas de fichier.
  const assets = resolveExportAssetsBase(env)
  if (!assets.ok) {
    log({ kind: `assets-${assets.reason}` })
    return fail(unavailable)
  }

  // 3. L'email affiché, recomposé par le resolver de sa famille (valeurs contrôlées recalculées).
  const prepared = prepareEmailRequest(toEmailEngineRequest(parsed.data.generation))
  if ("error" in prepared) return fail(invalidRequest, (prepared.error.issues ?? []).map(({ path, message }) => ({ path, message })))
  const resolution = resolveEmailFamilyDraft(prepared.family, prepared.request, parsed.data.draft)
  if (resolution.status !== "resolved") {
    log({ kind: `resolution-${resolution.status}` })
    return fail(unresolvable)
  }

  // 3 bis. La composition de la version affichée (blocs ajoutés ou retirés, surface, image), rejouée sur l'email recomposé.
  const composition = safeParseEmailComposition(parsed.data.composition)
  if (!composition.success) return fail(invalidRequest, composition.error.issues.map((issue) => ({ path: `composition.${issue.path.join(".")}`, message: issue.message })))
  const visible = visibleEmail(prepared.family, prepared.request, resolution.config, composition.data)
  if (!visible.ok) {
    log({ kind: "composition" })
    return fail(unresolvable)
  }

  // 4. Rendu canonique → export → contrôles.
  try {
    const exported = buildExportableEmailHtml(renderEmail(visible.config), assets.base)
    const issues = validateExportHtml(exported.html, { assetsBase: assets.base, local: assets.local })
    if (issues.length > 0) {
      log({ kind: "export-invalid" })
      return fail(exportInvalid)
    }
    const success: EmailExportSuccess = {
      status: "success",
      filename: exportFilename(visible.config.name),
      html: exported.html,
      placeholders: exported.placeholders,
      warnings: assets.local ? ["assets-local"] : [],
    }
    return Response.json(success, { headers })
  } catch (error) {
    if (!(error instanceof EmailTemplateError || error instanceof EmailExportError)) {
      log({ kind: "unexpected" })
      return fail(internal)
    }
    log({ kind: error instanceof EmailExportError ? `export-${error.code}` : "renderer" })
    return fail(error instanceof EmailExportError ? exportInvalid : rendering)
  }
}
