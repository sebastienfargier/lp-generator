/**
 * Second appel de la création depuis une référence (V2.9.4b) : SERVEUR UNIQUEMENT. UN appel texte `messages.create`,
 * non streamé, sans relance (`maxRetries: 0`, comme le premier), avec Structured Output strict (le schéma de V2.9.4a).
 *
 * Responsabilité UNIQUE : `GeneratedReferenceRequest` → un appel → réponse validée (`GeneratedReferenceOutput`). Il
 * ne choisit rien : ni quelles sections, ni s'il a lieu (c'est le pipeline : aucun candidat, aucun appel), ni ce qu'il
 * advient d'un échec (le résultat Reference ne dépend jamais de lui).
 *
 * Le message ne contient que la requête (données fermées) et le contexte système : aucune image, aucun base64,
 * aucun EmailDocument, aucun `intent` de la capture, aucun HTML, aucune URL. Le prompt est constant et ne contient
 * aucun texte tiré de l'image. Réutilise l'intégration Anthropic du domaine Email (`anthropic.ts`) : la clé n'apparaît
 * ni dans les résultats ni dans les erreurs.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { createClient, failure, mapApiError, readStructuredOutput, resolveEmailModel, type CreateParams, type EmailClaudeDependencies, type EmailClaudeUsage, type EmailEngineError } from "../email/anthropic"
import { describeGeneratedReferenceContext, type GeneratedReferenceRequest } from "./reference-generated-request"
import { buildGeneratedReferenceTransportSchema, parseGeneratedReferenceOutput, type GeneratedReferenceOutput } from "./reference-generated-schema"

/** Trois blueprints compacts avec leurs textes tiennent largement ici. */
export const GENERATED_REFERENCE_MAX_TOKENS = 6000

export const generatedReferenceSystemPrompt = `Tu composes des structures d'email sur mesure pour Studi, dans un vocabulaire FERMÉ et compact (un "blueprint"). Tu réponds uniquement par l'objet JSON conforme au schéma.

Le message utilisateur contient "request" (les sections à construire : des données fermées) et "context" (le vocabulaire du blueprint, ses règles, les noms de slots, les limites de texte, les icônes, les intentions visuelles, les règles de rédaction de Studi). Tu n'as aucune image et aucun texte de la référence : ne devine rien au-delà des données.

Pour chaque entrée de "request.candidates", réponds par UN item de "items" avec le même "ref". Choisis la composition MINIMALE qui couvre les gaps demandés ("structure") :
- "blueprint" : UN objet dont tous les champs sont donnés (valeurs neutres pour ce qui est sans objet : voir "context.blueprint"). Il ne contient ni texte, ni rôle, ni nom de slot, ni URL, ni couleur, ni taille.
- Couvre TOUS les gaps de "structure" grâce à "context.blueprint.covers" : une carte par élément répété (itemStyle card ou icon-card, count = "repeatedItems"), une icône par élément (icon ou icon-card), des colonnes comme "layout" (columns-2/3/4), des colonnes inégales (proportion), un grand chiffre (stat), un visuel placé comme "layout" l'indique, une carte qui chevauche un visuel (overlap). Un seul archétype par candidat.
- Respecte "hasImage" (sans visuel : archétype items, imagePosition none) et "hasCta" (sans bouton : cta false). Ne mets un bouton que s'il est utile.
- "texts" : un texte par slot de texte du blueprint (noms dans "context.blueprint.slots"), SAUF "stat-N" : le système le remplit, ne l'écris pas. Registre Studi (vouvoiement, phrases courtes, bénéfice avant caractéristique, aucune pression), longueurs de "context.textLimits".
- "buttons" : un libellé court pour le slot "cta" (liste vide sans bouton). Tu ne choisis AUCUNE destination et n'écris aucune URL.
- "icons" : une icône de "context.icons" par slot d'icône (icon-N ou card-N-icon).
- "images" : une INTENTION de "context.visualIntents" pour le slot "image" (liste vide sans visuel). Tu ne choisis AUCUN identifiant d'image.

N'invente AUCUNE donnée commerciale : aucun prix, remise, pourcentage, code promotionnel, date, échéance, durée, statistique, classement, garantie, certification, partenaire. Pas de HTML ni d'URL dans aucun texte.

Règles de rédaction et formulations à éviter de Studi : voir "context.brand". Réponds en français.`

export type GeneratedReferenceEngineResult =
  | { status: "success"; output: GeneratedReferenceOutput; model: string; usage?: EmailClaudeUsage; requestId?: string }
  | { status: "error"; error: EmailEngineError }

/** Ne lève pas : renvoie un résultat. Une requête sans candidat n'appelle jamais le modèle. */
export async function analyzeGeneratedReference(request: GeneratedReferenceRequest, dependencies: EmailClaudeDependencies = {}): Promise<GeneratedReferenceEngineResult> {
  if (request.candidates.length === 0) return failure({ kind: "invalid-request", message: "Aucun candidat à construire." })

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

  const refs = request.candidates.map((candidate) => candidate.ref)
  const model = resolveEmailModel(env)
  const params: CreateParams = {
    model,
    max_tokens: GENERATED_REFERENCE_MAX_TOKENS,
    system: generatedReferenceSystemPrompt,
    messages: [{ role: "user", content: [{ type: "text", text: JSON.stringify({ task: "Compose les structures demandées et réponds selon le schéma.", request, context: describeGeneratedReferenceContext() }) }] }],
    output_config: { format: { type: "json_schema", schema: buildGeneratedReferenceTransportSchema(refs) } },
  }

  let response
  try {
    response = await client.messages.create(params)
  } catch (error) {
    return failure(mapApiError(error, secrets))
  }
  const read = readStructuredOutput(response)
  if (!read.ok) return read.failure
  const parsed = parseGeneratedReferenceOutput(refs, read.output)
  if (!parsed.ok) return failure({ ...read.meta, kind: "invalid-draft", message: "La réponse de construction ne respecte pas le contrat attendu.", issues: parsed.issues, output: read.text })
  return { status: "success", output: parsed.value, model: response.model || model, ...read.meta }
}
