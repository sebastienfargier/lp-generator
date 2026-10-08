/**
 * Échange du code de lancement (contrat HCC §5.1, `POST /api/builder/v1/launch/exchange`) : SERVEUR UNIQUEMENT.
 * Requête signée HMAC (en-têtes `HCC-*`, `Authorization: HCC-Client <id>`), sans `Origin`, sans redirection suivie,
 * sans nouvelle tentative (le nonce est à usage unique). La réponse est validée strictement avant tout usage.
 */
import { z } from "zod"

import type { HccConfig } from "./config"
import { randomToken, signRequest } from "./crypto"

export const EXCHANGE_PATH = "/api/builder/v1/launch/exchange"
export const EXCHANGE_TIMEOUT_MS = 10_000

const ExchangeResponseSchema = z.object({
  access_token: z.string().regex(/^hcca_[A-Za-z0-9_-]{43}$/),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive().max(1800),
  scope: z.literal("owner"),
  contractVersion: z.literal(1),
  user: z.object({ id: z.string().min(1).max(200), nom: z.string().max(200).nullable().optional() }),
  asset: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), nom: z.string().max(200), format: z.literal("email") }),
  permissions: z.object({ canEdit: z.boolean(), canPublish: z.boolean() }),
})
export type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>

/** Raisons fermées (jamais un message du HCC transmis tel quel). */
export type ExchangeFailure = "invalid_grant" | "invalid_request" | "invalid_client" | "rate_limited" | "unavailable" | "invalid_response"

export type ExchangeResult = { ok: true; value: ExchangeResponse } | { ok: false; reason: ExchangeFailure; status?: number }

export type ExchangeDependencies = { fetch?: typeof fetch; now?: () => number }

export async function exchangeLaunchCode(config: HccConfig, input: { code: string; codeVerifier: string }, dependencies: ExchangeDependencies = {}): Promise<ExchangeResult> {
  const doFetch = dependencies.fetch ?? globalThis.fetch
  const now = dependencies.now ?? Date.now
  const body = JSON.stringify({ code: input.code, code_verifier: input.codeVerifier })
  const timestamp = String(Math.floor(now() / 1000))
  const nonce = randomToken(16)
  const signature = signRequest(config.signingKey, { method: "POST", pathAndQuery: EXCHANGE_PATH, timestamp, nonce, body, clientId: config.clientId })

  let response: Response
  try {
    response = await doFetch(`${config.apiOrigin}${EXCHANGE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HCC-Client ${config.clientId}`,
        "HCC-Client-Id": config.clientId,
        "HCC-Key-Id": config.keyId,
        "HCC-Timestamp": timestamp,
        "HCC-Nonce": nonce,
        "HCC-Signature": signature,
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    })
  } catch {
    return { ok: false, reason: "unavailable" }
  }

  if (!response.ok) {
    const code = await response
      .json()
      .then((json: unknown) => (json as { error?: { code?: unknown } })?.error?.code)
      .catch(() => undefined)
    const known: Record<string, ExchangeFailure> = { invalid_grant: "invalid_grant", invalid_request: "invalid_request", invalid_client: "invalid_client", rate_limited: "rate_limited" }
    return { ok: false, reason: (typeof code === "string" && known[code]) || "unavailable", status: response.status }
  }
  const parsed = ExchangeResponseSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "invalid_response", status: response.status }
}
