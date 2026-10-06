/**
 * Retours discrets du Builder : ce que la personne voit après une opération.
 * Pur, sans interface : une phrase et un ton, jamais une liste d'erreurs.
 *
 * - une opération REFUSÉE (impossibilité technique) : une phrase claire ;
 * - une opération ACCEPTÉE qui crée une recommandation évidente : un conseil,
 *   ignorable, qui ne bloque et ne corrige rien. Seules les recommandations
 *   NOUVELLES comptent (celles que l'opération vient de créer), et seulement
 *   celles qui méritent d'être dites sur le moment : un avertissement ou une
 *   alerte, et le conseil sur les zones colorées consécutives. Le reste
 *   (conformité de recette, terminologie d'un texte provisoire…) reste
 *   disponible sans interrompre.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailDocument } from "./document"
import type { OperationError } from "./operations"
import { getDocumentRecommendations, type DocumentRecommendation } from "./recommendations"

export type BuilderNotice = { tone: "info" | "warning" | "error"; message: string }

/** Refus d'une opération → une phrase pour la personne. */
export function describeOperationError(error: OperationError): BuilderNotice {
  const issues = error.issues?.map((issue) => issue.message) ?? []
  if (issues.some((message) => message.includes("Au moins une lame"))) return { tone: "error", message: "Un email garde toujours au moins une lame." }
  if (error.code === "surface-unsupported") return { tone: "error", message: "Cette lame garde ses couleurs : sa surface ne se change pas." }
  return { tone: "error", message: error.message }
}

const friendly: Record<string, string> = {
  "layout-consecutive-colored": "Deux zones colorées se suivent. Studi recommande généralement d'alterner les surfaces.",
  "layout-footer-missing": "Cet email n'a plus de footer : il n'a plus de lien de désabonnement ni de préférences.",
  "layout-footer-not-last": "Le footer n'est plus la dernière lame de l'email.",
  "layout-footer-duplicate": "Cet email contient plusieurs footers.",
  "layout-disclaimer-not-before-footer": "Les mentions légales ne sont plus juste avant le footer.",
  "promotion-legal": "La mention légale de cette offre n'est plus dans l'email. Studi recommande de la conserver.",
  "promotion-offer-value": "La valeur affichée ne correspond plus à celle de l'offre.",
  "promotion-promo-code": "Le code affiché ne correspond plus à celui de l'offre.",
  "promotion-deadline": "La date affichée ne correspond plus à la date de fin de l'offre.",
  "promotion-scope": "Le périmètre affiché ne correspond plus à celui de l'offre.",
  "promotion-destination": "Un bouton ou un lien ne mène plus à la destination de l'offre.",
}

const keyOf = (entry: DocumentRecommendation) => `${entry.code}|${entry.target?.path ?? ""}`

const worthSaying = (entry: DocumentRecommendation) => entry.level !== "info" || entry.code === "layout-consecutive-colored"

/** Le conseil que `after` doit à l'opération (absent de `before`), le plus sérieux d'abord ; `null` s'il n'y en a pas. */
export function newRecommendationNotice(before: EmailDocument, after: EmailDocument): BuilderNotice | null {
  const known = new Set(getDocumentRecommendations(before).map(keyOf))
  const fresh = getDocumentRecommendations(after).filter((entry) => !known.has(keyOf(entry)) && worthSaying(entry))
  const [first] = fresh
  if (!first) return null
  return { tone: first.level === "info" ? "info" : "warning", message: friendly[first.code] ?? first.message }
}
