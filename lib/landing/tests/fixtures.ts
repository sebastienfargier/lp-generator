/** Données partagées des tests de génération Landing (sans réseau). */
import { buildLandingAiPrompt } from "../ai-prompt"
import { buildLandingGenerationContext } from "../generation-context"
import type { LandingGenerationRequest } from "../generation-request"
import { landingImages } from "../image-catalog"

export const request: LandingGenerationRequest = {
  projectName: "Reconversion RH",
  brief:
    "Créer une landing page pour des professionnels en poste qui souhaitent se reconvertir dans les ressources humaines. L'objectif principal est de leur faire découvrir les formations disponibles.",
  audience: "Professionnels en poste souhaitant changer de métier",
  objective: "discover-trainings",
}

export const context = buildLandingGenerationContext(request)

export const prompt = (() => {
  const built = buildLandingAiPrompt(request)
  if (built.status !== "ready") throw new Error(JSON.stringify(built))
  return built
})()

export const image = landingImages[0]
export const otherImage = landingImages[3]
export const catalogueUrl = context.destinations.find((destination) => destination.id === "catalogue-formations")!.url

export const picture = (source: { src: string; alt: string } = image) => ({ src: source.src, alt: source.alt })

export const section = (id: string, type: string, props: unknown) => ({ id, type, props })

/** Props minimales valides, par type de section. */
export const props = {
  "editorial-hero": () => ({
    title: "Changer de métier, étape par étape",
    visual: picture(),
    primaryAction: { label: "Découvrir les formations", href: catalogueUrl },
    supportingText: "Une reconversion se prépare.",
  }),
  "immersive-hero": () => ({
    headline: ["Une nouvelle voie", "se construit"],
    visual: { ...picture(), position: "center" },
    primaryAction: { label: "Voir les étapes", href: "#parcours" },
  }),
  "value-props": () => ({
    items: [{ title: "En ligne", description: "Vous suivez vos cours à distance." }],
  }),
  pillars: () => ({
    title: "Un parcours en trois temps",
    items: [{ title: "Faire le point", description: "Clarifier votre projet." }],
  }),
  "content-carousel": () => ({
    items: [{ title: "Reprendre une formation", image: picture(otherImage) }],
  }),
  "audience-switcher": () => ({
    items: [{ id: "actifs", eyebrow: "En poste", title: "Salariés", description: "Se former sans tout arrêter.", image: picture(otherImage) }],
  }),
} as const

export const page = (sections: unknown[]) => ({ version: 1, id: "reconversion-rh", title: "Reconversion RH", sections })

/** Réponse de modèle simulée, valide pour `request`. */
export const validOutput = () =>
  page([
    section("hero", "editorial-hero", props["editorial-hero"]()),
    section("parcours", "pillars", props.pillars()),
    section("atouts", "value-props", props["value-props"]()),
  ])

/* -------------------------------------------------------------------------- */
/* Brouillons (LandingGenerationDraft)                                        */
/* -------------------------------------------------------------------------- */

export const draftCta = { label: "Découvrir les formations", destination: "catalogue-formations" } as const

/** Brouillon minimal valide, par lame. */
export const draftSection = {
  "editorial-hero": () => ({
    section: "editorial-hero",
    title: "Changer de métier, étape par étape",
    supportingText: "Une reconversion se prépare.",
    image: "hero-apprenante",
    cta: { ...draftCta },
  }),
  "immersive-hero": () => ({
    section: "immersive-hero",
    headline: ["Une nouvelle voie", "se construit"],
    description: "Explorez les formations à votre rythme.",
    image: "hero-bilan",
    cta: { ...draftCta },
  }),
  "value-props": () => ({
    section: "value-props",
    label: "Pourquoi se former",
    items: [{ title: "En ligne", description: "Vous suivez vos cours à distance." }],
  }),
  pillars: () => ({
    section: "pillars",
    eyebrow: "Votre parcours",
    title: "Un parcours en trois temps",
    description: "Chaque étape prépare la suivante.",
    items: [{ title: "Faire le point", description: "Clarifier votre projet." }],
  }),
  "content-carousel": () => ({
    section: "content-carousel",
    label: "À découvrir",
    items: [{ eyebrow: "Conseil", title: "Reprendre une formation", image: "content-1" }],
  }),
  "audience-switcher": () => ({
    section: "audience-switcher",
    label: "Vous êtes",
    items: [{ eyebrow: "En poste", title: "Salarié", description: "Se former sans tout arrêter.", image: "audience-1" }],
  }),
} as const

export const draftOf = (...sections: unknown[]) => ({ sections })

/** Brouillon de modèle simulé, valide : un hero, un parcours, des bénéfices. */
export const validDraft = () => draftOf(draftSection["editorial-hero"](), draftSection.pillars(), draftSection["value-props"]())
