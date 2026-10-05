import type { EmailGenerationSuccess } from "./generation"
import type { EmailClientErrorCode } from "./generator-form"

/**
 * État de /email-generator : pur, testable hors de React.
 *
 * - idle : avant la première génération (aperçu vide) ;
 * - loading : un appel est en cours ;
 * - success : la dernière génération a réussi ;
 * - error : la dernière génération a échoué.
 *
 * `email` est le dernier email valide : un échec ne l'efface jamais. Lui seul
 * alimente l'aperçu. Il n'existe aucun état intermédiaire simulé : pas de
 * progression, pas d'étapes.
 */
export type EmailGeneratorError = {
  code: EmailClientErrorCode
  issues: { path: string; message: string }[]
}

export type EmailGeneratorState = {
  status: "idle" | "loading" | "success" | "error"
  email: EmailGenerationSuccess | null
  error: EmailGeneratorError | null
}

export const initialEmailGeneratorState: EmailGeneratorState = { status: "idle", email: null, error: null }

export type EmailGeneratorAction =
  | { type: "start" }
  | { type: "success"; email: EmailGenerationSuccess }
  | { type: "failure"; error: EmailGeneratorError }

export function emailGeneratorReducer(state: EmailGeneratorState, action: EmailGeneratorAction): EmailGeneratorState {
  switch (action.type) {
    case "start":
      // Pas de seconde soumission pendant un appel.
      return state.status === "loading" ? state : { status: "loading", email: state.email, error: null }
    case "success":
      return state.status === "loading" ? { status: "success", email: action.email, error: null } : state
    case "failure":
      // Le dernier email valide reste affiché.
      return state.status === "loading" ? { status: "error", email: state.email, error: action.error } : state
  }
}

/** « Générer » tant qu'aucun email valide n'existe, « Régénérer » dès qu'il y en a un (même après une erreur). */
export function emailSubmitLabel(state: EmailGeneratorState): string {
  if (state.status === "loading") return "Génération…"
  return state.email ? "Régénérer" : "Générer l'email"
}

/** Légende du résultat : le nombre de lames vient de l'email réellement généré. */
export function describeGeneratedEmail(email: Pick<EmailGenerationSuccess, "blockCount">): string {
  return `Email généré · ${email.blockCount} ${email.blockCount > 1 ? "lames" : "lame"}`
}
