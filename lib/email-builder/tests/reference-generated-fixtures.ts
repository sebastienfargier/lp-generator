/**
 * Mocks PURS de V2.9.4a : des sections de référence (analyse structurelle + gaps) et des sorties du futur appel
 * texte, écrites à la main. Aucun appel, aucun HTML ; les compositions sont des blueprints (V2.9.4c.1).
 */
import type { GeneratedBlockSpec } from "../generated/schema"
import { isExpressibleReferenceGap, type ReferenceGapSection } from "../reference-gap"
import { bannerOverlapCard } from "./generated-fixtures"
import { deriveGeneratedReferenceBlueprintSlots, type GeneratedReferenceBlueprint } from "../reference-generated-blueprint"
import type { GeneratedReferenceCandidate } from "../reference-generated-request"
import type { GeneratedReferenceItem } from "../reference-generated-schema"

export const clone = <T>(value: T): T => structuredClone(value)

export const section = (ref: string, over: Partial<ReferenceGapSection> = {}): ReferenceGapSection => ({ ref, status: "unmatched", role: "text", layout: "single-column", tone: "light", hasImage: false, imageCount: 0, hasCta: false, repeatedItems: 0, structure: [], ...over })

export const candidateOf = (value: ReferenceGapSection): GeneratedReferenceCandidate => ({
  ref: value.ref,
  role: value.role,
  layout: value.layout,
  tone: value.tone,
  hasImage: value.hasImage,
  imageCount: value.imageCount,
  hasCta: value.hasCta,
  repeatedItems: value.repeatedItems,
  structure: value.structure.filter(isExpressibleReferenceGap),
})

/** Les blueprints de référence des tests : un par famille de gap. */
export const baseBlueprint: GeneratedReferenceBlueprint = { archetype: "items", count: 1, columns: 1, itemStyle: "plain", proportion: "equal", imagePosition: "none", imageFormat: "none", overlap: 0, align: "start", intro: "title-body", cta: false }
export const textBlueprint = (): GeneratedReferenceBlueprint => ({ ...baseBlueprint, cta: true })
/** 4 éléments à icône en 2 colonnes, sans bouton. */
export const iconGridBlueprint = (): GeneratedReferenceBlueprint => ({ ...baseBlueprint, count: 4, columns: 2, itemStyle: "icon", intro: "none" })
/** 3 cartes côte à côte, avec un bouton. */
export const cardsBlueprint = (): GeneratedReferenceBlueprint => ({ ...baseBlueprint, count: 3, columns: 3, itemStyle: "card", align: "center", intro: "none", cta: true })
export const statBlueprint = (): GeneratedReferenceBlueprint => ({ ...baseBlueprint, itemStyle: "stat", align: "center", intro: "eyebrow-title-body", cta: true })
/** Le visuel en haut puis le texte (image-top). */
export const mediaTopBlueprint = (): GeneratedReferenceBlueprint => ({ ...baseBlueprint, archetype: "media", imagePosition: "top", imageFormat: "large", intro: "eyebrow-title-body", cta: true })
export const mediaSideBlueprint = (side: "left" | "right" = "left"): GeneratedReferenceBlueprint => ({ ...baseBlueprint, archetype: "media", imagePosition: side, imageFormat: "split", proportion: side === "left" ? "second-wide" : "first-wide", intro: "title", cta: true })
export const overlapBlueprint = (): GeneratedReferenceBlueprint => ({ ...baseBlueprint, archetype: "overlap", imagePosition: "top", imageFormat: "band", overlap: 40, align: "center", intro: "eyebrow-title-body", cta: true })

/** Une sortie de modèle bien formée pour un blueprint : un texte par slot texte (sauf « stat »), un libellé de bouton, une icône, une intention. */
export function itemFor(ref: string, blueprint: unknown, over: Partial<GeneratedReferenceItem> = {}): GeneratedReferenceItem {
  const slots = deriveGeneratedReferenceBlueprintSlots(blueprint) ?? []
  return {
    ref,
    blueprint: blueprint as GeneratedReferenceItem["blueprint"],
    texts: slots.filter((slot) => slot.kind === "texte" && !/^stat-\d$/.test(slot.name)).map((slot) => ({ slot: slot.name as never, value: "Avancer à votre rythme" })),
    buttons: slots.filter((slot) => slot.kind === "cta" || slot.kind === "cta:fleche").map(() => ({ slot: "cta" as const, label: "Découvrir" })),
    icons: slots.filter((slot) => slot.kind === "asset:icone").map((slot) => ({ slot: slot.name as never, icon: "star" as const })),
    images: slots.filter((slot) => slot.kind === "asset:visuel").map(() => ({ slot: "image" as const, intent: "warm-reassurance" as const })),
    ...over,
  }
}

/** La bannière à carte chevauchante du DSL, en rôle « hero » : sert aux sondes de couverture sur spec brute. */
export const overlapSpec = (): GeneratedBlockSpec => ({ ...clone(bannerOverlapCard), role: "hero" }) as GeneratedBlockSpec

/* Sections */
export const unmatchedColumns = () => section("s1", { status: "unmatched", role: "feature-list", layout: "columns-2", repeatedItems: 4, structure: ["columns", "icon-items"] })
export const approximateCards = () => section("s2", { status: "approximate", role: "products", layout: "columns-3", hasCta: true, repeatedItems: 3, structure: ["columns", "repeated-cards"] })
export const editorialApproximate = () => section("s3", { status: "approximate", role: "text", structure: [] })
export const inexpressibleUnmatched = () => section("s4", { status: "unmatched", role: "products", layout: "cards", repeatedItems: 3, structure: ["image-in-cards"] })
export const offerStructural = () => section("s5", { status: "unmatched", role: "offer", layout: "image-top", hasImage: true, imageCount: 1, hasCta: true, structure: ["card-over-image"] })
export const statSection = () => section("s6", { status: "unmatched", role: "proof", hasCta: true, structure: ["stat-emphasis"] })
export const heroSection = () => section("s7", { status: "approximate", role: "hero", layout: "image-top", hasImage: true, imageCount: 1, hasCta: true, structure: ["image-placement"] })
export const overlapSection = () => section("s8", { status: "unmatched", role: "hero", layout: "image-top", hasImage: true, imageCount: 1, hasCta: true, structure: ["card-over-image"] })
