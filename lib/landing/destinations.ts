/**
 * Destinations contrôlées des landing pages : les seules URLs qu'un modèle
 * peut proposer comme `href`, hors ancres internes (`#id-de-section`).
 * Catalogue propre au domaine Landing : il n'importe rien du domaine Email.
 *
 * Audit des `href` du domaine Landing (`demo.ts`, `/examples`, `/library`,
 * composants) :
 * - A, ancres internes (`#formations`, `#bilan`, `#documentation`…) :
 *   toujours autorisées, mais jamais cataloguées : elles dépendent de la page
 *   générée, et `LandingPageSchema` vérifie qu'elles ciblent une section.
 * - C, destinations non vérifiées, EXCLUES : les trois
 *   `/formations/<formation>` de `demo.ts` et de l'exemple `product-grid`
 *   (chemins relatifs à l'application, sans route ni source qui les établisse)
 *   et les `#documentation` / `#contact` des exemples (ancres sans section).
 * - B, destinations établies : aucune dans le domaine Landing lui-même. Les
 *   entrées ci-dessous sont reprises du catalogue contrôlé du projet Email
 *   (`lib/email/destinations.ts`, chemins relevés dans `sources-studi.md`,
 *   provenance vérifiée le 2026-09-29), en copie : aucun import. Elles ne
 *   portent aucun suivi (pas de paramètre UTM).
 *
 * Aucune destination de contact, de formulaire ni de téléchargement de
 * documentation n'est établie : le contexte de génération le dit au modèle.
 */

export const landingOrigin = "https://www.studi.com"

type LandingDestinationEntry = {
  label: string
  path: `/fr/${string}`
  /** Quand la proposer. */
  usage: string
  /** Provenance du chemin. */
  source: string
}

const emailCatalog = "lib/email/destinations.ts"

export const landingDestinations = {
  "catalogue-formations": { label: "Catalogue Studi", path: "/fr/formations", usage: "Catalogue complet des formations, avec filtres.", source: `${emailCatalog} · sources-studi.md §2` },
  metiers: { label: "Fiches métiers", path: "/fr/metiers", usage: "Découvrir un métier avant de choisir une formation.", source: `${emailCatalog} · sources-studi.md §2` },
  diplomes: { label: "Formations par niveau de diplôme", path: "/fr/diplomes", usage: "Choisir une formation par niveau de sortie.", source: `${emailCatalog} · sources-studi.md §2` },
  certificats: { label: "Certificats professionnels", path: "/fr/certificats", usage: "Monter en compétences avec un certificat.", source: `${emailCatalog} · sources-studi.md §2` },
  financement: { label: "Financement", path: "/fr/financement", usage: "Tous les dispositifs de financement.", source: `${emailCatalog} · sources-studi.md §5` },
  "parcours-decouverte": { label: "Parcours Découverte", path: "/fr/parcours-decouverte", usage: "Essayer avant de s'engager ; lien secondaire, jamais second bouton.", source: `${emailCatalog} · sources-studi.md §5` },
  accompagnement: { label: "Accompagnement", path: "/fr/accompagnement", usage: "Les niveaux d'accompagnement pendant la formation.", source: `${emailCatalog} · sources-studi.md §5` },
  methode: { label: "Méthode et pédagogie", path: "/fr/methode", usage: "Expliquer comment on apprend chez Studi.", source: `${emailCatalog} · sources-studi.md §5` },
} as const satisfies Record<string, LandingDestinationEntry>

export type LandingDestinationId = keyof typeof landingDestinations

/** URL absolue d'une destination contrôlée. */
export function landingDestinationUrl(id: LandingDestinationId): string {
  return `${landingOrigin}${landingDestinations[id].path}`
}

/** Destinations vues dans le domaine Landing et écartées, avec la raison. */
export const landingExcludedDestinations = [
  { href: "/formations/assistant-ressources-humaines", reason: "Chemin relatif sans route ni source (demo.ts, exemple product-grid)." },
  { href: "/formations/bachelor-charge-ressources-humaines", reason: "Chemin relatif sans route ni source (demo.ts)." },
  { href: "/formations/mba-manager-strategique-rh", reason: "Chemin relatif sans route ni source (demo.ts, exemple product-grid)." },
  { href: "#documentation", reason: "Ancre d'exemple sans section ; aucune URL de documentation n'est établie." },
  { href: "#contact", reason: "Ancre d'exemple sans section ; aucune destination de contact n'est établie." },
] as const
