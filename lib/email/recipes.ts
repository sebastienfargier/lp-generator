/**
 * Recettes de composition Email V2 : trois façons contrôlées d'assembler les
 * lames existantes. Une recette décrit des CONTRAINTES (quelles lames, combien
 * de sections, quel budget de boutons, quelles images, quelle zone colorée,
 * quelles preuves), jamais du HTML ni du CSS.
 *
 * - R1 `discovery-reassurance` : email rassurant de découverte, hero humain,
 *   un ou deux blocs de progression, un appel à découvrir.
 * - R2 `editorial-newsletter` : newsletter à part entière, hero newsletter
 *   (bandeau image ou frise de portraits), rythme éditorial.
 * - R3 `brand-proof` : email construit autour de preuves Studi, uniquement les
 *   claims approuvées de la couche Brand (`claims.ts`), copiées telles quelles.
 *
 * Ce module est ADDITIF et HORS LIGNE : le Draft V1, son resolver, son prompt
 * et la route de génération ne le connaissent pas. Il ne contient aucune
 * logique : `recipe-resolver.ts` compose un EmailConfig, `recipe-validation.ts`
 * le vérifie. Aucune dépendance, aucun moteur de workflow : des données typées.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailDestinationId } from "./destinations"
import type { EmailType } from "./generation-request"
import type { EmailPortraitStripId, EmailVisualIntent } from "./image-bank"
import type { EmailSurface } from "./surfaces"
import type { EmailBlockType } from "./types"

export const emailRecipeIds = ["discovery-reassurance", "editorial-newsletter", "brand-proof"] as const
export type EmailRecipeId = (typeof emailRecipeIds)[number]

/* -------------------------------------------------------------------------- */
/* Vocabulaire sémantique : ce que l'IA pourra choisir                         */
/* -------------------------------------------------------------------------- */

/** Présentations du hero : le choix d'une lame se fait par sa disposition, jamais par son identifiant. */
export const emailHeroLayouts = ["large", "medium", "split", "banner", "portrait-strip"] as const
export type EmailHeroLayout = (typeof emailHeroLayouts)[number]

export const emailRecipeHeroLames = {
  large: "email-module-hero-promotional-image-large",
  medium: "email-module-hero-promotional-image-medium",
  split: "email-module-hero-split-image",
  banner: "email-hero-newsletter-variant-02",
  "portrait-strip": "email-hero-newsletter-variant-01",
} as const satisfies Record<EmailHeroLayout, EmailBlockType>

/** Sections de corps : un sens éditorial, pas une lame. */
export const emailRecipeSectionKinds = [
  "steps",
  "grid",
  "benefits",
  "text",
  "feature",
  "illustrated",
  "closing",
  "claim-list",
  "claim-highlight",
  "claim-text",
] as const
export type EmailRecipeSectionKind = (typeof emailRecipeSectionKinds)[number]

export const emailRecipeSectionLames = {
  steps: "email-module-numbered-list",
  grid: "email-module-numbererd-grid",
  benefits: "email-module-icons-list",
  text: "email-module-text-only",
  feature: "email-module-text-and-feature-card",
  illustrated: "email-module-text-and-cta-variant-02",
  closing: "email-module-text-and-cta-variant-01",
  "claim-list": "email-module-numbered-list",
  "claim-highlight": "email-module-benefits-compact-highlights",
  "claim-text": "email-module-text-only",
} as const satisfies Record<EmailRecipeSectionKind, EmailBlockType>

/** Rôle éditorial d'une section : les trois formes de preuve comptent pour un seul rôle. */
export type EmailRecipeRole = "hero" | "steps" | "grid" | "benefits" | "text" | "feature" | "illustrated" | "closing" | "proof"

export const emailRecipeSectionRoles = {
  steps: "steps",
  grid: "grid",
  benefits: "benefits",
  text: "text",
  feature: "feature",
  illustrated: "illustrated",
  closing: "closing",
  "claim-list": "proof",
  "claim-highlight": "proof",
  "claim-text": "proof",
} as const satisfies Record<EmailRecipeSectionKind, EmailRecipeRole>

/** Icônes de la liste à icônes : huit sens lisibles sur Page (le catalogue en compte 40). */
export const emailRecipeIcons = ["briefcase", "graduation-cap", "handshake-simple", "laptop", "lightbulb", "magnifying-glass", "stopwatch", "users"] as const
export type EmailRecipeIcon = (typeof emailRecipeIcons)[number]

/**
 * Lames dont le fond est sombre par construction : elles forment une zone
 * colorée forte sans porter de `surface`. Le bandeau preheader (fin liseré
 * au-dessus du header) n'en fait pas partie.
 */
export const emailIntrinsicDarkLames = [
  "email-module-banner-full",
  "email-module-benefits-compact-highlights",
  "email-module-discount-banner-full",
  "email-module-hero-offer-image-top",
  "email-module-hero-split-image-dark",
] as const satisfies readonly EmailBlockType[]

/** Bandeau preheader : seul support propre d'un lien texte secondaire hors du corps (label + lien). */
export const emailRecipePreheaderLame = "email-module-preheader" as const satisfies EmailBlockType

/** Un lien texte vers la destination du bandeau, sans second bouton. */
export const emailRecipeSecondaryLinkLame = emailRecipePreheaderLame

/* -------------------------------------------------------------------------- */
/* Forme d'une recette                                                        */
/* -------------------------------------------------------------------------- */

type Range = { min: number; max: number }

export type EmailRecipe = {
  id: EmailRecipeId
  label: string
  purpose: string
  /** Types d'email des sources auxquels la recette répond. */
  emailTypes: readonly EmailType[]
  /** Sections de contenu entre le header et les mentions/footer, hero compris. */
  contentSections: Range
  heroLayouts: readonly EmailHeroLayout[]
  /** Rôles requis et facultatifs, chacun au plus une fois ; tout autre rôle est refusé. */
  roles: { required: readonly EmailRecipeRole[]; optional: readonly EmailRecipeRole[] }
  /** Budget de boutons : un seul bouton principal (une destination), éventuellement répété. */
  cta: { buttons: number; secondaryLinks: number }
  destinations: readonly EmailDestinationId[]
  images: {
    /** Intentions autorisées pour les visuels uniques (hero, section illustrée). */
    intents: readonly EmailVisualIntent[]
    /** Frises de portraits autorisées (aucune : la recette n'utilise pas de frise). */
    strips: readonly EmailPortraitStripId[]
  }
  surface: {
    /** Où la zone colorée forte se pose. */
    zone: "hero" | "proof"
    default: EmailSurface
    allowed: readonly EmailSurface[]
  }
  /** Preuves : nombre de claims approuvées dans l'email. `max: 0` : aucune. */
  claims: Range
  /** Mentions légales : seulement celles qu'appelle une claim utilisée. */
  disclaimers: "from-claims"
  /** Chiffres : `none` interdit tout nombre ; `claims-only` n'admet que ceux d'une claim approuvée. */
  figures: "none" | "claims-only"
  /** Longueur indicative du texte de contenu, en mots. */
  density: Range
}

const discoveryDestinations = ["metiers", "catalogue-formations", "accompagnement", "methode", "coaching-carriere", "competences-360"] as const
const editorialDestinations = ["trajectoire-magazine", "blog", "catalogue-formations", "metiers", "methode", "blog-les-tips-et-conseils", "blog-la-vie-pro", "blog-reconversion-professionnelle"] as const
const proofDestinations = ["catalogue-formations", "methode", "accompagnement", "metiers", "alternance"] as const

export const emailRecipes = {
  "discovery-reassurance": {
    id: "discovery-reassurance",
    label: "Découverte et réassurance",
    purpose: "Rassurer une personne qui explore une orientation : un hero humain, une progression en étapes, éventuellement des appuis, puis un appel à découvrir.",
    emailTypes: ["lifecycle-debut"],
    contentSections: { min: 3, max: 5 },
    heroLayouts: ["large", "medium", "split"],
    roles: { required: ["hero", "steps", "closing"], optional: ["benefits", "text"] },
    cta: { buttons: 2, secondaryLinks: 0 },
    destinations: discoveryDestinations,
    images: { intents: ["warm-reassurance", "career-movement"], strips: [] },
    surface: { zone: "hero", default: "marque", allowed: ["marque", "accent-2-soft"] },
    claims: { min: 0, max: 0 },
    disclaimers: "from-claims",
    figures: "none",
    density: { min: 80, max: 280 },
  },
  "editorial-newsletter": {
    id: "editorial-newsletter",
    label: "Newsletter éditoriale",
    purpose: "Une newsletter Studi : hero newsletter (bandeau image ou frise de portraits), puis un rythme éditorial de textes, de rubriques et d'un encart.",
    emailTypes: ["newsletter"],
    contentSections: { min: 3, max: 5 },
    heroLayouts: ["banner", "portrait-strip"],
    roles: { required: ["hero", "text"], optional: ["steps", "grid", "benefits", "feature", "illustrated", "closing"] },
    cta: { buttons: 2, secondaryLinks: 1 },
    destinations: editorialDestinations,
    images: { intents: ["editorial-work"], strips: ["portrait-strip-mixed-01", "portrait-strip-mixed-02"] },
    surface: { zone: "hero", default: "marque", allowed: ["marque"] },
    claims: { min: 0, max: 0 },
    disclaimers: "from-claims",
    figures: "none",
    density: { min: 110, max: 380 },
  },
  "brand-proof": {
    id: "brand-proof",
    label: "Preuves de marque",
    purpose: "Un email construit autour de deux ou trois preuves Studi approuvées, copiées au caractère près, sans offre ni témoignage.",
    emailTypes: ["newsletter", "lifecycle-debut"],
    contentSections: { min: 3, max: 5 },
    heroLayouts: ["large", "medium", "split"],
    roles: { required: ["hero", "proof"], optional: ["text", "benefits"] },
    cta: { buttons: 1, secondaryLinks: 0 },
    destinations: proofDestinations,
    images: { intents: ["campaign-portrait", "editorial-work"], strips: [] },
    surface: { zone: "proof", default: "marque", allowed: ["marque"] },
    claims: { min: 2, max: 3 },
    disclaimers: "from-claims",
    figures: "claims-only",
    density: { min: 70, max: 260 },
  },
} as const satisfies Record<EmailRecipeId, EmailRecipe>

/** Types de lames que l'une des recettes peut produire (hero, corps), hors shell. */
export function emailRecipeLames(recipeId: EmailRecipeId): EmailBlockType[] {
  const recipe: EmailRecipe = emailRecipes[recipeId]
  const roles = new Set<EmailRecipeRole>([...recipe.roles.required, ...recipe.roles.optional])
  const heroes = recipe.heroLayouts.map((layout) => emailRecipeHeroLames[layout])
  const sections = emailRecipeSectionKinds.filter((kind) => roles.has(emailRecipeSectionRoles[kind])).map((kind) => emailRecipeSectionLames[kind])
  return [...new Set<EmailBlockType>([...heroes, ...sections])]
}
