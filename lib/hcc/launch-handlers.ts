/**
 * Parcours de lancement HCC → Email Builder (docs/POC_INTEGRATION_HCC.md §3) : handlers injectables, SERVEUR UNIQUEMENT.
 *
 *   GET  /hcc/start?asset=…            → transaction scellée + 303 vers `/api/builder/v1/launch/authorize` (5 paramètres)
 *   GET  /hcc/callback?code=…&state=…  → transaction vérifiée, échange signé, session scellée, 303 /email-builder/{asset}
 *   POST /hcc/logout                   → cookies supprimés (révocation LOCALE ; l'endpoint HCC de révocation n'existe pas)
 *
 * Aucune redirection vers une URL reçue ; aucune erreur ne renvoie le code ou le state ; journal sans secret.
 */
import { tryReadHccConfig, type HccConfig } from "./config"
import { challengeS256, constantTimeEqual, deriveCodeVerifier, randomToken } from "./crypto"
import { exchangeLaunchCode, type ExchangeDependencies } from "./exchange"
import { hasAllowedOrigin } from "./guard"
import {
  ASSET_ID,
  clearCookie,
  MAX_SESSION_SECONDS,
  openTransaction,
  readCookie,
  SESSION_COOKIE,
  SESSION_MARGIN_SECONDS,
  sealSession,
  sealTransaction,
  setCookie,
  TRANSACTION_COOKIE,
  TRANSACTION_TTL_SECONDS,
} from "./session"

export type LaunchDependencies = ExchangeDependencies & {
  env?: Readonly<Record<string, string | undefined>>
  log?: (event: string, details?: Record<string, string | number>) => void
}

const AUTHORIZE_PATH = "/api/builder/v1/launch/authorize"
export const launchErrors = ["lancement_invalide", "lancement_expire", "hcc_indisponible", "trop_de_requetes"] as const
export type LaunchError = (typeof launchErrors)[number]

const baseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } as const

const defaultLog: NonNullable<LaunchDependencies["log"]> = (event, details = {}) => console.error("[hcc]", JSON.stringify({ evenement: event, ...details }))

/** 303 vers un chemin INTERNE fixe, avec des cookies à poser. */
function redirect(request: Request, path: string, cookies: string[] = []): Response {
  const headers = new Headers(baseHeaders)
  headers.set("Location", new URL(path, request.url).toString())
  for (const cookie of cookies) headers.append("Set-Cookie", cookie)
  return new Response(null, { status: 303, headers })
}

const errorPage = (request: Request, reason: LaunchError, cookies: string[] = []) => redirect(request, `/hcc/erreur?raison=${reason}`, cookies)

/** Chaque paramètre attendu exactement une fois, aucun autre. */
function singleParams(url: URL, names: readonly string[]): Record<string, string> | null {
  const keys = [...url.searchParams.keys()]
  if (keys.length !== names.length || names.some((name) => url.searchParams.getAll(name).length !== 1)) return null
  return Object.fromEntries(names.map((name) => [name, url.searchParams.get(name)!]))
}

function config(dependencies: LaunchDependencies): HccConfig | null {
  return tryReadHccConfig(dependencies.env ?? process.env)
}

export function handleHccStart(request: Request, dependencies: LaunchDependencies = {}): Response {
  const settings = config(dependencies)
  if (!settings) return errorPage(request, "hcc_indisponible")
  const params = singleParams(new URL(request.url), ["asset"])
  if (!params || !ASSET_ID.test(params.asset!)) return errorPage(request, "lancement_invalide")

  const now = (dependencies.now ?? Date.now)()
  const state = randomToken(32)
  const challenge = challengeS256(deriveCodeVerifier(settings.keys.pkce, state))
  const authorize = new URL(AUTHORIZE_PATH, settings.apiOrigin)
  authorize.searchParams.set("client_id", settings.clientId)
  authorize.searchParams.set("asset", params.asset!)
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("code_challenge", challenge)
  authorize.searchParams.set("code_challenge_method", "S256")

  const headers = new Headers(baseHeaders)
  headers.set("Location", authorize.toString())
  headers.append("Set-Cookie", setCookie(TRANSACTION_COOKIE, sealTransaction(settings.keys.cookie, { v: 1, state, asset: params.asset!, iat: now }), TRANSACTION_TTL_SECONDS))
  ;(dependencies.log ?? defaultLog)("lancement_demarre")
  return new Response(null, { status: 303, headers })
}

export async function handleHccCallback(request: Request, dependencies: LaunchDependencies = {}): Promise<Response> {
  const log = dependencies.log ?? defaultLog
  // La transaction ne sert qu'une fois : elle est effacée dans TOUTE réponse du rappel.
  const clearTx = clearCookie(TRANSACTION_COOKIE)
  const settings = config(dependencies)
  if (!settings) return errorPage(request, "hcc_indisponible", [clearTx])

  const params = singleParams(new URL(request.url), ["code", "state"])
  if (!params || !/^[A-Za-z0-9_-]{43}$/.test(params.code!) || !/^[A-Za-z0-9_-]{43}$/.test(params.state!)) {
    log("rappel_refuse", { resultat: "parametres" })
    return errorPage(request, "lancement_invalide", [clearTx])
  }
  const now = (dependencies.now ?? Date.now)()
  const transaction = openTransaction(settings.keys.cookie, readCookie(request.headers.get("cookie"), TRANSACTION_COOKIE), now)
  if (!transaction) {
    log("rappel_refuse", { resultat: "transaction" })
    return errorPage(request, "lancement_expire", [clearTx])
  }
  if (!constantTimeEqual(params.state!, transaction.state)) {
    log("rappel_refuse", { resultat: "state" })
    return errorPage(request, "lancement_invalide", [clearTx])
  }

  const exchanged = await exchangeLaunchCode(settings, { code: params.code!, codeVerifier: deriveCodeVerifier(settings.keys.pkce, params.state!) }, dependencies)
  if (!exchanged.ok) {
    log("echange_refuse", { resultat: exchanged.reason, ...(exchanged.status ? { statut: exchanged.status } : {}) })
    const reason: LaunchError = exchanged.reason === "invalid_grant" ? "lancement_expire" : exchanged.reason === "rate_limited" ? "trop_de_requetes" : exchanged.reason === "invalid_request" ? "lancement_invalide" : "hcc_indisponible"
    return errorPage(request, reason, [clearTx])
  }
  const value = exchanged.value
  if (value.asset.id !== transaction.asset) {
    log("echange_refuse", { resultat: "asset_different" })
    return errorPage(request, "lancement_invalide", [clearTx])
  }

  const lifetime = Math.min(value.expires_in, MAX_SESSION_SECONDS) - SESSION_MARGIN_SECONDS
  if (lifetime <= 0) return errorPage(request, "lancement_expire", [clearTx])
  const session = sealSession(settings.keys.cookie, {
    v: 1,
    token: value.access_token,
    expiresAt: now + lifetime * 1000,
    assetId: value.asset.id,
    assetName: value.asset.nom,
    userId: value.user.id,
    userName: value.user.nom ?? "",
    permissions: { canEdit: value.permissions.canEdit, canPublish: value.permissions.canPublish },
  })
  log("session_ouverte", { assetId: value.asset.id })
  return redirect(request, `/email-builder/${encodeURIComponent(value.asset.id)}`, [clearTx, setCookie(SESSION_COOKIE, session, lifetime)])
}

/** Déconnexion LOCALE : les cookies du Builder sont supprimés ; le jeton HCC n'est pas révoqué (endpoint inexistant). */
export function handleHccLogout(request: Request): Response {
  if (!hasAllowedOrigin(request)) return new Response(null, { status: 403, headers: baseHeaders })
  return redirect(request, "/hcc/deconnecte", [clearCookie(SESSION_COOKIE), clearCookie(TRANSACTION_COOKIE)])
}
