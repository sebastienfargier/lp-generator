/**
 * État du Builder : pur, testable hors de React. La SEULE source de vérité est
 * l'historique d'EmailDocument (`history.present`) ; l'interface n'y touche
 * jamais directement : tout changement passe par `applyDocumentOperation`
 * (opérations de `operations.ts`), puis par l'historique de travail (annuler /
 * rétablir). Rien n'est persisté : un rechargement repart du document initial.
 *
 * L'état d'interface (lame sélectionnée, bibliothèque ouverte, retour discret)
 * est volontairement minuscule et ne fait jamais partie du document.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailDocument } from "./document"
import { applyToHistory, canRedo, canUndo, createHistory, redo, undo, type History } from "./history"
import { newRecommendationNotice, describeOperationError, type BuilderNotice } from "./notices"
import { applyDocumentOperation, type DocumentOperation } from "./operations"

export type BuilderState = {
  history: History<EmailDocument>
  /** Lame sélectionnée (jamais un état du document). */
  selectedId: string | null
  /** Bibliothèque ouverte : `index` est la position d'insertion demandée (absent : avant les mentions légales et le footer). */
  library: { index?: number } | null
  notice: BuilderNotice | null
  /** Change à chaque retour : permet de le réafficher et de relancer son minuteur. */
  noticeKey: number
}

export type BuilderAction =
  | { type: "select"; blockId: string | null }
  | { type: "operation"; operation: DocumentOperation }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "open-library"; index?: number }
  | { type: "close-library" }
  | { type: "dismiss-notice" }

export const createBuilderState = (document: EmailDocument): BuilderState => ({ history: createHistory(document), selectedId: null, library: null, notice: null, noticeKey: 0 })

export const builderDocument = (state: BuilderState) => state.history.present
export const builderCanUndo = (state: BuilderState) => canUndo(state.history)
export const builderCanRedo = (state: BuilderState) => canRedo(state.history)

const withNotice = (state: BuilderState, notice: BuilderNotice | null): BuilderState => ({ ...state, notice, noticeKey: state.noticeKey + 1 })

const ids = (document: EmailDocument) => document.config.blocks.map((block) => block.id)
/** La sélection survit tant que sa lame existe. */
const keepSelection = (selectedId: string | null, document: EmailDocument) => (selectedId && ids(document).includes(selectedId) ? selectedId : null)

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.blockId && ids(state.history.present).includes(action.blockId) ? action.blockId : null }

    case "operation": {
      const before = state.history.present
      const result = applyDocumentOperation(before, action.operation)
      // Refus technique : le document ne change pas ; une phrase claire.
      if (!result.ok) return withNotice(state, describeOperationError(result.error))
      const after = result.value
      const added = action.operation.type === "add-block" ? ids(after).find((id) => !ids(before).includes(id)) : undefined
      return {
        ...withNotice(state, newRecommendationNotice(before, after)),
        history: applyToHistory(state.history, after),
        // Une lame ajoutée est sélectionnée (on voit où elle est) ; une lame supprimée n'est plus sélectionnée.
        selectedId: added ?? keepSelection(state.selectedId, after),
        library: action.operation.type === "add-block" ? null : state.library,
      }
    }

    case "undo": {
      const history = undo(state.history)
      return history === state.history ? state : { ...withNotice(state, null), history, selectedId: keepSelection(state.selectedId, history.present) }
    }
    case "redo": {
      const history = redo(state.history)
      return history === state.history ? state : { ...withNotice(state, null), history, selectedId: keepSelection(state.selectedId, history.present) }
    }

    case "open-library":
      return { ...state, library: action.index === undefined ? {} : { index: action.index } }
    case "close-library":
      return state.library ? { ...state, library: null } : state
    case "dismiss-notice":
      return state.notice ? { ...state, notice: null } : state
  }
}
