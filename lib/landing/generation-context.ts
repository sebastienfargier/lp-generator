import { landingDestinations, landingDestinationUrl, type LandingDestinationId } from "./destinations"
import type { LandingGenerationRequest } from "./generation-request"
import { landingImages, type LandingCatalogImage } from "./image-catalog"
import { getSectionCatalogForPrompt } from "./section-catalog"
import type { LandingSectionType } from "./types"

/**
 * Contexte d'une génération Landing : ce que le modèle peut employer pour
 * CETTE génération. Compact et sérialisable (aucun JSX, composant, fonction,
 * className, Tailwind ni CSS).
 *
 * Il ne dit pas quelle section choisir : aucun « objectif X → hero A →
 * section B ». Il retire seulement ce qui ne peut pas être employé sans
 * inventer, et le modèle décide du reste (sections, nombre, ordre, contenu)
 * dans les limites de `LandingPageSchema`.
 */

export type LandingGenerationResources = {
  images: readonly LandingCatalogImage[]
  destinations: readonly { id: string; label: string; url: string; usage: string }[]
}

/** Ressources contrôlées du POC : catalogues d'images et de destinations. */
export const landingResources: LandingGenerationResources = {
  images: landingImages,
  destinations: (Object.keys(landingDestinations) as LandingDestinationId[]).map((id) => ({
    id,
    label: landingDestinations[id].label,
    url: landingDestinationUrl(id),
    usage: landingDestinations[id].usage,
  })),
}

/**
 * Sections qui portent des données commerciales structurées : formation
 * nommée, prix, financement, partenaire, badges. Aucune source produit
 * contrôlée n'existe : elles ne sont pas proposées. Le contrat, les
 * composants et les exemples les gardent.
 */
const commercialSections = {
  "product-hero": "Porte une formation nommée, un prix, un financement et un partenaire : aucune source produit contrôlée.",
  "product-grid": "Exige des produits nommés, avec lien, image et prix : aucune source produit contrôlée.",
} as const satisfies Partial<Record<LandingSectionType, string>>

/** Sections dont les données exigent au moins une image du catalogue. */
const sectionsNeedingImages: ReadonlySet<LandingSectionType> = new Set([
  "editorial-hero",
  "immersive-hero",
  "content-carousel",
  "audience-switcher",
])

/** Sections écartées pour ces ressources, avec la raison. */
export function explainLandingSectionSelection(
  resources: LandingGenerationResources = landingResources
): Partial<Record<LandingSectionType, string>> {
  const excluded: Partial<Record<LandingSectionType, string>> = { ...commercialSections }
  if (resources.images.length === 0) {
    for (const type of sectionsNeedingImages) excluded[type] = "Exige une image du catalogue : aucune image disponible."
  }
  return excluded
}

const resourceRules = [
  { id: "images-only", rule: "Une image se désigne par son id, pris dans context.images. Aucun partenaire, prix ni produit n'est disponible." },
  { id: "image-reuse", rule: "Ne pas répéter une image dans plusieurs sections sans nécessité." },
  { id: "image-framing", rule: "Les images sont des photos paysage 3:2 ; le cadrage est géré par l'application." },
  { id: "destination-only", rule: "La destination d'un CTA se désigne par son id, pris dans context.destinations. Aucun lien n'est écrit." },
  { id: "cta-label", rule: "Le libellé d'un CTA décrit sa destination, sans promettre davantage." },
  { id: "no-contact", rule: "Aucune destination de contact, de formulaire ni de téléchargement n'existe : aucun CTA ne promet un contact, un formulaire ou un téléchargement." },
  { id: "facts-only", rule: "Un prix, une remise, un pourcentage, une durée, une statistique, un effectif, une certification, un classement, une garantie, un témoignage, un partenaire, une date limite ou un code promo n'apparaît que s'il figure dans request.facts, repris à l'identique." },
] as const

export function buildLandingGenerationContext(
  // La requête ne retire encore aucune ressource : aucun fait structuré n'ouvre
  // une section commerciale. Elle est dans la signature pour la suite.
  _request: LandingGenerationRequest,
  resources: LandingGenerationResources = landingResources
) {
  const excluded = explainLandingSectionSelection(resources)
  const catalog = getSectionCatalogForPrompt()
  return {
    sections: catalog.sections.filter((section) => !(section.type in excluded)),
    destinations: resources.destinations.map((destination) => ({ ...destination })),
    images: resources.images.map((image) => ({ ...image })),
    rules: {
      composition: catalog.rules,
      resources: resourceRules.map(({ id, rule }) => ({ id, rule })),
    },
  }
}

export type LandingGenerationContext = ReturnType<typeof buildLandingGenerationContext>
