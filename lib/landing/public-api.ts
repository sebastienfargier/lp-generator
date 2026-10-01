import type { LandingPageConfig } from "./types"

/**
 * Contrat public de `POST /api/generate` : ce que le navigateur reçoit. Types
 * seulement, sans dépendance serveur : importable côté client comme côté
 * serveur. Le navigateur ne reçoit que la configuration validée ou une erreur
 * courte : jamais le brouillon, le prompt, le contexte, les tokens, la
 * réponse brute du modèle, un identifiant de requête Anthropic ni un détail du
 * SDK.
 */

export const landingGenerateEndpoint = "/api/generate"

export const publicErrorCodes = [
  /** Le brief est incomplet ou invalide. */
  "invalid-request",
  /** Le modèle a répondu, mais pas par une page valide. */
  "generation-failed",
  /** Le modèle a refusé la demande. */
  "refused",
  "rate-limit",
  /** Configuration du service indisponible (clé, modèle). */
  "configuration",
  /** Fournisseur temporairement indisponible ou surchargé. */
  "unavailable",
  "network",
  "timeout",
  "internal",
  /** Réponse du service illisible (produit par le client). */
  "invalid-response",
] as const

export type PublicErrorCode = (typeof publicErrorCodes)[number]

/** Champ du formulaire à corriger : chemin dans la requête et message de validation. */
export type PublicErrorField = { path: string; message: string }

export type PublicGenerationError = {
  code: PublicErrorCode
  message: string
  /** Présent seulement pour `invalid-request`. */
  fields?: PublicErrorField[]
}

export type LandingGenerateResponse =
  | { ok: true; config: LandingPageConfig }
  | { ok: false; error: PublicGenerationError }
