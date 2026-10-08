/**
 * Configuration du lancement HCC → Email Builder (docs/POC_INTEGRATION_HCC.md) : SERVEUR UNIQUEMENT, lue à la demande.
 * Aucune valeur par défaut, aucun `NEXT_PUBLIC_*`, aucun message qui affiche une valeur.
 *
 *   HCC_API_URL             origine du HCC (https ; http://localhost seulement hors production), sans chemin ni requête
 *   HCC_CLIENT_ID           identifiant du client Builder pour cet environnement (ex. « email-builder-local »)
 *   HCC_SIGNING_KEY_ID      kid de la clé de signature HMAC
 *   HCC_SIGNING_KEY         clé HMAC partagée avec le HCC, base64url, 32 octets au moins
 *   BUILDER_SESSION_SECRET  secret propre au Builder, base64url, 32 octets au moins (dérive les clés PKCE et cookies)
 */
import { deriveBuilderKeys, type BuilderKeys } from "./crypto"

type Env = Readonly<Record<string, string | undefined>>

export type HccConfig = {
  /** Origine du HCC, sans barre finale. */
  apiOrigin: string
  clientId: string
  keyId: string
  signingKey: Buffer
  keys: BuilderKeys
}

export class HccConfigError extends Error {
  override name = "HccConfigError"
  constructor(message: string) {
    super(`Configuration HCC invalide : ${message}`)
  }
}

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])

/** Une clé base64url d'au moins 32 octets (refus de toute autre forme). */
function secretOf(env: Env, name: string): Buffer {
  const raw = env[name]?.trim() ?? ""
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new HccConfigError(`${name} est absente ou n'est pas en base64url.`)
  const value = Buffer.from(raw, "base64url")
  if (value.length < 32) throw new HccConfigError(`${name} fait moins de 32 octets.`)
  return value
}

export function readHccConfig(env: Env = process.env): HccConfig {
  let url: URL
  try {
    url = new URL(env.HCC_API_URL?.trim() ?? "")
  } catch {
    throw new HccConfigError("HCC_API_URL n'est pas une URL valide.")
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new HccConfigError("HCC_API_URL doit être une origine, sans chemin, requête, fragment ni identifiants.")
  }
  const local = localHosts.has(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && env.NODE_ENV !== "production")) {
    throw new HccConfigError("HCC_API_URL doit être en HTTPS (http://localhost admis hors production seulement).")
  }
  const clientId = env.HCC_CLIENT_ID?.trim() ?? ""
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(clientId)) throw new HccConfigError("HCC_CLIENT_ID est absent ou mal formé.")
  const keyId = env.HCC_SIGNING_KEY_ID?.trim() ?? ""
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(keyId)) throw new HccConfigError("HCC_SIGNING_KEY_ID est absent ou mal formé.")
  const signingKey = secretOf(env, "HCC_SIGNING_KEY")
  const sessionSecret = secretOf(env, "BUILDER_SESSION_SECRET")
  if (signingKey.equals(sessionSecret)) throw new HccConfigError("BUILDER_SESSION_SECRET doit différer de HCC_SIGNING_KEY.")
  return { apiOrigin: url.origin, clientId, keyId, signingKey, keys: deriveBuilderKeys(sessionSecret) }
}

/** Configuration ou `null` (journalisé sans valeur) : une intégration non configurée ne fait pas tomber le reste. */
export function tryReadHccConfig(env: Env = process.env): HccConfig | null {
  try {
    return readHccConfig(env)
  } catch (error) {
    console.error("[hcc]", JSON.stringify({ evenement: "configuration_invalide", message: error instanceof HccConfigError ? error.message : "inconnue" }))
    return null
  }
}
