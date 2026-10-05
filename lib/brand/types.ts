/**
 * Brand Knowledge Studi : types communs. Cette couche est une copie compacte,
 * typée et testée de ce que les documents de `ressources/brand/` permettent de
 * contrôler. Les documents Markdown restent les sources humaines ; rien ici ne
 * les lit à l'exécution (les tests, eux, vérifient que la copie ne dérive pas).
 *
 * Domaine indépendant : aucun import depuis `lib/landing` ni `lib/email`, et
 * rien dans les moteurs, prompts ou resolvers ne l'utilise encore.
 */

/** Statuts réellement présents dans le corpus (`approuve`, `en_revue`, `brouillon`). */
export const brandStatuses = ["approved", "in-review", "draft"] as const

export type BrandStatus = (typeof brandStatuses)[number]

/** D'où vient une donnée, et ce que vaut cette source. */
export type BrandProvenance = {
  /** Identifiant du document source (`id` de son front matter). */
  documentId: string
  /** Chemin du document source, relatif à la racine du dépôt. */
  path: string
  status: BrandStatus
  /** Absent quand le document dit « à définir ». */
  owner?: string
  /** Dernière revue (AAAA-MM-JJ). */
  lastReview: string
  /** Le document a une portée légale. */
  legalScope: boolean
}

/** Provenance d'un document approuvé : le type interdit d'y mettre autre chose. */
export type ApprovedProvenance = BrandProvenance & { status: "approved" }

export type BrandSeverity = "error" | "warning"
