import Anthropic from "@anthropic-ai/sdk"

import { buildEmailDraftPrompt, validateGeneratedDraftEmail, type EmailDraftPrompt } from "./draft-prompt"
import { resolveEmailGenerationDraft } from "./draft-resolver"
import { safeParseEmailGenerationDraft, type EmailGenerationDraft } from "./generation-draft"
import { safeParseEmailConfig } from "./schemas"
import type { EmailConfig } from "./types"

/**
 * Génération d'un email par Claude : serveur uniquement.
 *
 * EmailGenerationRequest → buildEmailDraftPrompt → schéma du Draft adapté →
 * Messages API (Structured Outputs) → JSON → EmailGenerationDraftSchema →
 * resolveEmailGenerationDraft → safeParseEmailConfig →
 * validateGeneratedDraftEmail → EmailConfig.
 *
 * Le JSON de Claude n'est jamais pris pour un EmailConfig : il passe par la
 * validation du brouillon, le resolver (shell, liens, image, surface), puis la
 * validation de l'EmailConfig et la validation métier finale. Le rendu
 * (`renderEmail`) est fait par l'appelant.
 *
 * Un seul appel, aucune relance : ni ici, ni dans le SDK (`maxRetries: 0`). Pas
 * de repli sur le mode démo : une erreur est une erreur.
 *
 * Secret : seule `ANTHROPIC_API_KEY` est lue, côté serveur. Elle n'apparaît ni
 * dans les résultats, ni dans les erreurs, ni dans les journaux. Les résultats
 * ne contiennent pas le prompt système.
 *
 * Ce module est celui du domaine Email : il reprend les principes du moteur
 * Landing sans rien partager avec lui. Ne jamais l'importer depuis un
 * composant client.
 */

/** Seul endroit où l'identifiant du modèle Email est défini (le modèle validé pour Landing). */
export const DEFAULT_EMAIL_MODEL = "claude-sonnet-5-5"

/** Plafond de sortie : un brouillon fait quelques centaines de tokens, la réflexion adaptative est comptée dans la limite. */
export const EMAIL_MAX_TOKENS = 16000

/** Délai d'attente d'une réponse, en millisecondes (comme Landing). */
export const EMAIL_REQUEST_TIMEOUT_MS = 180_000

type Env = Readonly<Record<string, string | undefined>>

/** Modèle configuré côté serveur (`ANTHROPIC_MODEL`), sinon celui par défaut. */
export function resolveEmailModel(env: Env = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_EMAIL_MODEL
}

/* -------------------------------------------------------------------------- */
/* Résultats                                                                  */
/* -------------------------------------------------------------------------- */

export type EmailClaudeUsage = {
  inputTokens: number
  outputTokens: number
  thinkingTokens: number | null
}

export type EmailGenerationErrorKind =
  | "invalid-request"
  | "unsupported"
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
  | "invalid-config"
  | "validation-failed"
  | "brand-violation"
  | "unexpected"

/** `code` : identifiant de la règle qui a refusé (diagnostic serveur, jamais renvoyé au navigateur). */
export type EmailEngineIssue = { path: string; message: string; code?: string }

export type EmailEngineError = {
  kind: EmailGenerationErrorKind
  message: string
  issues?: EmailEngineIssue[]
  /** Statut HTTP renvoyé par Anthropic, s'il y en a un. */
  status?: number
  requestId?: string
  usage?: EmailClaudeUsage
  /** Texte de la réponse du modèle, pour inspection serveur : ne jamais le renvoyer au navigateur. */
  output?: string
}

export type EmailEngineResult =
  | {
      status: "success"
      config: EmailConfig
      /** Brouillon produit par le modèle, dont `config` est la résolution. */
      draft: EmailGenerationDraft
      model: string
      stopReason: string
      usage?: EmailClaudeUsage
      requestId?: string
    }
  | { status: "error"; error: EmailEngineError }

export const failure = (error: EmailEngineError): { status: "error"; error: EmailEngineError } => ({ status: "error", error })

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateParams = Anthropic.MessageCreateParamsNonStreaming

/** Ce dont le pipeline a besoin du SDK : `messages.create`, rien d'autre. */
export type EmailClaudeClient = {
  messages: { create(params: CreateParams): Promise<Anthropic.Message> }
}

export type EmailClaudeDependencies = {
  /** Client Messages API, injecté par les tests ; absent : créé avec ANTHROPIC_API_KEY. */
  client?: EmailClaudeClient
  /** Variables d'environnement ; par défaut `process.env`. */
  env?: Env
}

export function createClient(apiKey: string): EmailClaudeClient {
  if (typeof window !== "undefined") throw new Error("Le client Anthropic est réservé au serveur.")
  // Pas de relance automatique : un appel, un résultat.
  return new Anthropic({ apiKey, maxRetries: 0, timeout: EMAIL_REQUEST_TIMEOUT_MS })
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

export function mapApiError(error: unknown, secrets: readonly string[]): EmailEngineError {
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

export function toUsage(usage: Anthropic.Usage | undefined): EmailClaudeUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    thinkingTokens: usage.output_tokens_details?.thinking_tokens ?? null,
  }
}

type ReadyPrompt = Extract<EmailDraftPrompt, { status: "ready" }>

const toIssues = (issues: readonly { path: readonly PropertyKey[]; message: string }[], root: string): EmailEngineIssue[] =>
  issues.map((issue) => ({ path: issue.path.map(String).join(".") || root, message: issue.message }))

type StructuredOutput =
  | { ok: true; output: unknown; text: string; meta: { usage?: EmailClaudeUsage; requestId?: string } }
  | { ok: false; failure: { status: "error"; error: EmailEngineError } }

/**
 * Réponse Messages API → JSON du modèle, partie commune aux moteurs Email :
 * motif d'arrêt (la conformité au schéma n'est garantie que sur `end_turn`),
 * texte, JSON. Ne valide rien du contenu : c'est le rôle de chaque moteur.
 */
export function readStructuredOutput(response: Anthropic.Message): StructuredOutput {
  const usage = toUsage(response.usage)
  const requestId = (response as { _request_id?: string | null })._request_id ?? undefined
  const meta = { ...(usage ? { usage } : {}), ...(requestId ? { requestId } : {}) }
  const stop = (error: EmailEngineError): StructuredOutput => ({ ok: false, failure: failure({ ...meta, ...error }) })

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category
    return stop({ kind: "refusal", message: `Le modèle a refusé de répondre${category ? ` (catégorie : ${category})` : ""}.` })
  }
  if (response.stop_reason === "max_tokens") {
    return stop({ kind: "truncated", message: "La réponse a atteint la limite de longueur : l'email est incomplet." })
  }
  if (response.stop_reason !== "end_turn") {
    return stop({ kind: "interrupted", message: `La génération s'est arrêtée de façon inattendue (${response.stop_reason ?? "sans motif"}).` })
  }

  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("").trim()
  if (text === "") return stop({ kind: "empty-output", message: "La réponse ne contient aucun texte exploitable." })

  try {
    return { ok: true, output: JSON.parse(text), text, meta }
  } catch {
    return stop({ kind: "invalid-json", message: "La réponse n'est pas du JSON valide.", output: text })
  }
}

function readResponse(response: Anthropic.Message, model: string, prompt: ReadyPrompt): EmailEngineResult {
  const read = readStructuredOutput(response)
  if (!read.ok) return read.failure
  const { output, text, meta } = read

  // 1. Le brouillon : seule validation de ce que Claude a produit.
  const draft = safeParseEmailGenerationDraft(output)
  if (!draft.success) {
    return failure({ ...meta, kind: "invalid-draft", message: "Le brouillon généré ne respecte pas le contrat attendu.", issues: toIssues(draft.error.issues, "brouillon"), output: text })
  }

  // 2. La résolution : pure et déterministe (shell, ids, liens, image, surface).
  const resolution = resolveEmailGenerationDraft(prompt.request, draft.data)
  if (resolution.status !== "resolved") {
    return failure({ ...meta, kind: "draft-resolution", message: "Le brouillon ne peut pas être résolu.", issues: resolution.issues, output: text })
  }

  // 3. L'EmailConfig : l'autorité de schemas.ts.
  const config = safeParseEmailConfig(resolution.config)
  if (!config.success) {
    return failure({ ...meta, kind: "invalid-config", message: "L'email résolu est refusé par le contrat EmailConfig.", issues: toIssues(config.error.issues, "config"), output: text })
  }

  // 4. La validation métier finale : liens, images, disclaimers, vocabulaire.
  const validation = validateGeneratedDraftEmail(config.data, prompt.request)
  if (validation.status === "invalid") {
    return failure({ ...meta, kind: "validation-failed", message: "L'email résolu est refusé par la validation finale.", issues: validation.issues, output: text })
  }
  return { status: "success", config: validation.config, draft: draft.data, model: response.model || model, stopReason: "end_turn", ...meta }
}

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Appelle Claude à partir d'un prompt déjà assemblé. Une demande invalide ou
 * hors périmètre n'appelle jamais Anthropic. Ne lève pas : renvoie un résultat.
 */
export async function generateEmailFromPrompt(
  prompt: EmailDraftPrompt,
  dependencies: EmailClaudeDependencies = {}
): Promise<EmailEngineResult> {
  if (prompt.status === "invalid-request") {
    return failure({ kind: "invalid-request", message: "La demande est invalide.", issues: prompt.issues })
  }
  if (prompt.status === "unsupported") {
    return failure({ kind: "unsupported", message: prompt.reasons.join(" ") })
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

  const model = resolveEmailModel(env)
  // Messages API + Structured Outputs. Ni température, ni tools, ni streaming.
  const params: CreateParams = {
    model,
    max_tokens: EMAIL_MAX_TOKENS,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    output_config: { format: { type: "json_schema", schema: prompt.transportSchema } },
  }

  let response: Anthropic.Message
  try {
    response = await client.messages.create(params)
  } catch (error) {
    return failure(mapApiError(error, secrets))
  }
  return readResponse(response, model, prompt)
}

/** Génère un email à partir d'une requête (`unknown` : validée ici). */
export function generateEmailWithClaude(
  request: unknown,
  dependencies: EmailClaudeDependencies = {}
): Promise<EmailEngineResult> {
  return generateEmailFromPrompt(buildEmailDraftPrompt(request), dependencies)
}
