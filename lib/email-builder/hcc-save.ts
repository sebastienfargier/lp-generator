/**
 * Sauvegarde du document de travail dans le HCC : logique PURE partagée par le composant client (aucun réseau, aucun
 * secret). Le jeton et la signature restent côté serveur (`/api/email-builder/hcc/document`).
 *
 * - `saved.key` : empreinte canonique de ce que le HCC contient (document + statut éditorial) ; « modifié » = différent ;
 * - une seule écriture à la fois ; une modification pendant l'écriture est enregistrée ensuite ;
 * - l'enregistrement automatique n'envoie jamais un email vide et s'arrête après une erreur ou un conflit : la reprise
 *   est un geste explicite (« Réessayer », « Garder mes modifications ») ; rien n'est perdu en silence.
 */
import type { EmailDocument } from "./document"
import { canonicalJson, type DocumentStatus } from "./versions"

/** Ce que le HCC contient : révision du document enregistré (0 : aucun) et empreinte de son contenu (`null` : aucun). */
export type HccSaved = { revision: number; key: string | null }

/** La création HCC ouverte, telle que l'éditeur la reçoit (jamais de jeton). */
export type HccEditorLink = { assetId: string; assetName: string; saved: HccSaved; onSaved: (saved: HccSaved) => void }

export type SavePhase = "saved" | "dirty" | "saving" | "error" | "conflict"

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
}
