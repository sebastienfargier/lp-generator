/**
 * Propositions de l'assistant éditorial : le contrat entre ce que le modèle peut
 * viser et ce que le système accepte d'appliquer. Pur, sans interface ni
 * réseau : le serveur le lit pour valider ce que Claude propose, le navigateur
 * le relit à l'application. Le modèle ne produit JAMAIS une opération : il
 * désigne des CHAMPS (`bloc:slot`) et leur donne une valeur ; le système les
 * traduit en opérations du modèle V2.1 (`set-slot`, `set-image`) et les
 * contrôle contre le document COURANT.
 *
 * Ce que l'assistant peut viser : textes, libellés de bouton, images de la
 * banque (hors en-tête, pied de page et liens texte, qui sont ceux du système). Jamais la structure (ni ajout, ni suppression, ni déplacement, ni
 * surface), ni un lien, ni le statut, ni l'objet ou le préheader : aucun champ
 * ne les désigne.
 *
 * Valeurs de référence : la valeur de l'offre, le code, la date de fin, le
 * périmètre (Promotion Facts) ne se réécrivent pas. Les slots qui les portent
 * sont écartés par leur RÔLE (`slotProtection`), jamais par leur valeur actuelle ;
 * un champ éditorial qui en contient une la liste dans `mustKeep`, et une proposition qui la fait disparaître est refusée. Un filet
 * de plus : toute nouvelle ALERTE de recommandation (écart aux faits, aux
 * claims, à une règle approuvée) refuse la proposition.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailBank, emailBankImageBlocks, emailBankImageIdFromSrc, emailBankImageIds } from "../email/image-bank"
import { emailBlockManifest } from "../email/manifest"
import { formatPromotionDate, promotionDeadlineLabel, promotionScopeSentence, promotionValueSlot } from "../email/promotion-facts"
import type { EmailBlockType } from "../email/types"
import type { EmailDocument } from "./document"
import { normalizeTextDraft, slotEditor } from "./inline-edit"
import { isControlledSlotName } from "./slot-roles"
import { applyDocumentOperations, type DocumentOperation } from "./operations"
import { getDocumentRecommendations } from "./recommendations"
import type { CompositionStructure } from "./composition"
import { canonicalJson, sameDocumentContent } from "./versions"

export type AssistantFieldKind = "titre" | "paragraphe" | "bouton" | "image"

/** Un champ que l'assistant peut viser. `target` : `bloc:slot`, ou `bloc:slot:label` pour le libellé d'un bouton. */
export type AssistantField = {
  target: string
  blockId: string
  slot: string
  blockType: EmailBlockType
  kind: AssistantFieldKind
  /** Texte actuel (libellé pour un bouton, description pour une image). */
  current: string
  /** Valeurs de référence présentes dans ce texte : elles doivent rester telles quelles. */
  mustKeep: string[]
}

export type ProposalChange = { target: string; value: string }

/**
 * Ce que le serveur renvoie, lié à l'état du document sur lequel il a été préparé.
 * `changes` : les contenus (V2.5). `structure` : ajouts, déplacements et
 * suppressions de lames (V2.7), absent d'une proposition de contenu seul.
 */
export type AssistantProposal = { summary: string; changes: ProposalChange[]; structure?: CompositionStructure; basedOn: string }

export const maxProposalChanges = 12

export type RawBlock = { id: string; type: EmailBlockType; slots: Record<string, Record<string, string>> }
export const blocksOf = (document: EmailDocument) => document.config.blocks as unknown as RawBlock[]

/** Espaces insécables et fines : une valeur « -20 % » est la même avec ou sans. */
export const plain = (value: string) => value.replace(/[   ]/g, " ").replace(/\s+/g, " ").trim()

/** Valeurs de référence du document, telles qu'elles s'affichent. */
export function protectedFragments(document: EmailDocument): string[] {
  const facts = document.facts.promotion
  if (!facts) return []
  return [promotionValueSlot(facts), promotionScopeSentence(facts), promotionDeadlineLabel(facts), formatPromotionDate(facts.endDate), ...(facts.code ? [facts.code] : [])].map(plain)
}

export type SlotProtection = "valeur de référence" | "mention légale" | "système"

/**
 * Le RÔLE d'un slot décide s'il est contrôlé, jamais sa valeur actuelle : une
 * valeur modifiée à la main reste contrôlée, un texte libre égal par hasard à un
 * fait reste éditable. Source : le manifest (famille de la lame, type du slot) et
 * le vocabulaire de slots du domaine pour les valeurs de référence (`valeur-cle`,
 * `code-promo-N`, que le resolver et la validation des promotions nomment ainsi).
 * `undefined` : slot éditorial, que l'assistant peut viser s'il porte du texte ou
 * une image.
 */
export function slotProtection(blockType: EmailBlockType, slot: string): SlotProtection | undefined {
  const { family, slots } = emailBlockManifest[blockType] as { family: string; slots: Record<string, string> }
  if (slots[slot] === "disclaimer") return "mention légale"
  if (isControlledSlotName(slot)) return "valeur de référence"
  // Les en-têtes et pieds de page (date de fin, liens de navigation, désabonnement) appartiennent au système.
  if (family === "Header" || family === "Footer") return "système"
  // Un lien texte (« Voir le Parcours Découverte ») est un lien système, pas du contenu à réécrire : seuls les boutons.
  if (slots[slot] === "lien") return "système"
  return undefined
}

/** Les champs que l'assistant peut viser, dans l'ordre du document. */
export function assistantFields(document: EmailDocument): AssistantField[] {
  const fragments = protectedFragments(document)
  const fields: AssistantField[] = []
  for (const block of blocksOf(document)) {
    for (const [slot, value] of Object.entries(block.slots)) {
      if (slotProtection(block.type, slot)) continue
      const editor = slotEditor(block.type, slot)
      if (!editor) continue
      const base = { blockId: block.id, slot, blockType: block.type }
      if (editor === "image") {
        fields.push({ ...base, target: `${block.id}:${slot}`, kind: "image", current: value.alt ?? "", mustKeep: [] })
        continue
      }
      const current = (editor === "cta" ? value.label : value.text) ?? ""
      fields.push({
        ...base,
        target: editor === "cta" ? `${block.id}:${slot}:label` : `${block.id}:${slot}`,
        kind: editor === "cta" ? "bouton" : editor === "short" ? "titre" : "paragraphe",
        current,
        // Une valeur de référence DANS un texte éditorial s'y garde telle quelle (mustKeep) ; elle ne le rend pas intouchable.
        mustKeep: fragments.filter((fragment) => plain(current).includes(fragment)),
      })
    }
  }
  return fields
}

/** Images de la banque qui existent au format de cette lame. */
export const compatibleImages = (blockType: EmailBlockType) => emailBankImageIds.filter((id) => (emailBankImageBlocks(id) as readonly string[]).includes(blockType)).map((id) => ({ id, alt: emailBank[id].alt }))

export const currentImageId = (document: EmailDocument, blockId: string, slot: string) => emailBankImageIdFromSrc(blocksOf(document).find((block) => block.id === blockId)?.slots[slot]?.src ?? "")

export type ProposalOperations = { ok: true; operations: DocumentOperation[] } | { ok: false; message: string }

/**
 * Changements → opérations V2.1, contre un document donné : chaque champ doit
 * exister, aucun champ deux fois, le libellé d'un bouton garde son lien.
 */
export function proposalToOperations(document: EmailDocument, changes: readonly ProposalChange[]): ProposalOperations {
  if (changes.length === 0) return { ok: false, message: "La proposition ne contient aucun changement." }
  if (changes.length > maxProposalChanges) return { ok: false, message: `Une proposition change ${maxProposalChanges} contenus au plus.` }
  const fields = new Map(assistantFields(document).map((field) => [field.target, field]))
  const seen = new Set<string>()
  const operations: DocumentOperation[] = []
  for (const change of changes) {
    const field = fields.get(change.target)
    if (!field) return { ok: false, message: `Le champ « ${change.target} » n'existe plus dans cet email.` }
    if (seen.has(change.target)) return { ok: false, message: "Un champ ne se modifie qu'une fois dans une proposition." }
    seen.add(change.target)
    if (field.kind === "image") {
      operations.push({ type: "set-image", blockId: field.blockId, slot: field.slot, imageId: change.value })
      continue
    }
    const value = normalizeTextDraft(change.value)
    if (value === "") return { ok: false, message: "Un texte proposé est vide." }
    if (field.kind === "bouton") {
      const href = blocksOf(document).find((block) => block.id === field.blockId)!.slots[field.slot]!.href
      operations.push({ type: "set-slot", blockId: field.blockId, slot: field.slot, value: { label: value, href } })
    } else {
      operations.push({ type: "set-slot", blockId: field.blockId, slot: field.slot, value: { text: value } })
    }
  }
  return { ok: true, operations }
}

export type ProposalCheck = { ok: true; operations: DocumentOperation[]; next: EmailDocument } | { ok: false; reason: "invalid" | "protected"; message: string }

const alertKeys = (document: EmailDocument) => new Set(getDocumentRecommendations(document).filter((entry) => entry.level === "alert").map((entry) => `${entry.code}|${entry.target?.path ?? ""}`))

/**
 * Valide une proposition contre le document COURANT, sans rien modifier : les
 * champs existent, les opérations s'appliquent (toutes ou aucune), les valeurs de
 * référence sont conservées, aucune nouvelle alerte n'apparaît, et quelque chose
 * change réellement. Le serveur l'appelle avant de présenter la proposition, le
 * navigateur à nouveau au moment d'appliquer.
 */
export function validateProposal(document: EmailDocument, changes: readonly ProposalChange[]): ProposalCheck {
  const translated = proposalToOperations(document, changes)
  if (!translated.ok) return { ok: false, reason: "invalid", message: translated.message }
  const applied = applyDocumentOperations(document, translated.operations)
  if (!applied.ok) return { ok: false, reason: "invalid", message: `Une modification n'est pas applicable : ${applied.error.message}` }
  if (sameDocumentContent(document, applied.value)) return { ok: false, reason: "invalid", message: "Cette proposition ne change rien." }
  const protectedCheck = checkContentProtection(document, applied.value, changes)
  if (!protectedCheck.ok) return protectedCheck
  return { ok: true, operations: translated.operations, next: applied.value }
}

/**
 * Les protections de CONTENU, indépendantes de la structure : les valeurs de
 * référence d'un champ modifié sont conservées, et aucune nouvelle alerte
 * (écart aux faits, aux claims ou à une règle approuvée) n'apparaît. `applied` :
 * le document avec les seuls changements de contenu.
 */
export function checkContentProtection(document: EmailDocument, applied: EmailDocument, changes: readonly ProposalChange[]): { ok: true } | { ok: false; reason: "protected"; message: string } {
  const fields = new Map(assistantFields(document).map((field) => [field.target, field]))
  const after = new Map(assistantFields(applied).map((field) => [field.target, field]))
  for (const change of changes) {
    const before = fields.get(change.target)!
    const kept = after.get(change.target)
    for (const fragment of before.mustKeep) {
      if (!kept || !plain(kept.current).includes(fragment)) return { ok: false, reason: "protected", message: `La proposition retire une valeur de référence de l'email (« ${fragment} »).` }
    }
  }
  const known = alertKeys(document)
  for (const key of alertKeys(applied)) {
    if (!known.has(key)) return { ok: false, reason: "protected", message: "La proposition éloigne l'email de ses données de référence (offre, claims ou règle approuvée)." }
  }
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* Péremption                                                                 */
/* -------------------------------------------------------------------------- */

/** Empreinte déterministe du CONTENU d'un document (cyrb53 sur son JSON canonique) : ni référence, ni date, ni historique. */
export function documentFingerprint(document: EmailDocument): string {
  const text = canonicalJson(document)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}

/** Une proposition est périmée dès que le document n'est plus celui sur lequel elle a été préparée. */
export const isProposalStale = (proposal: Pick<AssistantProposal, "basedOn">, document: EmailDocument) => proposal.basedOn !== documentFingerprint(document)

/* -------------------------------------------------------------------------- */
/* Affichage                                                                  */
/* -------------------------------------------------------------------------- */

export type ProposalItem = { target: string; blockName: string; label: string; before: string; after: string }

const kindLabels: Record<AssistantFieldKind, string> = { titre: "Titre", paragraphe: "Texte", bouton: "Bouton", image: "Image" }

/** Ce qui va changer, lisible sans JSON : où, quoi, avant, après. */
export function describeProposal(document: EmailDocument, changes: readonly ProposalChange[], blockName: (type: EmailBlockType) => string): ProposalItem[] {
  const fields = new Map(assistantFields(document).map((field) => [field.target, field]))
  return changes.flatMap((change) => {
    const field = fields.get(change.target)
    if (!field) return []
    const after = field.kind === "image" ? (emailBank[change.value as keyof typeof emailBank]?.alt ?? change.value) : normalizeTextDraft(change.value)
    return [{ target: change.target, blockName: blockName(field.blockType), label: kindLabels[field.kind], before: field.current, after }]
  })
}
