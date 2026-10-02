import { z } from "zod"

import { DraftImageIdSchema, landingDraftSectionTypes, type LandingDraftSectionType } from "./generation-draft"
import { landingImages } from "./image-catalog"

/**
 * TransportDraft : la forme de sortie demandée à Claude, plus compacte que le
 * `LandingGenerationDraft` qu'elle sert à produire.
 *
 * Pourquoi : Anthropic compile le JSON Schema de sortie en grammaire, et une
 * union de 11 objets stricts (un par lame) a été refusée (« compiled grammar is
 * too large »). Le transport regroupe donc les lames par FORME JSON en 6
 * familles ; le Draft métier, le résolveur et les composants ne changent pas.
 *
 *   Claude → TransportDraft → validation transport → conversion déterministe
 *          → LandingGenerationDraft → `safeParseLandingGenerationDraft` → résolveur
 *
 * Toujours UN seul appel : une sortie invalide devient une erreur `invalid-draft`
 * (jamais de relance, de correction ni de repli).
 *
 * Conventions (à lire avant de modifier une famille) :
 * - AUCUNE propriété optionnelle : une famille porte tous ses champs, requis.
 * - Un champ SANS OBJET pour la section choisie est une CHAÎNE VIDE (le système
 *   le demande à Claude). La conversion le retire. S'il est NON vide, la
 *   conversion REFUSE : Claude n'écrit pas de contenu qui serait jeté en silence.
 * - Un champ dont le nom change entre transport et Draft est renommé par la
 *   conversion seulement : `title` → `label` (value-props), `description` →
 *   `supportingText` (editorial-hero).
 * - Les images restent un enum contrôlé. Seule la famille « bloc CTA » accepte en
 *   plus `""`, pour final-cta qui n'a pas d'image.
 * - `destination` est une chaîne LIBRE au transport (moins de littéraux dans la
 *   grammaire). La frontière métier est le Draft : `z.enum` des destinations
 *   contrôlées. Une destination inconnue passe le transport et échoue au Draft.
 * - Le transport n'est jamais la validation métier finale.
 *
 * Familles :
 * - text-items  : value-props, pillars, step-sequence    { eyebrow, title, description, items[{title, description}] }
 * - media-items : content-carousel, audience-switcher    { label, items[{eyebrow, title, description, image}] }
 * - link-items  : destination-cards                      { title, description, items[{title, description, destination}] }
 * - image-text  : narrative-split                        { eyebrow, title, description, image }
 * - cta-block   : editorial-hero, campaign-spotlight, final-cta   { title, accent, description, image, cta }
 * - immersive   : immersive-hero                         { headline[], description, image, cta }
 */

/* -------------------------------------------------------------------------- */
/* Schémas                                                                    */
/* -------------------------------------------------------------------------- */

const imageIds = landingImages.map((image) => image.id)

/** Texte : une chaîne simple. Vide = champ sans objet (la validation métier est celle du Draft). */
const text = z.string()
const destination = z.string()
const nonEmpty = <Item extends z.ZodType>(item: Item) => z.array(item).min(1, "Au moins un élément est requis.")

/** Image du bloc CTA : un id du catalogue, ou `""` quand la section n'a pas d'image (final-cta). */
const imageOrEmpty = z.enum([...imageIds, ""] as unknown as [string, ...string[]])

const textItem = z.strictObject({ title: text, description: text })
const mediaItem = z.strictObject({ eyebrow: text, title: text, description: text, image: DraftImageIdSchema })
const linkItem = z.strictObject({ title: text, description: text, destination })
const cta = z.strictObject({ label: text, destination })

type FamilySections = readonly [LandingDraftSectionType, ...LandingDraftSectionType[]]

/** Les sections de chaque famille, dans l'ordre du catalogue. */
export const landingTransportFamilies = {
  "text-items": ["value-props", "pillars", "step-sequence"],
  "media-items": ["content-carousel", "audience-switcher"],
  "link-items": ["destination-cards"],
  "image-text": ["narrative-split"],
  "cta-block": ["editorial-hero", "campaign-spotlight", "final-cta"],
  immersive: ["immersive-hero"],
} as const satisfies Record<string, FamilySections>

export type LandingTransportFamily = keyof typeof landingTransportFamilies

/** Formes des familles, avec toutes les sections : sert aux types et à la validation de la réponse. */
const familyShapes = {
  "text-items": z.strictObject({
    section: z.enum(landingTransportFamilies["text-items"]),
    eyebrow: text,
    title: text,
    description: text,
    items: nonEmpty(textItem),
  }),
  "media-items": z.strictObject({
    section: z.enum(landingTransportFamilies["media-items"]),
    label: text,
    items: nonEmpty(mediaItem),
  }),
  "link-items": z.strictObject({
    section: z.literal("destination-cards"),
    title: text,
    description: text,
    items: nonEmpty(linkItem),
  }),
  "image-text": z.strictObject({
    section: z.literal("narrative-split"),
    eyebrow: text,
    title: text,
    description: text,
    image: DraftImageIdSchema,
  }),
  "cta-block": z.strictObject({
    section: z.enum(landingTransportFamilies["cta-block"]),
    title: text,
    accent: text,
    description: text,
    image: imageOrEmpty,
    cta,
  }),
  immersive: z.strictObject({
    section: z.literal("immersive-hero"),
    headline: nonEmpty(text),
    description: text,
    image: DraftImageIdSchema,
    cta,
  }),
}

const familyOrder = Object.keys(familyShapes) as LandingTransportFamily[]

/** Réponse complète attendue de Claude, toutes sections : validation côté application. */
const fullTransportSchema = z.strictObject({
  sections: z.array(z.discriminatedUnion("section", Object.values(familyShapes) as [(typeof familyShapes)["text-items"], ...(typeof familyShapes)[LandingTransportFamily][]])).min(1, "Au moins une section est requise."),
})

export type LandingTransportDraft = z.infer<typeof fullTransportSchema>
export type LandingTransportSection = LandingTransportDraft["sections"][number]

/**
 * Schéma envoyé à Claude pour CETTE génération : seulement les familles qui
 * contiennent au moins une candidate, avec un `section` restreint aux candidates.
 */
export function buildLandingTransportSchema(candidateTypes: readonly string[]) {
  const allowed = new Set(candidateTypes)
  const options = familyOrder.flatMap((family) => {
    const sections = landingTransportFamilies[family].filter((section) => allowed.has(section))
    if (sections.length === 0) return []
    const shape = familyShapes[family]
    const sectionSchema = sections.length === 1 ? z.literal(sections[0]!) : z.enum(sections as unknown as [string, ...string[]])
    return [shape.extend({ section: sectionSchema })]
  })
  const [first, ...rest] = options
  if (!first) throw new Error("Aucune section candidate : pas de schéma de sortie.")
  return z.strictObject({
    sections: z.array(z.discriminatedUnion("section", [first, ...rest] as [typeof first, ...typeof rest])).min(1, "Au moins une section est requise."),
  })
}

export function buildLandingTransportJsonSchema(candidateTypes: readonly string[]) {
  return z.toJSONSchema(buildLandingTransportSchema(candidateTypes), { reused: "ref" })
}

/* -------------------------------------------------------------------------- */
/* Conversion TransportDraft → LandingGenerationDraft                         */
/* -------------------------------------------------------------------------- */

export type LandingTransportIssue = { path: string; message: string }

export type LandingTransportConversion =
  | { status: "converted"; draft: { sections: Record<string, unknown>[] } }
  | { status: "invalid"; issues: LandingTransportIssue[] }

const noPurpose = (section: string) => `Champ sans objet pour « ${section} » : laissez-le vide (chaîne vide), il ne sera pas utilisé.`

/** Convertit une réponse de transport valide ; refuse un champ sans objet non vide. */
export function convertLandingTransportDraft(transport: LandingTransportDraft): LandingTransportConversion {
  const issues: LandingTransportIssue[] = []
  const sections = transport.sections.map((entry, index): Record<string, unknown> => {
    const at = `sections.${index}`
    /** Champs sans objet : doivent être vides. */
    const mustBeEmpty = (values: Record<string, string>, prefix = at) => {
      for (const [field, value] of Object.entries(values)) {
        if (value !== "") issues.push({ path: `${prefix}.${field}`, message: noPurpose(entry.section) })
      }
    }
    switch (entry.section) {
      case "value-props":
        mustBeEmpty({ eyebrow: entry.eyebrow, description: entry.description })
        return { section: entry.section, label: entry.title, items: entry.items }
      case "pillars":
        return { section: entry.section, eyebrow: entry.eyebrow, title: entry.title, description: entry.description, items: entry.items }
      case "step-sequence":
        mustBeEmpty({ eyebrow: entry.eyebrow })
        return { section: entry.section, title: entry.title, description: entry.description, items: entry.items }
      case "content-carousel":
        entry.items.forEach((item, position) => mustBeEmpty({ description: item.description }, `${at}.items.${position}`))
        return { section: entry.section, label: entry.label, items: entry.items.map(({ eyebrow, title, image }) => ({ eyebrow, title, image })) }
      case "audience-switcher":
        return { section: entry.section, label: entry.label, items: entry.items }
      case "destination-cards":
        return { section: entry.section, title: entry.title, description: entry.description, items: entry.items }
      case "narrative-split":
        return { section: entry.section, eyebrow: entry.eyebrow, title: entry.title, description: entry.description, image: entry.image }
      case "editorial-hero":
        mustBeEmpty({ accent: entry.accent })
        return { section: entry.section, title: entry.title, supportingText: entry.description, image: entry.image, cta: entry.cta }
      case "campaign-spotlight":
        return { section: entry.section, title: entry.title, accent: entry.accent, description: entry.description, image: entry.image, cta: entry.cta }
      case "final-cta":
        mustBeEmpty({ accent: entry.accent, image: entry.image })
        return { section: entry.section, title: entry.title, description: entry.description, cta: entry.cta }
      case "immersive-hero":
        return { section: entry.section, headline: entry.headline, description: entry.description, image: entry.image, cta: entry.cta }
    }
  })
  return issues.length > 0 ? { status: "invalid", issues } : { status: "converted", draft: { sections } }
}

export type LandingTransportParse =
  | { status: "ok"; transport: LandingTransportDraft; draft: { sections: Record<string, unknown>[] } }
  | { status: "invalid"; issues: LandingTransportIssue[] }

/**
 * Valide la sortie de Claude comme TransportDraft, puis la convertit. Le
 * résultat n'est PAS encore un Draft valide : l'appelant doit passer
 * `safeParseLandingGenerationDraft`, seule validation métier.
 */
export function parseLandingTransportDraft(output: unknown): LandingTransportParse {
  const parsed = fullTransportSchema.safeParse(output, { error: z.locales.fr().localeError })
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join(".") || "brouillon", message: issue.message })) }
  }
  const converted = convertLandingTransportDraft(parsed.data)
  return converted.status === "invalid" ? converted : { status: "ok", transport: parsed.data, draft: converted.draft }
}

/* -------------------------------------------------------------------------- */
/* Encodage Draft → TransportDraft : tests et fixtures SEULEMENT              */
/* -------------------------------------------------------------------------- */

type DraftSectionLike = { section: LandingDraftSectionType } & Record<string, unknown>

/**
 * Inverse de la conversion, pour les tests et les réponses simulées : jamais
 * utilisé par le pipeline de génération (Claude produit le transport lui-même).
 * Les champs sans objet sont des chaînes vides.
 */
export function encodeLandingDraftForTransport(draft: { sections: readonly DraftSectionLike[] }): LandingTransportDraft {
  const sections = draft.sections.map((entry): LandingTransportSection => {
    const d = entry as never as Record<string, never>
    switch (entry.section) {
      case "value-props":
        return { section: "value-props", eyebrow: "", title: d.label, description: "", items: d.items }
      case "pillars":
        return { section: "pillars", eyebrow: d.eyebrow, title: d.title, description: d.description, items: d.items }
      case "step-sequence":
        return { section: "step-sequence", eyebrow: "", title: d.title, description: d.description, items: d.items }
      case "content-carousel":
        return { section: "content-carousel", label: d.label, items: (d.items as { eyebrow: string; title: string; image: string }[]).map((item) => ({ ...item, description: "" })) as never }
      case "audience-switcher":
        return { section: "audience-switcher", label: d.label, items: d.items }
      case "destination-cards":
        return { section: "destination-cards", title: d.title, description: d.description, items: d.items }
      case "narrative-split":
        return { section: "narrative-split", eyebrow: d.eyebrow, title: d.title, description: d.description, image: d.image }
      case "editorial-hero":
        return { section: "editorial-hero", title: d.title, accent: "", description: d.supportingText, image: d.image, cta: d.cta }
      case "campaign-spotlight":
        return { section: "campaign-spotlight", title: d.title, accent: d.accent, description: d.description, image: d.image, cta: d.cta }
      case "final-cta":
        return { section: "final-cta", title: d.title, accent: "", description: d.description, image: "", cta: d.cta }
      case "immersive-hero":
        return { section: "immersive-hero", headline: d.headline, description: d.description, image: d.image, cta: d.cta }
    }
  })
  return { sections } as LandingTransportDraft
}

/** Toutes les sections couvertes par les familles : doit être exactement celles du Draft. */
export const landingTransportSectionTypes = familyOrder.flatMap((family) => [...landingTransportFamilies[family]])
export const landingTransportCoversDraft =
  landingTransportSectionTypes.length === landingDraftSectionTypes.length && landingDraftSectionTypes.every((type) => landingTransportSectionTypes.includes(type))
