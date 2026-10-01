import { z } from "zod"

import { generatorObjectives, GeneratorBriefSchema } from "./brief"

/**
 * Contrat d'entrée d'une génération Landing : uniquement ce que la personne
 * donne. Il part du brief du générateur (`GeneratorBriefSchema`), sans
 * vocabulaire parallèle, et en précise l'objectif.
 *
 * Le modèle rédige ; il n'invente aucun fait. Prix, remise, pourcentage,
 * durée, statistique, effectif, certification, classement, garantie,
 * témoignage, partenaire, date limite, code promo : un tel fait vient de
 * `facts`, validé par la personne qui fait la demande, jamais d'une phrase du
 * brief ni du modèle.
 */

type GeneratorObjective = (typeof generatorObjectives)[number]["value"]

/**
 * Objectifs que le moteur IA POC sait servir proprement. Le formulaire
 * (`generatorObjectives`, brief.ts) en connaît davantage : ce contrat en
 * accepte temporairement moins.
 *
 * Réintroduire un objectif : l'ajouter ici quand sa ressource contrôlée
 * existe (le compilateur vérifie qu'il figure dans le formulaire), puis
 * relire la règle "no-contact" de generation-context.ts.
 * - lead-generation : un formulaire ou une destination de lead contrôlée ;
 * - documentation-download : l'URL d'un téléchargement ;
 * - contact : une destination de contact.
 */
export const landingSupportedObjectives = ["discover-trainings"] as const satisfies readonly GeneratorObjective[]

const text = (label: string, max: number) =>
  z
    .string()
    .regex(/\S/, `${label} est requis.`)
    .max(max, `${label} est trop long (${max} caractères au plus).`)

/** Fait validé, utilisable tel quel dans les textes de la page. */
export const LandingFactSchema = z.strictObject({
  label: text("Le libellé du fait", 100).optional(),
  value: text("Le fait", 300),
})

export const LandingGenerationRequestSchema = GeneratorBriefSchema.extend({
  projectName: text("Le nom du projet", 120),
  brief: text("Le brief", 4000),
  audience: text("L'audience", 300),
  objective: z.enum(landingSupportedObjectives, { error: "Objectif non pris en charge par la génération IA pour l'instant." }),
  /** Faits validés ; absents, le modèle n'écrit aucun fait de ce type. */
  facts: z.array(LandingFactSchema).max(12, "12 faits au plus.").optional(),
})

export type LandingGenerationRequest = z.infer<typeof LandingGenerationRequestSchema>
export type LandingFact = z.infer<typeof LandingFactSchema>

export function safeParseLandingGenerationRequest(input: unknown) {
  return LandingGenerationRequestSchema.safeParse(input, {
    error: z.locales.fr().localeError,
  })
}
