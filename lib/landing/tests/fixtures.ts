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
  "narrative-split": () => ({
    eyebrow: "Votre rythme",
    title: "Se former en gardant sa vie en équilibre",
    description: "Apprendre en parallèle d'un emploi ou d'un quotidien déjà chargé demande de la souplesse.",
    visual: picture(),
  }),
  "step-sequence": () => ({
    title: "Clarifier son projet pas à pas",
    description: "Quelques repères pour passer d'une première idée à une direction plus précise.",
    items: [
      { title: "Explorer les possibilités", description: "Parcourez les domaines et les métiers qui vous attirent, sans vous fermer de porte." },
      { title: "Comparer les pistes", description: "Mettez en regard ce que chaque piste demande et ce qu'elle peut vous apporter." },
      { title: "Préciser son choix", description: "Gardez la piste qui correspond le mieux à votre situation et à vos envies." },
    ],
  }),
  "destination-cards": () => ({
    title: "Trois façons de poursuivre votre exploration",
    description: "Explorez votre projet par métier, par niveau de diplôme ou directement dans le catalogue.",
    items: [
      { title: "Explorer les métiers", description: "Découvrir un métier avant de choisir une formation.", href: "https://www.studi.com/fr/metiers" },
      { title: "Comparer les niveaux de diplôme", description: "Choisir une formation selon le niveau de sortie visé.", href: "https://www.studi.com/fr/diplomes" },
      { title: "Parcourir le catalogue", description: "Consulter l'ensemble des formations, avec des filtres.", href: catalogueUrl },
    ],
  }),
  "campaign-spotlight": () => ({
    title: "Explorez les temps forts",
    accent: "de Studi",
    description: "Découvrez les formations Studi et avancez dans votre projet, à votre rythme.",
    visual: picture(landingImages[9]),
    primaryAction: { label: "Découvrir les formations", href: catalogueUrl },
  }),
  "final-cta": () => ({
    title: "Prêt à explorer les formations ?",
    description: "Parcourez le catalogue Studi pour découvrir les formations qui correspondent à votre projet.",
    primaryAction: { label: "Voir le catalogue", href: catalogueUrl },
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
  "narrative-split": () => ({
    section: "narrative-split",
    eyebrow: "Votre rythme",
    title: "Se former en gardant sa vie en équilibre",
    description: "Apprendre en parallèle d'un emploi ou d'un quotidien déjà chargé demande de la souplesse.",
    image: "content-1",
  }),
  "step-sequence": () => ({
    section: "step-sequence",
    title: "Clarifier son projet pas à pas",
    description: "Quelques repères pour passer d'une première idée à une direction plus précise.",
    items: [
      { title: "Explorer les possibilités", description: "Parcourez les domaines et les métiers qui vous attirent, sans vous fermer de porte." },
      { title: "Comparer les pistes", description: "Mettez en regard ce que chaque piste demande et ce qu'elle peut vous apporter." },
      { title: "Préciser son choix", description: "Gardez la piste qui correspond le mieux à votre situation et à vos envies." },
    ],
  }),
  "destination-cards": () => ({
    section: "destination-cards",
    title: "Trois façons de poursuivre votre exploration",
    description: "Explorez votre projet par métier, par niveau de diplôme ou directement dans le catalogue.",
    items: [
      { title: "Explorer les métiers", description: "Découvrir un métier avant de choisir une formation.", destination: "metiers" },
      { title: "Comparer les niveaux de diplôme", description: "Choisir une formation selon le niveau de sortie visé.", destination: "diplomes" },
      { title: "Parcourir le catalogue", description: "Consulter l'ensemble des formations, avec des filtres.", destination: "catalogue-formations" },
    ],
  }),
  "campaign-spotlight": () => ({
    section: "campaign-spotlight",
    title: "Explorez les temps forts",
    accent: "de Studi",
    description: "Découvrez les formations Studi et avancez dans votre projet, à votre rythme.",
    image: "content-4",
    cta: { label: "Découvrir les formations", destination: "catalogue-formations" },
  }),
  "final-cta": () => ({
    section: "final-cta",
    title: "Prêt à explorer les formations ?",
    description: "Parcourez le catalogue Studi pour découvrir les formations qui correspondent à votre projet.",
    cta: { ...draftCta },
  }),
} as const

export const draftOf = (...sections: unknown[]) => ({ sections })

/** Brouillon de modèle simulé, valide : un hero, un parcours, des bénéfices. */
export const validDraft = () => draftOf(draftSection["editorial-hero"](), draftSection.pillars(), draftSection["value-props"]())
