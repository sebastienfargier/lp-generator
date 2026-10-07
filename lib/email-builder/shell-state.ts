/**
 * Le SHELL du Builder : ce qui précède et entoure le travail. Trois états
 * distincts, qui ne se confondent jamais avec `EmailDocument` :
 *
 * - `entry`     : AUCUN email ouvert, l'écran « Comment veux-tu commencer ? » ;
 * - `templates` : le choix d'un modèle (toujours sans email ouvert) ;
 * - `builder`   : UN email ouvert, éventuellement vide (zéro lame), avec son
 *                 document de départ.
 *
 * Choisir « Partir de zéro » ou un modèle INITIALISE le travail : ce n'est pas
 * une opération (pas d'Undo). Recommencer abandonne tout le travail local (le
 * Builder repart d'un état neuf : un autre `session`, donc un autre espace de
 * travail) et revient à l'entrée : aucun Undo ne traverse cette frontière.
 *
 * Pur, sans interface, sans réseau, sans persistance.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { createBlankDocument, type EmailDocument } from "./document"

export type ShellState = {
  /** Nombre d'emails ouverts depuis le début : change à chaque ouverture, donc un espace de travail neuf (clé du Builder). */
  opened: number
} & ({ screen: "entry" } | { screen: "templates" } | { screen: "builder"; document: EmailDocument })

export type ShellAction = { type: "choose-blank" } | { type: "choose-templates" } | { type: "choose-template"; document: EmailDocument } | { type: "back" } | { type: "restart" }

export const createShell = (): ShellState => ({ screen: "entry", opened: 0 })

const open = (state: ShellState, document: EmailDocument): ShellState => ({ screen: "builder", opened: state.opened + 1, document })

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case "choose-blank":
      return state.screen === "entry" ? open(state, createBlankDocument()) : state
    case "choose-templates":
      return state.screen === "entry" ? { screen: "templates", opened: state.opened } : state
    case "choose-template":
      return state.screen === "templates" ? open(state, structuredClone(action.document)) : state
    case "back":
      return state.screen === "templates" ? { screen: "entry", opened: state.opened } : state
    case "restart":
      return state.screen === "builder" ? { screen: "entry", opened: state.opened } : state
  }
}
