import { z } from "zod"

import {
  generateDemoLandingPage,
  type DemoScenario,
} from "@/lib/landing/demo-generator"
import { safeParseLandingPage } from "@/lib/landing/schemas"
import type { LandingPageConfig } from "@/lib/landing/types"

/* -------------------------------------------------------------------------- */
/* Brief                                                                      */
/* -------------------------------------------------------------------------- */

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

export const defaultGeneratorBrief: GeneratorBrief = {
  projectName: "Reconversion RH",
  brief:
    "Créer une landing page pour des professionnels en poste qui souhaitent se reconvertir dans les ressources humaines. L'objectif principal est de leur faire découvrir les formations disponibles.",
  audience: "Professionnels en poste souhaitant changer de métier",
  objective: "discover-trainings",
}

/* -------------------------------------------------------------------------- */
/* Génération (mode démo)                                                     */
/* -------------------------------------------------------------------------- */

export type GenerationIssue = { path: string; message: string }

export type GenerationSuccess = {
  status: "success"
  scenario: DemoScenario
  config: LandingPageConfig
  /** Document d'aperçu (iframe) correspondant à cette génération. */
  previewUrl: string
}

export type GenerationError = {
  status: "error"
  title: string
  issues: GenerationIssue[]
}

export type GenerationResult = GenerationSuccess | GenerationError

function toIssues(error: z.ZodError): GenerationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(racine)",
    message: issue.message,
  }))
}

/**
 * URL du document d'aperçu. Le moteur de démo étant déterministe, le brief
 * suffit à reproduire exactement la config côté serveur (aucun stockage) ;
 * `revision` force le rechargement de l'iframe à chaque génération.
 */
export function buildPreviewUrl(brief: GeneratorBrief, revision: string) {
  const params = new URLSearchParams({ ...brief, revision })
  return `/generator/preview?${params.toString()}`
}

/** Brief validé → génération démo → validation Zod de la config. */
export function generateValidatedPage(
  brief: GeneratorBrief
):
  | { success: true; scenario: DemoScenario; config: LandingPageConfig }
  | { success: false; issues: GenerationIssue[] } {
  const { scenario, config } = generateDemoLandingPage(brief)
  // Même chemin que les futures sorties du modèle : la config est une donnée
  // externe tant qu'elle n'a pas passé LandingPageSchema.
  const page = safeParseLandingPage(config)
  return page.success
    ? { success: true, scenario, config: page.data }
    : { success: false, issues: toIssues(page.error) }
}

/** Point d'entrée de /api/generate : ne lève jamais, renvoie un résultat. */
export function runGeneration(input: unknown): GenerationResult {
  const brief = GeneratorBriefSchema.safeParse(input)
  if (!brief.success) {
    return {
      status: "error",
      title: "Brief incomplet",
      issues: toIssues(brief.error),
    }
  }

  const page = generateValidatedPage(brief.data)
  if (!page.success) {
    return {
      status: "error",
      title: "Configuration invalide",
      issues: page.issues,
    }
  }

  return {
    status: "success",
    scenario: page.scenario,
    config: page.config,
    previewUrl: buildPreviewUrl(brief.data, crypto.randomUUID()),
  }
}
