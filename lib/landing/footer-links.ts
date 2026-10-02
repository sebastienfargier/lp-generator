/**
 * Liens fixes du footer global des landing pages (shell, jamais une section).
 * Aucun de ces contenus n'entre dans `LandingPageConfig`, dans le Draft, dans
 * le catalogue de composition ni dans le contexte envoyé au modèle.
 *
 * - Navigation : libellé propre au footer, destination contrôlée existante ;
 *   l'URL est dérivée par `landingDestinationUrl`, jamais recopiée.
 * - Liens légaux : constante à part, hors de `destinations.ts` (ce ne sont pas
 *   des destinations proposables par un modèle). URL officielle fournie et
 *   validée, sans suivi. Aucun autre lien légal n'est ajouté tant qu'aucune
 *   URL n'est validée : la structure peut en accueillir d'autres.
 */
import { landingDestinationUrl, type LandingDestinationId } from "./destinations"

export type LandingFooterNavigationLink = {
  label: string
  destination: LandingDestinationId
  href: string
}

export type LandingFooterNavigationGroup = {
  label: string
  links: readonly LandingFooterNavigationLink[]
}

export type LandingLegalLink = {
  label: string
  /** URL absolue https, sans suivi. */
  href: string
}

const navigationLink = (label: string, destination: LandingDestinationId): LandingFooterNavigationLink => ({
  label,
  destination,
  href: landingDestinationUrl(destination),
})

export const landingFooterNavigationGroups: readonly LandingFooterNavigationGroup[] = [
  {
    label: "Explorer",
    links: [
      navigationLink("Formations", "catalogue-formations"),
      navigationLink("Diplômes", "diplomes"),
      navigationLink("Certificats", "certificats"),
    ],
  },
  {
    label: "Votre projet",
    links: [
      navigationLink("Métiers", "metiers"),
      navigationLink("Financement", "financement"),
      navigationLink("Accompagnement", "accompagnement"),
    ],
  },
]

export const landingLegalLinks: readonly LandingLegalLink[] = [
  { label: "Mentions légales", href: "https://www.studi.com/fr/mentions-legales" },
]
