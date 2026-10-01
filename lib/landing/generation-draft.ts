import { z } from "zod"

import { landingDestinations, type LandingDestinationId } from "./destinations"
import { landingImages, type LandingImageId } from "./image-catalog"

/**
 * Contrat IA intermédiaire : ce que Claude produit. Il n'est ni
 * `LandingPageConfig` (le contrat applicatif, seul connu des composants et du
 * renderer), ni un format libre : une branche stricte par lame, discriminée par
 * `section`, sans aucune propriété optionnelle.
 *
 * LandingGenerationRequest → Claude → LandingGenerationDraft →
 * resolveLandingDraft → LandingPageConfig → LandingPageSchema →
 * validateGeneratedLanding.
 *
 * Claude décide : les sections et leur ordre, le contenu éditorial, l'image de
 * chaque visuel et la destination de chaque CTA, ces deux derniers par
 * identifiant de ressource contrôlée. Il n'écrit jamais : version, ids de page,
 * de section ou d'audience, `src`, `alt`, `href`, ancre, logo, badge, icône,
 * position d'image, `defaultValue`. Le résolveur les produit.
 *
 * Une forme par lame, volontairement : une factorisation en familles se fera
 * quand plusieurs lames partageront réellement la même forme, en ne touchant
 * qu'à ce fichier et au résolveur.
 */

/** Texte obligatoire : au moins un caractère non blanc (même règle que le contrat final). */
const text = z.string().regex(/\S/, "Ne doit pas être vide.")

const imageIds = landingImages.map((image) => image.id) as [LandingImageId, ...LandingImageId[]]
const destinationIds = Object.keys(landingDestinations) as [LandingDestinationId, ...LandingDestinationId[]]

/** Image désignée par son identifiant de catalogue, jamais par un chemin. */
export const DraftImageIdSchema = z.enum(imageIds)

/** CTA : un libellé et une destination contrôlée, jamais un lien ni une ancre. */
export const DraftCtaSchema = z.strictObject({
  label: text,
  destination: z.enum(destinationIds),
})

const textItem = z.strictObject({ title: text, description: text })

const nonEmpty = <Item extends z.ZodType>(item: Item) => z.array(item).min(1, "Au moins un élément est requis.")

const branches = [
  z.strictObject({
    section: z.literal("editorial-hero"),
    title: text,
    supportingText: text,
    image: DraftImageIdSchema,
    cta: DraftCtaSchema,
  }),
  z.strictObject({
    section: z.literal("immersive-hero"),
    /** Une entrée par ligne affichée. */
    headline: nonEmpty(text),
    description: text,
    image: DraftImageIdSchema,
    cta: DraftCtaSchema,
  }),
  z.strictObject({
    section: z.literal("value-props"),
    label: text,
    items: nonEmpty(textItem),
  }),
  z.strictObject({
    section: z.literal("pillars"),
    eyebrow: text,
    title: text,
    description: text,
    items: nonEmpty(textItem),
  }),
  z.strictObject({
    section: z.literal("content-carousel"),
    label: text,
    items: nonEmpty(z.strictObject({ eyebrow: text, title: text, image: DraftImageIdSchema })),
  }),
  z.strictObject({
    section: z.literal("audience-switcher"),
    label: text,
    items: nonEmpty(z.strictObject({ eyebrow: text, title: text, description: text, image: DraftImageIdSchema })),
  }),
] as const

/** Les lames que le Draft sait exprimer, dans l'ordre du catalogue. */
export const landingDraftSectionTypes = branches.map((branch) => branch.shape.section.value)

export type LandingDraftSectionType = (typeof landingDraftSectionTypes)[number]

const sections = z.array(z.discriminatedUnion("section", branches)).min(1, "Au moins une section est requise.")

export const LandingGenerationDraftSchema = z.strictObject({ sections })

export type LandingGenerationDraft = z.infer<typeof LandingGenerationDraftSchema>
export type LandingDraftSection = LandingGenerationDraft["sections"][number]
export type LandingDraftSectionOf<Type extends LandingDraftSectionType> = Extract<LandingDraftSection, { section: Type }>

/**
 * Schéma restreint aux lames candidates de la génération : même construction,
 * aucun schéma parallèle. C'est lui, passé au transport, qui contraint Claude.
 */
export function buildLandingDraftSchema(candidateTypes: readonly string[]) {
  const allowed = new Set(candidateTypes)
  const options = branches.filter((branch) => allowed.has(branch.shape.section.value))
  const [first, ...rest] = options
  if (!first) throw new Error("Aucune section candidate : pas de schéma de sortie.")
  return z.strictObject({
    sections: z.array(z.discriminatedUnion("section", [first, ...rest])).min(1, "Au moins une section est requise."),
  })
}

export function buildLandingDraftJsonSchema(candidateTypes: readonly string[]) {
  return z.toJSONSchema(buildLandingDraftSchema(candidateTypes), { reused: "ref" })
}

export function safeParseLandingGenerationDraft(input: unknown) {
  return LandingGenerationDraftSchema.safeParse(input, { error: z.locales.fr().localeError })
}
