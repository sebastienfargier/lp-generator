/**
 * Types publics du contrat LandingPageConfig, dérivés des schémas Zod de
 * `./schemas` (source de vérité). Uniquement des imports de types : aucun code
 * runtime, et toujours indépendant de React, Tailwind, shadcn et Lucide.
 */
import type { z } from "zod"

import type {
  AudienceSwitcherConfigSchema,
  ContentCarouselConfigSchema,
  EditorialHeroConfigSchema,
  FinalCtaConfigSchema,
  ImmersiveHeroConfigSchema,
  LandingActionSchema,
  LandingAudienceItemSchema,
  LandingBadgeSchema,
  LandingBadgeVariantSchema,
  LandingContentItemSchema,
  LandingHighlightSchema,
  LandingIconNameSchema,
  LandingImagePositionSchema,
  LandingImageSchema,
  LandingLogoSchema,
  LandingPageSchema,
  LandingPageSectionSchema,
  LandingPartnerSchema,
  LandingPricingSchema,
  LandingProductSchema,
  LandingTextItemSchema,
  PillarsConfigSchema,
  ProductGridConfigSchema,
  ProductHeroConfigSchema,
  ValuePropsConfigSchema,
} from "./schemas"

/* Primitives */
export type LandingIconName = z.infer<typeof LandingIconNameSchema>
export type LandingBadgeVariant = z.infer<typeof LandingBadgeVariantSchema>
export type LandingImage = z.infer<typeof LandingImageSchema>
export type LandingLogo = z.infer<typeof LandingLogoSchema>
export type LandingImagePosition = z.infer<typeof LandingImagePositionSchema>
export type LandingAction = z.infer<typeof LandingActionSchema>
export type LandingBadge = z.infer<typeof LandingBadgeSchema>
export type LandingPartner = z.infer<typeof LandingPartnerSchema>
export type LandingPricing = z.infer<typeof LandingPricingSchema>
export type LandingTextItem = z.infer<typeof LandingTextItemSchema>

/* Données des sections */
export type LandingHighlight = z.infer<typeof LandingHighlightSchema>
export type LandingProduct = z.infer<typeof LandingProductSchema>
export type LandingContentItem = z.infer<typeof LandingContentItemSchema>
export type LandingAudienceItem = z.infer<typeof LandingAudienceItemSchema>

/* Configurations des sections */
export type ProductHeroConfig = z.infer<typeof ProductHeroConfigSchema>
export type EditorialHeroConfig = z.infer<typeof EditorialHeroConfigSchema>
export type ImmersiveHeroConfig = z.infer<typeof ImmersiveHeroConfigSchema>
export type ProductGridConfig = z.infer<typeof ProductGridConfigSchema>
export type ValuePropsConfig = z.infer<typeof ValuePropsConfigSchema>
export type PillarsConfig = z.infer<typeof PillarsConfigSchema>
export type ContentCarouselConfig = z.infer<typeof ContentCarouselConfigSchema>
export type AudienceSwitcherConfig = z.infer<typeof AudienceSwitcherConfigSchema>
export type FinalCtaConfig = z.infer<typeof FinalCtaConfigSchema>

/* Landing page */

/** Union discriminée par `type` : `props` est typé selon la section. */
export type LandingPageSection = z.infer<typeof LandingPageSectionSchema>

export type LandingSectionType = LandingPageSection["type"]

/** Section d'un type donné (ex. `LandingSectionOf<"value-props">`). */
export type LandingSectionOf<Type extends LandingSectionType> = Extract<
  LandingPageSection,
  { type: Type }
>

/** Correspondance entre l'identifiant d'une section et sa configuration. */
export type LandingSectionConfigMap = {
  [Type in LandingSectionType]: LandingSectionOf<Type>["props"]
}

/**
 * `version` : format du contrat · `id` : identifiant technique ·
 * `title` : titre interne, jamais affiché automatiquement ·
 * `sections` : ordre d'affichage.
 */
export type LandingPageConfig = z.infer<typeof LandingPageSchema>
