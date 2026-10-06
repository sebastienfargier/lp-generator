import { createClient, EMAIL_MAX_TOKENS, failure, mapApiError, readStructuredOutput, resolveEmailModel, type CreateParams, type EmailClaudeDependencies, type EmailClaudeUsage, type EmailEngineError, type EmailEngineIssue } from "./anthropic"
import { isEmailPromotionInput } from "./promotion-facts"
import { buildPromotionPrompt } from "./promotion-prompt"
import { resolvePromotionDraft } from "./promotion-resolver"
import { resolveEmailRecipeDraft, type EmailRecipeDraftResolution } from "./recipe-drafts"
import { buildEmailRecipePrompt } from "./recipe-prompts"
import type { PromotionDraftResolution } from "./promotion-resolver"
import type { EmailRecipeDiagnostic } from "./recipe-validation"
import type { EmailRecipeId } from "./recipes"
import type { EmailConfig } from "./types"

/**
 * Moteur Email V2 : serveur uniquement.
 *
 * requête → validation → recette (déterministe) → contexte Brand → prompt et
 * schéma de CETTE recette → UN appel `messages.create` → JSON → Draft de la
 * recette → resolver → EmailConfig (Zod) → validation de recette (claims,
 * chiffres, boutons, zone colorée, images) → diagnostics de terminologie →
 * politique de blocage → EmailConfig. Le rendu (`renderEmail`) et l'aperçu
 * sont faits par l'appelant.
 *
 * Un seul appel, aucune relance : ni ici, ni dans le SDK (`maxRetries: 0`,
 * délai d'attente de `anthropic.ts`). Pas de repli : une demande routée V2
 * réussit en V2 ou échoue avec une erreur explicite ; le moteur V1
 * (`anthropic.ts` : `generateEmailWithClaude`) n'est jamais appelé ici après un
 * échec. Seul le schéma de la recette choisie est envoyé : jamais d'union des
 * trois.
 *
 * La configuration (clé, modèle, délai, client, correspondance des erreurs du
 * fournisseur, lecture de la réponse) est celle de `anthropic.ts`, partagée et
 * non recopiée. La clé n'apparaît ni dans les résultats, ni dans les erreurs,
 * ni dans les journaux ; le prompt, le contexte Brand, le Draft, la
 * provenance et la réponse brute restent sur le serveur.
 *
 * Politique de terminologie : une erreur issue d'une règle APPROUVÉE bloque
 * (`brand-violation`) ; tout le reste (conflit connu, brouillon, avertissement,
 * erreur d'une règle en revue) n'est qu'un diagnostic. Aucune règle actuelle
 * n'est approuvée : rien ne bloque aujourd'hui. Aucune correction automatique.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */

export type EmailV2EngineResult =
  | {
      status: "success"
      config: EmailConfig
      /** Recette utilisée : serveur uniquement, jamais renvoyée au navigateur. */
      recipe: EmailRecipeId | "promotion"
      diagnostics: EmailRecipeDiagnostic[]
      model: string
      stopReason: string
      usage?: EmailClaudeUsage
      requestId?: string
    }
  | { status: "error"; error: EmailEngineError }

type Meta = { usage?: EmailClaudeUsage; requestId?: string }

const toIssues = (issues: readonly { path: string; message: string }[]): EmailEngineIssue[] => issues.map(({ path, message }) => ({ path, message }))

/** Résolution hors ligne → erreur du moteur, sans contenu de remplacement. */
function resolutionFailure(resolution: Exclude<EmailRecipeDraftResolution | PromotionDraftResolution, { status: "resolved" }>, meta: Meta, output: string): EmailV2EngineResult {
  switch (resolution.status) {
    case "invalid-draft":
      return failure({ ...meta, kind: "invalid-draft", message: "Le brouillon généré ne respecte pas le contrat de la recette.", issues: toIssues(resolution.issues), output })
    case "invalid-composition":
      return failure({ ...meta, kind: "draft-resolution", message: "Le brouillon ne peut pas être résolu.", issues: toIssues(resolution.issues), output })
    case "invalid-config":
      return failure({ ...meta, kind: "invalid-config", message: "L'email résolu est refusé par le contrat EmailConfig.", issues: toIssues(resolution.issues), output })
    case "invalid-recipe":
      return failure({ ...meta, kind: "validation-failed", message: "L'email résolu est refusé par la validation de la recette.", issues: toIssues(resolution.issues), output })
  }
}

/**
 * Politique de blocage : seules les erreurs de règles APPROUVÉES invalident la
 * génération. Pure, testée à part (aucune règle actuelle n'est approuvée).
 */
export function brandPolicyFailure(policy: { blocking: readonly EmailRecipeDiagnostic[] }, meta: Meta, output: string): EmailV2EngineResult | undefined {
  if (policy.blocking.length === 0) return undefined
  return failure({
    ...meta,
    kind: "brand-violation",
    message: "L'email résolu enfreint une règle de marque approuvée.",
    issues: policy.blocking.map((diagnostic) => ({ path: diagnostic.path, message: diagnostic.label })),
    output,
  })
}

/**
 * Génère un email V2 à partir d'une requête (`unknown` : validée ici). Une
 * demande invalide ou non prise en charge n'appelle jamais Anthropic. Ne lève
 * pas : renvoie un résultat.
 */
export async function generateEmailV2(request: unknown, dependencies: EmailClaudeDependencies = {}): Promise<EmailV2EngineResult> {
  // Une promotion suit son propre contrat (Promotion Facts) : demande, prompt, schéma et resolver distincts.
  const prompt = isEmailPromotionInput(request) ? buildPromotionPrompt(request) : buildEmailRecipePrompt(request)
  if (prompt.status === "invalid-request") return failure({ kind: "invalid-request", message: "La demande est invalide.", issues: toIssues(prompt.issues) })
  if (prompt.status === "unsupported") return failure({ kind: "unsupported", message: prompt.issues.map((issue) => issue.message).join(" ") })

  const env = dependencies.env ?? process.env
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  const secrets = apiKey ? [apiKey] : []

  let client = dependencies.client
  if (!client) {
    if (!apiKey) return failure({ kind: "missing-api-key", message: "ANTHROPIC_API_KEY est absente : ajoutez-la côté serveur (.env.local)." })
    try {
      client = createClient(apiKey)
    } catch (error) {
      return failure(mapApiError(error, secrets))
    }
  }

  const model = resolveEmailModel(env)
  // Messages API + Structured Outputs, avec le SEUL schéma de la recette. Ni température, ni tools, ni streaming.
  const params: CreateParams = {
    model,
    max_tokens: EMAIL_MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    output_config: { format: { type: "json_schema", schema: prompt.transportSchema } },
  }

  let response
  try {
    response = await client.messages.create(params)
  } catch (error) {
    return failure(mapApiError(error, secrets))
  }

  const read = readStructuredOutput(response)
  if (!read.ok) return read.failure

  const resolution = prompt.recipe === "promotion" ? resolvePromotionDraft(prompt.request, read.output) : resolveEmailRecipeDraft(prompt.request, prompt.recipe, read.output)
  if (resolution.status !== "resolved") return resolutionFailure(resolution, read.meta, read.text)

  // Seule une erreur d'une règle approuvée bloque ; le reste est un diagnostic.
  const blocked = brandPolicyFailure(resolution.policy, read.meta, read.text)
  if (blocked) return blocked
  return {
    status: "success",
    config: resolution.config,
    recipe: prompt.recipe,
    diagnostics: resolution.diagnostics,
    model: response.model || model,
    stopReason: "end_turn",
    ...read.meta,
  }
}
