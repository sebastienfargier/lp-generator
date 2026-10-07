/**
 * Gaps STRUCTURELS d'une référence (V2.9.4a) : tout ce qui dit « la bibliothèque officielle ne peut pas
 * représenter cette structure, une lame générée le pourrait ». Pur : ni réseau, ni modèle, ni document.
 *
 * Le contrat est FERMÉ. Le futur appel multimodal ne fournira que des valeurs de `referenceGaps` (tableau
 * `structure` de chaque correspondance) ; une raison libre ne décide jamais de rien. Le CODE décide si une
 * section est candidate :
 *
 * - `matched` : jamais ; `approximate` ou `unmatched` : seulement avec un `structure` NON vide ;
 * - toute raison inexprimable par le DSL (V2.9.1) : jamais ;
 * - chaque raison doit être COHÉRENTE avec l'analyse (disposition, éléments répétés, visuel) : une
 *   incohérence rend la section non candidate, sans réparation ;
 * - le rôle `offer` : jamais (les valeurs commerciales restent aux Promotion Facts, V2.8.1) ;
 * - au plus `maxGeneratedBlocksPerEmail` candidats : `unmatched` avant `approximate`, puis ordre de lecture.
 *   Un candidat au-delà du quota n'est JAMAIS promu si un autre échoue plus tard.
 *
 * L'`intent` libre de l'analyse n'entre pas ici : ni dans les types, ni dans la sélection.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { referenceLayouts, referenceRoles } from "./document"
import { maxGeneratedBlocksPerEmail } from "./generated/tokens"
import type { referenceMappingStatuses, referenceTones } from "./reference-schema"

/** Ce que le DSL sait exprimer. */
export const expressibleReferenceGaps = ["columns", "column-proportions", "repeated-cards", "icon-items", "card-over-image", "stat-emphasis", "image-placement"] as const
/** Ce qu'il ne sait pas exprimer : la section reste officielle ou sans équivalent. */
export const inexpressibleReferenceGaps = ["image-in-cards", "background-image", "free-positioning", "embedded-widget", "data-table"] as const
export const referenceGaps = [...expressibleReferenceGaps, ...inexpressibleReferenceGaps] as const

export type ExpressibleReferenceGap = (typeof expressibleReferenceGaps)[number]
export type ReferenceGap = (typeof referenceGaps)[number]
type Role = (typeof referenceRoles)[number]
type Layout = (typeof referenceLayouts)[number]

/**
 * La définition de chaque gap, en une phrase : ce que le modèle lit dans le prompt de l'appel 1. Une seule source,
 * indexée par la taxonomie (un gap sans définition ne compile pas) : le prompt ne recopie aucune liste.
 */
export const referenceGapDefinitions: Record<ReferenceGap, string> = {
  columns: "un nombre de colonnes, 2, 3 ou 4, absent de toutes les lames",
  "column-proportions": "des colonnes de largeurs inégales, une large et une étroite",
  "repeated-cards": "des cartes répétées côte à côte ou en grille",
  "icon-items": "des éléments répétés, chacun avec une icône",
  "card-over-image": "une carte qui chevauche le bas d'une image",
  "stat-emphasis": "un grand chiffre ou une valeur mise en avant",
  "image-placement": "un visuel dont la position ou la taille n'existe dans aucune lame",
  "image-in-cards": "une petite image dans chaque carte",
  "background-image": "du texte posé sur une image de fond",
  "free-positioning": "des éléments placés librement, en diagonale ou en superposition libre",
  "embedded-widget": "un élément interactif ou animé : compte à rebours, quiz, vidéo, carte, barres de progression",
  "data-table": "un tableau de données",
}

export const isExpressibleReferenceGap = (gap: string): gap is ExpressibleReferenceGap => (expressibleReferenceGaps as readonly string[]).includes(gap)
export const isReferenceGap = (gap: string): gap is ReferenceGap => (referenceGaps as readonly string[]).includes(gap)

/** Une section telle que la sélection la lit : l'analyse STRUCTURELLE, son statut de correspondance et ses gaps. Jamais l'intention libre. */
export type ReferenceGapSection = {
  ref: string
  status: (typeof referenceMappingStatuses)[number]
  role: Role
  layout: Layout
  tone: (typeof referenceTones)[number]
  hasImage: boolean
  imageCount: number
  hasCta: boolean
  repeatedItems: number
  structure: readonly ReferenceGap[]
}

const columnLayouts: readonly Layout[] = ["columns-2", "columns-3", "columns-4"]

/** La table de cohérence gap ↔ analyse. `stat-emphasis` n'a pas de règle fiable dans l'analyse : accepté tel quel (aucune heuristique inventée). */
const consistency: Record<ExpressibleReferenceGap, (section: ReferenceGapSection) => boolean> = {
  columns: (section) => columnLayouts.includes(section.layout),
  "column-proportions": (section) => section.layout === "columns-2" || section.layout === "image-left" || section.layout === "image-right",
  "repeated-cards": (section) => section.repeatedItems >= 2 && ([...columnLayouts, "cards", "list"] as readonly Layout[]).includes(section.layout),
  "icon-items": (section) => section.repeatedItems >= 2,
  "card-over-image": (section) => section.hasImage,
  "stat-emphasis": () => true,
  "image-placement": (section) => section.hasImage,
}

export type ReferenceGapConsistency = { ok: true } | { ok: false; gap: ExpressibleReferenceGap }

/** Chaque gap exprimable est cohérent avec l'analyse ; le premier qui ne l'est pas est désigné. Un gap inexprimable n'est pas évalué ici. */
export function validateReferenceGapConsistency(section: ReferenceGapSection): ReferenceGapConsistency {
  for (const gap of section.structure) if (isExpressibleReferenceGap(gap) && !consistency[gap](section)) return { ok: false, gap }
  return { ok: true }
}

/** Pourquoi une section n'est pas candidate (liste fermée). */
export const notCandidateReasons = ["matched", "no-structural-gap", "offer-role", "inexpressible-gap", "inconsistent-gap", "unknown-gap"] as const
export type NotCandidateReason = (typeof notCandidateReasons)[number]

export type ReferenceCandidateDecision = { candidate: true } | { candidate: false; reason: NotCandidateReason }

/** Une section est-elle un candidat generated ? Pas de score : des règles dans l'ordre, la première qui refuse l'emporte. */
export function isGeneratedReferenceCandidate(section: ReferenceGapSection): ReferenceCandidateDecision {
  if (section.status === "matched") return { candidate: false, reason: "matched" }
  if (section.role === "offer") return { candidate: false, reason: "offer-role" }
  if (section.structure.length === 0) return { candidate: false, reason: "no-structural-gap" }
  if (section.structure.some((gap) => !isReferenceGap(gap))) return { candidate: false, reason: "unknown-gap" }
  if (section.structure.some((gap) => !isExpressibleReferenceGap(gap))) return { candidate: false, reason: "inexpressible-gap" }
  // Un gap déclaré deux fois n'est pas réparé : la déclaration est incohérente.
  if (new Set(section.structure).size !== section.structure.length) return { candidate: false, reason: "inconsistent-gap" }
  if (!validateReferenceGapConsistency(section).ok) return { candidate: false, reason: "inconsistent-gap" }
  return { candidate: true }
}

/** Le plafond de candidats : celui des lames générées par email (le domaine le vérifie aussi). */
export const maxGeneratedReferenceCandidates = maxGeneratedBlocksPerEmail

export type ReferenceSelectionOutcome = "selected" | "not-selected-limit" | NotCandidateReason
export type ReferenceSelectionEntry = { ref: string; outcome: ReferenceSelectionOutcome }

export type GeneratedReferenceSelection = {
  /** Les candidats retenus (3 au plus), dans l'ordre de sélection : `unmatched` d'abord, puis `approximate`, chacun en ordre de lecture. */
  selected: ReferenceGapSection[]
  /** Une décision par section, dans l'ordre de lecture. */
  decisions: ReferenceSelectionEntry[]
}

/** Sélection déterministe des candidats, avec le sort de chaque section. */
export function selectGeneratedReferenceCandidates(sections: readonly ReferenceGapSection[], limit = maxGeneratedReferenceCandidates): GeneratedReferenceSelection {
  const verdicts = sections.map((section) => ({ section, verdict: isGeneratedReferenceCandidate(section) }))
  const candidates = verdicts.filter((entry) => entry.verdict.candidate).map((entry) => entry.section)
  const ordered = [...candidates.filter((section) => section.status === "unmatched"), ...candidates.filter((section) => section.status === "approximate")]
  const selected = ordered.slice(0, Math.max(0, limit))
  const picked = new Set(selected.map((section) => section.ref))
  const decisions = verdicts.map(({ section, verdict }): ReferenceSelectionEntry => ({ ref: section.ref, outcome: !verdict.candidate ? verdict.reason : picked.has(section.ref) ? "selected" : "not-selected-limit" }))
  return { selected, decisions }
}
