/**
 * Moteur de l'assistant éditorial : SERVEUR UNIQUEMENT.
 *
 *   document courant + conversation + demande
 *     → champs éditables, lames existantes, lames ajoutables (listes fermées)
 *     → prompt (instructions / contexte Studi / catalogue / email-donnée / conversation)
 *     → UN appel `messages.create`, Structured Output { message, summary, changes, add, move, remove }
 *     → réponse validée (Zod, listes fermées)
 *     → plan validé par le MOTEUR DE COMPOSITION (`composition.ts` : références,
 *       lames, places, contenus, opérations V2.1 toutes ou aucune, protections)
 *     → { message, proposal? }
 *
 * Le modèle ne produit ni HTML, ni opération, ni document : il désigne des champs
 * et des lames de listes fermées, et écrit du texte. Rien n'est appliqué ici : la personne décide, le
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
import { assistantSystemPrompt, buildAssistantMessages, type AssistantSelection, type AssistantTurn } from "./assistant-context"
import { assistantFields, blocksOf, documentFingerprint, type AssistantProposal } from "./assistant-proposal"
import { buildAssistantTransportSchema, safeParseAssistantResponse, type AssistantSchemaContext } from "./assistant-schema"
import { builderLames } from "./catalog"
import { compositionCatalog, hasStructure, validateCompositionPlan, type CompositionCatalog } from "./composition"
import type { EmailDocument } from "./document"

/** Une réponse d'assistant tient en quelques centaines de tokens. */
export const ASSISTANT_MAX_TOKENS = 4000

export type AssistantEngineInput = {
  document: EmailDocument
  history: readonly AssistantTurn[]
  message: string
  /** La sélection du canvas au moment de l'envoi : un indice, jamais une autorisation. */
  selection?: AssistantSelection | null
  /** Les lames ajoutables ; par défaut, celles de la bibliothèque du Builder. */
  catalog?: CompositionCatalog
}

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
  const catalog = input.catalog ?? compositionCatalog(builderLames())
  const schemaContext: AssistantSchemaContext = { targets: assistantFields(document).map((field) => field.target), blockIds: blocksOf(document).map((block) => block.id), blockTypes: Object.keys(catalog) }
  const model = resolveEmailModel(env)
  const params: CreateParams = {
    model,
    max_tokens: ASSISTANT_MAX_TOKENS,
    system: assistantSystemPrompt,
    messages: buildAssistantMessages(document, input.history, input.message, { catalog, selection: input.selection ?? null }),
    output_config: { format: { type: "json_schema", schema: buildAssistantTransportSchema(schemaContext) } },
  }

  let response
  try {
    response = await client.messages.create(params)
  } catch (error) {
    return failure(mapApiError(error, secrets))
  }

  const read = readStructuredOutput(response)
  if (!read.ok) return read.failure
  const parsed = safeParseAssistantResponse(schemaContext, read.output)
  if (!parsed.success) {
    return failure({ ...read.meta, kind: "invalid-draft", message: "La réponse de l'assistant ne respecte pas le contrat attendu.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "réponse", message: issue.message })), output: read.text })
  }

  const { message, summary, changes, add, move, remove } = parsed.data
  const meta = { model: response.model || model, ...read.meta }
  const structure = { add, move, remove }
  // Un conseil : aucune proposition, rien à valider.
  if (changes.length === 0 && !hasStructure(structure)) return { status: "success", message, ...meta }
  if (summary.trim() === "") return failure({ ...read.meta, kind: "invalid-draft", message: "Une proposition sans résumé n'est pas présentable.", output: read.text })

  // Le domaine a le dernier mot : une proposition invalide ou qui touche aux valeurs de référence est refusée en entier.
  const checked = validateCompositionPlan(document, { content: changes, ...structure }, catalog)
  if (!checked.ok) {
    return failure({ ...read.meta, kind: "validation-failed", message: checked.message, issues: [{ path: "proposition", message: checked.message, code: checked.reason }], output: read.text })
  }
  return { status: "success", message, proposal: { summary: summary.trim(), changes, ...(hasStructure(structure) ? { structure } : {}), basedOn: documentFingerprint(document) }, ...meta }
}
