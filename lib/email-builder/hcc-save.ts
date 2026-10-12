/**
 * Sauvegarde du document de travail dans le HCC : logique PURE partagée par le composant client (aucun réseau, aucun
 * secret). Le jeton et la signature restent côté serveur (`/api/email-builder/hcc/document`).
 *
 * - `saved.key` : empreinte canonique de ce que le HCC contient (document + statut éditorial) ; « modifié » = différent ;
 * - une seule écriture à la fois ; une modification pendant l'écriture est enregistrée ensuite ;
 * - l'enregistrement automatique n'envoie jamais un email vide et s'arrête après une erreur ou un conflit : la reprise
 *   est un geste explicite (« Réessayer », « Garder mes modifications » après confirmation) ; rien n'est perdu en silence ;
 * - VERROU : quand le HCC répond que la production n'est plus modifiable (`locked`) ou que la session a expiré
 *   (`expired`), l'éditeur passe en lecture seule pour toute la suite de la page (aucune sauvegarde, aucune
 *   modification, aucune action IA qui modifie). Le HCC reste l'autorité : ce verrou n'est qu'une protection
 *   d'interface, il ne contourne ni ne remplace le refus serveur.
 */
import type { BuilderAction } from "./builder-state"
import type { EmailDocument } from "./document"
import { canonicalJson, type DocumentStatus } from "./versions"

/** Ce que le HCC contient : révision du document enregistré (0 : aucun) et empreinte de son contenu (`null` : aucun). */
export type HccSaved = { revision: number; key: string | null }

/** Pourquoi l'éditeur est verrouillé par le HCC : production plus modifiable, ou session expirée. */
export type HccLock = "locked" | "expired"

/** La création HCC ouverte, telle que l'éditeur la reçoit (jamais de jeton). */
export type HccEditorLink = {
  assetId: string
  assetName: string
  saved: HccSaved
  onSaved: (saved: HccSaved) => void
  /** Verrou posé par une réponse du HCC ; `null` : édition possible. Tenu par le shell (survit à « Recommencer »). */
  lock: HccLock | null
  onLock: (lock: HccLock) => void
  /** Fiche de la production dans le HCC (origine de la configuration serveur), ou `null` si inconnue. */
  hccHome: string | null
}

export type SavePhase = "saved" | "dirty" | "saving" | "error" | "conflict" | HccLock

/** Code d'erreur de la route de sauvegarde → verrou de l'éditeur (les autres erreurs restent des erreurs relançables). */
export const lockOfFailure = (code: string): HccLock | null => (code === "locked" ? "locked" : code === "session" ? "expired" : null)

/**
 * Gestes encore permis quand l'éditeur est verrouillé par le HCC : sélectionner, fermer, lire les réponses en cours de
 * l'assistant. Tout le reste (édition, opérations, annuler / rétablir, statut, versions, envoi ou application d'une
 * proposition IA, bibliothèque, banque d'images) est refusé.
 */
const allowedWhileLocked: ReadonlySet<BuilderAction["type"]> = new Set(["select-block", "select-element", "escape", "close-panel", "dismiss-notice", "exit-view", "assistant-reply", "assistant-fail", "ignore-proposal"])
export const isAllowedWhileLocked = (action: BuilderAction) => allowedWhileLocked.has(action.type)

/** Le dispatch de l'éditeur sous verrou HCC : les gestes refusés ne sont jamais transmis au réducteur. */
export const guardLockedDispatch = (locked: boolean, dispatch: (action: BuilderAction) => void) => (action: BuilderAction) => {
  if (locked && !isAllowedWhileLocked(action)) return
  dispatch(action)
}

export const hccLockMessages: Record<HccLock, { title: string; text: string; link: string }> = {
  locked: { title: "Production verrouillée", text: "Cette production n'est plus modifiable dans le HCC. Retourne dans le HCC pour consulter son statut.", link: "Retourner dans le HCC" },
  expired: { title: "Session expirée", text: "Ta session Email Builder a expiré. Rouvre l'Email Builder depuis le HCC pour continuer.", link: "Rouvrir depuis le HCC" },
}

/** Ce qui est dit des modifications non enregistrées au moment du verrou : jamais une promesse de récupération. */
export const unsavedAtLockMessage: Record<HccLock, string> = {
  locked: "Tes dernières modifications n'ont pas pu être enregistrées dans le HCC. Elles restent affichées ici, mais ne seront pas conservées.",
  expired: "Tes dernières modifications n'ont pas été enregistrées dans le HCC. Elles restent affichées ici, mais ne seront pas récupérées après la réouverture.",
}

export const saveKey = (document: EmailDocument, status: DocumentStatus) => canonicalJson({ document, status })

export const AUTOSAVE_DELAY_MS = 1500

/** Enregistrer automatiquement maintenant ? Jamais un email vide, jamais pendant une écriture, jamais après un refus. */
export const shouldAutosave = (input: { dirty: boolean; phase: SavePhase; empty: boolean; inFlight: boolean }) =>
  input.dirty && !input.empty && !input.inFlight && (input.phase === "dirty" || input.phase === "saved")

export const savePhaseLabels: Record<SavePhase, string> = {
  saved: "Enregistré dans le HCC",
  dirty: "Modifications non enregistrées",
  saving: "Enregistrement…",
  error: "Erreur de sauvegarde",
  conflict: "Conflit : le document a changé dans le HCC",
  locked: "Production verrouillée dans le HCC",
  expired: "Session expirée",
}
