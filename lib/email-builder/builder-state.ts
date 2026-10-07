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
 * Un email peut être VIDE (aucune lame) : c'est un document ouvert, pas l'absence
 * de document (« aucun email ouvert » est un état du shell, `shell-state.ts`). Tant
 * qu'il est vide, il reste Brouillon, ne s'enregistre pas en version et l'assistant
 * ne travaille pas : il n'y a encore rien à valider, à garder, ni à relire.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { chatFail, chatReply, chatSend, emptyChat, findChatProposal, setProposalStatus, type AssistantChat } from "./assistant-chat"
import { documentFingerprint, type AssistantProposal } from "./assistant-proposal"
import { planOf, validateCompositionPlan, type CompositionCatalog } from "./composition"
import { isEmptyDocument, type EmailDocument } from "./document"
import { applyToHistory, canRedo, canUndo, createHistory, redo, undo, type History } from "./history"
import { sameSlotValue, slotEditor, slotValueFromDraft, type SlotDraft } from "./inline-edit"
import { newRecommendationNotice, describeOperationError, type BuilderNotice } from "./notices"
import { applyDocumentOperation, type DocumentOperation } from "./operations"
import { createVersion, sameDocumentContent, type DocumentStatus, type EmailVersion } from "./versions"

export type Selection =
  | { kind: "none" }
  | { kind: "block"; blockId: string }
  | { kind: "element"; blockId: string; slot: string }
  | { kind: "editing"; blockId: string; slot: string }

/** Panneau latéral : la bibliothèque de lames (position d'insertion demandée), ou la banque d'images d'un visuel. */
export type Panel = { kind: "library"; index?: number } | { kind: "images"; blockId: string; slot: string }

export type BuilderState = {
  /** Le TRAVAIL courant et son historique immédiat (annuler / rétablir). */
  history: History<EmailDocument>
  /** Statut du travail courant : libre, indépendant de l'historique et des versions. */
  status: DocumentStatus
  /** Versions enregistrées, de la plus ancienne à la plus récente : des snapshots complets et immuables. */
  versions: EmailVersion[]
  /** La version dont part le travail (dernière enregistrée, ou « repartie de ») : sert à savoir si le travail en diffère. */
  baseId: string | null
  /** Version CONSULTÉE (lecture seule) ; `null` : on travaille. */
  viewingId: string | null
  /** La conversation avec l'assistant éditorial : en mémoire, jamais dans le document ni dans les versions. */
  assistant: AssistantChat
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
  | { type: "set-status"; status: DocumentStatus }
  | { type: "save-version"; name: string; at: string }
  | { type: "view-version"; id: string }
  | { type: "exit-view" }
  | { type: "restart-from"; id: string }
  | { type: "assistant-send"; text: string }
  | { type: "assistant-reply"; message: string; proposal?: AssistantProposal }
  | { type: "assistant-fail"; message: string }
  /** `catalog` : les lames ajoutables (contenu initial), nécessaire seulement à une proposition qui ajoute une lame. */
  | { type: "apply-proposal"; id: string; catalog?: CompositionCatalog }
  | { type: "ignore-proposal"; id: string }

const none: Selection = { kind: "none" }

/** `intro` : un premier message de l'assistant (le compte rendu d'une création depuis une référence) ; ce n'est ni une proposition ni une opération. */
export const createBuilderState = (document: EmailDocument, intro?: string): BuilderState => ({ history: createHistory(document), status: "draft", versions: [], baseId: null, viewingId: null, assistant: intro ? chatReply(emptyChat, { message: intro }) : emptyChat, selection: none, panel: null, notice: null, noticeKey: 0 })

export const builderDocument = (state: BuilderState) => state.history.present
/** Le travail courant n'a aucune lame. */
export const builderIsEmpty = (state: BuilderState) => isEmptyDocument(state.history.present)
/** Y a-t-il quelque chose à perdre en recommençant : au moins une lame, ou une version enregistrée. */
export const builderHasWork = (state: BuilderState) => !builderIsEmpty(state) || state.versions.length > 0
export const builderCanUndo = (state: BuilderState) => canUndo(state.history)
export const builderCanRedo = (state: BuilderState) => canRedo(state.history)
/** La version consultée, ou `null`. */
export const builderViewing = (state: BuilderState) => state.versions.find((version) => version.id === state.viewingId) ?? null
/** Ce que le canvas affiche : le snapshot consulté, sinon le travail courant. */
export const shownDocument = (state: BuilderState) => builderViewing(state)?.document ?? state.history.present
/** Consultation : tout geste d'édition est refusé (lecture seule). */
export const builderReadOnly = (state: BuilderState) => state.viewingId !== null
/**
 * Le travail diffère-t-il de la version dont il part ? Comparaison du contenu
 * sérialisable des deux documents (ni dates, ni historique, ni interface) ;
 * `false` s'il n'a encore aucune version de référence. Ce n'est PAS un état de
 * sauvegarde serveur : rien n'est persisté.
 */
export function hasChangesSinceVersion(state: BuilderState): boolean {
  const base = state.versions.find((version) => version.id === state.baseId)
  return base ? !sameDocumentContent(state.history.present, base.document) : false
}
/** La version dont part le travail, ou `null`. */
export const builderBase = (state: BuilderState) => state.versions.find((version) => version.id === state.baseId) ?? null

/** La lame concernée par la sélection, à n'importe quel niveau. */
export const selectedBlockId = (state: BuilderState) => (state.selection.kind === "none" ? null : state.selection.blockId)

const withNotice = (state: BuilderState, notice: BuilderNotice | null): BuilderState => ({ ...state, notice, noticeKey: state.noticeKey + 1 })

/** Un email vide reste Brouillon, quel que soit le chemin qui le vide (suppression, annuler, rétablir). */
const settled = (state: BuilderState): BuilderState => (isEmptyDocument(state.history.present) && state.status !== "draft" ? { ...state, status: "draft" } : state)

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
  return settled({ ...withNotice(state, newRecommendationNotice(before, result.value)), history: applyToHistory(state.history, result.value), ...after(result.value, before) })
}

/** Actions permises pendant la consultation d'une version : elle est en lecture seule. */
const whileViewing: ReadonlySet<BuilderAction["type"]> = new Set(["view-version", "exit-view", "restart-from", "close-panel", "dismiss-notice", "assistant-reply", "assistant-fail", "ignore-proposal"])

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  if (state.viewingId !== null && !whileViewing.has(action.type)) return state
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
      return settled({ ...withNotice(state, null), history, selection, panel: state.panel?.kind === "images" ? null : state.panel })
    }

    case "open-library":
      return { ...state, panel: action.index === undefined ? { kind: "library" } : { kind: "library", index: action.index } }
    case "open-images":
      return { ...state, panel: { kind: "images", blockId: action.blockId, slot: action.slot } }
    case "close-panel":
      return state.panel ? { ...state, panel: null } : state
    case "dismiss-notice":
      return state.notice ? { ...state, notice: null } : state

    case "set-status":
      // Libre : aucune transition imposée, aucune recommandation ne bloque. Ni opération, ni historique.
      // Seule impossibilité : un email sans lame n'a rien à valider ni à envoyer, il reste Brouillon.
      if (state.status === action.status || (action.status !== "draft" && isEmptyDocument(document))) return state
      return { ...state, status: action.status }

    case "save-version": {
      // Un email vide n'est pas un travail à garder.
      if (isEmptyDocument(document)) return state
      // Un snapshot du travail : le document, l'historique et la sélection ne bougent pas (l'objet `history` reste le même).
      const version = createVersion(state.versions, { name: action.name, document, status: state.status, createdAt: action.at })
      return { ...state, versions: [...state.versions, version], baseId: version.id }
    }

    case "view-version":
      return state.versions.some((version) => version.id === action.id) ? { ...state, viewingId: action.id, selection: none, panel: null } : state
    case "exit-view":
      return state.viewingId === null ? state : { ...state, viewingId: null }

    case "restart-from": {
      const version = state.versions.find((candidate) => candidate.id === action.id)
      if (!version) return state
      // Nouveau point de départ : copie du snapshot, historique vierge, statut Brouillon ; les versions restent toutes.
      return { ...withNotice(state, null), history: createHistory(structuredClone(version.document)), status: "draft", baseId: version.id, viewingId: null, selection: none, panel: null }
    }

    case "assistant-send":
      // Un seul appel à la fois ; un message vide n'est pas envoyé ; un email vide n'a rien à relire.
      return state.assistant.pending || action.text.trim() === "" || isEmptyDocument(document) ? state : { ...state, assistant: chatSend(state.assistant, action.text) }
    case "assistant-reply":
      return { ...state, assistant: chatReply(state.assistant, { message: action.message, ...(action.proposal ? { proposal: action.proposal } : {}) }) }
    case "assistant-fail":
      return { ...state, assistant: chatFail(state.assistant, action.message) }
    case "ignore-proposal":
      return findChatProposal(state.assistant, action.id)?.status === "open" ? { ...state, assistant: setProposalStatus(state.assistant, action.id, "ignored") } : state

    case "apply-proposal": {
      // Une proposition ne s'applique que si elle est ouverte, que le document est celui sur lequel elle a été préparée, et que le domaine la valide encore : toutes ses opérations, ou aucune.
      const proposal = findChatProposal(state.assistant, action.id)
      if (!proposal || proposal.status !== "open") return state
      if (proposal.basedOn !== documentFingerprint(document)) return withNotice(state, { tone: "warning", message: "L'email a changé depuis cette proposition. Demande-moi de l'actualiser." })
      const checked = validateCompositionPlan(document, planOf(proposal), action.catalog ?? {})
      if (!checked.ok) return withNotice(state, { tone: "error", message: "Cette proposition ne peut plus être appliquée : l'email a évolué." })
      // UNE transformation (contenus, ajouts, déplacements, suppressions) = UNE entrée d'historique ; le statut et les versions ne bougent pas, sauf qu'un email vidé redevient Brouillon.
      return settled({
        ...withNotice(state, newRecommendationNotice(document, checked.next)),
        history: applyToHistory(state.history, checked.next),
        selection: validSelection(state.selection, checked.next),
        assistant: setProposalStatus(state.assistant, action.id, "applied"),
      })
    }
  }
}
