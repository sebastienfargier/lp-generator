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

/* -------------------------------------------------------------------------- */
/* Informations à reprendre telles quelles (request.facts)                    */
/* -------------------------------------------------------------------------- */

/** Nombre maximal d'informations : celui de `LandingGenerationRequestSchema.facts`. */
export const maxGeneratorFacts = 12

/**
 * Valeurs du formulaire : le brief et le texte BRUT du champ « Informations à
 * reprendre telles quelles » (une information par ligne). Le texte brut suit le
 * même cycle de vie que les autres champs ; il n'est transformé qu'à l'envoi.
 */
export type GeneratorFormValues = GeneratorBrief & { facts: string }

/** Ce que les fonctions pures acceptent : `facts` est facultatif. */
export type GeneratorFormInput = GeneratorBrief & { facts?: string }

/**
 * Une ligne non vide = une information : le texte est coupé par lignes, chaque
 * ligne est rognée (`trim`), les lignes vides sont supprimées, le contenu des
 * autres lignes n'est pas modifié.
 */
export function parseFactsInput(input: string | undefined): string[] {
  return (input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

/** Validation légère côté client : pas plus de 12 informations. Le serveur reste l'autorité. */
export function factsInputError(input: string | undefined): string | null {
  const count = parseFactsInput(input).length
  return count > maxGeneratorFacts ? `${maxGeneratorFacts} informations au plus (${count} saisies).` : null
}

const fieldLabels: Record<string, string> = {
  projectName: "Nom du projet",
  brief: "Brief",
  audience: "Audience",
  objective: "Objectif",
  facts: "Informations à reprendre",
}

/**
 * Libellé lisible d'un chemin de champ renvoyé par le serveur. `facts.2.value`
 * désigne la 3e information non vide, pas la 3e ligne du texte.
 */
export function describeFieldPath(path: string): string {
  const [head, index] = path.split(".")
  if (head === "facts" && index !== undefined && /^\d+$/.test(index)) return `${fieldLabels.facts} (n° ${Number(index) + 1})`
  return fieldLabels[path] ?? path
}
