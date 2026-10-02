import type { LandingSectionType } from "./types"

/**
 * Catalogue des sections destiné au futur générateur IA : à quoi sert chaque
 * section, quand l'utiliser ou l'éviter, et les règles de composition.
 *
 * Ce n'est pas le renderer (le rendu reste un switch exhaustif dans
 * `components/landing/section-renderer.tsx`) et il ne décrit aucun design :
 * l'IA choisit la structure et le contenu, les composants gèrent l'apparence.
 * Aucun import React : utilisable côté serveur.
 */

export const sectionCategories = ["hero", "product", "content", "audience", "conversion"] as const

export type SectionCategory = (typeof sectionCategories)[number]

export type SectionCatalogEntry<Type extends LandingSectionType = LandingSectionType> = {
  type: Type
  name: string
  category: SectionCategory
  /** `first` : la section ne peut être que la première de la page (heroes). */
  placement: "first" | "any"
  description: string
  bestFor: readonly string[]
  avoidWhen: readonly string[]
  /** Consignes éditoriales complémentaires pour remplir la section. */
  guidance?: readonly string[]
}

/**
 * Une entrée par type de section. `satisfies` rend le catalogue exhaustif :
 * un nouveau LandingSectionType sans entrée, ou une entrée dont `type` ne
 * correspond pas à sa clé, est une erreur TypeScript.
 */
const catalog = {
  "product-hero": {
    type: "product-hero",
    name: "ProductHero",
    category: "hero",
    placement: "first",
    description:
      "Hero transactionnel centré sur une formation ou une offre précise : titre, description, badges, prix et financement, deux CTA, partenaire, visuel et liste de points clés.",
    bestFor: [
      "page d'une formation précise",
      "mise en avant du prix",
      "financement (CPF, etc.)",
      "conversion produit",
      "informations produit essentielles",
    ],
    avoidWhen: [
      "la page présente plusieurs formations équivalentes",
      "le message principal est d'abord une problématique ou une audience",
    ],
  },
  "editorial-hero": {
    type: "editorial-hero",
    name: "EditorialHero",
    category: "hero",
    placement: "first",
    description:
      "Hero éditorial : un grand titre centré qui pose la proposition, un visuel encadré, un CTA principal et une phrase de réassurance. Le message est expliqué, pas seulement affirmé.",
    bestFor: [
      "le visiteur a besoin de comprendre la proposition avant d'agir",
      "le message demande du contexte ou de la réassurance",
      "approche pédagogique ou explicative",
      "le texte secondaire joue un rôle important",
    ],
    avoidWhen: [
      "le message tient en une promesse très courte, portée surtout par l'image",
      "le prix ou les détails d'une formation précise constituent le message principal",
    ],
    guidance: [
      "title : une phrase complète qui pose la proposition ; elle n'est pas découpée en lignes",
      "supportingText : une phrase qui rassure ou précise, jamais purement décorative",
    ],
  },
  "immersive-hero": {
    type: "immersive-hero",
    name: "ImmersiveHero",
    category: "hero",
    placement: "first",
    description:
      "Hero à fort impact visuel : image plein cadre en arrière-plan, titre découpé ligne par ligne (direction artistique), description courte et CTA.",
    bestFor: [
      "l'impact visuel est prioritaire",
      "le message repose sur une promesse courte et forte",
      "la campagne cherche une réaction émotionnelle",
      "le titre se découpe naturellement en quelques lignes courtes",
      "une grande image participe fortement au message",
      "une campagne dynamique, y compris promotionnelle, lorsque le brief l'exprime",
    ],
    avoidWhen: [
      "le message a besoin d'être expliqué ou nuancé avant l'action",
      "beaucoup d'informations produit doivent apparaître immédiatement",
    ],
    guidance: [
      "headline : 2 à 4 lignes courtes, chaque entrée est une ligne affichée telle quelle",
      "description : une phrase courte qui prolonge la promesse, pas un paragraphe",
    ],
  },
  "value-props": {
    type: "value-props",
    name: "ValueProps",
    category: "content",
    placement: "any",
    description:
      "Liste compacte de bénéfices ou de preuves parallèles, chacun avec un titre et une description d'une phrase.",
    bestFor: [
      "3 à 5 bénéfices courts",
      "réassurance",
      "avantages",
      "preuves simples",
    ],
    avoidWhen: ["chaque idée nécessite un long développement"],
    guidance: [
      "court et compact ; pour des idées développées, préférer pillars",
      "ne jamais utiliser comme hero",
    ],
  },
  pillars: {
    type: "pillars",
    name: "PillarsSection",
    category: "content",
    placement: "any",
    description:
      "Introduction (surtitre, titre, description) suivie de piliers numérotés automatiquement, chacun avec un titre et un paragraphe explicatif.",
    bestFor: [
      "méthodologie",
      "piliers d'une offre",
      "explications structurées",
    ],
    avoidWhen: ["les messages sont de simples bénéfices d'une ligne"],
    guidance: [
      "plus développé et structuré que value-props ; principes parallèles ; l'ordre des items est l'ordre de numérotation",
    ],
  },
  "product-grid": {
    type: "product-grid",
    name: "ProductGrid",
    category: "product",
    placement: "any",
    description:
      "Grille de cartes cliquables présentant plusieurs formations ou produits : image, badge, partenaire et prix.",
    bestFor: [
      "catalogue court",
      "sélection de formations",
      "comparaison visuelle d'offres",
    ],
    avoidWhen: ["une seule formation constitue toute la proposition"],
    guidance: [
      "ne pas inventer de produits : n'utiliser que ceux fournis par le brief ou une source produit",
      "produits de démonstration uniquement si le mode de génération l'autorise",
    ],
  },
  "content-carousel": {
    type: "content-carousel",
    name: "ContentCarousel",
    category: "content",
    placement: "any",
    description:
      "Carrousel horizontal de contenus éditoriaux, chacun avec une catégorie, un titre et une photo.",
    bestFor: [
      "articles",
      "guides",
      "témoignages éditoriaux",
      "ressources",
      "inspiration",
    ],
    avoidWhen: [
      "le contenu est essentiel au parcours principal et doit être vu entièrement sans interaction",
    ],
  },
  "audience-switcher": {
    type: "audience-switcher",
    name: "AudienceSwitcher",
    category: "audience",
    placement: "any",
    description:
      "Plusieurs profils affichés côte à côte (surtitre, titre, description) ; le profil sélectionné change le grand visuel associé.",
    bestFor: [
      "plusieurs audiences",
      "plusieurs situations professionnelles",
      "personas",
      "messages contextualisés",
    ],
    avoidWhen: ["la page ne cible qu'un seul profil"],
    guidance: [
      "chaque profil a son propre visuel, affiché quand il est sélectionné",
    ],
  },
  "narrative-split": {
    type: "narrative-split",
    name: "NarrativeSplit",
    category: "content",
    placement: "any",
    description:
      "Une idée développée : image d'un côté, surtitre, titre et paragraphe de l'autre.",
    bestFor: [
      "développer une idée importante de la page : manière d'apprendre, accompagnement, étape du projet, contexte d'une promesse",
    ],
    avoidWhen: [
      "l'idée tient en une phrase : préférer value-props",
      "plusieurs idées parallèles à présenter ensemble : préférer pillars",
      "la page est déjà dense",
    ],
    guidance: [
      "eyebrow : 2 à 4 mots, environ 30 caractères",
      "title : environ 60 à 70 caractères",
      "description : 2 à 3 phrases, environ 200 à 300 caractères",
      "une idée distincte par narrative-split",
      "1 à 3 narrative-split par page",
      "l'image change de côté d'une narrative-split à l'autre ; ce côté n'est jamais à choisir",
    ],
  },
  "step-sequence": {
    type: "step-sequence",
    name: "StepSequence",
    category: "content",
    placement: "any",
    description:
      "Une progression ordonnée de trois ou quatre étapes, chacune avec un titre et une phrase.",
    bestFor: [
      "parcours de découverte ou raisonnement séquentiel en 3 ou 4 temps, tiré du brief",
    ],
    avoidWhen: [
      "idées parallèles ou bénéfices : préférer pillars ou value-props",
      "pas de vraie progression, ou idées déjà présentées en étapes",
      "procédure opérationnelle Studi",
    ],
    guidance: [
      "progression éditoriale ; chaque étape dit ce que la personne peut explorer, comparer, identifier ou préciser",
      "ne présente jamais comme processus Studi des étapes d'inscription, d'admission, de financement, de contact ou de suivi, ni délai, condition ou résultat, sauf s'ils figurent dans request.facts",
      "3 étapes de préférence ; ne pas écrire leur nombre dans le titre",
      "section : titre ~50-60 caractères, phrase ~100-120 ; étape : titre 2 à 4 mots, phrase ~70-110",
      "une seule par page, au milieu, pas juste après pillars ou value-props",
    ],
  },
  "destination-cards": {
    type: "destination-cards",
    name: "DestinationCards",
    category: "conversion",
    placement: "any",
    description:
      "Deux ou trois suites cliquables vers des destinations Studi : titre et courte description, sans image.",
    bestFor: [
      "la page peut mener vers plusieurs suites pertinentes : métiers, diplômes, financement, accompagnement, méthode, certificats",
    ],
    avoidWhen: [
      "une seule suite est évidente : préférer final-cta",
      "plus de trois suites sont nécessaires",
      "la page expose déjà ces mêmes suites",
    ],
    guidance: [
      "2 à 3 cartes, 3 de préférence",
      "chaque carte pointe une destination différente",
      "le titre de carte nomme clairement la suite et sert de texte de lien : environ 25 à 40 caractères",
      "description de carte : une phrase d'environ 90 à 120 caractères, fidèle à l'usage de la destination et sans promesse",
      "titre de section : environ 60 caractères ; description de section : environ 120 caractères",
      "une seule destination-cards par page, au milieu ou en bas de page, avant la clôture si elle existe",
      "choisir des destinations complémentaires ; reprendre une destination du hero ou de la clôture est permis",
    ],
  },
  "campaign-spotlight": {
    type: "campaign-spotlight",
    name: "CampaignSpotlight",
    category: "conversion",
    placement: "any",
    description:
      "Mise en avant visuelle d'une communication ou annonce précise Studi, avec image et CTA.",
    bestFor: [
      "annonce explicite : live, événement, actualité, campagne éditoriale ou communication spéciale",
    ],
    avoidWhen: [
      "le brief ne contient aucune annonce précise à mettre en avant : préférer narrative-split pour développer une idée",
    ],
    guidance: [
      "uniquement si le brief contient une annonce explicite",
      "CTA obligatoire, vers la destination existante la plus cohérente avec le but de l'annonce",
      "une seule par page, jamais en ouverture",
      "ne reprends des faits événementiels que depuis request.facts",
      "title + accent forment une phrase naturelle (~60 caractères) ; description : 1 à 2 phrases",
    ],
  },
  "final-cta": {
    type: "final-cta",
    name: "FinalCta",
    category: "conversion",
    placement: "any",
    description:
      "Bandeau de clôture avec titre, phrase courte et action unique.",
    bestFor: [
      "la page a une action naturelle de poursuite : catalogue, métiers, financement, accompagnement",
    ],
    avoidWhen: [
      "aucune poursuite n'est évidente",
      "la page se conclut déjà suffisamment sur une autre invitation",
    ],
    guidance: [
      "title : une phrase d'invitation, environ 70 caractères",
      "description : 1 à 2 phrases, environ 160 caractères",
      "cta.label : 2 à 4 mots qui décrivent la destination",
      "la destination du hero peut être reprise si c'est la suite logique",
    ],
  },
} as const satisfies { [Type in LandingSectionType]: SectionCatalogEntry<Type> }

const catalogByType: { [Type in LandingSectionType]: SectionCatalogEntry<Type> } =
  catalog

export const sectionCatalog: readonly SectionCatalogEntry[] =
  Object.values(catalogByType)

export function getSectionCatalogEntry<Type extends LandingSectionType>(
  type: Type
): SectionCatalogEntry<Type> {
  return catalogByType[type]
}

/** Règles de composition d'une landing page, à destination de l'IA. */
export const compositionRules = [
  { id: "single-hero", rule: "Au maximum un hero par landing page." },
  { id: "hero-first", rule: "Si un hero est présent, il est toujours la première section." },
  { id: "hero-by-message", rule: "Le type de hero se choisit d'après la manière dont le message doit être présenté (explication et réassurance, ou impact visuel et promesse courte), jamais parce qu'un hero est listé en premier : aucun n'est un choix par défaut. Interpréter le brief." },
  { id: "closing-last", rule: "Une section de clôture, si elle est utilisée, est la dernière section de la page et n'apparaît qu'une fois." },
  { id: "no-exhaustive-use", rule: "Ne pas utiliser toutes les sections par défaut : ne choisir que celles utiles au brief." },
  { id: "editorial-purpose", rule: "Chaque section doit avoir une raison éditoriale claire dans le parcours." },
  { id: "no-redundancy", rule: "Éviter deux sections consécutives qui disent essentiellement la même chose." },
  { id: "short-and-coherent", rule: "Préférer une page courte et cohérente à une page remplie artificiellement." },
  { id: "internal-anchors", rule: "Un CTA interne (href commençant par #) doit pointer vers l'id d'une section existante de la page." },
  { id: "section-ids", rule: "Les ids de section sont courts, descriptifs, uniques, en minuscules avec tirets (ex. formations, profils)." },
] as const

/**
 * Représentation JSON du catalogue et des règles, prête à être insérée dans
 * un prompt. Structure simple et testable (pas encore le prompt complet).
 */
export function getSectionCatalogForPrompt() {
  return {
    categories: [...sectionCategories],
    sections: sectionCatalog.map((entry) => ({
      type: entry.type,
      category: entry.category,
      isHero: entry.placement === "first",
      description: entry.description,
      bestFor: [...entry.bestFor],
      avoidWhen: [...entry.avoidWhen],
      guidance: entry.guidance ? [...entry.guidance] : [],
    })),
    rules: compositionRules.map(({ id, rule }) => ({ id, rule })),
  }
}
