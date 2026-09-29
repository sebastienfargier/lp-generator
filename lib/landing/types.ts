/**
 * Contrat de données d'une landing page, destiné au générateur.
 *
 * Tout ce qui est décrit ici est sérialisable en JSON et indépendant du rendu :
 * aucun type React, Tailwind, shadcn ou Lucide. Le futur renderer adaptera ces
 * configurations vers les Props des composants de `components/sections/*`.
 */

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Icônes autorisées dans une configuration. Le renderer les traduira en
 * composants (ex. "arrow-right" → ArrowRight). Liste volontairement fermée.
 */
export type LandingIconName = "arrow-right" | "check" | "download" | "phone"

/**
 * Variantes de badge utilisables dans une landing page (sous-ensemble des
 * variantes de `components/ui/badge.tsx`, sans les variantes d'état ou
 * techniques : destructive, ghost, link).
 */
export type LandingBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "accent-1"
  | "accent-2-soft"
  | "brand-soft"

export type LandingImage = {
  src: string
  /** Chaîne vide si l'image est purement décorative. */
  alt: string
}

/** Image dont les dimensions intrinsèques sont nécessaires (logos). */
export type LandingLogo = LandingImage & {
  width: number
  height: number
}

export type LandingImagePosition = "center" | "left" | "right"

export type LandingAction = {
  label: string
  href: string
  /** Absent : icône par défaut de la section. `null` : aucune icône. */
  icon?: LandingIconName | null
}

export type LandingBadge = {
  label: string
  variant?: LandingBadgeVariant
}

export type LandingPartner = {
  label: string
  name: string
  /** À défaut de logo, `name` est affiché en texte. */
  logo?: LandingLogo
}

export type LandingPricing = {
  /** Valeurs déjà formatées (ex. "990 €"). */
  price: string
  originalPrice?: string
  discount?: string
  installment?: string
  financing?: {
    title: string
    description?: string
  }
}

/** Bloc titre + description, partagé par ValueProps et PillarsSection. */
export type LandingTextItem = {
  title: string
  description: string
}

/* -------------------------------------------------------------------------- */
/* Données des sections                                                       */
/* -------------------------------------------------------------------------- */

export type LandingHighlight = {
  title: string
  items: string[]
  icon?: LandingIconName
}

/** Produit / formation affiché dans une grille de cartes. */
export type LandingProduct = {
  title: string
  href: string
  image: LandingImage
  badge?: LandingBadge
  partner?: LandingPartner
  pricing?: LandingPricing
}

export type LandingContentItem = {
  eyebrow?: string
  title: string
  image: LandingImage
}

export type LandingAudienceItem = {
  id: string
  eyebrow: string
  title: string
  description: string
  image: LandingImage
}

/* -------------------------------------------------------------------------- */
/* Configurations des 8 sections                                              */
/* -------------------------------------------------------------------------- */

export type ProductHeroConfig = {
  title: string
  description?: string
  badges?: LandingBadge[]
  pricing?: LandingPricing
  primaryAction?: LandingAction
  secondaryAction?: LandingAction
  partner?: LandingPartner
  visual: LandingImage
  highlight?: LandingHighlight
}

export type EditorialHeroConfig = {
  title: string
  visual: LandingImage
  primaryAction?: LandingAction
  supportingText?: string
}

export type ImmersiveHeroConfig = {
  /** Une entrée par ligne : le découpage fait partie de la direction artistique. */
  headline: string[]
  visual: LandingImage & { position?: LandingImagePosition }
  logo?: LandingLogo
  badge?: LandingBadge
  description?: string
  primaryAction?: LandingAction
}

export type ProductGridConfig = {
  /** Nom accessible de la section. */
  label?: string
  products: LandingProduct[]
}

export type ValuePropsConfig = {
  label?: string
  items: LandingTextItem[]
}

export type PillarsConfig = {
  eyebrow?: string
  title: string
  description?: string
  /** Numérotés automatiquement par la section, dans cet ordre. */
  items: LandingTextItem[]
}

export type ContentCarouselConfig = {
  label?: string
  items: LandingContentItem[]
}

export type AudienceSwitcherConfig = {
  label?: string
  /** `id` de l'audience sélectionnée au chargement ; à défaut, la première. */
  defaultValue?: string
  items: LandingAudienceItem[]
}

/* -------------------------------------------------------------------------- */
/* Landing page                                                               */
/* -------------------------------------------------------------------------- */

/** Correspondance entre l'identifiant d'une section et sa configuration. */
export type LandingSectionConfigMap = {
  "product-hero": ProductHeroConfig
  "editorial-hero": EditorialHeroConfig
  "immersive-hero": ImmersiveHeroConfig
  "product-grid": ProductGridConfig
  "value-props": ValuePropsConfig
  pillars: PillarsConfig
  "content-carousel": ContentCarouselConfig
  "audience-switcher": AudienceSwitcherConfig
}

export type LandingSectionType = keyof LandingSectionConfigMap

/**
 * Union discriminée par `type` : pour chaque identifiant, `props` est
 * automatiquement typé avec la configuration correspondante.
 */
export type LandingPageSection = {
  [Type in LandingSectionType]: {
    /** Clé React, ancre HTML (`#id`) et cible d'édition d'une section. */
    id: string
    type: Type
    props: LandingSectionConfigMap[Type]
  }
}[LandingSectionType]

/** Section d'un type donné (ex. `LandingSectionOf<"value-props">`). */
export type LandingSectionOf<Type extends LandingSectionType> = Extract<
  LandingPageSection,
  { type: Type }
>

export type LandingPageConfig = {
  /** Version du format, pour permettre de le faire évoluer. */
  version: 1
  id: string
  /** Titre interne ; n'est pas affiché automatiquement dans la page. */
  title: string
  /** Sections dans leur ordre d'affichage. */
  sections: LandingPageSection[]
}
