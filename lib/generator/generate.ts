import { z } from "zod"

import { demoLandingPage } from "@/lib/landing/demo"
import { safeParseLandingPage } from "@/lib/landing/schemas"

/* -------------------------------------------------------------------------- */
/* Brief                                                                      */
/* -------------------------------------------------------------------------- */

export const generatorObjectives = [
  { value: "discover-trainings", label: "Découverte des formations" },
  { value: "lead-generation", label: "Génération de leads" },
  { value: "documentation-download", label: "Téléchargement de documentation" },
  { value: "contact", label: "Prise de contact" },
] as const

export const GeneratorBriefSchema = z.strictObject({
  projectName: z.string().regex(/\S/, "Le nom du projet est requis."),
  brief: z.string().regex(/\S/, "Le brief est requis."),
  audience: z.string(),
  objective: z.enum([
    "discover-trainings",
    "lead-generation",
    "documentation-download",
    "contact",
  ]),
})

export type GeneratorBrief = z.infer<typeof GeneratorBriefSchema>

export const defaultGeneratorBrief: GeneratorBrief = {
  projectName: "Reconversion RH",
  brief:
    "Créer une landing page pour des professionnels en poste qui souhaitent se reconvertir dans les ressources humaines. L'objectif principal est de leur faire découvrir les formations disponibles.",
  audience: "Professionnels en poste souhaitant changer de métier",
  objective: "discover-trainings",
}

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

export type GenerationIssue = { path: string; message: string }

export type GenerationResult =
  | { status: "success"; revision: string; sectionCount: number }
  | { status: "error"; title: string; issues: GenerationIssue[] }

/**
 * Génération simulée : renvoie la démo telle qu'une source externe la
 * fournirait (`unknown`), pour emprunter le même chemin que les futures
 * réponses du modèle. Le brief sera utilisé quand l'API sera branchée.
 */
export function simulateLandingPageGeneration(): unknown {
  return structuredClone(demoLandingPage)
}

function toIssues(error: z.ZodError): GenerationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(racine)",
    message: issue.message,
  }))
}

/** Brief → génération → validation Zod. Ne lève jamais : renvoie un résultat. */
export function runGeneration(input: unknown): GenerationResult {
  const brief = GeneratorBriefSchema.safeParse(input)
  if (!brief.success) {
    return {
      status: "error",
      title: "Brief incomplet",
      issues: toIssues(brief.error),
    }
  }

  const page = safeParseLandingPage(simulateLandingPageGeneration())
  if (!page.success) {
    return {
      status: "error",
      title: "Configuration invalide",
      issues: toIssues(page.error),
    }
  }

  return {
    status: "success",
    revision: crypto.randomUUID(),
    sectionCount: page.data.sections.length,
  }
}
