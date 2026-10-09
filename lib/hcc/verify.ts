/**
 * Vérification HMAC des requêtes HCC → Builder (route `POST /api/hcc/v1/render`) : SERVEUR UNIQUEMENT.
 *
 * Mêmes en-têtes et même chaîne signée que le contrat HCC §4.2 (`HCC-Client-Id`, `HCC-Key-Id`, `HCC-Timestamp`,
 * `HCC-Nonce`, `HCC-Signature: v1=<hex>` ; chaîne = METHOD \n chemin+requête \n timestamp \n nonce \n SHA-256 hex du
 * corps brut \n client-id \n Idempotency-Key ou vide). La clé est DÉDIÉE au sens HCC → Builder, dérivée de la clé
 * partagée (`HCC_SIGNING_KEY`, kid `HCC_SIGNING_KEY_ID`) par HKDF :
 *
 *   clé de rendu = HKDF-SHA256(IKM = octets de la clé k1, salt = UTF-8 "hcc-email-builder-v1",
 *                              info = UTF-8 "hcc-to-builder:render", L = 32 octets)
 *
 * Une signature Builder → HCC (clé k1 brute) n'est donc jamais valable ici, et inversement. Tout échec répond
 * `invalid_client`, sans dire lequel ; rien n'est journalisé (ni signature, ni nonce, ni corps).
 */
import { hkdfSync } from "node:crypto"

import type { HccConfig } from "./config"
import { constantTimeEqual, signRequest } from "./crypto"

export const RENDER_KEY_SALT = "hcc-email-builder-v1"
export const RENDER_KEY_INFO = "hcc-to-builder:render"
export const RENDER_KEY_LENGTH = 32
export const SIGNATURE_WINDOW_SECONDS = 300
export const NONCE_FORMAT = /^[A-Za-z0-9_-]{22,64}$/

/** Clé HMAC du sens HCC → Builder, dérivée de la clé partagée (aucun nouveau secret). */
export const deriveRenderKey = (sharedKey: Buffer) => Buffer.from(hkdfSync("sha256", sharedKey, Buffer.from(RENDER_KEY_SALT, "utf8"), Buffer.from(RENDER_KEY_INFO, "utf8"), RENDER_KEY_LENGTH))

/**
 * Nonces déjà vus (fenêtre de ±300 s), EN MÉMOIRE : une instance refuse un rejeu ; plusieurs instances ne partagent pas
 * ce registre. Acceptable pour une route SANS EFFET (rendu en lecture seule). ponytail: registre local, magasin partagé
 * si une route à effet utilise ce sens.
 */
const seen = new Map<string, number>()
export const resetSeenNonces = () => seen.clear()

export type IncomingRequest = { method: string; url: string; headers: Headers; body: string }

/** `true` si la requête est signée par le HCC pour CE client et CE kid, dans la fenêtre, avec un nonce neuf. */
export function verifyHccSignature(request: IncomingRequest, config: HccConfig, now: number): boolean {
  const h = request.headers
  const clientId = h.get("hcc-client-id") ?? ""
  const keyId = h.get("hcc-key-id") ?? ""
  const timestamp = h.get("hcc-timestamp") ?? ""
  const nonce = h.get("hcc-nonce") ?? ""
  const signature = h.get("hcc-signature") ?? ""
  if (!clientId || !keyId || !timestamp || !nonce || !signature) return false
  if (!NONCE_FORMAT.test(nonce) || !/^\d{1,12}$/.test(timestamp) || !/^v1=[0-9a-f]{64}$/.test(signature)) return false
  // Les deux comparaisons sont faites, quel que soit le résultat de la première.
  const knownClient = constantTimeEqual(clientId, config.clientId)
  const knownKey = constantTimeEqual(keyId, config.keyId)
  if (!knownClient || !knownKey) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS) return false

  const url = new URL(request.url)
  const expected = signRequest(deriveRenderKey(config.signingKey), {
    method: request.method,
    pathAndQuery: url.pathname + url.search,
    timestamp,
    nonce,
    body: request.body,
    clientId,
    idempotencyKey: h.get("idempotency-key") ?? undefined,
  })
  if (!constantTimeEqual(signature, expected)) return false

  // Anti-rejeu : un nonce valide ne sert qu'une fois pendant la fenêtre.
  for (const [value, expiry] of seen) if (expiry < now) seen.delete(value)
  const key = `${clientId}:${nonce}`
  if (seen.has(key)) return false
  seen.set(key, now + 2 * SIGNATURE_WINDOW_SECONDS * 1000)
  return true
}
