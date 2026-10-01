import { generateLandingWithClaude, type LandingGenerationErrorKind, type LandingGenerationResult } from "./anthropic"
import { safeParseLandingGenerationRequest } from "./generation-request"
import type { LandingGenerateResponse, PublicErrorCode, PublicGenerationError } from "./public-api"

/**
 * Logique de `POST /api/generate`, hors du fichier de route (Next n'y autorise
 * que les exports de méthodes HTTP). Serveur uniquement.
 *
 * Requête → validation → UN appel au moteur → réponse publique. Pas de relance,
 * ni ici ni côté client. Le navigateur ne reçoit que `{ ok: true, config }` ou
 * une erreur courte : tout le diagnostic du moteur (sortie brute, brouillon,
 * configuration résolue, tokens, identifiant de requête, détails du SDK) reste
 * sur le serveur.
 */

/** Taille maximale du corps, en caractères : bien au-delà d'un brief valide. */
const maxBodyLength = 100_000

export type LandingEngine = (request: unknown) => Promise<LandingGenerationResult>

export type LandingHandlerOptions = {
  /** Moteur de génération ; par défaut Claude. Injecté par les tests. */
  engine?: LandingEngine
  /** Journal serveur des échecs : type, statut et identifiant de requête, jamais le contenu. */
  log?: (entry: { kind: string; status?: number; requestId?: string }) => void
}

type PublicMapping = { status: number; code: PublicErrorCode; message: string }

const generationFailed: PublicMapping = {
  status: 422,
  code: "generation-failed",
  message: "La génération n'a pas pu produire une page valide. Réessayez.",
}
const unavailable: PublicMapping = {
  status: 503,
  code: "unavailable",
  message: "Le service de génération est temporairement indisponible. Réessayez dans un instant.",
}
const configuration: PublicMapping = {
  status: 500,
  code: "configuration",
  message: "Le service de génération n'est pas configuré. Contactez l'équipe.",
}
const internal: PublicMapping = {
  status: 500,
  code: "internal",
  message: "La génération a rencontré une erreur interne. Réessayez plus tard.",
}

/**
 * Erreur du moteur → erreur publique. Le `Record` est exhaustif : un nouveau
 * type d'erreur du moteur ne compile pas tant qu'on n'a pas décidé de ce que
 * voit le navigateur.
 */
export const publicErrors: Record<LandingGenerationErrorKind, PublicMapping> = {
  "invalid-request": { status: 400, code: "invalid-request", message: "Le brief est incomplet ou invalide : vérifiez les informations du formulaire." },
  impossible: configuration,
  "missing-api-key": configuration,
  authentication: configuration,
  "rate-limit": { status: 429, code: "rate-limit", message: "Trop de demandes pour le moment. Réessayez dans un instant." },
  rejected: internal,
  server: unavailable,
  "api-error": { ...unavailable, status: 502 },
  timeout: { status: 504, code: "timeout", message: "La génération a pris trop de temps et a été interrompue. Réessayez." },
  network: { status: 502, code: "network", message: "La génération a été interrompue. Réessayez." },
  refusal: { status: 422, code: "refused", message: "La demande n'a pas pu être traitée. Reformulez votre brief." },
  truncated: generationFailed,
  interrupted: generationFailed,
  "empty-output": generationFailed,
  "invalid-json": generationFailed,
  "invalid-draft": generationFailed,
  "draft-resolution": generationFailed,
  "invalid-landing": generationFailed,
  unexpected: internal,
}

const headers = { "Cache-Control": "no-store" }

function reply(status: number, body: LandingGenerateResponse) {
  return Response.json(body, { status, headers })
}

function fail(mapping: PublicMapping, fields?: PublicGenerationError["fields"]) {
  const error: PublicGenerationError = { code: mapping.code, message: mapping.message, ...(fields ? { fields } : {}) }
  return reply(mapping.status, { ok: false, error })
}

const defaultLog: NonNullable<LandingHandlerOptions["log"]> = (entry) => console.error("[landing-generation]", JSON.stringify(entry))

export async function handleLandingGeneration(request: Request, options: LandingHandlerOptions = {}): Promise<Response> {
  const engine = options.engine ?? ((input: unknown) => generateLandingWithClaude(input))
  const log = options.log ?? defaultLog

  // 1. Le corps : borné, JSON, objet.
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > maxBodyLength) return fail(publicErrors["invalid-request"])
    body = JSON.parse(text)
  } catch {
    return fail(publicErrors["invalid-request"])
  }

  // 2. La requête de génération : le serveur reste l'autorité, aucun appel si elle est invalide.
  const parsed = safeParseLandingGenerationRequest(body)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join(".") || "requête", message: issue.message }))
    return fail(publicErrors["invalid-request"], fields)
  }

  // 3. Un seul appel au moteur.
  let result: LandingGenerationResult
  try {
    result = await engine(parsed.data)
  } catch {
    log({ kind: "engine-threw" })
    return fail(publicErrors.unexpected)
  }

  // 4. Réponse publique : la configuration seule, ou une erreur traduite.
  if (result.status === "success") return reply(200, { ok: true, config: result.config })
  const { kind, status, requestId } = result.error
  log({ kind, ...(status ? { status } : {}), ...(requestId ? { requestId } : {}) })
  const mapping = publicErrors[kind] ?? internal
  // Aucun champ ici : la requête a été validée avant l'appel, et rien du diagnostic du moteur ne sort.
  return fail(mapping)
}
