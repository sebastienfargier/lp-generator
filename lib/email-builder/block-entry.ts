/**
 * `blockEntry` : ce que le Builder doit savoir d'un bloc, officiel ou généré, sans que
 * chaque appelant ne distingue les deux. Une lame officielle répond depuis le manifest ;
 * une lame générée, depuis sa spec. Pur et petit : ce sont des réponses, pas une
 * architecture. Sert aussi dans le navigateur (aucun import du renderer).
 *
 * Questions posées : famille et rôle, surface configurable, éditeur et protection d'un
 * slot, images compatibles d'un visuel, compatibilité d'une lame.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailBank, emailBankDerivative, emailBankImageBlocks, emailBankImageIdFromSrc, emailBankImageIds, resolveEmailBankImage, type EmailBankImageId } from "../email/image-bank"
import { emailBlockManifest, type EmailSurfaceMode } from "../email/manifest"
import type { EmailBlockType } from "../email/types"
import { generatedBlockSlots, isGeneratedBlock, type DocumentBlock, type GeneratedEmailBlock } from "./generated-block"
import { referenceRoles } from "./document"
import { deriveGeneratedCapabilities } from "./generated/validate"
import { slotEditor, type SlotEditor } from "./inline-edit"
import { slotProtection, type SlotProtection } from "./slot-roles"

/** Nom court d'un rôle de lame générée, pour l'interface et l'assistant. */
const roleNames: Record<(typeof referenceRoles)[number], string> = {
  hero: "hero",
  text: "texte",
  "feature-list": "liste d'éléments",
  benefits: "bénéfices",
  proof: "preuve",
  testimonial: "témoignage",
  offer: "offre",
  cta: "appel à l'action",
  products: "produits",
  divider: "séparateur",
  other: "section",
}

export type BlockLabel = { name: string; family: string; role: string }

/** Nom affichable d'un bloc généré : « Lame générée — hero ». Un bloc officiel est nommé par la bibliothèque (le Builder le sait déjà). */
export const generatedBlockLabel = (block: GeneratedEmailBlock): BlockLabel => ({ name: `Lame générée — ${roleNames[block.spec.role]}`, family: "Générée", role: block.spec.role })

export const blockSurfaceMode = (block: { type: string }): EmailSurfaceMode => (isGeneratedBlock(block) ? "configurable" : (emailBlockManifest[block.type as EmailBlockType]?.surfaceMode ?? "fixed"))

/** Les noms de slots d'un bloc (officiel : le manifest ; généré : sa spec). */
export const blockSlotNames = (block: DocumentBlock): string[] => (isGeneratedBlock(block) ? generatedBlockSlots(block).map((slot) => slot.name) : Object.keys(emailBlockManifest[block.type].slots))

/**
 * L'éditeur direct d'un slot, ou `null` s'il ne s'édite pas. Un bouton GÉNÉRÉ n'a que son
 * libellé à éditer (`label`) : sa destination est contrôlée par la spec et le système.
 */
export type BlockSlotEditor = SlotEditor | "label"

export function blockSlotEditor(block: DocumentBlock, slot: string): BlockSlotEditor | null {
  if (!isGeneratedBlock(block)) return slotEditor(block.type, slot)
  const found = generatedBlockSlots(block).find((entry) => entry.name === slot)
  if (!found) return null
  switch (found.kind) {
    case "texte":
      return found.editor === "long" ? "long" : "short"
    case "cta":
    case "cta:fleche":
      return "label"
    case "asset:visuel":
      return "image"
    default:
      return null
  }
}

/** Protection d'un slot : seules les lames officielles en ont (une spec ne peut pas déclarer un slot réservé). */
export const blockSlotProtection = (block: DocumentBlock, slot: string): SlotProtection | undefined => (isGeneratedBlock(block) ? undefined : slotProtection(block.type, slot))

/** Le format de la banque qu'attend un slot image généré. */
const imageFormatOf = (block: GeneratedEmailBlock, slot: string) => generatedBlockSlots(block).find((entry) => entry.name === slot)?.format

/** Identifiant de banque de l'image d'un slot (officiel : depuis son `src` ; généré : le contenu). */
export function blockImageId(block: DocumentBlock, slot: string): EmailBankImageId | undefined {
  const value = (block.slots as Record<string, Record<string, unknown>>)[slot]
  if (isGeneratedBlock(block)) return typeof value?.imageId === "string" ? (value.imageId as EmailBankImageId) : undefined
  return typeof value?.src === "string" ? emailBankImageIdFromSrc(value.src) : undefined
}

export type ImageChoice = { id: EmailBankImageId; alt: string; /** URL canonique du dérivé (la clé de `emailBankPreviews`). */ src: string }

/** Les images de la banque qui existent au format de ce slot : par lame pour une officielle, par format pour une générée. Jamais un `blockType` inventé. */
export function blockImageChoices(block: DocumentBlock, slot: string): ImageChoice[] {
  if (isGeneratedBlock(block)) {
    const format = imageFormatOf(block, slot)
    if (!format) return []
    return emailBankImageIds.filter((id) => (emailBank[id].formats as readonly string[]).includes(format)).map((id) => ({ id, alt: emailBank[id].alt, src: emailBankDerivative(id, format).src }))
  }
  return emailBankImageIds
    .filter((id) => (emailBankImageBlocks(id) as readonly string[]).includes(block.type))
    .map((id) => ({ id, alt: emailBank[id].alt, src: resolveEmailBankImage(id, block.type).src }))
}

/** `robust` ou `degraded` : dérivée de la spec (une lame officielle est robuste). Jamais stockée. */
export const blockCompatibility = (block: DocumentBlock): "robust" | "degraded" => (isGeneratedBlock(block) && deriveGeneratedCapabilities(block.spec).usesOverlap ? "degraded" : "robust")
