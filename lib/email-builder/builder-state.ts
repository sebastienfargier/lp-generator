/**
 * État du Builder : pur, testable hors de React. La SEULE source de vérité est
 * l'historique d'EmailDocument (`history.present`) ; l'interface n'y touche
 * jamais directement : tout changement passe par `applyDocumentOperation`
 * (opérations de `operations.ts`), puis par l'historique de travail (annuler /
 * rétablir). Rien n'est persisté : un rechargement repart du document initial.
 *
 * L'état d'interface est volontairement minuscule et ne fait jamais partie du
 * document : la SÉLECTION (rien, une lame, un élément, un élément en cours
 * d'édition), le panneau ouvert (bibliothèque de lames ou banque d'images) et
 * le retour discret. Le BROUILLON d'une édition en cours n'est pas ici : il
 * vit dans le composant d'édition pendant la frappe ; le document n'est
 * modifié qu'à la validation (`commit-edit`), en UNE opération et UNE entrée
 * d'historique.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailDocument } from "./document"
import { applyToHistory, canRedo, canUndo, createHistory, redo, undo, type History } from "./history"
import { sameSlotValue, slotEditor, slotValueFromDraft, type SlotDraft } from "./inline-edit"
import { newRecommendationNotice, describeOperationError, type BuilderNotice } from "./notices"
import { applyDocumentOperation, type DocumentOperation } from "./operations"

export type Selection =
  | { kind: "none" }
  | { kind: "block"; blockId: string }
  | { kind: "element"; blockId: string; slot: string }
  | { kind: "editing"; blockId: string; slot: string }

/** Panneau latéral : la bibliothèque de lames (position d'insertion demandée), ou la banque d'images d'un visuel. */
export type Panel = { kind: "library"; index?: number } | { kind: "images"; blockId: string; slot: string }

export type BuilderState = {
  history: History<EmailDocument>
  selection: Selection
  panel: Panel | null
  notice: BuilderNotice | null
  /** Change à chaque retour : permet de le réafficher et de relancer son minuteur. */
  noticeKey: number
}

export type BuilderAction =
  | { type: "select-block"; blockId: string | null }
  | { type: "select-element"; blockId: string; slot: string }
  | { type: "start-edit"; blockId: string; slot: string }
  | { type: "commit-edit"; blockId: string; slot: string; draft: SlotDraft }
  | { type: "escape" }
  | { type: "operation"; operation: DocumentOperation }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "open-library"; index?: number }
  | { type: "open-images"; blockId: string; slot: string }
  | { type: "close-panel" }
  | { type: "dismiss-notice" }

const none: Selection = { kind: "none" }

export const createBuilderState = (document: EmailDocument): BuilderState => ({ history: createHistory(document), selection: none, panel: null, notice: null, noticeKey: 0 })

export const builderDocument = (state: BuilderState) => state.history.present
export const builderCanUndo = (state: BuilderState) => canUndo(state.history)
export const builderCanRedo = (state: BuilderState) => canRedo(state.history)
/** La lame concernée par la sélection, à n'importe quel niveau. */
export const selectedBlockId = (state: BuilderState) => (state.selection.kind === "none" ? null : state.selection.blockId)

const withNotice = (state: BuilderState, notice: BuilderNotice | null): BuilderState => ({ ...state, notice, noticeKey: state.noticeKey + 1 })

const ids = (document: EmailDocument) => document.config.blocks.map((block) => block.id)
const blockOf = (document: EmailDocument, id: string) => document.config.blocks.find((block) => block.id === id)

/** Une sélection n'est valable que si sa lame existe (et, pour un élément, son slot). */
function validSelection(selection: Selection, document: EmailDocument): Selection {
  if (selection.kind === "none") return selection
  const block = blockOf(document, selection.blockId)
  if (!block) return none
  if (selection.kind === "block") return selection
  const slots = (block as unknown as { slots: Record<string, unknown> }).slots
  return Object.hasOwn(slots, selection.slot) ? selection : { kind: "block", blockId: selection.blockId }
}

/** Applique UNE opération : refus technique → le document ne change pas, une phrase claire ; succès → un nouveau présent dans l'historique. */
function operate(state: BuilderState, operation: DocumentOperation, after: (document: EmailDocument, before: EmailDocument) => Partial<BuilderState>): BuilderState {
  const before = state.history.present
  const result = applyDocumentOperation(before, operation)
  if (!result.ok) return withNotice(state, describeOperationError(result.error))
  return { ...withNotice(state, newRecommendationNotice(before, result.value)), history: applyToHistory(state.history, result.value), ...after(result.value, before) }
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  const document = state.history.present
  switch (action.type) {
    case "select-block": {
      const closing = state.panel?.kind === "images" ? { panel: null } : {}
      return { ...state, ...closing, selection: action.blockId && blockOf(document, action.blockId) ? { kind: "block", blockId: action.blockId } : none }
    }

    case "select-element": {
      // La banque d'images ne reste ouverte que pour le visuel qu'elle remplace.
      const keep = state.panel?.kind !== "images" || (state.panel.blockId === action.blockId && state.panel.slot === action.slot)
      return { ...state, panel: keep ? state.panel : null, selection: validSelection({ kind: "element", blockId: action.blockId, slot: action.slot }, document) }
    }

    case "start-edit": {
      const block = blockOf(document, action.blockId)
      const editor = block && slotEditor(block.type, action.slot)
      if (!editor || editor === "image") return state
      return { ...state, panel: state.panel?.kind === "images" ? null : state.panel, selection: validSelection({ kind: "editing", blockId: action.blockId, slot: action.slot }, document) }
    }

    case "commit-edit": {
      const block = blockOf(document, action.blockId)
      const editor = block && slotEditor(block.type, action.slot)
      const back: Selection = validSelection({ kind: "element", blockId: action.blockId, slot: action.slot }, document)
      if (!block || !editor || editor === "image") return { ...state, selection: back }
      const value = slotValueFromDraft(action.draft)
      // Valeur inchangée : ni opération, ni historique, ni retour.
      if (sameSlotValue(value, (block as unknown as { slots: Record<string, unknown> }).slots[action.slot])) return { ...state, selection: back }
      const next = operate(state, { type: "set-slot", blockId: action.blockId, slot: action.slot, value }, () => ({}))
      return { ...next, selection: back }
    }

    case "escape": {
      // Édition → annulée (le brouillon est perdu, le document n'a pas bougé) ; sinon panneau ; sinon élément, puis lame.
      const { selection } = state
      if (selection.kind === "editing") return { ...state, selection: { kind: "element", blockId: selection.blockId, slot: selection.slot } }
      if (state.panel) return { ...state, panel: null }
      if (selection.kind === "element") return { ...state, selection: { kind: "block", blockId: selection.blockId } }
      if (selection.kind === "block") return { ...state, selection: none }
      return state
    }

    case "operation": {
      const op = action.operation
      return operate(state, op, (after, before) => {
        // Une lame ajoutée est sélectionnée (on voit où elle est) et la bibliothèque se ferme ; une image remplacée referme la banque.
        const added = op.type === "add-block" ? ids(after).find((id) => !ids(before).includes(id)) : undefined
        return {
          selection: added ? ({ kind: "block", blockId: added } as Selection) : validSelection(state.selection, after),
          panel: op.type === "add-block" || op.type === "set-image" ? null : state.panel,
        }
      })
    }

    case "undo":
    case "redo": {
      const history = action.type === "undo" ? undo(state.history) : redo(state.history)
      if (history === state.history) return state
      // La sélection retombe au niveau de la lame (si elle existe encore) ; un panneau d'images se ferme.
      const selection = state.selection.kind === "none" ? none : validSelection({ kind: "block", blockId: state.selection.blockId }, history.present)
      return { ...withNotice(state, null), history, selection, panel: state.panel?.kind === "images" ? null : state.panel }
    }

    case "open-library":
      return { ...state, panel: action.index === undefined ? { kind: "library" } : { kind: "library", index: action.index } }
    case "open-images":
      return { ...state, panel: { kind: "images", blockId: action.blockId, slot: action.slot } }
    case "close-panel":
      return state.panel ? { ...state, panel: null } : state
    case "dismiss-notice":
      return state.notice ? { ...state, notice: null } : state
  }
}
