/**
 * Cryptographie du lancement HCC → Email Builder : SERVEUR UNIQUEMENT, `node:crypto` seul.
 *
 * - Clés : `BUILDER_SESSION_SECRET` → HKDF-SHA256 → deux clés indépendantes (PKCE, cookies).
 * - PKCE (RFC 7636) : `state` aléatoire (32 octets) ; `code_verifier` = base64url(HMAC-SHA256(K_pkce, "pkce:" + state)),
 *   43 caractères non réservés, jamais stocké ni envoyé au navigateur ; challenge S256.
 * - Cookies : AES-256-GCM, IV aléatoire de 12 octets, AAD = nom du cookie (un cookie ne se substitue pas à un autre).
 * - Signature HMAC : chaîne IDENTIQUE à `chaineASigner` du HCC (hub-creative-content/src/lib/builder/hmac.ts).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

export type BuilderKeys = { pkce: Buffer; cookie: Buffer }

const hkdf = (secret: Buffer, info: string) => Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), info, 32))

export const deriveBuilderKeys = (sessionSecret: Buffer): BuilderKeys => ({ pkce: hkdf(sessionSecret, "hcc-pkce-v1"), cookie: hkdf(sessionSecret, "hcc-cookie-v1") })

/** `bytes` octets aléatoires en base64url (32 → 43 caractères, 16 → 22). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url")

export const deriveCodeVerifier = (pkceKey: Buffer, state: string) => createHmac("sha256", pkceKey).update(`pkce:${state}`, "utf8").digest("base64url")

export const challengeS256 = (verifier: string) => createHash("sha256").update(verifier, "ascii").digest("base64url")

/** Égalité en temps constant ; longueurs différentes : faux, sans court-circuit sur le contenu. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8")
  const y = Buffer.from(b, "utf8")
  if (x.length !== y.length) {
    timingSafeEqual(x, x)
    return false
  }
  return timingSafeEqual(x, y)
}

/* Cookies scellés ------------------------------------------------------------ */

/** `v1.<iv>.<chiffré>.<tag>` (base64url). */
export function seal(key: Buffer, name: string, payload: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(`${name}|v1`, "utf8"))
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), body.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".")
}

/** Le contenu, ou `null` si la valeur est absente, mal formée, altérée ou scellée pour un autre cookie. */
export function unseal(key: Buffer, name: string, value: string | undefined): unknown {
  if (!value || value.length > 4096) return null
  const parts = value.split(".")
  if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some((part) => !/^[A-Za-z0-9_-]*$/.test(part))) return null
  try {
    const iv = Buffer.from(parts[1]!, "base64url")
    const tag = Buffer.from(parts[3]!, "base64url")
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAAD(Buffer.from(`${name}|v1`, "utf8"))
    decipher.setAuthTag(tag)
    const text = Buffer.concat([decipher.update(Buffer.from(parts[2]!, "base64url")), decipher.final()]).toString("utf8")
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/* Signature HMAC (contrat HCC §4.2) ------------------------------------------- */

export type RequestToSign = { method: string; pathAndQuery: string; timestamp: string; nonce: string; body: string; clientId: string; idempotencyKey?: string }

export function stringToSign(r: RequestToSign): string {
  const bodyHash = createHash("sha256").update(r.body, "utf8").digest("hex")
  return [r.method.toUpperCase(), r.pathAndQuery, r.timestamp, r.nonce, bodyHash, r.clientId, r.idempotencyKey ?? ""].join("\n")
}

export const signRequest = (key: Buffer, r: RequestToSign) => `v1=${createHmac("sha256", key).update(stringToSign(r), "utf8").digest("hex")}`

/** Empreinte non réversible d'un jeton (clé de limitation, jamais le jeton lui-même). */
export const tokenFingerprint = (token: string) => createHash("sha256").update(token, "utf8").digest("hex").slice(0, 32)
