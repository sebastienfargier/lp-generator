import { z } from "zod"

import type { EmailGenerationErrorKind } from "./anthropic"
import { generateEmailV2, type EmailV2EngineResult } from "./anthropic-v2"
import type { EmailGenerationSuccess } from "./generation"
import {
  emailFactsLimits,
  emailGeneratorIntentValues,
  emailGeneratorTargets,
  emailGeneratorTargetValues,
  type EmailGeneratorIntent,
} from "./generator-form"
import { checkPromotionRequest } from "./promotion-prompt"
import { PromotionFactsSchema, type EmailPromotionRequest } from "./promotion-facts"
import type { EmailRecipeRequest } from "./recipe-selection"
import { EmailPreviewError, toPreviewHtml } from "./preview"
import { EmailTemplateError, renderEmail } from "./renderer"

/**
 * Logique de `POST /api/generate-email`, hors du fichier de route (Next n'y
 * autorise que les exports de méthodes HTTP). Serveur uniquement.
 *
 * Corps du formulaire → validation → requête V2 (intention et cible
 * contrôlées) → UN appel au moteur Email V2 → rendu → réponse publique. Le
 * moteur choisit la recette de façon déterministe et n'appelle Claude qu'une
 * fois, avec le prompt et le schéma de cette recette. Pas de relance, et
 * surtout pas de repli : ni sur le moteur V1, ni sur le mode démo. Une erreur
 * du moteur est une erreur publique, jamais un faux succès. Le navigateur ne
 * reçoit que l'email rendu ou une erreur courte : sortie brute, brouillon,
 * recette, configuration résolue, prompt, contexte, provenance, tokens,
 * identifiant de requête et détails du SDK restent sur le serveur.
 *
 * Le moteur V1 (`anthropic.ts`, Draft, resolver) et le moteur déterministe de
 * démonstration restent importables et testés à part ; cette route ne les
 * utilise plus.
 *
 * La forme de la réponse est celle que le client lit déjà (`status`, `title`,
 * `issues`), avec un `code` stable en plus pour une erreur.
 */

/** Taille maximale du corps, en caractères : bien au-delà d'un brief valide. */
const maxBodyLength = 100_000

/**
 * Corps accepté par la route : ce que le formulaire envoie. Intention et cible
 * sont des identifiants fermés ; les informations sont des lignes de texte,
 * converties en faits `{ statement }`. L'objet est facultatif (vide, Claude le
 * propose ; rempli, il reste l'objet final). Rien d'autre n'est accepté : ni
 * promotion, ni offre, ni visuel, ni mention légale, ni recette.
 */
const required = (label: string) => z.string().trim().min(1, `${label} est requis.`)

export const EmailGenerateBodySchema = z
  .strictObject({
  campaignName: required("Le nom de campagne"),
  subject: z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  brief: required("Le brief"),
  intent: z.enum(emailGeneratorIntentValues, { error: "Intention inconnue." }),
  target: z.enum(emailGeneratorTargetValues, { error: "Cible inconnue." }),
  facts: z
    .array(z.string().trim().min(1, "Une information ne peut pas être vide.").max(emailFactsLimits.maxLength, `Une information tient en ${emailFactsLimits.maxLength} caractères au maximum.`))
    .max(emailFactsLimits.maxCount, `${emailFactsLimits.maxCount} informations au maximum.`)
    .optional(),
  /** Données de l'offre (Promotion Facts) : seulement avec l'intention « promotion ». Jamais générées. */
  promotion: PromotionFactsSchema.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.intent === "promotion") {
      if (!body.promotion) ctx.addIssue({ code: "custom", path: ["promotion"], message: "Une promotion exige les données de l'offre." })
      if (body.facts && body.facts.length > 0) ctx.addIssue({ code: "custom", path: ["facts"], message: "Une promotion ne reprend pas d'informations libres : les valeurs de l'offre viennent des données de l'offre." })
    } else if (body.promotion) {
      ctx.addIssue({ code: "custom", path: ["promotion"], message: "Les données d'offre ne s'utilisent qu'avec l'intention « promotion »." })
    }
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
  | "brand-violation"
  | "rendering"
  | "internal"

export type EmailPublicError = {
  status: "error"
  code: EmailPublicErrorCode
  title: string
  issues: { path: string; message: string }[]
}

export type EmailGenerateResponse = EmailGenerationSuccess | EmailPublicError

/** Moteur Email V2 : requête de recette → email résolu ou erreur. */
export type EmailEngine = (request: EmailRecipeRequest | EmailPromotionRequest) => Promise<EmailV2EngineResult>

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
const brandViolation = mapping(422, "brand-violation", "L'email généré ne respecte pas une règle de marque. Réessayez.")
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
  "brand-violation": brandViolation,
  unexpected: internal,
}

/**
 * Intention de l'interface → champs de la requête V2. Déterministe : la
 * recette se déduit ensuite de ces champs (`selectEmailRecipe`), jamais du
 * texte du brief. « Accompagnement » et « orientation » mènent à la même
 * famille d'email, avec un angle différent.
 */
const intentRequests: Record<Exclude<EmailGeneratorIntent, "promotion">, Partial<EmailRecipeRequest>> = {
  orientation: { intent: "discovery", objective: "decouverte-formations" },
  accompagnement: { intent: "discovery", objective: "accompagnement" },
  newsletter: { intent: "editorial", emailType: "newsletter" },
  preuves: { intent: "brand-proof" },
}

/** Corps validé → requête V2 : la cible contrôlée est transmise telle quelle, son libellé tient lieu d'audience. */
export function toEmailRecipeRequest(body: z.output<typeof EmailGenerateBodySchema>): EmailRecipeRequest {
  const target = emailGeneratorTargets.find((entry) => entry.value === body.target)!
  return {
    campaignName: body.campaignName,
    ...(body.subject ? { subject: body.subject } : {}),
    brief: body.brief,
    audience: target.label,
    target: target.value,
    ...intentRequests[body.intent as Exclude<EmailGeneratorIntent, "promotion">],
    ...(body.facts && body.facts.length > 0 ? { facts: body.facts.map((statement) => ({ statement })) } : {}),
  }
}

/**
 * Corps validé → requête du moteur : une promotion suit son propre contrat
 * (Promotion Facts) ; le brief reste du texte, l'offre reste des données.
 */
export function toEmailEngineRequest(body: z.output<typeof EmailGenerateBodySchema>): EmailRecipeRequest | EmailPromotionRequest {
  if (body.intent !== "promotion") return toEmailRecipeRequest(body)
  const target = emailGeneratorTargets.find((entry) => entry.value === body.target)!
  return {
    campaignName: body.campaignName,
    ...(body.subject ? { subject: body.subject } : {}),
    brief: body.brief,
    audience: target.label,
    target: target.value,
    intent: "promotion",
    promotion: body.promotion!,
  }
}

const headers = { "Cache-Control": "no-store" }

function fail(error: PublicMapping, issues: EmailPublicError["issues"] = []) {
  const body: EmailPublicError = { status: "error", code: error.code, title: error.title, issues: issues.length > 0 ? issues : [{ path: "génération", message: error.message }] }
  return Response.json(body, { status: error.status, headers })
}

const defaultLog: NonNullable<EmailHandlerOptions["log"]> = (entry) => console.error("[email-generation]", JSON.stringify(entry))

export async function handleEmailGeneration(request: Request, options: EmailHandlerOptions = {}): Promise<Response> {
  const engine = options.engine ?? ((input: EmailRecipeRequest | EmailPromotionRequest) => generateEmailV2(input))
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

  // 3. Un seul appel au moteur V2 ; la recette est choisie par le moteur, avant l'appel.
  const engineRequest = toEmailEngineRequest(brief.data)
  // Promotion : valeurs, date et texte libre se vérifient AVANT tout appel (deux vérités possibles, date passée, objet qui presse).
  if (brief.data.intent === "promotion") {
    const check = checkPromotionRequest(engineRequest)
    if (check.status === "invalid") return fail(invalidRequest, check.issues)
  }
  let result: EmailV2EngineResult
  try {
    result = await engine(engineRequest)
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

  // 4. Le rendu réel du moteur Email : l'EmailConfig est déjà validé.
  try {
    const html = renderEmail(result.config)
    const success: EmailGenerationSuccess = {
      status: "success",
      subject: result.config.subject,
      preheader: result.config.preheader,
      blockCount: result.config.blocks.length,
      html,
      previewHtml: toPreviewHtml(html),
      ...(result.draft !== undefined ? { draft: result.draft } : {}),
    }
    return Response.json(success, { headers })
  } catch (error) {
    if (!(error instanceof EmailTemplateError || error instanceof EmailPreviewError)) throw error
    log({ kind: error instanceof EmailPreviewError ? "preview" : "renderer" })
    return fail(rendering)
  }
}
