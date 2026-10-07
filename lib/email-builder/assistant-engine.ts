/**
 * Moteur de l'assistant éditorial : SERVEUR UNIQUEMENT.
 *
 *   document courant + conversation + demande
 *     → champs éditables (liste fermée, décidée par le code)
 *     → prompt (instructions / contexte Studi / email-donnée / conversation)
 *     → UN appel `messages.create`, Structured Output { message, summary, changes }
 *     → réponse validée (Zod, champs de la liste fermée)
 *     → proposition validée par le DOMAINE (`validateProposal` : champs existants,
 *       opérations V2.1 applicables toutes ou aucune, valeurs de référence
 *       conservées, aucune nouvelle alerte)
 *     → { message, proposal? }
 *
 * Le modèle ne produit ni HTML, ni opération, ni document : il désigne des champs
 * et leur donne un texte. Rien n'est appliqué ici : la personne décide, le
 * navigateur applique (une transformation, une entrée d'historique).
 *
 * Réutilise l'intégration Anthropic du domaine Email (`anthropic.ts` : client,
 * erreurs, lecture du Structured Output), sans seconde couche. Un seul appel,
 * aucune relance (`maxRetries: 0`), aucun repli. La clé n'apparaît ni dans les
 * résultats, ni dans les erreurs, ni dans les journaux.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { createClient, failure, mapApiError, readStructuredOutput, resolveEmailModel, type CreateParams, type EmailClaudeDependencies, type EmailClaudeUsage, type EmailEngineError } from "../email/anthropic"
import { assistantSystemPrompt, buildAssistantMessages, type AssistantTurn } from "./assistant-context"
import { assistantFields, documentFingerprint, validateProposal, type AssistantProposal } from "./assistant-proposal"
import { buildAssistantTransportSchema, safeParseAssistantResponse } from "./assistant-schema"
import type { EmailDocument } from "./document"

/** Une réponse d'assistant tient en quelques centaines de tokens. */
export const ASSISTANT_MAX_TOKENS = 4000

export type AssistantEngineInput = { document: EmailDocument; history: readonly AssistantTurn[]; message: string }

export type AssistantEngineResult =
  | { status: "success"; message: string; proposal?: AssistantProposal; model: string; usage?: EmailClaudeUsage; requestId?: string }
  | { status: "error"; error: EmailEngineError }

/** Ne lève pas : renvoie un résultat. Une demande vide n'appelle jamais le modèle. */
export async function runAssistant(input: AssistantEngineInput, dependencies: EmailClaudeDependencies = {}): Promise<AssistantEngineResult> {
  if (input.message.trim() === "") return failure({ kind: "invalid-request", message: "Le message est vide." })

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

  const { document } = input
  const targets = assistantFields(document).map((field) => field.target)
  const model = resolveEmailModel(env)
  const params: CreateParams = {
    model,
    max_tokens: ASSISTANT_MAX_TOKENS,
    system: assistantSystemPrompt,
    messages: buildAssistantMessages(document, input.history, input.message),
    output_config: { format: { type: "json_schema", schema: buildAssistantTransportSchema(targets) } },
  }

  let response
  try {
    response = await client.messages.create(params)
  } catch (error) {
    return failure(mapApiError(error, secrets))
  }

  const read = readStructuredOutput(response)
  if (!read.ok) return read.failure
  const parsed = safeParseAssistantResponse(targets, read.output)
  if (!parsed.success) {
    return failure({ ...read.meta, kind: "invalid-draft", message: "La réponse de l'assistant ne respecte pas le contrat attendu.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "réponse", message: issue.message })), output: read.text })
  }

  const { message, summary, changes } = parsed.data
  const meta = { model: response.model || model, ...read.meta }
  // Un conseil : aucune proposition, rien à valider.
  if (changes.length === 0) return { status: "success", message, ...meta }
  if (summary.trim() === "") return failure({ ...read.meta, kind: "invalid-draft", message: "Une proposition sans résumé n'est pas présentable.", output: read.text })

  // Le domaine a le dernier mot : une proposition invalide ou qui touche aux valeurs de référence est refusée en entier.
  const checked = validateProposal(document, changes)
  if (!checked.ok) {
    return failure({ ...read.meta, kind: "validation-failed", message: checked.message, issues: [{ path: "proposition", message: checked.message, code: checked.reason }], output: read.text })
  }
  return { status: "success", message, proposal: { summary: summary.trim(), changes, basedOn: documentFingerprint(document) }, ...meta }
}
