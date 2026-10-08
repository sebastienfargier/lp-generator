/**
 * API documentaire du HCC (contrat §5.2, §5.3 ; `hub-creative-content` @ 969a81c) : SERVEUR UNIQUEMENT.
 *
 *   GET /api/builder/v1/assets/{assetId}/document  → { document | null, schemaVersion, statutEditorial, baseVersion, revision, updatedAt }
 *   PUT /api/builder/v1/assets/{assetId}/document  ← { document, schemaVersion: 1, statutEditorial, baseRevision }
 *                                                   → 200 { revision, updatedAt } | 409 revision_conflict { revision } | …
 *
 * Chaque appel : `Authorization: Bearer <jeton de la session serveur>` ET signature HMAC du corps BRUT (GET : corps vide),
 * nonce unique, sans `Origin`, sans redirection suivie, délai borné, aucune nouvelle tentative automatique.
 */
import { z } from "zod"

import type { HccConfig } from "./config"
import { randomToken, signRequest } from "./crypto"

export const HCC_TIMEOUT_MS = 10_000
/** Limite du HCC sur le JSON du document (octets). */
export const MAX_DOCUMENT_BYTES = 512 * 1024
export const editorialStatuses = ["draft", "review", "ready"] as const
export type EditorialStatus = (typeof editorialStatuses)[number]

export const documentPath = (assetId: string) => `/api/builder/v1/assets/${assetId}/document`

const CurrentSchema = z.object({
  document: z.record(z.string(), z.unknown()).nullable(),
  schemaVersion: z.number().int().nullable(),
  statutEditorial: z.string().nullable(),
  revision: z.number().int().min(0),
  updatedAt: z.string().nullable(),
})
export type HccCurrentDocument = z.infer<typeof CurrentSchema>
const SavedSchema = z.object({ revision: z.number().int().min(1), updatedAt: z.string() })
const ErrorSchema = z.object({ error: z.object({ code: z.string() }), revision: z.number().int().min(0).optional() })

/** Raisons fermées : jamais un message du HCC transmis tel quel. */
export type HccFailure = "session" | "not_found" | "conflict" | "locked" | "invalid_document" | "too_large" | "rate_limited" | "unavailable" | "invalid_response"

export type HccCallDependencies = { fetch?: typeof fetch; now?: () => number }

async function signedCall(config: HccConfig, token: string, method: "GET" | "PUT", path: string, body: string, dependencies: HccCallDependencies): Promise<Response | null> {
  const timestamp = String(Math.floor((dependencies.now ?? Date.now)() / 1000))
  const nonce = randomToken(16)
  try {
    return await (dependencies.fetch ?? globalThis.fetch)(`${config.apiOrigin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "HCC-Client-Id": config.clientId,
        "HCC-Key-Id": config.keyId,
        "HCC-Timestamp": timestamp,
        "HCC-Nonce": nonce,
        "HCC-Signature": signRequest(config.signingKey, { method, pathAndQuery: path, timestamp, nonce, body, clientId: config.clientId }),
        ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "PUT" ? { body } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(HCC_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

/** Erreur HCC → raison fermée (+ révision courante d'un conflit). */
async function failureOf(response: Response): Promise<{ reason: HccFailure; revision?: number }> {
  const parsed = ErrorSchema.safeParse(await response.json().catch(() => null))
  const code = parsed.success ? parsed.data.error.code : ""
  if (response.status === 401) return { reason: "session" }
  if (response.status === 404) return { reason: "not_found" }
  if (code === "revision_conflict") return { reason: "conflict", ...(parsed.success && parsed.data.revision !== undefined ? { revision: parsed.data.revision } : {}) }
  if (code === "statut_non_modifiable") return { reason: "locked" }
  if (response.status === 413) return { reason: "too_large" }
  if (response.status === 422) return { reason: "invalid_document" }
  if (response.status === 429) return { reason: "rate_limited" }
  return { reason: "unavailable" }
}

const assetPattern = /^[A-Za-z0-9_-]{1,64}$/

export type FetchDocumentResult = { ok: true; value: HccCurrentDocument } | { ok: false; reason: HccFailure }

export async function fetchHccDocument(config: HccConfig, token: string, assetId: string, dependencies: HccCallDependencies = {}): Promise<FetchDocumentResult> {
  if (!assetPattern.test(assetId)) return { ok: false, reason: "not_found" }
  const response = await signedCall(config, token, "GET", documentPath(assetId), "", dependencies)
  if (!response) return { ok: false, reason: "unavailable" }
  if (!response.ok) return { ok: false, ...(await failureOf(response)) }
  const parsed = CurrentSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) return { ok: false, reason: "invalid_response" }
  // Document initial : `null` ⇔ révision 0 (jamais l'un sans l'autre).
  if ((parsed.data.document === null) !== (parsed.data.revision === 0)) return { ok: false, reason: "invalid_response" }
  return { ok: true, value: parsed.data }
}

export type SaveDocumentInput = { document: unknown; statutEditorial: EditorialStatus; baseRevision: number }
export type SaveDocumentResult = { ok: true; revision: number; updatedAt: string } | { ok: false; reason: HccFailure; revision?: number }

export async function saveHccDocument(config: HccConfig, token: string, assetId: string, input: SaveDocumentInput, dependencies: HccCallDependencies = {}): Promise<SaveDocumentResult> {
  if (!assetPattern.test(assetId)) return { ok: false, reason: "not_found" }
  const body = JSON.stringify({ document: input.document, schemaVersion: 1, statutEditorial: input.statutEditorial, baseRevision: input.baseRevision })
  const response = await signedCall(config, token, "PUT", documentPath(assetId), body, dependencies)
  if (!response) return { ok: false, reason: "unavailable" }
  if (!response.ok) return { ok: false, ...(await failureOf(response)) }
  const parsed = SavedSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? { ok: true, revision: parsed.data.revision, updatedAt: parsed.data.updatedAt } : { ok: false, reason: "invalid_response" }
}
