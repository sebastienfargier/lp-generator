/**
 * Draft métier d'une génération Email par modèle : ce que Claude décide, rien
 * de plus. L'objet, le préheader et des blocs éditoriaux ; jamais le shell
 * (header, footer, mentions légales), jamais une surface, une URL, un `src`,
 * un alt, du HTML, du CSS ni un jeton système. Le resolver
 * (`draft-resolver.ts`) le convertit en `EmailConfig`, qui reste l'autorité.
 *
 * Le Draft est plus petit et plus sémantique que l'EmailConfig : sept types de
 * blocs (un hero, six blocs de corps) au lieu de 36 lames, des textes nommés
 * `title` / `text` plutôt que des slots, et des ressources désignées par
 * identifiant (image du catalogue, destination contrôlée, icône d'un enum
 * compact).
 *
 * Vocabulaire V1 : les lames utiles aux objectifs non promotionnels, sans offre,
 * compte à rebours, témoignage, partenaire ni intitulé de formation exact, et
 * dont les visuels existent au catalogue.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import type { EmailDestinationId } from "./destinations"
import { emailImageBlocks, emailImageIds, type EmailImageId } from "./image-catalog"
import type { EmailBlockType } from "./types"

/* -------------------------------------------------------------------------- */
/* Vocabulaire V1                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Le hero se choisit par son image : chaque photo n'est recadrée que pour une
 * lame (`image-catalog.ts`), donc l'image désigne la lame. Les trois lames
 * ci-dessous n'exigent que des textes, un CTA et cette photo. Hors V1 :
 * `hero-offer-image-top` (valeur clé et code promo), `hero-diagnostic-quiz`
 * (annoncerait un quiz inexistant), `hero-newsletter-*` (visuels sans asset).
 */
export const emailDraftHeroBlocks = [
  "email-module-hero-promotional-image-medium",
  "email-module-hero-promotional-image-large",
  "email-module-hero-split-image",
] as const satisfies readonly EmailBlockType[]

/** Images du hero : celles dont la lame est un hero V1 (la photo « promotion » n'en fait pas partie). */
export const emailDraftImageIds = emailImageIds.filter((id) =>
  emailImageBlocks(id).some((type) => (emailDraftHeroBlocks as readonly string[]).includes(type))
) as [EmailImageId, ...EmailImageId[]]

/** Lames du corps produites par les six types de blocs de corps (le resolver s'y conforme : testé). */
export const emailDraftBodyLames = [
  "email-module-numbered-list",
  "email-module-numbererd-grid",
  "email-module-icons-list",
  "email-module-text-only",
  "email-module-text-and-feature-card",
  "email-module-text-and-cta-variant-01",
] as const satisfies readonly EmailBlockType[]

/**
 * Destinations proposables à un CTA (identifiants de `destinations.ts`) : les
 * pages du catalogue et des services utiles aux objectifs V1. Hors V1 : les
 * filières (liées au brief), le blog, et `parcours-decouverte`, réservé à un
 * lien texte secondaire « jamais en second bouton ».
 */
export const emailDraftDestinations = [
  "catalogue-formations",
  "metiers",
  "diplomes",
  "certificats",
  "alternance",
  "accompagnement",
  "methode",
  "coaching-carriere",
  "competences-360",
  "financement",
] as const satisfies readonly EmailDestinationId[]

/** Icônes de la liste à icônes : huit sens utiles aux thèmes V1 (sur les 40 du catalogue). */
export const emailDraftIcons = [
  "briefcase",
  "graduation-cap",
  "handshake-simple",
  "laptop",
  "lightbulb",
  "magnifying-glass",
  "stopwatch",
  "users",
] as const

/* -------------------------------------------------------------------------- */
/* Schéma                                                                     */
/* -------------------------------------------------------------------------- */

const text = z.string().refine((value) => value.trim() !== "", "Ne doit pas être vide.")

const CtaSchema = z.strictObject({
  label: text,
  destination: z.enum(emailDraftDestinations, { error: "Destination inconnue." }),
})

const item = z.strictObject({ title: text, text })

const HeroSchema = z.strictObject({
  type: z.literal("hero"),
  image: z.enum(emailDraftImageIds, { error: "Image inconnue du catalogue ou sans hero V1." }),
  /** Surtitre : affiché par les héros large et vertical, sans objet avec la photo « tablette-interieur ». */
  eyebrow: text,
  title: text,
  text,
  cta: CtaSchema,
})

const StepsSchema = z.strictObject({
  type: z.literal("steps"),
  eyebrow: text,
  items: z.array(item).length(3),
})

const GridSchema = z.strictObject({
  type: z.literal("grid"),
  eyebrow: text,
  title: text,
  items: z.array(item).length(4),
})

const IconsSchema = z.strictObject({
  type: z.literal("icons"),
  title: text,
  items: z
    .array(z.strictObject({ icon: z.enum(emailDraftIcons, { error: "Icône hors de la liste V1." }), title: text, text }))
    .length(3),
})

const TextSchema = z.strictObject({ type: z.literal("text"), title: text, text })

const FeatureSchema = z.strictObject({
  type: z.literal("feature"),
  title: text,
  text,
  cardTitle: text,
  cardText: text,
  cta: CtaSchema,
})

const ClosingSchema = z.strictObject({ type: z.literal("cta"), title: text, text, cta: CtaSchema })

const bodyOptions = [StepsSchema, GridSchema, IconsSchema, TextSchema, FeatureSchema, ClosingSchema] as const

export const EmailDraftBlockSchema = z.discriminatedUnion("type", [HeroSchema, ...bodyOptions])

export const emailDraftBodyTypes = bodyOptions.map((option) => option.shape.type.value)

/** Corps : un à quatre blocs, deux à cinq lames de l'email avec le hero (guidance : 2 à 4 lames de corps). */
export const EmailGenerationDraftSchema = z
  .strictObject({
    subject: text,
    preheader: text,
    blocks: z.array(EmailDraftBlockSchema).min(2).max(5),
  })
  .superRefine((draft, ctx) => {
    draft.blocks.forEach((block, index) => {
      const isFirst = index === 0
      if (isFirst && block.type !== "hero") {
        ctx.addIssue({ code: "custom", path: ["blocks", index, "type"], message: "Le premier bloc est le hero." })
      }
      if (!isFirst && block.type === "hero") {
        ctx.addIssue({ code: "custom", path: ["blocks", index, "type"], message: "Un seul hero, en premier bloc." })
      }
    })
    const body = draft.blocks.flatMap((block, index) => (block.type === "hero" ? [] : [{ block, index }]))
    const seen = new Set<string>()
    for (const { block, index } of body) {
      if (seen.has(block.type)) {
        ctx.addIssue({ code: "custom", path: ["blocks", index, "type"], message: `Bloc « ${block.type} » en double : chaque type de corps au plus une fois.` })
      }
      seen.add(block.type)
    }
    const withCta = body.filter(({ block }) => block.type === "feature" || block.type === "cta")
    withCta.slice(1).forEach(({ index }) => {
      ctx.addIssue({ code: "custom", path: ["blocks", index, "type"], message: "Au plus un bloc de corps avec bouton (un seul CTA principal, un second au maximum dans le corps)." })
    })
  })

export type EmailDraftBlock = z.infer<typeof EmailDraftBlockSchema>
export type EmailGenerationDraft = z.infer<typeof EmailGenerationDraftSchema>
export type EmailDraftCta = z.infer<typeof CtaSchema>

export function safeParseEmailGenerationDraft(input: unknown) {
  return EmailGenerationDraftSchema.safeParse(input, { error: z.locales.fr().localeError })
}

/**
 * JSON Schema du Draft, tel qu'un futur appel en sortie structurée le recevrait.
 * Pure : sert aujourd'hui à mesurer la complexité de la grammaire.
 */
export function buildEmailDraftJsonSchema() {
  return z.toJSONSchema(EmailGenerationDraftSchema, { reused: "ref" })
}
