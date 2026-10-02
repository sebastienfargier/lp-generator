import type { GeneratorBrief } from "./brief"
import type { PublicGenerationError } from "./public-api"
import type { LandingPageConfig } from "./types"

/**
 * État de /generator : pur, testable hors de React.
 *
 * - idle : avant la première génération (aperçu vide) ;
 * - loading : un appel est en cours ;
 * - success : la dernière génération a réussi ;
 * - error : la dernière génération a échoué.
 *
 * `config` est la dernière configuration valide : un échec ne l'efface jamais.
 * Elle seule alimente l'aperçu.
 */
export type GeneratorState = {
  status: "idle" | "loading" | "success" | "error"
  config: LandingPageConfig | null
  error: PublicGenerationError | null
}

export const initialGeneratorState: GeneratorState = { status: "idle", config: null, error: null }

export type GeneratorAction =
  | { type: "start" }
  | { type: "success"; config: LandingPageConfig }
  | { type: "failure"; error: PublicGenerationError }

export function generatorReducer(state: GeneratorState, action: GeneratorAction): GeneratorState {
  switch (action.type) {
    case "start":
      // Pas de seconde soumission pendant un appel.
      return state.status === "loading" ? state : { status: "loading", config: state.config, error: null }
    case "success":
      return state.status === "loading" ? { status: "success", config: action.config, error: null } : state
    case "failure":
      // Le dernier résultat valide reste affiché.
      return state.status === "loading" ? { status: "error", config: state.config, error: action.error } : state
  }
}

/** Validation légère pour l'UX : le serveur reste l'autorité. */
export function canGenerate(brief: GeneratorBrief): boolean {
  return [brief.projectName, brief.brief, brief.audience, brief.objective].every((value) => value.trim() !== "")
}

/** Légende compacte d'un résultat : dérivée de la configuration affichée, sans état en plus. */
export function describeGeneratedPage(config: LandingPageConfig): string {
  const count = config.sections.length
  return `Page générée · ${count} ${count > 1 ? "sections" : "section"}`
}
