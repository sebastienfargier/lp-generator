/**
 * Moteur de COMPOSITION : un plan structuré → un nouvel EmailDocument. Pur : ni
 * React, ni chat, ni réseau, ni Anthropic. Il reçoit un plan de n'importe quelle
 * source (l'assistant conversationnel aujourd'hui, l'analyse d'une référence
 * demain) et le traite de la même façon :
 *
 *   plan → validation (références, lames, positions, contenus, protections)
 *        → opérations V2.1 (`add-block`, `move-block`, `remove-block`, `set-slot`)
 *        → `applyDocumentOperations` : toutes ou aucune, UN document résultat
 *
 * Le plan est une API de haut niveau, jamais une liste d'opérations internes :
 *
 * - `add`     : une lame OFFICIELLE du catalogue (type), sa place (`first`,
 *               `last` = fin du corps avant mentions légales et footer, ou
 *               `before` / `after` une lame par son identifiant), un identifiant
 *               symbolique local (`ref`) que le système résout, et le texte de ses
 *               champs éditoriaux. Le reste (liens, images, surface) est celui du
 *               contenu initial de la bibliothèque ;
 * - `move`    : une lame existante, sa nouvelle place ;
 * - `remove`  : une lame existante ;
 * - `content` : les changements de contenu de V2.5 (champs existants).
 *
 * Ordre d'application, fixé par le système : ajouts, déplacements, suppressions,
 * contenus. Une place `before` / `after` désigne une lame qui existe encore ou une
 * lame ajoutée plus tôt dans le plan (`ref`), jamais une lame supprimée.
 *
 * Les protections de contenu de V2.5 restent entières (champs en lecture seule,
 * `mustKeep`, nouvelles alertes sur un contenu modifié). Une action de
 * STRUCTURE n'est en revanche jamais refusée pour une recommandation : le Builder
 * conseille (`notice`), il n'impose pas.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { isEmailBankImageId } from "../email/image-bank"
import { emailBlockManifest } from "../email/manifest"
import type { EmailBlockType } from "../email/types"
import type { EmailDocument } from "./document"
import {
  assistantFields,
  blocksOf,
  checkContentProtection,
  compatibleImages,
  maxProposalChanges,
  proposalToOperations,
  slotProtection,
  type ProposalChange,
} from "./assistant-proposal"
import { normalizeTextDraft, slotEditor } from "./inline-edit"
import { newRecommendationNotice } from "./notices"
import { applyDocumentOperations, defaultIndex, freeId, type DocumentOperation } from "./operations"
import { sameDocumentContent } from "./versions"

/* -------------------------------------------------------------------------- */
/* Contrat                                                                    */
/* -------------------------------------------------------------------------- */

export const placementWheres = ["first", "last", "before", "after"] as const
export type PlacementWhere = (typeof placementWheres)[number]

/** `anchor` : l'identifiant d'une lame (ou la `ref` d'une lame ajoutée) pour `before` / `after` ; vide pour `first` / `last`. */
export type Placement = { where: PlacementWhere; anchor: string }

export type AddAction = {
  ref: string
  blockType: string
  placement: Placement
  content: { slot: string; value: string }[]
  /** Images de la BANQUE (identifiant, jamais une URL) pour les visuels de la lame ; absent : l'image par défaut de la bibliothèque. */
  images?: { slot: string; imageId: string }[]
}
export type MoveAction = { blockId: string; placement: Placement }
export type RemoveAction = { blockId: string }

export type CompositionStructure = { add: AddAction[]; move: MoveAction[]; remove: RemoveAction[] }
export type CompositionPlan = CompositionStructure & { content: ProposalChange[] }

export const emptyStructure = (): CompositionStructure => ({ add: [], move: [], remove: [] })

/** Le plan d'une proposition (contenu seul ou avec structure). */
export const planOf = (proposal: { changes: readonly ProposalChange[]; structure?: Partial<CompositionStructure> | undefined }): CompositionPlan => ({
  content: [...proposal.changes],
  add: [...(proposal.structure?.add ?? [])],
  move: [...(proposal.structure?.move ?? [])],
  remove: [...(proposal.structure?.remove ?? [])],
})

export const hasStructure = (structure: Partial<CompositionStructure> | undefined) => (structure?.add?.length ?? 0) + (structure?.move?.length ?? 0) + (structure?.remove?.length ?? 0) > 0

/** Limites d'un plan. Celles-ci sont les valeurs par défaut (l'assistant : une proposition reste relisible d'un coup d'œil) ; un autre producteur de plan peut en passer d'autres. */
export type CompositionLimits = { add: number; move: number; remove: number; content: number; slotsPerBlock: number }
export const compositionLimits: CompositionLimits = { add: 5, move: 8, remove: 8, content: maxProposalChanges, slotsPerBlock: 16 }

/** Une ref symbolique : un mot court, jamais un identifiant existant. */
const refPattern = /^[a-z][a-z0-9-]{0,29}$/

/* -------------------------------------------------------------------------- */
/* Catalogue des lames ajoutables                                             */
/* -------------------------------------------------------------------------- */

export type CompositionCatalogEntry = { name: string; family: string; role: string; /** Contenu initial de la bibliothèque (slots complets, liens et image compris). */ starter: Readonly<Record<string, unknown>> }
export type CompositionCatalog = Readonly<Record<string, CompositionCatalogEntry>>

/** Les lames AJOUTABLES (celles qui ont un contenu initial valide) : le catalogue de la bibliothèque, sans rien de plus. */
export function compositionCatalog(lames: readonly { type: string; name: string; family: string; role: string; starter?: Record<string, unknown> }[]): CompositionCatalog {
  return Object.fromEntries(lames.flatMap((lame) => (lame.starter ? [[lame.type, { name: lame.name, family: lame.family, role: lame.role, starter: lame.starter }] as const] : [])))
}

type FieldGenre = "titre" | "paragraphe" | "bouton"

/** Les champs éditoriaux d'un type de lame : ce qu'un plan peut écrire dans une lame ajoutée (texte et libellé de bouton ; ni image, ni lien, ni valeur contrôlée). */
export function editableSlots(blockType: string): { slot: string; genre: FieldGenre }[] {
  const entry = (emailBlockManifest as Record<string, { slots: Record<string, string> } | undefined>)[blockType]
  if (!entry) return []
  return Object.keys(entry.slots).flatMap((slot) => {
    if (slotProtection(blockType as EmailBlockType, slot)) return []
    const editor = slotEditor(blockType as EmailBlockType, slot)
    if (!editor || editor === "image") return []
    return [{ slot, genre: editor === "cta" ? ("bouton" as const) : editor === "short" ? ("titre" as const) : ("paragraphe" as const) }]
  })
}

/** Le catalogue vu par le modèle : compact, sans HTML ni rendu ; type, nom, famille, rôle, champs éditoriaux, présence d'une image. */
export function describeCatalog(catalog: CompositionCatalog) {
  return Object.entries(catalog).map(([type, entry]) => ({
    type,
    name: entry.name,
    family: entry.family,
    role: entry.role,
    fields: editableSlots(type).map((field) => `${field.slot} (${field.genre})`),
    image: Object.values((emailBlockManifest as Record<string, { slots: Record<string, string> }>)[type]?.slots ?? {}).includes("asset:visuel"),
  }))
}

/* -------------------------------------------------------------------------- */
/* Validation et application                                                  */
/* -------------------------------------------------------------------------- */

export type CompositionCheck =
  | { ok: true; operations: DocumentOperation[]; next: EmailDocument; /** Le conseil que le résultat appelle (nouvelle alerte), jamais un refus. */ notice: string | null }
  | { ok: false; reason: "invalid" | "protected"; message: string }

const invalid = (message: string): CompositionCheck => ({ ok: false, reason: "invalid", message })

/** Où insérer, dans la liste `order` privée de la lame déplacée (`movingType` : son type, pour « fin du corps »). */
function indexFor(order: readonly string[], types: ReadonlyMap<string, string>, placement: Placement, movingType: string): { ok: true; index: number } | { ok: false; message: string } {
  if (placement.where === "first" || placement.where === "last") {
    if (placement.anchor !== "") return { ok: false, message: "Une place « au début » ou « à la fin » ne désigne aucune lame." }
    return { ok: true, index: placement.where === "first" ? 0 : defaultIndex(order.map((id) => ({ type: types.get(id)! })), movingType) }
  }
  if (placement.anchor === "") return { ok: false, message: "Une place « avant » ou « après » désigne une lame." }
  const at = order.indexOf(placement.anchor)
  if (at < 0) return { ok: false, message: `La lame « ${placement.anchor} » n'existe pas (ou pas encore) dans cet email.` }
  return { ok: true, index: placement.where === "before" ? at : at + 1 }
}

/**
 * Valide un plan contre le document COURANT, sans rien modifier, et renvoie le
 * document résultat : toutes les actions s'appliquent, ou aucune (un échec ne
 * laisse rien). Le catalogue dit quelles lames sont ajoutables.
 */
export function validateCompositionPlan(document: EmailDocument, plan: CompositionPlan, catalog: CompositionCatalog, options: { limits?: Partial<CompositionLimits> } = {}): CompositionCheck {
  const limits = { ...compositionLimits, ...options.limits }
  const { add, move, remove, content } = plan
  const total = add.length + move.length + remove.length + content.length
  if (total === 0) return invalid("La proposition ne contient aucun changement.")
  if (add.length > limits.add) return invalid(`Une proposition ajoute ${limits.add} lames au plus.`)
  if (move.length > limits.move) return invalid(`Une proposition déplace ${limits.move} lames au plus.`)
  if (remove.length > limits.remove) return invalid(`Une proposition supprime ${limits.remove} lames au plus.`)

  const blocks = blocksOf(document)
  const types = new Map<string, string>(blocks.map((block) => [block.id, block.type]))
  const existing = new Set(types.keys())

  // Suppressions : des lames existantes, une fois chacune.
  const removed = new Set<string>()
  for (const action of remove) {
    if (!existing.has(action.blockId)) return invalid(`La lame « ${action.blockId} » n'existe plus dans cet email.`)
    if (removed.has(action.blockId)) return invalid(`La lame « ${action.blockId} » est supprimée deux fois.`)
    removed.add(action.blockId)
  }

  // Déplacements : des lames existantes qui restent, une fois chacune.
  const moved = new Set<string>()
  for (const action of move) {
    if (!existing.has(action.blockId)) return invalid(`La lame « ${action.blockId} » n'existe plus dans cet email.`)
    if (removed.has(action.blockId)) return invalid(`La lame « ${action.blockId} » est supprimée : elle ne peut pas être déplacée.`)
    if (moved.has(action.blockId)) return invalid(`La lame « ${action.blockId} » est déplacée deux fois.`)
    if (action.placement.anchor === action.blockId) return invalid("Une lame ne se place pas par rapport à elle-même.")
    moved.add(action.blockId)
  }

  // Ajouts : des types officiels ajoutables, des refs neuves, des champs éditoriaux.
  const refs = new Map<string, string>()
  const declared = new Set(add.map((action) => action.ref))
  for (const action of add) {
    if (!refPattern.test(action.ref)) return invalid(`Référence « ${action.ref} » invalide : un mot court en minuscules (ex. new-1).`)
    if (existing.has(action.ref)) return invalid(`La référence « ${action.ref} » est déjà un identifiant de lame.`)
    if (refs.has(action.ref)) return invalid(`La référence « ${action.ref} » est utilisée deux fois.`)
    if (!Object.hasOwn(catalog, action.blockType)) return invalid(`Lame « ${action.blockType} » : inconnue ou non ajoutable.`)
    const allowed = new Set(editableSlots(action.blockType).map((field) => field.slot))
    if (action.content.length > limits.slotsPerBlock) return invalid(`Une lame ajoutée reçoit ${limits.slotsPerBlock} contenus au plus.`)
    const seen = new Set<string>()
    for (const entry of action.content) {
      if (!allowed.has(entry.slot)) return invalid(`Le champ « ${entry.slot} » n'existe pas (ou n'est pas modifiable) dans la lame « ${action.blockType} ».`)
      if (seen.has(entry.slot)) return invalid(`Le champ « ${entry.slot} » est renseigné deux fois.`)
      seen.add(entry.slot)
      if (normalizeTextDraft(entry.value) === "") return invalid("Un texte proposé est vide.")
    }
    const imageSlots = new Set(Object.entries((emailBlockManifest as Record<string, { slots: Record<string, string> }>)[action.blockType]?.slots ?? {}).filter(([, kind]) => kind === "asset:visuel").map(([slot]) => slot))
    const usedImages = new Set<string>()
    for (const entry of action.images ?? []) {
      if (!imageSlots.has(entry.slot)) return invalid(`Le champ « ${entry.slot} » n'est pas un visuel de la lame « ${action.blockType} ».`)
      if (usedImages.has(entry.slot)) return invalid(`Le visuel « ${entry.slot} » est renseigné deux fois.`)
      usedImages.add(entry.slot)
      if (!isEmailBankImageId(entry.imageId)) return invalid(`Image inconnue de la banque : « ${entry.imageId} ».`)
      if (!compatibleImages(action.blockType as EmailBlockType).some((image) => image.id === entry.imageId)) return invalid(`L'image « ${entry.imageId} » n'est pas compatible avec la lame « ${action.blockType} ».`)
    }
    refs.set(action.ref, action.blockType)
  }
  for (const [ref, type] of refs) types.set(ref, type)

  // Les places ne visent jamais une lame supprimée ni une référence inconnue.
  for (const placement of [...add.map((action) => action.placement), ...move.map((action) => action.placement)]) {
    if (removed.has(placement.anchor)) return invalid(`La lame « ${placement.anchor} » est supprimée : on ne peut pas s'y référer.`)
    if (placement.anchor !== "" && !existing.has(placement.anchor) && !declared.has(placement.anchor)) return invalid(`La lame « ${placement.anchor} » n'existe pas dans cet email.`)
  }

  // Contenu des lames existantes : champs existants, hors lames supprimées.
  const fields = new Map(assistantFields(document).map((field) => [field.target, field]))
  for (const change of content) {
    const field = fields.get(change.target)
    if (field && removed.has(field.blockId)) return invalid(`Le champ « ${change.target} » appartient à une lame supprimée.`)
  }
  let contentOperations: DocumentOperation[] = []
  if (content.length > 0) {
    const translated = proposalToOperations(document, content)
    if (!translated.ok) return invalid(translated.message)
    contentOperations = translated.operations
    // Protections de contenu de V2.5, sur les seuls changements de contenu.
    const alone = applyDocumentOperations(document, contentOperations)
    if (!alone.ok) return invalid(`Une modification n'est pas applicable : ${alone.error.message}`)
    const protectedCheck = checkContentProtection(document, alone.value, content)
    if (!protectedCheck.ok) return protectedCheck
  }

  // Opérations : ajouts, déplacements, suppressions, contenus. Les positions sont calculées sur l'ordre qui évolue.
  const operations: DocumentOperation[] = []
  const order = blocks.map((block) => block.id)
  const taken = new Set(existing)
  const ids = new Map<string, string>()
  for (const action of add) {
    const anchor = ids.get(action.placement.anchor) ?? action.placement.anchor
    const placement = { ...action.placement, anchor }
    const resolved = indexFor(order, types, placement, action.blockType)
    if (!resolved.ok) return invalid(resolved.message)
    const id = freeId(action.blockType, taken)
    taken.add(id)
    ids.set(action.ref, id)
    types.set(id, action.blockType)
    order.splice(resolved.index, 0, id)
    operations.push({ type: "add-block", blockType: action.blockType, slots: structuredClone(catalog[action.blockType]!.starter) as Record<string, unknown>, id, index: resolved.index })
  }
  for (const action of move) {
    const rest = order.filter((id) => id !== action.blockId)
    const placement = { ...action.placement, anchor: ids.get(action.placement.anchor) ?? action.placement.anchor }
    const resolved = indexFor(rest, types, placement, types.get(action.blockId)!)
    if (!resolved.ok) return invalid(resolved.message)
    rest.splice(resolved.index, 0, action.blockId)
    order.splice(0, order.length, ...rest)
    operations.push({ type: "move-block", blockId: action.blockId, toIndex: resolved.index })
  }
  for (const action of remove) {
    order.splice(order.indexOf(action.blockId), 1)
    operations.push({ type: "remove-block", blockId: action.blockId })
  }
  operations.push(...contentOperations)
  for (const action of add) {
    const id = ids.get(action.ref)!
    const starter = catalog[action.blockType]!.starter as Record<string, { href?: string }>
    const genres = new Map(editableSlots(action.blockType).map((field) => [field.slot, field.genre]))
    for (const entry of action.content) {
      const value = normalizeTextDraft(entry.value)
      operations.push({ type: "set-slot", blockId: id, slot: entry.slot, value: genres.get(entry.slot) === "bouton" ? { label: value, href: starter[entry.slot]?.href ?? "" } : { text: value } })
    }
  }

  for (const action of add) {
    for (const entry of action.images ?? []) operations.push({ type: "set-image", blockId: ids.get(action.ref)!, slot: entry.slot, imageId: entry.imageId })
  }

  const applied = applyDocumentOperations(document, operations)
  if (!applied.ok) return invalid(`Une action n'est pas applicable : ${applied.error.message}`)
  if (sameDocumentContent(document, applied.value)) return invalid("Cette proposition ne change rien.")
  return { ok: true, operations, next: applied.value, notice: newRecommendationNotice(document, applied.value)?.message ?? null }
}

/** Applique un plan : le même contrôle que `validateCompositionPlan`, le document résultat en plus. UNE transformation, UNE entrée d'historique pour l'appelant. */
export const applyCompositionPlan = validateCompositionPlan

/* -------------------------------------------------------------------------- */
/* Affichage                                                                  */
/* -------------------------------------------------------------------------- */

export type StructureItem = { kind: "add" | "move" | "remove"; /** « Hero offre » (lame 2). */ title: string; /** Où, ou ce qui est écrit dans la lame ajoutée. */ detail: string }

/** La structure d'une proposition, lisible sans JSON : quelle lame, quelle action, où. */
export function describeStructure(document: EmailDocument, structure: Partial<CompositionStructure> | undefined, catalog: CompositionCatalog, blockName: (type: EmailBlockType) => string): StructureItem[] {
  const blocks = blocksOf(document)
  const label = (id: string) => {
    const at = blocks.findIndex((block) => block.id === id)
    return at < 0 ? id : `« ${blockName(blocks[at]!.type)} » (lame ${at + 1})`
  }
  const added = new Map((structure?.add ?? []).map((action) => [action.ref, `« ${catalog[action.blockType]?.name ?? action.blockType} » (nouvelle lame)`]))
  const named = (id: string) => added.get(id) ?? label(id)
  const where = (placement: Placement) =>
    placement.where === "first" ? "au début de l'email" : placement.where === "last" ? "à la fin du corps, avant les mentions légales et le footer" : `${placement.where === "before" ? "avant" : "après"} ${named(placement.anchor)}`
  return [
    ...(structure?.remove ?? []).map((action) => ({ kind: "remove" as const, title: label(action.blockId), detail: "" })),
    ...(structure?.move ?? []).map((action) => ({ kind: "move" as const, title: label(action.blockId), detail: where(action.placement) })),
    ...(structure?.add ?? []).map((action) => ({
      kind: "add" as const,
      title: added.get(action.ref)!,
      detail: [where(action.placement), ...action.content.map((entry) => `${entry.slot} : « ${normalizeTextDraft(entry.value)} »`)].join(" · "),
    })),
  ]
}
