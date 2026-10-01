import { z } from "zod"

/**
 * Brief saisi dans /generator : l'entrée de la future génération Landing.
 * Contrat d'entrée uniquement : aucun moteur ici. La génération (Claude →
 * LandingPageConfig → Zod) arrive au checkpoint suivant.
 */

export const generatorObjectives = [
  { value: "discover-trainings", label: "Découverte des formations" },
  { value: "lead-generation", label: "Génération de leads" },
  { value: "documentation-download", label: "Téléchargement de documentation" },
  { value: "contact", label: "Prise de contact" },
] as const

const required = (message: string) => z.string().regex(/\S/, message)

export const GeneratorBriefSchema = z.strictObject({
  projectName: required("Le nom du projet est requis."),
  brief: required("Le brief est requis."),
  audience: required("L'audience est requise."),
  objective: required("L'objectif est requis."),
})

export type GeneratorBrief = z.infer<typeof GeneratorBriefSchema>

/** Formulaire vide au chargement : aucun brief, aucun scénario par défaut. */
export const emptyGeneratorBrief: GeneratorBrief = {
  projectName: "",
  brief: "",
  audience: "",
  objective: "",
}
