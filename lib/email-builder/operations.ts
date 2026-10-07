/**
 * Opérations du Builder sur un EmailDocument : pures, déterministes, sans
 * réseau, sans modèle, sans HTML. Entrée = document + opération ; sortie = un
 * NOUVEAU document, ou une erreur typée. L'entrée n'est jamais modifiée et une
 * opération qui échoue ne laisse rien derrière elle (atomicité : le candidat
 * n'existe qu'une fois validé).
 *
 * Seule l'impossibilité TECHNIQUE refuse une opération : lame ou slot
 * inconnu, surface que la lame ne supporte pas, image hors de la banque ou
 * incompatible, ou un résultat qui ne serait plus un EmailConfig valide
 * (`integrity.ts` : identifiants uniques, valeurs des catalogues, au moins une
 * lame…). Rien d'éditorial ni de produit ne refuse : footer retiré ou déplacé,
 * mentions légales supprimées, zones colorées consécutives sont acceptés, et le
 * Builder conseille ou alerte (`recommendations.ts`).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { emailBankDerivative, EmailImageBankError, resolveEmailBankImage, isEmailBankImageId } from "../email/image-bank"
import { emailBlockManifest, type EmailSurfaceMode } from "../email/manifest"
import { emailSurfaceRules, emailSurfaces, type EmailSurface } from "../email/surfaces"
import type { EmailBlock, EmailBlockType } from "../email/types"
import type { EmailDocument } from "./document"
import { generatedBlockSlots, isGeneratedBlock, validateGeneratedBlock, validateGeneratedLimit, type DocumentBlock, type DocumentConfig, type GeneratedEmailBlock } from "./generated-block"
import { applyToHistory, type History } from "./history"
import { validateDocumentIntegrity, type DocumentIssue } from "./integrity"

/* -------------------------------------------------------------------------- */
/* Opérations                                                                 */
/* -------------------------------------------------------------------------- */

export const documentOperationTypes = ["set-slot", "add-block", "add-generated-block", "remove-block", "move-block", "set-surface", "set-image"] as const

const blockType = z.string().refine((value) => Object.hasOwn(emailBlockManifest, value), "Lame inconnue du manifeste.")
const slots = z.record(z.string(), z.unknown())

export const DocumentOperationSchema = z.discriminatedUnion("type", [
  /** Contenu d'un slot (texte, bouton, lien, icône, mention) : la valeur est celle du contrat EmailConfig. Les visuels passent par `set-image`. */
  z.strictObject({ type: z.literal("set-slot"), blockId: z.string().min(1), slot: z.string().min(1), value: z.unknown() }),
  /** Une lame OFFICIELLE du manifeste, avec tous ses slots requis. `index` : position finale ; absent, juste avant les mentions légales et le footer. */
  z.strictObject({ type: z.literal("add-block"), blockType, slots, id: z.string().min(1).optional(), index: z.number().int().min(0).optional(), surface: z.enum(emailSurfaces).optional() }),
  /**
   * Une lame GÉNÉRÉE : sa spec (V2.9.1) et son contenu (V2.9.2), validés ensemble. Opération dédiée et non extension d'`add-block` :
   * `add-block` désigne une lame du manifeste, ce qui reste vrai ; une lame générée n'en est pas une. Aucune IA ici, et la bibliothèque
   * ne l'appelle pas : c'est la porte d'un plan écrit (futur Reference).
   */
  z.strictObject({ type: z.literal("add-generated-block"), spec: z.unknown(), slots, id: z.string().min(1).optional(), index: z.number().int().min(0).optional(), surface: z.enum(emailSurfaces).optional() }),
  z.strictObject({ type: z.literal("remove-block"), blockId: z.string().min(1) }),
  /** `toIndex` : position finale de la lame dans la liste. */
  z.strictObject({ type: z.literal("move-block"), blockId: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.strictObject({ type: z.literal("set-surface"), blockId: z.string().min(1), surface: z.enum(emailSurfaces) }),
  /** Une image de la banque contrôlée, par identifiant : jamais une URL. */
  z.strictObject({ type: z.literal("set-image"), blockId: z.string().min(1), slot: z.string().min(1), imageId: z.string().min(1) }),
])

export type DocumentOperation = z.infer<typeof DocumentOperationSchema>

export type OperationErrorCode =
  | "invalid-operation"
  | "unknown-block"
  | "unknown-slot"
  | "slot-not-editable"
  | "surface-unsupported"
  | "image"
  | "limit"
  | "position"
  | "integrity"

export type OperationError = { code: OperationErrorCode; message: string; issues?: DocumentIssue[]; /** `applyDocumentOperations` : position de l'opération refusée dans la liste. */ index?: number }

export type OperationResult<Value = EmailDocument> = { ok: true; value: Value } | { ok: false; error: OperationError }

const fail = (code: OperationErrorCode, message: string, issues?: DocumentIssue[]): OperationResult<never> => ({ ok: false, error: { code, message, ...(issues ? { issues } : {}) } })

/* -------------------------------------------------------------------------- */
/* Aides                                                                      */
/* -------------------------------------------------------------------------- */

type ManifestEntry = { surfaceMode: EmailSurfaceMode; slots: Readonly<Record<string, string>>; system?: readonly string[] }
const entryOf = (type: string) => (emailBlockManifest as Record<string, ManifestEntry>)[type]
type RawBlock = { id: string; type: EmailBlockType; slots: Record<string, unknown>; surface?: EmailSurface }
const raw = (block: EmailBlock) => block as unknown as RawBlock

/** Lames de fin d'email : footer (lien de désabonnement) et mentions légales (slot `disclaimer`). */
const isFooter = (type: string) => entryOf(type)?.system?.includes("lien-desabonnement") === true
const isDisclaimer = (type: string) => Object.values(entryOf(type)?.slots ?? {}).includes("disclaimer")

/** Position par défaut d'une nouvelle lame : avant la queue (mentions légales puis footer) de l'email. */
export function defaultIndex(blocks: readonly { type: string }[], type: string): number {
  if (isDisclaimer(type)) {
    const footer = blocks.findIndex((block) => isFooter(block.type))
    return footer >= 0 ? footer : blocks.length
  }
  let index = blocks.length
  while (index > 0 && (isFooter(blocks[index - 1]!.type) || isDisclaimer(blocks[index - 1]!.type))) index -= 1
  return index
}

/** Identifiant libre : le type de la lame, suffixé -2, -3… s'il existe déjà. */
export function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/** Remplace la config ; les métadonnées suivent les lames. */
function withConfig(document: EmailDocument, config: DocumentConfig, blockMeta = document.blockMeta): EmailDocument {
  return { ...document, config, blockMeta }
}

/** Validation finale : le candidat n'est rendu que s'il est exploitable. */
function validated(candidate: EmailDocument): OperationResult {
  const issues = validateDocumentIntegrity(candidate)
  return issues.length === 0 ? { ok: true, value: candidate } : fail("integrity", issues[0]!.message, issues)
}

/**
 * Contenu d'un slot d'une lame GÉNÉRÉE. La spec ne bouge jamais : seul un slot que la spec
 * dérive se modifie, un texte ou un libellé de bouton. La DESTINATION d'un bouton est
 * contrôlée (spec + destinations Studi) : elle ne se change pas par cette opération ; une
 * image passe par `set-image`. Le contenu est revalidé en entier (`validated`).
 */
function setGeneratedSlot(document: EmailDocument, block: GeneratedEmailBlock, index: number, slotName: string, value: unknown, replaceAt: (index: number, block: DocumentBlock) => DocumentBlock[]): OperationResult {
  const slot = generatedBlockSlots(block).find((entry) => entry.name === slotName)
  if (!slot) return fail("unknown-slot", `Cette lame générée n'a pas de slot « ${slotName} ».`)
  if (slot.kind === "asset:visuel") return fail("slot-not-editable", "Une image se change par l'opération set-image : seules les images de la banque contrôlée sont publiables.")
  if ((slot.kind === "cta" || slot.kind === "cta:fleche") && (value as { destination?: unknown } | null)?.destination !== (block.slots[slotName] as { destination?: unknown } | undefined)?.destination) {
    return fail("slot-not-editable", "La destination d'un bouton d'une lame générée ne se modifie pas : seul son libellé.")
  }
  const next: GeneratedEmailBlock = { ...block, slots: { ...block.slots, [slotName]: value as GeneratedEmailBlock["slots"][string] } }
  return validated(withConfig(document, { ...document.config, blocks: replaceAt(index, next) }))
}

/** Image d'une lame GÉNÉRÉE : une image de la banque qui existe au format du slot (jamais une URL). */
function setGeneratedImage(document: EmailDocument, block: GeneratedEmailBlock, index: number, slotName: string, imageId: string, replaceAt: (index: number, block: DocumentBlock) => DocumentBlock[]): OperationResult {
  const slot = generatedBlockSlots(block).find((entry) => entry.name === slotName)
  if (slot?.kind !== "asset:visuel") return fail("unknown-slot", `Cette lame générée n'a pas de slot image « ${slotName} ».`)
  if (!isEmailBankImageId(imageId)) return fail("image", `Image inconnue de la banque : « ${imageId} ».`)
  try {
    emailBankDerivative(imageId, slot.format ?? "")
  } catch (error) {
    if (error instanceof EmailImageBankError) return fail("image", `L'image « ${imageId} » n'existe pas au format de cette lame.`)
    throw error
  }
  const next: GeneratedEmailBlock = { ...block, slots: { ...block.slots, [slotName]: { imageId } } }
  return validated(withConfig(document, { ...document.config, blocks: replaceAt(index, next) }))
}

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Applique UNE opération. Une entrée qui n'est pas une opération connue donne
 * `invalid-operation` ; un échec technique donne son code et un message pour
 * la personne ; le document d'entrée reste intact dans tous les cas.
 */
export function applyDocumentOperation(document: EmailDocument, input: DocumentOperation | unknown): OperationResult {
  const parsed = DocumentOperationSchema.safeParse(input, { error: z.locales.fr().localeError })
  if (!parsed.success) return fail("invalid-operation", parsed.error.issues[0]?.message ?? "Opération invalide.", parsed.error.issues.map((issue) => ({ code: "document-structure" as const, path: issue.path.join(".") || "operation", message: issue.message })))
  const operation = parsed.data
  const blocks = document.config.blocks
  const find = (id: string) => blocks.findIndex((block) => block.id === id)
  const replaceAt = (index: number, block: DocumentBlock) => blocks.map((candidate, position) => (position === index ? block : candidate))

  switch (operation.type) {
    case "set-slot": {
      const index = find(operation.blockId)
      if (index < 0) return fail("unknown-block", `Aucune lame « ${operation.blockId} » dans cet email.`)
      const found = blocks[index]!
      if (isGeneratedBlock(found)) return setGeneratedSlot(document, found, index, operation.slot, operation.value, replaceAt)
      const block = raw(found)
      const kind = entryOf(block.type)?.slots[operation.slot]
      if (!kind) return fail("unknown-slot", `La lame « ${block.type} » n'a pas de slot « ${operation.slot} ».`)
      if (kind === "asset:visuel") return fail("slot-not-editable", "Une image se change par l'opération set-image : seules les images de la banque contrôlée sont publiables.")
      const next = { ...block, slots: { ...block.slots, [operation.slot]: operation.value } } as unknown as EmailBlock
      return validated(withConfig(document, { ...document.config, blocks: replaceAt(index, next) }))
    }

    case "add-block": {
      const entry = entryOf(operation.blockType)
      const taken = new Set(blocks.map((block) => block.id))
      if (operation.id && taken.has(operation.id)) return fail("integrity", `Identifiant de lame déjà utilisé : « ${operation.id} ».`)
      if (operation.surface && entry?.surfaceMode !== "configurable") return fail("surface-unsupported", `La lame « ${operation.blockType} » garde ses couleurs : elle n'accepte pas de surface.`)
      const index = operation.index ?? defaultIndex(blocks, operation.blockType)
      if (index > blocks.length) return fail("position", `Position ${index} impossible : l'email compte ${blocks.length} lames.`)
      const id = operation.id ?? freeId(operation.blockType, taken)
      const block = { id, type: operation.blockType, slots: operation.slots, ...(operation.surface ? { surface: operation.surface } : {}) } as unknown as EmailBlock
      const next = [...blocks.slice(0, index), block, ...blocks.slice(index)]
      return validated(withConfig(document, { ...document.config, blocks: next }, { ...document.blockMeta, [id]: { origin: "builder" } }))
    }

    case "add-generated-block": {
      const taken = new Set(blocks.map((block) => block.id))
      if (operation.id && taken.has(operation.id)) return fail("integrity", `Identifiant de lame déjà utilisé : « ${operation.id} ».`)
      const id = operation.id ?? freeId("generated", taken)
      const index = operation.index ?? defaultIndex(blocks, "generated")
      if (index > blocks.length) return fail("position", `Position ${index} impossible : l'email compte ${blocks.length} lames.`)
      const limit = validateGeneratedLimit([...blocks, { type: "generated" }])
      if (limit) return fail("limit", limit.message)
      // La surface neutre est l'absence de clé, comme pour une lame officielle.
      const candidate = { id, type: "generated", spec: operation.spec, slots: operation.slots, ...(operation.surface && operation.surface !== emailSurfaceRules.neutral ? { surface: operation.surface } : {}) }
      const checked = validateGeneratedBlock(candidate)
      if (!checked.ok) return fail("invalid-operation", `Lame générée refusée : ${checked.issues[0]!.message}`, checked.issues.map((issue) => ({ code: "config-contract" as const, path: issue.path, message: issue.message })))
      const next = [...blocks.slice(0, index), checked.block, ...blocks.slice(index)]
      return validated(withConfig(document, { ...document.config, blocks: next }, { ...document.blockMeta, [id]: { origin: "builder" } }))
    }

    case "remove-block": {
      const index = find(operation.blockId)
      if (index < 0) return fail("unknown-block", `Aucune lame « ${operation.blockId} » dans cet email.`)
      const { [operation.blockId]: _removed, ...meta } = document.blockMeta
      void _removed
      return validated(withConfig(document, { ...document.config, blocks: blocks.filter((_, position) => position !== index) }, meta))
    }

    case "move-block": {
      const index = find(operation.blockId)
      if (index < 0) return fail("unknown-block", `Aucune lame « ${operation.blockId} » dans cet email.`)
      if (operation.toIndex > blocks.length - 1) return fail("position", `Position ${operation.toIndex} impossible : l'email compte ${blocks.length} lames.`)
      const rest = blocks.filter((_, position) => position !== index)
      const next = [...rest.slice(0, operation.toIndex), blocks[index]!, ...rest.slice(operation.toIndex)]
      return validated(withConfig(document, { ...document.config, blocks: next }))
    }

    case "set-surface": {
      const index = find(operation.blockId)
      if (index < 0) return fail("unknown-block", `Aucune lame « ${operation.blockId} » dans cet email.`)
      const found = blocks[index]!
      const block = raw(found as EmailBlock)
      if (!isGeneratedBlock(found) && entryOf(block.type)?.surfaceMode !== "configurable") return fail("surface-unsupported", `La lame « ${block.type} » garde ses couleurs : elle n'accepte pas de surface.`)
      const { surface: _previous, ...withoutSurface } = block
      void _previous
      // La surface neutre est l'absence de clé : une seule écriture canonique.
      const next = (operation.surface === emailSurfaceRules.neutral ? withoutSurface : { ...withoutSurface, surface: operation.surface }) as unknown as DocumentBlock
      return validated(withConfig(document, { ...document.config, blocks: replaceAt(index, next) }))
    }

    case "set-image": {
      const index = find(operation.blockId)
      if (index < 0) return fail("unknown-block", `Aucune lame « ${operation.blockId} » dans cet email.`)
      const found = blocks[index]!
      if (isGeneratedBlock(found)) return setGeneratedImage(document, found, index, operation.slot, operation.imageId, replaceAt)
      const block = raw(found)
      if (entryOf(block.type)?.slots[operation.slot] !== "asset:visuel") return fail("unknown-slot", `La lame « ${block.type} » n'a pas de slot image « ${operation.slot} ».`)
      if (!isEmailBankImageId(operation.imageId)) return fail("image", `Image inconnue de la banque : « ${operation.imageId} ».`)
      let resolved
      try {
        resolved = resolveEmailBankImage(operation.imageId, block.type)
      } catch (error) {
        if (error instanceof EmailImageBankError) return fail("image", error.message)
        throw error
      }
      const next = { ...block, slots: { ...block.slots, [operation.slot]: resolved } } as unknown as EmailBlock
      return validated(withConfig(document, { ...document.config, blocks: replaceAt(index, next) }))
    }
  }
}

/**
 * Applique une opération au travail en cours : succès, un nouveau présent et
 * l'ancien dans `past` ; échec, l'historique est rendu tel quel.
 */
export function applyOperationToHistory(history: History<EmailDocument>, operation: DocumentOperation | unknown): OperationResult<History<EmailDocument>> {
  const result = applyDocumentOperation(history.present, operation)
  return result.ok ? { ok: true, value: applyToHistory(history, result.value) } : result
}

/**
 * Applique une LISTE d'opérations comme une seule transformation : toutes
 * réussissent, ou aucune n'est appliquée (le document d'entrée n'est jamais
 * touché ; un échec dit quelle opération a été refusée, `error.index`). Chaque
 * opération voit le résultat des précédentes. Le résultat est UN document : un
 * seul `applyToHistory`, donc une seule entrée d'historique. Une liste vide est
 * refusée (rien à transformer).
 */
export function applyDocumentOperations(document: EmailDocument, operations: readonly (DocumentOperation | unknown)[]): OperationResult {
  if (operations.length === 0) return fail("invalid-operation", "Aucune opération à appliquer.")
  let current = document
  for (const [index, operation] of operations.entries()) {
    const result = applyDocumentOperation(current, operation)
    if (!result.ok) return { ok: false, error: { ...result.error, index } }
    current = result.value
  }
  return { ok: true, value: current }
}
