/**
 * État de l'édition conversationnelle de /email-generator : pur, testable hors de
 * React, utilisable côté client (aucun import du moteur, de Claude ou du
 * renderer).
 *
 * - `versions` : l'historique local. V1 est la génération initiale, chaque
 *   modification réussie ajoute une version (V2, V3…). Chaque version garde son
 *   email rendu ET son Draft éditable : annuler ou rétablir ne fait AUCUN appel.
 * - `index` : la version affichée. Annuler recule, rétablir avance ; une
 *   nouvelle modification faite après un retour en arrière remplace les versions
 *   « rétablissables ».
 * - `generation` : le corps de la génération qui a produit V1 (recette, cible,
 *   données de l'offre) : il redonne au serveur les valeurs protégées à chaque
 *   édition. Le serveur ne garde rien : le navigateur tient l'historique, sans
 *   persistance (un rechargement repart de zéro).
 * - une erreur ne change jamais l'historique : la dernière version valide reste
 *   affichée, aucune version n'est ajoutée.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailGenerationSuccess } from "./generation"
import type { EmailClientErrorCode } from "./generator-form"

export type EmailVersion = {
  /** 1 pour la génération initiale, puis 2, 3… (numéro d'affichage, stable pendant la session). */
  number: number
  kind: "generation" | "edit"
  /** Instruction qui a produit cette version (modifications seulement). */
  instruction?: string
  /** Ce que la modification a changé, en une phrase (modifications seulement). */
  summary?: string
  email: EmailGenerationSuccess
}

export type EmailEditErrorCode = EmailClientErrorCode | "edit-refused" | "protected-mutation" | "no-change"

export type EmailEditorError = { code: EmailEditErrorCode; issues: { path: string; message: string }[] }

export type EmailEditorState = {
  versions: EmailVersion[]
  /** Version affichée ; -1 tant qu'aucun email n'a été généré. */
  index: number
  /** Corps de la génération initiale (voir plus haut), ou `null`. */
  generation: unknown
  status: "idle" | "editing"
  /** Court message de succès (« Email mis à jour ») ; effacé à l'action suivante. */
  notice: string | null
  error: EmailEditorError | null
}

export const initialEmailEditorState: EmailEditorState = { versions: [], index: -1, generation: null, status: "idle", notice: null, error: null }

export type EmailEditorAction =
  | { type: "generated"; email: EmailGenerationSuccess; generation: unknown }
  | { type: "edit-start" }
  | { type: "edit-success"; email: EmailGenerationSuccess; instruction: string; summary: string }
  | { type: "edit-failure"; error: EmailEditorError }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "dismiss" }

export const emailEditNotice = "Email mis à jour"

export function emailEditorReducer(state: EmailEditorState, action: EmailEditorAction): EmailEditorState {
  switch (action.type) {
    case "generated":
      // Une nouvelle génération repart de V1 : l'ancien historique n'a plus de sens.
      return { versions: [{ number: 1, kind: "generation", email: action.email }], index: 0, generation: action.generation, status: "idle", notice: null, error: null }
    case "edit-start":
      // Pas de seconde soumission pendant un appel ; rien à éditer avant une génération.
      return state.status === "editing" || state.index < 0 ? state : { ...state, status: "editing", notice: null, error: null }
    case "edit-success": {
      if (state.status !== "editing") return state
      const kept = state.versions.slice(0, state.index + 1)
      const number = Math.max(...state.versions.map((version) => version.number)) + 1
      const version: EmailVersion = { number, kind: "edit", instruction: action.instruction, summary: action.summary, email: action.email }
      return { ...state, versions: [...kept, version], index: kept.length, status: "idle", notice: emailEditNotice, error: null }
    }
    case "edit-failure":
      // La dernière version valide reste affichée ; aucune version n'est ajoutée.
      return state.status === "editing" ? { ...state, status: "idle", notice: null, error: action.error } : state
    case "undo":
      return canUndo(state) ? { ...state, index: state.index - 1, notice: null, error: null } : state
    case "redo":
      return canRedo(state) ? { ...state, index: state.index + 1, notice: null, error: null } : state
    case "dismiss":
      return { ...state, notice: null, error: null }
  }
}

export const currentVersion = (state: EmailEditorState): EmailVersion | null => state.versions[state.index] ?? null
/** Annuler : seulement s'il existe une version antérieure, et pas pendant un appel. */
export const canUndo = (state: EmailEditorState) => state.status === "idle" && state.index > 0
export const canRedo = (state: EmailEditorState) => state.status === "idle" && state.index >= 0 && state.index < state.versions.length - 1
/** On ne modifie que ce qui porte un Draft éditable (jamais le mode démo). */
export const canEditEmail = (state: EmailEditorState) => state.index >= 0 && currentVersion(state)?.email.draft !== undefined

/** « V2 — Raccourcis l'email » : étiquette d'une version dans l'historique. */
export function versionLabel(version: EmailVersion): string {
  if (version.kind === "generation") return `V${version.number} — Génération initiale`
  const text = (version.instruction ?? "").trim().replace(/\s+/g, " ")
  return `V${version.number} — ${text.length > 48 ? `${text.slice(0, 47)}…` : text}`
}

/* -------------------------------------------------------------------------- */
/* Ajustements rapides                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Quatre ajustements : chacun est une instruction d'édition ordinaire, avec les
 * mêmes garde-fous que l'instruction libre. Aucun ne vise une valeur protégée.
 */
export const emailQuickAdjustments = [
  { id: "direct", label: "Plus direct", instruction: "Rends le ton plus direct." },
  { id: "short", label: "Plus court", instruction: "Raccourcis les textes de l'email." },
  { id: "warm", label: "Plus chaleureux", instruction: "Rends le ton plus chaleureux." },
  { id: "dynamic", label: "Plus dynamique", instruction: "Rends le ton plus dynamique." },
] as const

export const emailEditPlaceholder = "Ex. Rends l'accroche plus directe et raccourcis la conclusion."
export const emailEditInstructionMaxLength = 500

/** Corps de `POST /api/edit-email` : l'instruction, la génération d'origine et le Draft de la version affichée. */
export function toEmailEditBody(state: EmailEditorState, instruction: string) {
  return { instruction: instruction.trim(), generation: state.generation, draft: currentVersion(state)?.email.draft }
}

/** Instruction prête à partir : non vide et dans la limite ; le serveur reste l'autorité. */
export const canSendEditInstruction = (instruction: string) => instruction.trim().length >= 3 && instruction.trim().length <= emailEditInstructionMaxLength

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                    */
/* -------------------------------------------------------------------------- */

export type EmailEditErrorView = { title: string; message: string }

const temporary: EmailEditErrorView = { title: "Modification impossible pour le moment", message: "L'email n'a pas pu être modifié. Votre version actuelle est conservée : réessayez dans un instant." }

/**
 * Ce que voit l'utilisateur : un titre et UNE phrase, jamais un chemin
 * technique. Un refus avant appel donne son motif (écrit par le serveur pour
 * l'utilisateur) ; tout le reste a un message fixe.
 */
export function describeEmailEditError(error: EmailEditorError): EmailEditErrorView {
  switch (error.code) {
    case "edit-refused":
      return { title: "Modification refusée", message: error.issues[0]?.message ?? "Cette modification n'est pas possible : seuls les textes de l'email se modifient." }
    case "protected-mutation":
      return { title: "Modification refusée", message: "Elle touchait à une valeur protégée (offre, code, date, lien, image, mention légale ou preuve). Votre version actuelle est conservée." }
    case "no-change":
      return { title: "Aucun changement", message: "Aucune modification n'a été proposée. Reformulez l'instruction, plus précisément." }
    case "invalid-request":
    case "unsupported":
      return { title: "Modification impossible", message: "La modification n'est pas possible sur cet email. Régénérez-le, puis réessayez." }
    case "configuration":
    case "internal":
      return { title: "Service indisponible", message: "Le service d'édition n'est pas disponible. Contactez l'équipe." }
    default:
      return temporary
  }
}
