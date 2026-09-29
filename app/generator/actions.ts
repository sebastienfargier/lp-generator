"use server"

import { runGeneration, type GenerationResult } from "@/lib/generator/generate"

/**
 * Server Function appelée par le formulaire. Le brief reçu est traité comme
 * une donnée externe (`unknown`) et validé côté serveur.
 */
export async function generateLandingPageAction(
  _previous: GenerationResult,
  brief: unknown
): Promise<GenerationResult> {
  return runGeneration(brief)
}
