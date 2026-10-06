/**
 * Projection compacte de la couche Brand pour la génération d'une recette :
 * uniquement ce qui sert à CETTE génération, jamais le corpus. Les vingt
 * documents Markdown ne partent pas à Claude ; seules des règles de rédaction
 * courtes, la voix de l'audience, une liste réduite de formulations à fort
 * risque, les destinations et les intentions visuelles de la recette, et, pour
 * R3 seulement, les claims approuvées utilisables (identifiant et formulation
 * exacte) y figurent.
 *
 * Deux sources, jamais mélangées :
 * - les FAITS de la demande (spécifiques à la campagne, prioritaires pour ce
 *   qu'ils disent) arrivent à part, dans la requête ;
 * - les CLAIMS approuvées (vérités Studi contrôlées) ne sont exposées qu'à R3.
 *   R1 et R2 n'en reçoivent aucune : pas d'avalanche de chiffres.
 *
 * La provenance (documents, statuts, claims) est conservée À CÔTÉ du
 * contexte, pour la validation et le débogage internes : elle n'est pas
 * envoyée au modèle.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { brandAudiences, type BrandAudienceId } from "../brand/audiences"
import { approvedClaims } from "../brand/claims"
import { provenanceOf, type BrandDocumentId } from "../brand/provenance"
import { brandTerminologyRules } from "../brand/terminology"
import { emailDestinations } from "./destinations"
import { buildEmailVisualIntentView } from "./image-bank"
import { lintPromotionCopy } from "./promotion-copy"
import { promotionVisualIntents } from "./promotion-draft"
import { emailRecipes, type EmailRecipe, type EmailRecipeId } from "./recipes"

/* -------------------------------------------------------------------------- */
/* Audience                                                                   */
/* -------------------------------------------------------------------------- */

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Indices lexicaux, dans l'ordre de priorité : le texte libre de l'audience ne sert qu'à choisir une voix, jamais un fait. */
const audienceCues: readonly (readonly [BrandAudienceId, RegExp])[] = [
  ["demandeurs_emploi", /demandeurs?|sans emploi|chomage|recherche d'emploi|france travail/],
  ["alternants", /alternan|apprenti/],
  ["b2b_rh", /\b(?:rh|b2b|opco|recruteurs?|entreprises?)\b/],
  ["reconversion", /reconversion|reconvertir|changer de metier|changement de metier/],
  ["actifs_en_poste", /\b(?:en poste|salaries?|actifs?)\b/],
]

/** Cible du corpus la plus proche de l'audience décrite, ou `undefined` (voix par défaut). */
export function matchBrandAudience(audience: string): BrandAudienceId | undefined {
  const folded = fold(audience)
  return audienceCues.find(([, cue]) => cue.test(folded))?.[0]
}

/* -------------------------------------------------------------------------- */
/* Règles de rédaction                                                        */
/* -------------------------------------------------------------------------- */

type WritingRule = { text: string; sources: readonly BrandDocumentId[] }

/**
 * Règles courtes, chacune reprise d'un document du corpus (`sources`) ou de
 * `generation/copy-email.md` (hors registre : pas de statut). Aucune n'est une
 * règle nouvelle.
 */
export const emailWritingRules = [
  { text: "Phrases courtes, une idée par phrase (15 à 20 mots au plus).", sources: ["regles-editoriales", "identite-marque"] },
  { text: "Optimisme réaliste, ton professionnel et bienveillant, sans emphase marketing ni superlatif.", sources: ["identite-marque"] },
  { text: "Décrire un chemin, jamais garantir un résultat : conditionnel (« peut », « vise à », « favorise »).", sources: ["promesse-editoriale"] },
  { text: "Aucune fausse urgence, pression, dramatisation ni culpabilisation.", sources: ["promesse-editoriale", "identite-marque"] },
  { text: "Le bénéfice pour la personne avant la caractéristique ; plus de « vous » que de « nous ».", sources: [] },
  { text: "Un bouton : verbe d'action clair qui invite à découvrir ou à s'informer, jamais à acheter ; libellé court.", sources: ["regles-editoriales"] },
  { text: "Informer sans promettre : ni chiffre, ni date, ni durée, ni certification, ni financement, ni partenaire qui ne figure pas dans les faits de la demande.", sources: ["promesse-editoriale"] },
] as const satisfies readonly WritingRule[]

/* -------------------------------------------------------------------------- */
/* Formulations à fort risque                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Règles de `terminology.ts` retenues pour le prompt : les promesses, le
 * financement et les reconnaissances, plus « facile / rapide » (conflit connu,
 * rien n'est tranché). Les identifiants sont vérifiés par les tests.
 */
export const emailPromptRiskRuleIds = [
  "garanti",
  "reussite-assuree",
  "emploi-garanti",
  "sans-effort",
  "gratuit",
  "finance-a-100",
  "pris-en-charge-etat",
  "formation-reconnue-etat",
  "master",
  "coach-mentor-dedie",
  "facile-rapide",
] as const

function riskyTerms() {
  return emailPromptRiskRuleIds.map((id) => {
    const rule = brandTerminologyRules.find((candidate) => candidate.id === id)
    if (!rule) throw new Error(`Règle de terminologie inconnue : ${id}.`)
    const alternative = "alternative" in rule ? (rule.alternative as string) : undefined
    // La ligne du lexique quand la règle en a une, sinon le terme seul (« Master » : l'intitulé de la règle est une phrase).
    const term = "corpusEntry" in rule && rule.corpusEntry ? (rule.corpusEntry as string) : id === "master" ? "Master" : rule.label
    return { term, ...(alternative ? { instead: alternative } : {}) }
  })
}

/* -------------------------------------------------------------------------- */
/* Contexte                                                                   */
/* -------------------------------------------------------------------------- */

export type RecipeBrandContext = {
  voice: { address: "vouvoiement" | "tutoiement"; tone: string; audience?: { label: string; keyPoints: readonly string[] } }
  rules: readonly string[]
  avoid: readonly { term: string; instead?: string }[]
  destinations: readonly { id: string; label: string; usage: string }[]
  /** R1 et R3 : les intentions visuelles de la recette, avec une indication courte (jamais d'image). */
  visualIntents?: readonly { intent: string; hint: string }[]
  /** R3 seulement : les claims approuvées utilisables, par identifiant et formulation exacte. */
  claims?: readonly { id: string; statement: string; headline?: true }[]
}

export type RecipeBrandProvenance = {
  /** Documents dont viennent les règles et la voix, avec leur statut dans le corpus. */
  documents: readonly { documentId: string; status: string }[]
  /** Claims exposées, avec leur document source approuvé. */
  claims: readonly { id: string; documentId: string; status: string }[]
}

const defaultTone = "Voix claire, optimiste, crédible ; ton professionnel et bienveillant."

/** Contexte Brand de la recette pour une cible (ou, à défaut, une audience), et sa provenance interne. */
export function buildRecipeBrandContext(
  recipeId: EmailRecipeId,
  audience: string,
  target?: BrandAudienceId
): { context: RecipeBrandContext; provenance: RecipeBrandProvenance } {
  const recipe = emailRecipes[recipeId]
  // La cible contrôlée décide de la voix ; sans elle, l'audience en texte libre ne sert qu'à en choisir une.
  const matched = target ?? matchBrandAudience(audience)
  const profile = matched ? brandAudiences[matched] : undefined
  const exposed = approvedClaims.filter((claim) => (recipe.claims.allowed as readonly string[]).includes(claim.id))
  const intents = recipe.images.intents as readonly string[]
  const visualIntents = recipeId === "editorial-newsletter" ? [] : buildEmailVisualIntentView().filter((entry) => intents.includes(entry.intent))

  const context: RecipeBrandContext = {
    voice: {
      address: profile?.addressMode ?? "vouvoiement",
      tone: profile?.tone ?? defaultTone,
      ...(profile ? { audience: { label: profile.label, keyPoints: profile.keyPoints } } : {}),
    },
    rules: emailWritingRules.map((rule) => rule.text),
    avoid: riskyTerms(),
    destinations: recipe.destinations.map((id) => ({ id, label: emailDestinations[id].label, usage: emailDestinations[id].usage ?? "" })),
    ...(visualIntents.length > 0 ? { visualIntents } : {}),
    ...(exposed.length > 0 ? { claims: exposed.map((claim) => ({
        id: claim.id,
        statement: claim.statement,
        // Claims que le système affiche en grands chiffres quand deux d'entre elles sont choisies (liste de la recette).
        ...(((recipe as EmailRecipe).claims.headline ?? []).includes(claim.id) ? { headline: true as const } : {}),
      })) } : {}),
  }

  const documentIds = new Set<BrandDocumentId>(["identite-marque", "promesse-editoriale", "regles-editoriales", "lexique-marque"])
  if (profile) documentIds.add("adaptation-par-cible")
  const provenance: RecipeBrandProvenance = {
    documents: [...documentIds].map((id) => ({ documentId: id, status: provenanceOf(id).status })),
    claims: exposed.map((claim) => ({ id: claim.id, documentId: claim.provenance.documentId, status: claim.provenance.status })),
  }
  return { context, provenance }
}

/* -------------------------------------------------------------------------- */
/* Contexte de la promotion (R4)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Contexte Brand de R4 : la voix de la cible, les règles de rédaction, les
 * formulations à fort risque et les intentions visuelles de la promotion. Ni
 * claim (aucun chiffre de marque dans une promotion V1), ni destination à
 * choisir (elle vient de la demande), ni valeur d'offre : celles-ci arrivent
 * dans la requête, à part.
 */
export type PromotionBrandContext = Pick<RecipeBrandContext, "voice" | "rules" | "avoid"> & { visualIntents: readonly { intent: string; hint: string }[] }

/**
 * Une alternative du lexique ou un point clé de cible que la copie d'une promotion refuserait
 * (« finançable », « jusqu'à 100 % », « accompagné à chaque étape », « Financement ») n'est pas
 * proposé à Claude : le terme à éviter reste, l'alternative ou le point clé est retiré. Le
 * contrôle de copie ne bouge pas.
 */
const promotionProbeFacts = { offer: { type: "percent", percent: 1 } } as const
const promotionUsableCopy = (value: string) => lintPromotionCopy(value, "body", promotionProbeFacts, { hasCode: false }).length === 0
function promotionUsableAvoidance(entry: { term: string; instead?: string }): { term: string; instead?: string } {
  if (!entry.instead || promotionUsableCopy(entry.instead)) return entry
  return { term: entry.term }
}

export function buildPromotionBrandContext(audience: string, target?: BrandAudienceId): { context: PromotionBrandContext; provenance: RecipeBrandProvenance } {
  const matched = target ?? matchBrandAudience(audience)
  const profile = matched ? brandAudiences[matched] : undefined
  const context: PromotionBrandContext = {
    voice: {
      address: profile?.addressMode ?? "vouvoiement",
      tone: profile?.tone ?? defaultTone,
      ...(profile ? { audience: { label: profile.label, keyPoints: profile.keyPoints.filter(promotionUsableCopy) } } : {}),
    },
    rules: emailWritingRules.map((rule) => rule.text),
    avoid: riskyTerms().map(promotionUsableAvoidance),
    visualIntents: buildEmailVisualIntentView().filter((entry) => (promotionVisualIntents as readonly string[]).includes(entry.intent)),
  }
  const documentIds = new Set<BrandDocumentId>(["identite-marque", "promesse-editoriale", "regles-editoriales", "lexique-marque"])
  if (profile) documentIds.add("adaptation-par-cible")
  return { context, provenance: { documents: [...documentIds].map((id) => ({ documentId: id, status: provenanceOf(id).status })), claims: [] } }
}
