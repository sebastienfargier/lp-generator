import { z } from "zod"

import type { LandingPageConfig } from "./types"

/**
 * Schémas Zod du contrat LandingPageConfig : source de vérité runtime.
 * Les types publics de `./types` en sont dérivés (`z.infer`).
 *
 * Les objets sont stricts : une propriété inconnue (ex. `className` inventé
 * par un générateur) est une erreur, jamais supprimée silencieusement.
 * Aucune règle de design ici : uniquement la validité des données.
 */

/* -------------------------------------------------------------------------- */
/* Briques                                                                    */
/* -------------------------------------------------------------------------- */

/** Texte obligatoire : au moins un caractère non blanc. */
const text = z.string().regex(/\S/, "Ne doit pas être vide.")

/** Identifiant utilisable comme ancre HTML (`#formations-rh`). */
export const LandingIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "Identifiant invalide : minuscules, chiffres et tirets, commençant par une lettre (ex. formations-rh)."
  )

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

export const LandingIconNameSchema = z.enum([
  "arrow-right",
  "check",
  "download",
  "phone",
])

/** Sous-ensemble des variantes de Badge (sans destructive, ghost, link). */
export const LandingBadgeVariantSchema = z.enum([
  "default",
  "secondary",
  "outline",
  "accent-1",
  "accent-2-soft",
  "brand-soft",
])

export const LandingImagePositionSchema = z.enum(["center", "left", "right"])

const imageShape = {
  src: text,
  /** Chaîne vide autorisée si l'image est purement décorative. */
  alt: z.string(),
}

export const LandingImageSchema = z.strictObject(imageShape)

export const LandingLogoSchema = z.strictObject({
  ...imageShape,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const LandingActionSchema = z.strictObject({
  label: text,
  href: text,
  /** Absent : icône par défaut de la section. `null` : aucune icône. */
  icon: LandingIconNameSchema.nullable().optional(),
})

export const LandingBadgeSchema = z.strictObject({
  label: text,
  variant: LandingBadgeVariantSchema.optional(),
})

export const LandingPartnerSchema = z.strictObject({
  label: text,
  name: text,
  logo: LandingLogoSchema.optional(),
})

export const LandingPricingSchema = z.strictObject({
  price: text,
  originalPrice: text.optional(),
  discount: text.optional(),
  installment: text.optional(),
  financing: z
    .strictObject({
      title: text,
      description: text.optional(),
    })
    .optional(),
})

export const LandingTextItemSchema = z.strictObject({
  title: text,
  description: text,
})

/* -------------------------------------------------------------------------- */
/* Données des sections                                                       */
/* -------------------------------------------------------------------------- */

export const LandingHighlightSchema = z.strictObject({
  title: text,
  items: z.array(text).min(1),
  icon: LandingIconNameSchema.optional(),
})

export const LandingProductSchema = z.strictObject({
  title: text,
  href: text,
  image: LandingImageSchema,
  badge: LandingBadgeSchema.optional(),
  partner: LandingPartnerSchema.optional(),
  pricing: LandingPricingSchema.optional(),
})

export const LandingContentItemSchema = z.strictObject({
  eyebrow: text.optional(),
  title: text,
  image: LandingImageSchema,
})

export const LandingAudienceItemSchema = z.strictObject({
  id: LandingIdSchema,
  eyebrow: text,
  title: text,
  description: text,
  image: LandingImageSchema,
})

/* -------------------------------------------------------------------------- */
/* Configurations des 8 sections                                              */
/* -------------------------------------------------------------------------- */

export const ProductHeroConfigSchema = z.strictObject({
  title: text,
  description: text.optional(),
  badges: z.array(LandingBadgeSchema).min(1).optional(),
  pricing: LandingPricingSchema.optional(),
  primaryAction: LandingActionSchema.optional(),
  secondaryAction: LandingActionSchema.optional(),
  partner: LandingPartnerSchema.optional(),
  visual: LandingImageSchema,
  highlight: LandingHighlightSchema.optional(),
})

export const EditorialHeroConfigSchema = z.strictObject({
  title: text,
  visual: LandingImageSchema,
  primaryAction: LandingActionSchema.optional(),
  supportingText: text.optional(),
})

export const ImmersiveHeroConfigSchema = z.strictObject({
  /** Une entrée par ligne : le découpage fait partie de la direction artistique. */
  headline: z.array(text).min(1),
  visual: z.strictObject({
    ...imageShape,
    position: LandingImagePositionSchema.optional(),
  }),
  logo: LandingLogoSchema.optional(),
  badge: LandingBadgeSchema.optional(),
  description: text.optional(),
  primaryAction: LandingActionSchema.optional(),
})

export const ProductGridConfigSchema = z.strictObject({
  label: text.optional(),
  products: z.array(LandingProductSchema).min(1),
})

export const ValuePropsConfigSchema = z.strictObject({
  label: text.optional(),
  items: z.array(LandingTextItemSchema).min(1),
})

export const PillarsConfigSchema = z.strictObject({
  eyebrow: text.optional(),
  title: text,
  description: text.optional(),
  items: z.array(LandingTextItemSchema).min(1),
})

export const ContentCarouselConfigSchema = z.strictObject({
  label: text.optional(),
  items: z.array(LandingContentItemSchema).min(1),
})

export const AudienceSwitcherConfigSchema = z
  .strictObject({
    label: text.optional(),
    defaultValue: LandingIdSchema.optional(),
    items: z.array(LandingAudienceItemSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>()
    config.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: `Identifiant d'audience en double : "${item.id}".`,
        })
      }
      seen.add(item.id)
    })
    if (config.defaultValue !== undefined && !seen.has(config.defaultValue)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: `defaultValue "${config.defaultValue}" ne correspond à aucune audience (${[...seen].join(", ")}).`,
      })
    }
  })

/* -------------------------------------------------------------------------- */
/* Sections et landing page                                                   */
/* -------------------------------------------------------------------------- */

function section<Type extends string, Props extends z.ZodType>(
  type: Type,
  props: Props
) {
  return z.strictObject({ id: LandingIdSchema, type: z.literal(type), props })
}

export const LandingPageSectionSchema = z.discriminatedUnion("type", [
  section("product-hero", ProductHeroConfigSchema),
  section("editorial-hero", EditorialHeroConfigSchema),
  section("immersive-hero", ImmersiveHeroConfigSchema),
  section("product-grid", ProductGridConfigSchema),
  section("value-props", ValuePropsConfigSchema),
  section("pillars", PillarsConfigSchema),
  section("content-carousel", ContentCarouselConfigSchema),
  section("audience-switcher", AudienceSwitcherConfigSchema),
])

type ParsedSection = z.infer<typeof LandingPageSectionSchema>
type ParsedAction = z.infer<typeof LandingActionSchema>

const heroTypes = new Set<ParsedSection["type"]>([
  "product-hero",
  "editorial-hero",
  "immersive-hero",
])

/** CTA d'une section, avec leur chemin relatif à `props`. */
function sectionActions(
  section: ParsedSection
): { action: ParsedAction; path: string[] }[] {
  const actions: { action: ParsedAction | undefined; path: string[] }[] = []
  switch (section.type) {
    case "product-hero":
      actions.push(
        { action: section.props.primaryAction, path: ["primaryAction"] },
        { action: section.props.secondaryAction, path: ["secondaryAction"] }
      )
      break
    case "editorial-hero":
    case "immersive-hero":
      actions.push({
        action: section.props.primaryAction,
        path: ["primaryAction"],
      })
      break
    case "product-grid":
    case "value-props":
    case "pillars":
    case "content-carousel":
    case "audience-switcher":
      break
    default: {
      const unhandled: never = section
      return unhandled
    }
  }
  return actions.flatMap(({ action, path }) =>
    action ? [{ action, path }] : []
  )
}

export const LandingPageSchema = z
  .strictObject({
    version: z.literal(1),
    id: LandingIdSchema,
    title: text,
    sections: z.array(LandingPageSectionSchema).min(1),
  })
  .superRefine((page, ctx) => {
    const ids = new Set<string>()
    page.sections.forEach((section, index) => {
      if (ids.has(section.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: `Identifiant de section en double : "${section.id}".`,
        })
      }
      ids.add(section.id)
    })

    let heroCount = 0
    page.sections.forEach((section, index) => {
      if (!heroTypes.has(section.type)) return
      heroCount += 1
      if (heroCount > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "type"],
          message: `Une landing page ne peut contenir qu'un seul hero ("${section.type}" en trop).`,
        })
      } else if (index !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "type"],
          message: `Le hero "${section.type}" doit être la première section (position actuelle : ${index + 1}).`,
        })
      }
    })

    page.sections.forEach((section, index) => {
      for (const { action, path } of sectionActions(section)) {
        if (!action.href.startsWith("#")) continue
        const target = action.href.slice(1)
        if (!ids.has(target)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", index, "props", ...path, "href"],
            message: `L'ancre "${action.href}" ne correspond à aucune section (ids disponibles : ${[...ids].join(", ")}).`,
          })
        }
      }
    })
  })

/* -------------------------------------------------------------------------- */
/* API de validation                                                          */
/* -------------------------------------------------------------------------- */

/** Valide des données externes ; lève une `ZodError` si elles sont invalides. */
export function parseLandingPage(input: unknown): LandingPageConfig {
  return LandingPageSchema.parse(input)
}

/**
 * Variante sans exception : renvoie les erreurs détaillées (chemin + message),
 * utiles pour demander une correction à un générateur.
 */
export function safeParseLandingPage(input: unknown) {
  return LandingPageSchema.safeParse(input)
}
