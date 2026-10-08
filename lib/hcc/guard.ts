/**
 * Garde des routes du Builder (docs/POC_INTEGRATION_HCC.md §7) : SERVEUR UNIQUEMENT. Vérification RÉELLE, dans chaque
 * route (le `proxy.ts` n'est qu'un filtre optimiste) :
 *
 * 1. `Origin` : toute requête qui modifie (POST…) doit venir de l'origine du Builder ; absente ou étrangère → 403 ;
 * 2. session : cookie scellé, intact, non expiré → sinon 401 (expirée : message « Rouvrir depuis le HCC ») ;
 * 3. limitation : fenêtre fixe par session et par famille de route → 429 + `Retry-After`.
 *
 * Aucun en-tête CORS. Le corps d'erreur garde la forme `{ status: "error", code, message }` que l'interface affiche déjà.
 */
import { tryReadHccConfig } from "./config"
import { tokenFingerprint } from "./crypto"
import { openSession, readCookie, SESSION_COOKIE, type BuilderSession } from "./session"

type Env = Readonly<Record<string, string | undefined>>

/** Familles d'appels limitées (par session, fenêtre de 10 minutes). */
export const rateLimits = { assistant: 20, reference: 5, legacy: 10, render: 300, save: 300 } as const
export type RateFamily = keyof typeof rateLimits
export const RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Compteurs EN MÉMOIRE (une instance de fonction) : approximatifs sur plusieurs instances, suffisants au POC ; une règle
 * de limitation Vercel Firewall peut les compléter. ponytail: mémoire locale, compteur partagé (KV) si la charge l'exige.
 */
const counters = new Map<string, { windowStart: number; count: number }>()

export function consumeRateLimit(key: string, limit: number, now: number): { ok: true } | { ok: false; retryAfter: number } {
  const windowStart = now - (now % RATE_WINDOW_MS)
  const entry = counters.get(key)
  const current = entry && entry.windowStart === windowStart ? entry : { windowStart, count: 0 }
  current.count += 1
  counters.set(key, current)
  if (counters.size > 10_000) for (const [name, value] of counters) if (value.windowStart !== windowStart) counters.delete(name)
  return current.count <= limit ? { ok: true } : { ok: false, retryAfter: Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1000) }
}

export const resetRateLimits = () => counters.clear()

const safeMethods = new Set(["GET", "HEAD"])

/** Une requête qui modifie vient-elle de l'origine du Builder ? (GET/HEAD : toujours vrai.) */
export function hasAllowedOrigin(request: Request): boolean {
  if (safeMethods.has(request.method.toUpperCase())) return true
  const origin = request.headers.get("origin")
  return origin !== null && origin === new URL(request.url).origin
}

const json = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
  Response.json({ status: "error", code, message }, { status, headers: { "Cache-Control": "no-store", ...extra } })

export const sessionMessages = {
  missing: "Ouvre l'Email Builder depuis le HCC pour utiliser cette fonction.",
  expired: "Ta session a expiré : rouvre l'Email Builder depuis le HCC.",
} as const

export type GuardOptions = { env?: Env; now?: () => number; family?: RateFamily }

/** La session d'une requête de route, ou la réponse de refus à renvoyer telle quelle. */
export function guardRequest(request: Request, options: GuardOptions = {}): { ok: true; session: BuilderSession } | { ok: false; response: Response } {
  if (!hasAllowedOrigin(request)) return { ok: false, response: json(403, "origin", "Appel refusé : origine non autorisée.") }
  const config = tryReadHccConfig(options.env ?? process.env)
  if (!config) return { ok: false, response: json(503, "unavailable", "L'Email Builder n'est pas disponible pour le moment.") }
  const now = (options.now ?? Date.now)()
  const read = openSession(config.keys.cookie, readCookie(request.headers.get("cookie"), SESSION_COOKIE), now)
  if (read.status !== "valid") return { ok: false, response: json(401, "session", sessionMessages[read.status], { "WWW-Authenticate": 'Cookie realm="email-builder"' }) }
  if (options.family) {
    const limited = consumeRateLimit(`${options.family}:${tokenFingerprint(read.session.token)}`, rateLimits[options.family], now)
    if (!limited.ok) return { ok: false, response: json(429, "rate-limited", "Trop de demandes : réessaie dans quelques minutes.", { "Retry-After": String(limited.retryAfter) }) }
  }
  return { ok: true, session: read.session }
}

/** Enveloppe une route : la garde d'abord, le handler existant ensuite (inchangé). */
export function withBuilderSession(handler: (request: Request) => Promise<Response> | Response, family?: RateFamily, options: Omit<GuardOptions, "family"> = {}) {
  return async (request: Request): Promise<Response> => {
    const guard = guardRequest(request, { ...options, ...(family ? { family } : {}) })
    return guard.ok ? handler(request) : guard.response
  }
}
