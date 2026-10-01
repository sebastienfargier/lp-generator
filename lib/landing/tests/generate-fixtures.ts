/** Brouillon typé à partir des fixtures, pour les tests qui résolvent un brouillon. */
import { safeParseLandingGenerationDraft } from "../generation-draft"

export function generationDraftFor(input: unknown) {
  const parsed = safeParseLandingGenerationDraft(input)
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues))
  return parsed.data
}
