/**
 * Sélection déterministe de la recette d'un email V2 : de la requête
 * structurée à R1, R2 ou R3, AVANT tout appel de modèle. Claude ne choisit
 * jamais la recette ; il rédige le contenu de celle qu'on lui impose.
 *
 * Vocabulaire V2 additif : le formulaire actuel ne propose que trois objectifs
 * (découverte, accompagnement, évolution de carrière), tous de découverte.
 * Les newsletters et les emails de preuves ont donc une intention explicite :
 *
 * | intention     | recette                 |
 * |---------------|-------------------------|
 * | `discovery`   | `discovery-reassurance` |
 * | `editorial`   | `editorial-newsletter`  |
 * | `brand-proof` | `brand-proof`           |
 *
 * Sans intention, la requête actuelle se rattache à une recette par ses
 * champs structurés seuls (jamais par le texte libre du brief) : le type
 * « newsletter » mène à R2, un objectif de découverte à R1. Une preuve de
 * marque n'a pas d'équivalent dans l'ancien vocabulaire : elle exige son
 * intention. Tout le reste (promotion, offre, transactionnel, fin de séquence,
 * témoignage, partenaire, visuels fournis, mention légale d'un fait) est refusé
 * explicitement, jamais ignoré ni fabriqué.
 *
 * Le formulaire n'est pas modifié : ce module ne le connaît pas.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { EmailGenerationRequestSchema } from "./generation-request"
import { emailObjectives } from "./demo-generator"
import type { EmailRecipeId } from "./recipes"

export const emailRecipeIntents = ["discovery", "editorial", "brand-proof"] as const
export type EmailRecipeIntent = (typeof emailRecipeIntents)[number]

export const emailRecipeIntentRecipes = {
  discovery: "discovery-reassurance",
  editorial: "editorial-newsletter",
  "brand-proof": "brand-proof",
} as const satisfies Record<EmailRecipeIntent, EmailRecipeId>

/**
 * Cibles de l'interface, identiques aux identifiants des cinq audiences de la
 * couche Brand (un test garde l'égalité). Elles décident de la voix : la
 * requête n'a plus à la deviner dans un texte libre.
 */
export const emailRecipeTargets = ["reconversion", "actifs_en_poste", "alternants", "b2b_rh", "demandeurs_emploi"] as const
export type EmailRecipeTarget = (typeof emailRecipeTargets)[number]

/**
 * Requête V2 : celle du moteur actuel, avec une intention facultative et un
 * objectif facultatif (l'un ou l'autre suffit). Le schéma de départ n'est pas
 * modifié : il est étendu.
 */
export const EmailRecipeRequestSchema = EmailGenerationRequestSchema.extend({
  intent: z.enum(emailRecipeIntents, { error: "Intention inconnue." }).optional(),
  objective: z.enum(emailObjectives.map((objective) => objective.value) as [string, ...string[]], { error: "Objectif inconnu." }).optional(),
  /** Cible contrôlée : source de la voix (vouvoiement, tutoiement, ton). Sans elle, la voix se déduit du texte de l'audience. */
  target: z.enum(emailRecipeTargets, { error: "Cible inconnue." }).optional(),
})

export type EmailRecipeRequest = z.infer<typeof EmailRecipeRequestSchema>

export function safeParseEmailRecipeRequest(input: unknown) {
  return EmailRecipeRequestSchema.safeParse(input, { error: z.locales.fr().localeError })
}

export type EmailRecipeUnsupportedCode =
  | "missing-intent"
  | "promotion"
  | "transactional"
  | "sequence-end"
  | "offer"
  | "testimonial"
  | "partner"
  | "visuals"
  | "fact-disclaimer"

export type EmailRecipeSelection =
  | { status: "selected"; recipe: EmailRecipeId; intent: EmailRecipeIntent; source: "intent" | "objective" | "email-type" }
  | { status: "unsupported"; issues: { code: EmailRecipeUnsupportedCode; message: string }[] }

const unsupported = (code: EmailRecipeUnsupportedCode, message: string) => ({ code, message })

/** Demandes que les recettes ne composent pas encore : refusées avant tout appel. */
function unsupportedReasons(request: EmailRecipeRequest) {
  const reasons: { code: EmailRecipeUnsupportedCode; message: string }[] = []
  if (request.emailType === "promo") reasons.push(unsupported("promotion", "Les emails promotionnels exigent une offre validée : non pris en charge par les recettes."))
  if (request.emailType === "transactionnel") reasons.push(unsupported("transactional", "Les emails transactionnels ne sont pas pris en charge par les recettes."))
  if (request.emailType === "lifecycle-fin") reasons.push(unsupported("sequence-end", "Les fins de séquence ne sont pas prises en charge par les recettes."))
  if (request.offer) reasons.push(unsupported("offer", "Les offres ne sont pas prises en charge par les recettes."))
  if (request.testimonial) reasons.push(unsupported("testimonial", "Les témoignages ne sont pas pris en charge par les recettes."))
  if (request.partner) reasons.push(unsupported("partner", "Les partenaires fournis ne sont pas pris en charge : les partenaires viennent des claims approuvées."))
  if (request.visuals && request.visuals.length > 0) reasons.push(unsupported("visuals", "Les visuels fournis ne sont pas pris en charge : les images viennent de la banque."))
  if ((request.facts ?? []).some((fact) => fact.disclaimer)) reasons.push(unsupported("fact-disclaimer", "Un fait qui appelle une mention légale n'est pas encore pris en charge par les recettes."))
  return reasons
}

/**
 * Requête validée → recette. Déterministe : mêmes champs structurés, même
 * recette. L'intention explicite l'emporte ; sinon le type d'email, puis
 * l'objectif. Aucune lecture du texte libre.
 */
export function selectEmailRecipe(request: EmailRecipeRequest): EmailRecipeSelection {
  const reasons = unsupportedReasons(request)
  if (reasons.length > 0) return { status: "unsupported", issues: reasons }
  if (request.intent) return { status: "selected", recipe: emailRecipeIntentRecipes[request.intent], intent: request.intent, source: "intent" }
  if (request.emailType === "newsletter") return { status: "selected", recipe: "editorial-newsletter", intent: "editorial", source: "email-type" }
  if (request.objective) return { status: "selected", recipe: "discovery-reassurance", intent: "discovery", source: "objective" }
  return {
    status: "unsupported",
    issues: [unsupported("missing-intent", `Ni intention (${emailRecipeIntents.join(", ")}), ni objectif, ni type d'email « newsletter » : la recette ne se déduit pas.`)],
  }
}
