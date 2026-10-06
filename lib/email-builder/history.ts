/**
 * Historique de TRAVAIL local : annuler / rétablir. Générique, pur, sans
 * persistance ni réseau. Ce n'est PAS une version : une version est un
 * snapshot métier sauvegardé volontairement (autre chantier) ; ici, chaque
 * changement du travail en cours pousse l'état précédent dans `past`.
 *
 * past[] → present → future[]. Un nouveau changement après un retour en arrière
 * vide `future` (la branche abandonnée est perdue, comme partout).
 */
export type History<T> = { past: readonly T[]; present: T; future: readonly T[] }

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

/** Nouveau présent ; l'ancien rejoint `past`, `future` est vidé. Le même objet n'ajoute rien. */
export function applyToHistory<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history
  return { past: [...history.past, history.present], present: next, future: [] }
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0
export const canRedo = <T>(history: History<T>) => history.future.length > 0

/** Sans effet (même objet) quand il n'y a rien à annuler. */
export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history
  const past = history.past.slice(0, -1)
  return { past, present: history.past[history.past.length - 1]!, future: [history.present, ...history.future] }
}

/** Sans effet (même objet) quand il n'y a rien à rétablir. */
export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history
  const [next, ...future] = history.future
  return { past: [...history.past, history.present], present: next!, future }
}
