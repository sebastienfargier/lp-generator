import Anthropic from "@anthropic-ai/sdk"

import { buildLandingAiPrompt, type LandingAiPrompt } from "./ai-prompt"
import { toAnthropicJsonSchema } from "./anthropic-schema"
import { resolveLandingDraft } from "./draft-resolver"
import { safeParseLandingGenerationDraft, type LandingGenerationDraft } from "./generation-draft"
import { validateGeneratedLanding, type LandingValidationIssue } from "./generation-validation"
import type { LandingPageConfig } from "./types"

/**
 * Génération d'une landing page par Claude : serveur uniquement.
 *
 * LandingGenerationRequest → buildLandingAiPrompt → schéma Draft adapté →
 * Messages API (Structured Outputs) → JSON → LandingGenerationDraftSchema →
 * resolveLandingDraft → validateGeneratedLanding → LandingPageConfig.
 *
 * Deux validations distinctes : celle du brouillon (ce que Claude a produit),
 * puis celle de la configuration finale (ce que l'application accepte). Le JSON
 * de Claude n'est jamais pris pour une LandingPageConfig.
 *
 * Un seul appel, aucune relance : ni ici, ni dans le SDK (`maxRetries: 0`).
 * La réponse est refusée telle quelle si elle échoue à une validation ; une
 * stratégie de réparation viendra après observation des résultats réels.
 *
 * Secret : seule `ANTHROPIC_API_KEY` est lue, côté serveur. Elle n'apparaît
 * ni dans les résultats, ni dans les erreurs, ni dans les journaux. Les
 * résultats ne contiennent pas le prompt système.
 *
 * Ne jamais importer ce module depuis un composant client.
 */

/** Seul endroit où l'identifiant du modèle est défini (Claude Sonnet 5.5, GA, Structured Outputs). */
export const DEFAULT_LANDING_MODEL = "claude-sonnet-5-5"

/**
 * Plafond de sortie : une page complète fait quelques milliers de tokens de
 * JSON, auxquels s'ajoute la réflexion adaptative (comptée dans la limite).
 * 16 000 laisse de la marge sans dépasser ce que le SDK accepte hors
 * streaming, et sans autoriser une réponse de plusieurs minutes.
 */
export const LANDING_MAX_TOKENS = 16000

/** Délai d'attente d'une réponse, en millisecondes. */
export const LANDING_REQUEST_TIMEOUT_MS = 180_000

type Env = Readonly<Record<string, string | undefined>>

/** Modèle configuré côté serveur (`ANTHROPIC_MODEL`), sinon celui par défaut. */
export function resolveLandingModel(env: Env = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_LANDING_MODEL
}

/* -------------------------------------------------------------------------- */
/* Résultats                                                                  */
/* -------------------------------------------------------------------------- */

export type LandingClaudeUsage = {
  inputTokens: number
  outputTokens: number
  /** Part de `outputTokens` consacrée à la réflexion, si l'API la donne. */
  thinkingTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
}

export type LandingGenerationErrorKind =
  | "invalid-request"
  | "impossible"
  | "missing-api-key"
  | "authentication"
  | "rate-limit"
  | "rejected"
  | "server"
  | "timeout"
  | "network"
  | "api-error"
  | "refusal"
  | "truncated"
  | "interrupted"
  | "empty-output"
  | "invalid-json"
  | "invalid-draft"
  | "draft-resolution"
  | "invalid-landing"
  | "unexpected"

export type LandingGenerationError = {
  kind: LandingGenerationErrorKind
  message: string
  issues?: LandingValidationIssue[]
  /** Statut HTTP renvoyé par Anthropic, s'il y en a un. */
  status?: number
  requestId?: string
  usage?: LandingClaudeUsage
  /** Texte de la réponse du modèle, pour inspection serveur : ne pas le renvoyer tel quel au navigateur. */
  output?: string
  /** Configuration résolue mais refusée (`invalid-landing`) : les `issues` portent sur elle. */
  resolved?: unknown
}

export type LandingGenerationResult =
  | {
      status: "success"
      config: LandingPageConfig
      /** Brouillon produit par le modèle, dont `config` est la résolution. */
      draft: LandingGenerationDraft
      /** Modèle qui a répondu. */
      model: string
      stopReason: string
      usage?: LandingClaudeUsage
      requestId?: string
    }
  | { status: "error"; error: LandingGenerationError }

const failure = (error: LandingGenerationError): LandingGenerationResult => ({ status: "error", error })

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

type CreateParams = Anthropic.MessageCreateParamsNonStreaming

/** Ce dont le pipeline a besoin du SDK : `messages.create`, rien d'autre. */
export type LandingClaudeClient = {
  messages: { create(params: CreateParams): Promise<Anthropic.Message> }
}

export type LandingClaudeDependencies = {
  /** Client Messages API, injecté par les tests ; absent : créé avec ANTHROPIC_API_KEY. */
  client?: LandingClaudeClient
  /** Variables d'environnement ; par défaut `process.env`. */
  env?: Env
}

function createClient(apiKey: string): LandingClaudeClient {
  if (typeof window !== "undefined") throw new Error("Le client Anthropic est réservé au serveur.")
  // Pas de relance automatique : un appel, un résultat.
  return new Anthropic({ apiKey, maxRetries: 0, timeout: LANDING_REQUEST_TIMEOUT_MS })
}

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                    */
/* -------------------------------------------------------------------------- */

const maxMessageLength = 500

/** Texte d'erreur sûr : clé masquée (valeur connue et forme sk-ant-…), longueur bornée. */
function sanitize(text: string, secrets: readonly string[]): string {
  let safe = text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[clé masquée]")
  for (const secret of secrets) if (secret.length >= 8) safe = safe.split(secret).join("[clé masquée]")
  return safe.length > maxMessageLength ? `${safe.slice(0, maxMessageLength)}…` : safe
}

function mapApiError(error: unknown, secrets: readonly string[]): LandingGenerationError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { kind: "timeout", message: "Anthropic n'a pas répondu à temps." }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { kind: "network", message: "Connexion à Anthropic impossible." }
  }
  if (!(error instanceof Anthropic.APIError)) {
    return { kind: "unexpected", message: "Erreur inattendue pendant la génération." }
  }
  const base = { status: error.status, ...(error.requestID ? { requestId: error.requestID } : {}) }
  const status = error.status ?? 0
  if (status === 401 || status === 403) {
    return { ...base, kind: "authentication", message: "Anthropic a refusé l'authentification : vérifiez ANTHROPIC_API_KEY." }
  }
  if (status === 429) {
    return { ...base, kind: "rate-limit", message: "Limite de requêtes Anthropic atteinte : réessayez dans un instant." }
  }
  if ([400, 404, 413, 422].includes(status)) {
    return { ...base, kind: "rejected", message: `Anthropic a rejeté la requête : ${sanitize(error.message, secrets)}` }
  }
  if (status >= 500) {
    return {
      ...base,
      kind: "server",
      message: status === 529 ? "Anthropic est surchargé : réessayez dans un instant." : `Erreur serveur Anthropic (HTTP ${status}).`,
    }
  }
  return { ...base, kind: "api-error", message: `Erreur Anthropic (HTTP ${status || "inconnu"}).` }
}

/* -------------------------------------------------------------------------- */
/* Réponse                                                                    */
/* -------------------------------------------------------------------------- */

function toUsage(usage: Anthropic.Usage | undefined): LandingClaudeUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    thinkingTokens: usage.output_tokens_details?.thinking_tokens ?? null,
    cacheReadTokens: usage.cache_read_input_tokens ?? null,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? null,
  }
}

type ReadyPrompt = Extract<LandingAiPrompt, { status: "ready" }>

const toIssues = (issues: readonly { path: readonly PropertyKey[]; message: string }[], root: string): LandingValidationIssue[] =>
  issues.map((issue) => ({ path: issue.path.map(String).join(".") || root, message: issue.message }))

function readResponse(response: Anthropic.Message, model: string, prompt: ReadyPrompt): LandingGenerationResult {
  const usage = toUsage(response.usage)
  const requestId = (response as { _request_id?: string | null })._request_id ?? undefined
  const meta = { ...(usage ? { usage } : {}), ...(requestId ? { requestId } : {}) }

  // La conformité au schéma n'est garantie que sur `end_turn`.
  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category
    return failure({ ...meta, kind: "refusal", message: `Le modèle a refusé de répondre${category ? ` (catégorie : ${category})` : ""}.` })
  }
  if (response.stop_reason === "max_tokens") {
    return failure({ ...meta, kind: "truncated", message: "La réponse a atteint la limite de longueur : la page est incomplète." })
  }
  if (response.stop_reason !== "end_turn") {
    return failure({ ...meta, kind: "interrupted", message: `La génération s'est arrêtée de façon inattendue (${response.stop_reason ?? "sans motif"}).` })
  }

  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim()
  if (text === "") {
    return failure({ ...meta, kind: "empty-output", message: "La réponse ne contient aucun texte exploitable." })
  }

  let output: unknown
  try {
    output = JSON.parse(text)
  } catch {
    return failure({ ...meta, kind: "invalid-json", message: "La réponse n'est pas du JSON valide.", output: text })
  }

  // 1. Le brouillon : ce que Claude a produit.
  const draft = safeParseLandingGenerationDraft(output)
  if (!draft.success) {
    return failure({ ...meta, kind: "invalid-draft", message: "Le brouillon généré ne respecte pas le contrat attendu.", issues: toIssues(draft.error.issues, "brouillon"), output: text })
  }

  // 2. La résolution : pure et déterministe, avec les ressources de cette génération.
  const resolution = resolveLandingDraft(prompt.request, draft.data, prompt.context)
  if (resolution.status === "unresolvable") {
    return failure({ ...meta, kind: "draft-resolution", message: "Le brouillon ne peut pas être résolu avec les ressources de cette génération.", issues: resolution.issues, output: text })
  }

  // 3. La configuration finale : ce que l'application accepte.
  const validation = validateGeneratedLanding(resolution.config, prompt.context)
  if (validation.status === "invalid") {
    return failure({ ...meta, kind: "invalid-landing", message: "La landing page résolue est refusée par la validation finale.", issues: validation.issues, output: text, resolved: resolution.config })
  }
  return {
    status: "success",
    config: validation.config,
    draft: draft.data,
    model: response.model || model,
    stopReason: response.stop_reason,
    ...meta,
  }
}

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Appelle Claude à partir d'un prompt déjà assemblé. Une demande invalide ou
 * impossible n'appelle jamais Anthropic. Ne lève pas : renvoie un résultat.
 */
export async function generateLandingFromPrompt(
  prompt: LandingAiPrompt,
  dependencies: LandingClaudeDependencies = {}
): Promise<LandingGenerationResult> {
  if (prompt.status === "invalid-request") {
    return failure({ kind: "invalid-request", message: "Le brief est invalide.", issues: prompt.issues })
  }
  if (prompt.status === "impossible") {
    return failure({ kind: "impossible", message: prompt.reasons.join(" ") })
  }

  const env = dependencies.env ?? process.env
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  const secrets = apiKey ? [apiKey] : []

  let client = dependencies.client
  if (!client) {
    if (!apiKey) {
      return failure({ kind: "missing-api-key", message: "ANTHROPIC_API_KEY est absente : ajoutez-la côté serveur (.env.local)." })
    }
    try {
      client = createClient(apiKey)
    } catch (error) {
      return failure(mapApiError(error, secrets))
    }
  }

  const model = resolveLandingModel(env)
  // Messages API + Structured Outputs. Ni température, ni tools, ni thinking :
  // les réglages par défaut du modèle.
  const params: CreateParams = {
    model,
    max_tokens: LANDING_MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    output_config: { format: { type: "json_schema", schema: toAnthropicJsonSchema(prompt.outputSchema) } },
  }

  let response: Anthropic.Message
  try {
    response = await client.messages.create(params)
  } catch (error) {
    return failure(mapApiError(error, secrets))
  }
  return readResponse(response, model, prompt)
}

/** Génère une landing page à partir d'une requête (`unknown` : validée ici). */
export function generateLandingWithClaude(
  request: unknown,
  dependencies: LandingClaudeDependencies = {}
): Promise<LandingGenerationResult> {
  return generateLandingFromPrompt(buildLandingAiPrompt(request), dependencies)
}
