import type { GeneratorBrief } from "./brief"
import { landingGenerateEndpoint, publicErrorCodes, type PublicErrorField, type PublicGenerationError } from "./public-api"
import { safeParseLandingPage } from "./schemas"
import type { LandingPageConfig } from "./types"

/**
 * Appel de `POST /api/generate` depuis le navigateur : UN POST, jamais de
 * relance. Aucune dépendance serveur (ni SDK, ni module Anthropic).
 *
 * La réponse n'est pas crue sur parole : la configuration est revalidée par
 * `LandingPageSchema` avant d'atteindre le renderer.
 */

export type GenerationOutcome =
  | { status: "success"; config: LandingPageConfig }
  | { status: "error"; error: PublicGenerationError }

const networkError: PublicGenerationError = {
  code: "network",
  message: "Connexion impossible. Vérifiez votre réseau et réessayez.",
}
const unreadable: PublicGenerationError = {
  code: "invalid-response",
  message: "La réponse du service est illisible. Réessayez.",
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Erreur publique reconnue : code connu et message ; rien d'autre n'est relayé. */
function toPublicError(value: unknown): PublicGenerationError | undefined {
  if (!isRecord(value) || typeof value.message !== "string") return undefined
  const code = publicErrorCodes.find((candidate) => candidate === value.code)
  if (!code) return undefined
  const fields = Array.isArray(value.fields)
    ? value.fields.flatMap((field): PublicErrorField[] =>
        isRecord(field) && typeof field.path === "string" && typeof field.message === "string" ? [{ path: field.path, message: field.message }] : []
      )
    : []
  return { code, message: value.message, ...(fields.length > 0 ? { fields } : {}) }
}

export async function requestLandingGeneration(
  brief: GeneratorBrief,
  // Résolu à chaque appel : le `fetch` global du moment.
  fetchImpl: typeof fetch = (input, init) => fetch(input, init)
): Promise<GenerationOutcome> {
  const payload = {
    projectName: brief.projectName.trim(),
    brief: brief.brief.trim(),
    audience: brief.audience.trim(),
    objective: brief.objective,
  }

  let response: Response
  try {
    response = await fetchImpl(landingGenerateEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    return { status: "error", error: networkError }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { status: "error", error: unreadable }
  }

  if (isRecord(body) && body.ok === true) {
    const page = safeParseLandingPage(body.config)
    return page.success ? { status: "success", config: page.data } : { status: "error", error: unreadable }
  }
  if (isRecord(body) && body.ok === false) {
    const error = toPublicError(body.error)
    if (error) return { status: "error", error }
  }
  return { status: "error", error: unreadable }
}
