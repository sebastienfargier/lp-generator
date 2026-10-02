import { landingDraftSectionTypes, type LandingDraftSectionType } from "./generation-draft"
import type { LandingSectionType } from "./types"

/**
 * Décision de génération IA, pour chaque lame du contrat.
 *
 * Deux statuts, distincts de l'appartenance à la bibliothèque (une lame n'a
 * pas besoin d'être générable pour exister) :
 *
 * - générable : elle a une branche dans `LandingGenerationDraft` ;
 * - exclue : elle figure dans `nonGenerableSections`, avec sa raison.
 *
 * Toute lame du contrat doit être dans UNE de ces deux situations. Le type
 * `SectionGenerationDecisions` le vérifie à la compilation (aucune lame sans
 * décision, aucune lame dans les deux) ; `getSectionGeneration` et les tests
 * d'alignement le vérifient à l'exécution. Aucune liste des lames générables
 * n'est écrite ici : elle est dérivée du Draft.
 *
 * Module de données : aucun SDK, aucun React. Il ne dépend pas du moteur
 * Anthropic, seulement du contrat de brouillon.
 */

/**
 * Sections qui portent des données commerciales structurées : formation
 * nommée, prix, financement, partenaire, badges. Aucune source produit
 * contrôlée n'existe : elles ne sont pas proposées à Claude. Le contrat, les
 * composants, le renderer et la bibliothèque les gardent.
 */
export const nonGenerableSections = {
  "product-hero": "Porte une formation nommée, un prix, un financement et un partenaire : aucune source produit contrôlée.",
  "product-grid": "Exige des produits nommés, avec lien, image et prix : aucune source produit contrôlée.",
  "campaign-spotlight": "Intégration IA différée pendant l'optimisation du contexte et des destinations de campagne.",
} as const satisfies Partial<Record<LandingSectionType, string>>

type Undecided = Exclude<LandingSectionType, LandingDraftSectionType | keyof typeof nonGenerableSections>
type Contradictory = Extract<LandingDraftSectionType, keyof typeof nonGenerableSections>
type MustBeNever<Type extends never> = Type

/** Ne compile que si chaque lame du contrat est exactement soit dans le Draft, soit exclue. */
export type SectionGenerationDecisions = MustBeNever<Undecided | Contradictory>

export type SectionGeneration = { status: "generable" } | { status: "library-only"; reason: string }

export function getSectionGeneration(type: LandingSectionType): SectionGeneration {
  const reason = (nonGenerableSections as Partial<Record<LandingSectionType, string>>)[type]
  const inDraft = (landingDraftSectionTypes as readonly string[]).includes(type)
  if (reason !== undefined && inDraft) {
    throw new Error(`Lame « ${type} » à la fois dans le Draft et dans nonGenerableSections : choisissez l'un des deux.`)
  }
  if (reason !== undefined) return { status: "library-only", reason }
  if (inDraft) return { status: "generable" }
  throw new Error(`Lame « ${type} » sans décision de génération : ajoutez une branche au Draft, ou une entrée avec raison dans nonGenerableSections.`)
}
