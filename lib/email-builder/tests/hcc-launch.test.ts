/**
 * Réception du lancement HCC (docs/POC_INTEGRATION_HCC.md) : cryptographie, parcours start → callback → session, garde
 * des routes IA et des aperçus, configuration, en-têtes. Aucun réseau : le HCC est simulé par un `fetch` injecté.
 * Les vecteurs HMAC ont été calculés avec le code RÉEL du HCC (`hub-creative-content/src/lib/builder/hmac.ts` @ b8107ce).
 */
import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, describe, mock, test } from "node:test"

import { HccConfigError, readHccConfig } from "../../hcc/config"
import { challengeS256, constantTimeEqual, deriveBuilderKeys, deriveCodeVerifier, randomToken, seal, signRequest, stringToSign, unseal } from "../../hcc/crypto"
import { EXCHANGE_PATH } from "../../hcc/exchange"
import { consumeRateLimit, guardRequest, rateLimits, resetRateLimits, withBuilderSession } from "../../hcc/guard"
import { handleHccCallback, handleHccLogout, handleHccStart } from "../../hcc/launch-handlers"
import { editorAccess, openSession, openTransaction, readCookie, sealSession, sealTransaction, SESSION_COOKIE, TRANSACTION_COOKIE, type BuilderSession } from "../../hcc/session"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})
beforeEach(() => resetRateLimits())

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

/* Fixtures ------------------------------------------------------------------- */

const b64 = (seed: number) => Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + seed) % 256)).toString("base64url")
const env = { HCC_API_URL: "http://localhost:3001", HCC_CLIENT_ID: "email-builder-local", HCC_SIGNING_KEY_ID: "2026-10", HCC_SIGNING_KEY: b64(1), BUILDER_SESSION_SECRET: b64(2), NODE_ENV: "test" }
const config = readHccConfig(env)
const BUILDER = "http://localhost:3000"
const T0 = 1_791_465_600_000
const ASSET = "ast_exemple"
const TOKEN = `hcca_${"A".repeat(43)}`

type Call = { url: string; init: RequestInit }
/** Un HCC simulé : réponse fixe, appels enregistrés. */
function fakeHcc(status: number, body: unknown) {
  const calls: Call[] = []
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}
const exchangeOk = (over: Record<string, unknown> = {}) => ({
  access_token: TOKEN,
  token_type: "Bearer",
  expires_in: 1800,
  scope: "owner",
  contractVersion: 1,
  user: { id: "usr_1", nom: "Prénom Nom" },
  asset: { id: ASSET, nom: "Relance octobre", format: "email", projet: null },
  permissions: { canEdit: true, canPublish: true },
  ...over,
})
const logs: string[] = []
const deps = (fetch: typeof globalThis.fetch, now = T0) => ({ env, fetch, now: () => now, log: (event: string, details: Record<string, string | number> = {}) => logs.push(JSON.stringify({ event, ...details })) })

/** Lance `/hcc/start` et renvoie le state, le cookie de transaction et la redirection. */
function start(asset = ASSET, now = T0) {
  const response = handleHccStart(new Request(`${BUILDER}/hcc/start?asset=${asset}`), deps(fakeHcc(500, {}).fetch, now))
  const location = new URL(response.headers.get("location")!)
  const setCookies = response.headers.getSetCookie()
  const tx = setCookies.find((cookie) => cookie.startsWith(`${TRANSACTION_COOKIE}=`))!
  return { response, location, state: location.searchParams.get("state")!, txValue: tx.slice(TRANSACTION_COOKIE.length + 1).split(";")[0]!, setCookies }
}
const callbackRequest = (query: string, cookie?: string) => new Request(`${BUILDER}/hcc/callback?${query}`, { headers: cookie ? { cookie } : {} })
const validCode = "c".repeat(43)

const session = (over: Partial<BuilderSession> = {}): BuilderSession => ({ v: 1, token: TOKEN, expiresAt: T0 + 60_000, assetId: ASSET, assetName: "Relance", userId: "usr_1", userName: "Prénom", permissions: { canEdit: true, canPublish: true }, ...over })
const sessionCookie = (over: Partial<BuilderSession> = {}) => `${SESSION_COOKIE}=${sealSession(config.keys.cookie, session(over))}`
const apiRequest = (path: string, headers: Record<string, string> = {}, method = "POST") => new Request(`${BUILDER}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(method === "POST" ? { body: "{}" } : {}) })

/* Cryptographie -------------------------------------------------------------- */

describe("HCC — cryptographie : PKCE, HKDF, scellement, HMAC conforme au HCC", () => {
  test("PKCE : vecteur RFC 7636 (annexe B) ; verifier dérivé = 43 caractères non réservés, déterministe par state, dépendant de la clé", () => {
    assert.equal(challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    const state = randomToken(32)
    const verifier = deriveCodeVerifier(config.keys.pkce, state)
    assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/)
    assert.equal(verifier.length, 43)
    assert.equal(deriveCodeVerifier(config.keys.pkce, state), verifier)
    assert.notEqual(deriveCodeVerifier(config.keys.pkce, randomToken(32)), verifier)
    assert.notEqual(deriveCodeVerifier(deriveBuilderKeys(Buffer.from(b64(9), "base64url")).pkce, state), verifier)
    assert.match(challengeS256(verifier), /^[A-Za-z0-9_-]{43}$/)
  })
  test("HKDF : clés PKCE et cookies distinctes, de 32 octets, et différentes du secret", () => {
    const secret = Buffer.from(env.BUILDER_SESSION_SECRET, "base64url")
    assert.equal(config.keys.pkce.length, 32)
    assert.equal(config.keys.cookie.length, 32)
    assert.ok(!config.keys.pkce.equals(config.keys.cookie))
    assert.ok(!config.keys.pkce.equals(secret) && !config.keys.cookie.equals(secret))
  })
  test("state : 32 octets aléatoires, 43 caractères, tous différents", () => {
    const states = new Set(Array.from({ length: 200 }, () => randomToken(32)))
    assert.equal(states.size, 200)
    for (const state of states) assert.match(state, /^[A-Za-z0-9_-]{43}$/)
  })
  test("scellement AES-256-GCM : aller-retour ; IV, chiffré, tag, version ou nom de cookie altérés → refus", () => {
    const value = seal(config.keys.cookie, "a", { x: 1 })
    assert.deepEqual(unseal(config.keys.cookie, "a", value), { x: 1 })
    assert.equal(unseal(config.keys.cookie, "b", value), null, "AAD : un cookie ne remplace pas un autre")
    const [v, iv, body, tag] = value.split(".")
    const flip = (part: string) => (part[0] === "A" ? `B${part.slice(1)}` : `A${part.slice(1)}`)
    for (const altered of [[v, flip(iv!), body, tag], [v, iv, flip(body!), tag], [v, iv, body, flip(tag!)], ["v2", iv, body, tag]]) assert.equal(unseal(config.keys.cookie, "a", altered.join(".")), null)
    assert.equal(unseal(deriveBuilderKeys(Buffer.from(b64(9), "base64url")).cookie, "a", value), null, "autre clé")
    for (const junk of [undefined, "", "v1", "v1.a.b", "x".repeat(5000), "v1.!!.b.c"]) assert.equal(unseal(config.keys.cookie, "a", junk), null)
  })
  test("HMAC : chaîne et signature IDENTIQUES au code du HCC (vecteurs calculés avec hub-creative-content @ b8107ce)", () => {
    const key = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1))
    const request = { method: "POST", pathAndQuery: "/api/builder/v1/launch/exchange", timestamp: "1791465600", nonce: "AAAAAAAAAAAAAAAAAAAAAA", body: '{"code":"c","code_verifier":"v"}', clientId: "email-builder-local" }
    assert.equal(stringToSign(request), "POST\n/api/builder/v1/launch/exchange\n1791465600\nAAAAAAAAAAAAAAAAAAAAAA\n12fc897172640274f14228e99d9712f9da40e4bd834b855507e4c2526dae2205\nemail-builder-local\n")
    assert.equal(signRequest(key, request), "v1=def360928adda8bd16e0fd0589de4ea3344211860a58dae2709fb521dbe51e12")
    assert.equal(signRequest(key, { ...request, idempotencyKey: "k-1" }), "v1=721442501b81066d211728bb865854d20a0ab3b1388e431e4caedb87acff3efd")
  })
  test("comparaison en temps constant", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true)
    assert.equal(constantTimeEqual("abc", "abd"), false)
    assert.equal(constantTimeEqual("abc", "abcd"), false)
  })
})

/* Configuration --------------------------------------------------------------- */

describe("HCC — configuration stricte, sans valeur dans les messages", () => {
  test("refus : URL invalide, chemin, http hors localhost, http en production, client, kid, clés courtes ou identiques", () => {
    const bad: Record<string, string | undefined>[] = [
      { HCC_API_URL: "pas une url" },
      { HCC_API_URL: "https://hcc.example/api" },
      { HCC_API_URL: "https://hcc.example/?x=1" },
      { HCC_API_URL: "http://hcc.example" },
      { NODE_ENV: "production" },
      { HCC_CLIENT_ID: "E" },
      { HCC_CLIENT_ID: undefined },
      { HCC_SIGNING_KEY_ID: "kid avec espaces" },
      { HCC_SIGNING_KEY: Buffer.alloc(16, 1).toString("base64url") },
      { HCC_SIGNING_KEY: "pas+base64/url=" },
      { BUILDER_SESSION_SECRET: undefined },
      { BUILDER_SESSION_SECRET: env.HCC_SIGNING_KEY },
    ]
    for (const over of bad) {
      assert.throws(() => readHccConfig({ ...env, ...over }), (error: unknown) => error instanceof HccConfigError && !error.message.includes(env.HCC_SIGNING_KEY) && !error.message.includes(env.BUILDER_SESSION_SECRET), JSON.stringify(Object.keys(over)))
    }
    assert.equal(readHccConfig({ ...env, HCC_API_URL: "https://hcc.example", NODE_ENV: "production" }).apiOrigin, "https://hcc.example")
  })
  test("mauvaise configuration : start et callback renvoient vers une page fixe, sans appel au HCC ; les routes protégées répondent 503", async () => {
    const hcc = fakeHcc(200, exchangeOk())
    const broken = { env: { ...env, HCC_SIGNING_KEY: "" }, fetch: hcc.fetch, now: () => T0, log: () => {} }
    const started = handleHccStart(new Request(`${BUILDER}/hcc/start?asset=${ASSET}`), broken)
    assert.equal(started.status, 303)
    assert.equal(new URL(started.headers.get("location")!).pathname, "/hcc/erreur")
    const called = await handleHccCallback(callbackRequest(`code=${validCode}&state=${"s".repeat(43)}`), broken)
    assert.equal(new URL(called.headers.get("location")!).search, "?raison=hcc_indisponible")
    assert.equal(hcc.calls.length, 0)
    const guarded = guardRequest(apiRequest("/api/email-builder/assistant", { origin: BUILDER, cookie: sessionCookie() }), { env: { ...env, BUILDER_SESSION_SECRET: "" } })
    assert.equal(!guarded.ok && guarded.response.status, 503)
  })
})

/* Start ---------------------------------------------------------------------------- */

describe("HCC — /hcc/start", () => {
  test("303 vers l'autorisation HCC avec EXACTEMENT les cinq paramètres du contrat ; challenge = S256(verifier dérivé du state)", () => {
    const { response, location, state } = start()
    assert.equal(response.status, 303)
    assert.equal(location.origin + location.pathname, "http://localhost:3001/api/builder/v1/launch/authorize")
    assert.deepEqual([...location.searchParams.keys()].sort(), ["asset", "client_id", "code_challenge", "code_challenge_method", "state"])
    assert.equal(location.searchParams.get("client_id"), "email-builder-local")
    assert.equal(location.searchParams.get("asset"), ASSET)
    assert.equal(location.searchParams.get("code_challenge_method"), "S256")
    assert.match(state, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(location.searchParams.get("code_challenge"), challengeS256(deriveCodeVerifier(config.keys.pkce, state)))
    assert.ok(!location.toString().includes(deriveCodeVerifier(config.keys.pkce, state)), "le verifier ne quitte jamais le serveur")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    assert.equal(response.headers.get("cache-control"), "no-store")
  })
  test("cookie de transaction : scellé {state, asset, iat}, HttpOnly, Secure, SameSite=Lax, Path=/, 120 s, sans verifier", () => {
    const { setCookies, txValue, state } = start()
    assert.equal(setCookies.length, 1)
    assert.match(setCookies[0]!, /^__Host-hcc_tx=v1\.[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=120$/)
    assert.ok(!setCookies[0]!.includes(state), "le state n'est pas en clair dans le cookie")
    assert.deepEqual(openTransaction(config.keys.cookie, txValue, T0 + 1000), { v: 1, state, asset: ASSET, iat: T0 })
  })
  test("asset absent, mal formé, dupliqué ou paramètre en trop : page d'erreur fixe, aucun cookie", () => {
    for (const query of ["", "asset=", "asset=a%2Fb", `asset=${"x".repeat(65)}`, `asset=${ASSET}&asset=${ASSET}`, `asset=${ASSET}&next=https://evil.example`]) {
      const response = handleHccStart(new Request(`${BUILDER}/hcc/start?${query}`), deps(fakeHcc(500, {}).fetch))
      assert.equal(response.status, 303, query)
      assert.equal(response.headers.get("location"), `${BUILDER}/hcc/erreur?raison=lancement_invalide`, query)
      assert.equal(response.headers.getSetCookie().length, 0, query)
    }
  })
})

/* Callback ---------------------------------------------------------------------------- */

describe("HCC — /hcc/callback", () => {
  test("succès : échange signé conforme, session scellée, transaction effacée, 303 vers /email-builder/{asset} sans paramètres", async () => {
    const { state, txValue } = start()
    const hcc = fakeHcc(200, exchangeOk())
    const response = await handleHccCallback(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), deps(hcc.fetch, T0 + 5000))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get("location"), `${BUILDER}/email-builder/${ASSET}`)
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")

    // Requête d'échange : chemin, en-têtes, corps, signature, verifier.
    assert.equal(hcc.calls.length, 1)
    const { url, init } = hcc.calls[0]!
    assert.equal(url, `http://localhost:3001${EXCHANGE_PATH}`)
    const headers = new Headers(init.headers)
    assert.equal(init.method, "POST")
    assert.equal(init.redirect, "error")
    assert.equal(headers.get("authorization"), "HCC-Client email-builder-local")
    assert.equal(headers.get("hcc-client-id"), "email-builder-local")
    assert.equal(headers.get("hcc-key-id"), "2026-10")
    assert.equal(headers.get("hcc-timestamp"), String(Math.floor((T0 + 5000) / 1000)))
    assert.match(headers.get("hcc-nonce")!, /^[A-Za-z0-9_-]{22,64}$/)
    assert.equal(headers.has("origin"), false, "aucun Origin : le HCC refuserait (403)")
    const body = String(init.body)
    assert.deepEqual(JSON.parse(body), { code: validCode, code_verifier: deriveCodeVerifier(config.keys.pkce, state) })
    const expected = `v1=${createHmac("sha256", config.signingKey)
      .update(["POST", EXCHANGE_PATH, headers.get("hcc-timestamp"), headers.get("hcc-nonce"), createHash("sha256").update(body).digest("hex"), "email-builder-local", ""].join("\n"))
      .digest("hex")}`
    assert.equal(headers.get("hcc-signature"), expected)

    // Cookies : transaction effacée, session posée, jeton jamais en clair.
    const cookies = response.headers.getSetCookie()
    assert.ok(cookies.includes(`${TRANSACTION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`))
    const sessionSet = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=v1.`))!
    assert.match(sessionSet, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=1770$/)
    assert.ok(!cookies.join("\n").includes("hcca_"), "le jeton n'apparaît jamais en clair")
    const opened = openSession(config.keys.cookie, sessionSet.slice(SESSION_COOKIE.length + 1).split(";")[0], T0 + 6000)
    assert.equal(opened.status, "valid")
    if (opened.status === "valid") {
      assert.equal(opened.session.token, TOKEN)
      assert.equal(opened.session.assetId, ASSET)
      assert.equal(opened.session.expiresAt, T0 + 5000 + 1770 * 1000, "expire avant le jeton (marge de 30 s)")
    }
    assert.ok(!logs.join("\n").includes(validCode) && !logs.join("\n").includes(state) && !logs.join("\n").includes("hcca_"), "journal sans secret")
  })
  test("deux échanges : deux nonces différents (aucune requête rejouée)", async () => {
    const nonces = new Set<string>()
    for (let run = 0; run < 2; run += 1) {
      const { state, txValue } = start()
      const hcc = fakeHcc(200, exchangeOk())
      await handleHccCallback(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), deps(hcc.fetch))
      nonces.add(new Headers(hcc.calls[0]!.init.headers).get("hcc-nonce")!)
    }
    assert.equal(nonces.size, 2)
  })

  const refusedWithoutExchange = async (request: Request, now = T0 + 1000, reason = "lancement_invalide") => {
    const hcc = fakeHcc(200, exchangeOk())
    const response = await handleHccCallback(request, deps(hcc.fetch, now))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get("location"), `${BUILDER}/hcc/erreur?raison=${reason}`)
    assert.equal(hcc.calls.length, 0, "aucun échange")
    const cookies = response.headers.getSetCookie()
    assert.ok(cookies.some((cookie) => cookie.startsWith(`${TRANSACTION_COOKIE}=;`)), "transaction toujours effacée")
    assert.ok(!cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=v1`)), "aucune session")
  }

  test("callback sans transaction, transaction altérée ou expirée : refus sans échange", async () => {
    const { state, txValue } = start()
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${state}`), T0 + 1000, "lancement_expire")
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue.slice(0, -2)}AA`), T0 + 1000, "lancement_expire")
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), T0 + 121_000, "lancement_expire")
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), T0 - 1000, "lancement_expire")
    // une session scellée présentée comme transaction : refus (AAD)
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${sealSession(config.keys.cookie, session())}`), T0 + 1000, "lancement_expire")
  })
  test("state absent, modifié, d'une autre transaction : refus (CSRF de connexion)", async () => {
    const { txValue } = start()
    const other = start()
    await refusedWithoutExchange(callbackRequest(`code=${validCode}`, `${TRANSACTION_COOKIE}=${txValue}`))
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${"x".repeat(43)}`, `${TRANSACTION_COOKIE}=${txValue}`))
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${other.state}`, `${TRANSACTION_COOKIE}=${txValue}`))
  })
  test("code absent, vide, mal formé ou dupliqué ; paramètre en trop : refus", async () => {
    const { state, txValue } = start()
    const cookie = `${TRANSACTION_COOKIE}=${txValue}`
    for (const query of [`state=${state}`, `code=&state=${state}`, `code=abc&state=${state}`, `code=${validCode}&code=${validCode}&state=${state}`, `code=${validCode}&state=${state}&state=${state}`, `code=${validCode}&state=${state}&x=1`]) {
      await refusedWithoutExchange(callbackRequest(query, cookie))
    }
  })
  test("réponses du HCC : invalid_grant, invalid_client, 429, 503, réseau → pages fixes, aucune session", async () => {
    const cases: [number, unknown, string][] = [
      [400, { error: { code: "invalid_grant", message: "x" } }, "lancement_expire"],
      [400, { error: { code: "invalid_request", message: "x" } }, "lancement_invalide"],
      [401, { error: { code: "invalid_client", message: "x" } }, "hcc_indisponible"],
      [429, { error: { code: "rate_limited", message: "x" } }, "trop_de_requetes"],
      [503, { error: { code: "client_non_configure", message: "x" } }, "hcc_indisponible"],
      [500, "pas du json", "hcc_indisponible"],
    ]
    for (const [status, body, reason] of cases) {
      const { state, txValue } = start()
      const response = await handleHccCallback(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), deps(fakeHcc(status, body).fetch))
      assert.equal(response.headers.get("location"), `${BUILDER}/hcc/erreur?raison=${reason}`, `${status}`)
      assert.ok(!response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=v1`)))
    }
    const { state, txValue } = start()
    const offline = (async () => {
      throw new TypeError("fetch failed")
    }) as typeof globalThis.fetch
    const response = await handleHccCallback(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), deps(offline))
    assert.equal(response.headers.get("location"), `${BUILDER}/hcc/erreur?raison=hcc_indisponible`)
  })
  test("réponse 200 invalide (jeton, type, durée, portée, version, format) ou ASSET DIFFÉRENT : refus, aucune session", async () => {
    const invalid = [
      { access_token: "pas-un-jeton" },
      { token_type: "MAC" },
      { expires_in: 0 },
      { expires_in: 3600 },
      { scope: "viewer" },
      { contractVersion: 2 },
      { asset: { id: ASSET, nom: "x", format: "landing" } },
      { asset: { id: "ast_autre", nom: "x", format: "email" } },
      { permissions: undefined },
    ]
    for (const over of invalid) {
      const { state, txValue } = start()
      const response = await handleHccCallback(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), deps(fakeHcc(200, exchangeOk(over)).fetch))
      const location = new URL(response.headers.get("location")!)
      assert.equal(location.pathname, "/hcc/erreur", JSON.stringify(over))
      assert.ok(!response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=v1`)), JSON.stringify(over))
    }
  })
  test("le rappel ne sert qu'une fois : la seconde visite n'a plus de transaction (cookie effacé) et n'échange rien", async () => {
    const { state, txValue } = start()
    const first = await handleHccCallback(callbackRequest(`code=${validCode}&state=${state}`, `${TRANSACTION_COOKIE}=${txValue}`), deps(fakeHcc(200, exchangeOk()).fetch))
    assert.ok(first.headers.getSetCookie().some((cookie) => cookie === `${TRANSACTION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`))
    await refusedWithoutExchange(callbackRequest(`code=${validCode}&state=${state}`), T0 + 2000, "lancement_expire")
  })
})

/* Session, déconnexion, accès -------------------------------------------------------- */

describe("HCC — session, déconnexion, accès à l'éditeur", () => {
  test("session : valide, expirée, altérée, absente", () => {
    const value = sealSession(config.keys.cookie, session())
    assert.equal(openSession(config.keys.cookie, value, T0).status, "valid")
    assert.equal(openSession(config.keys.cookie, value, T0 + 60_000).status, "expired")
    assert.equal(openSession(config.keys.cookie, `${value.slice(0, -2)}AA`, T0).status, "missing")
    assert.equal(openSession(config.keys.cookie, undefined, T0).status, "missing")
    assert.equal(openSession(config.keys.cookie, sealTransaction(config.keys.cookie, { v: 1, state: "s".repeat(43), asset: ASSET, iat: T0 }), T0).status, "missing")
  })
  test("éditeur : session valide du MÊME asset seulement ; sinon « Ouvre depuis le HCC » ou « Rouvrir depuis le HCC »", () => {
    assert.deepEqual(editorAccess("valid", ASSET, ASSET), { ok: true })
    assert.deepEqual(editorAccess("valid", ASSET, "ast_autre"), { ok: false, redirect: "/hcc/requis" })
    assert.deepEqual(editorAccess("missing", null, ASSET), { ok: false, redirect: "/hcc/requis" })
    assert.deepEqual(editorAccess("expired", null, ASSET), { ok: false, redirect: "/hcc/expire" })
    assert.deepEqual(editorAccess("unavailable", null, ASSET), { ok: false, redirect: "/hcc/erreur?raison=hcc_indisponible" })
  })
  test("les pages de l'éditeur passent par la garde ; aucune ne transmet le jeton au client", () => {
    const page = code("app/email-builder/[assetId]/page.tsx")
    assert.match(page, /loadPageEditor\(assetId\)/)
    for (const path of ["app/email-builder/page.tsx", "app/email-builder/[assetId]/page.tsx"]) assert.match(code(path), /dynamic = "force-dynamic"/, `${path} : jamais une redirection figée au build`)
    assert.ok(code("lib/hcc/page-session.ts").indexOf("await cookies()") < code("lib/hcc/page-session.ts").indexOf("tryReadHccConfig()"), "cookies() lu avant toute sortie anticipée")
    assert.match(code("lib/hcc/editor-load.ts"), /editorAccess\(/)
    assert.match(code("app/email-builder/page.tsx"), /redirect\(/)
    assert.ok(!/BuilderShell/.test(code("app/email-builder/page.tsx")), "/email-builder n'ouvre plus l'éditeur directement")
    assert.match(code("lib/hcc/page-session.ts"), /publicSession\(/)
    for (const path of ["app/email-builder/[assetId]/page.tsx", "app/email-builder/page.tsx", "components/email-builder/builder-shell.tsx"]) assert.ok(!/\.token\b|access_token/.test(code(path)), path)
  })
  test("déconnexion : POST de la même origine → cookies effacés, 303 /hcc/deconnecte ; origine étrangère → 403 ; aucun appel au HCC", () => {
    const ok = handleHccLogout(new Request(`${BUILDER}/hcc/logout`, { method: "POST", headers: { origin: BUILDER, cookie: sessionCookie() } }))
    assert.equal(ok.status, 303)
    assert.equal(ok.headers.get("location"), `${BUILDER}/hcc/deconnecte`)
    assert.deepEqual(ok.headers.getSetCookie().sort(), [`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, `${TRANSACTION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`].sort())
    for (const headers of [{ origin: "https://evil.example" }, {}] as Record<string, string>[]) assert.equal(handleHccLogout(new Request(`${BUILDER}/hcc/logout`, { method: "POST", headers })).status, 403)
    assert.ok(!/fetch\(|revoke/.test(code("lib/hcc/launch-handlers.ts").split("handleHccLogout")[1]!), "aucune révocation HCC prétendue")
  })
  test("lecture d'un cookie dans l'en-tête Cookie", () => {
    assert.equal(readCookie("a=1; __Host-hcc_session=v1.x.y.z; b=2", SESSION_COOKIE), "v1.x.y.z")
    assert.equal(readCookie(null, SESSION_COOKIE), undefined)
  })
})

/* Routes protégées ---------------------------------------------------------------------- */

describe("HCC — routes IA, anciennes routes et aperçus protégés", () => {
  const ok = async () => Response.json({ status: "success" })
  const run = (request: Request, family: "assistant" | "reference" | "legacy" | "render" = "assistant") => withBuilderSession(ok, family, { env, now: () => T0 })(request)

  test("sans session, session altérée ou expirée : 401, le handler n'est jamais appelé", async () => {
    let called = 0
    const handler = async () => {
      called += 1
      return Response.json({ status: "success" })
    }
    for (const cookie of [undefined, `${SESSION_COOKIE}=v1.a.b.c`, sessionCookie({ expiresAt: T0 - 1 })]) {
      const response = await withBuilderSession(handler, "assistant", { env, now: () => T0 })(apiRequest("/api/email-builder/assistant", { origin: BUILDER, ...(cookie ? { cookie } : {}) }))
      assert.equal(response.status, 401)
      const body = (await response.json()) as { status: string; message: string }
      assert.equal(body.status, "error")
      assert.match(body.message, /HCC/)
    }
    assert.equal(called, 0)
  })
  test("Origin absente ou étrangère : 403 avant toute lecture de session ; même origine : accepté", async () => {
    assert.equal((await run(apiRequest("/api/email-builder/assistant", { cookie: sessionCookie() }))).status, 403)
    assert.equal((await run(apiRequest("/api/email-builder/assistant", { origin: "https://evil.example", cookie: sessionCookie() }))).status, 403)
    assert.equal((await run(apiRequest("/api/email-builder/assistant", { origin: "http://localhost:3001", cookie: sessionCookie() }))).status, 403, "le HCC lui-même n'appelle pas les routes IA")
    assert.equal((await run(apiRequest("/api/email-builder/assistant", { origin: BUILDER, cookie: sessionCookie() }))).status, 200)
  })
  test("GET d'aperçu (iframe interne) : session exigée, Origin non exigée", async () => {
    assert.equal(guardRequest(apiRequest("/email-builder/preview/x", {}, "GET"), { env, now: () => T0 }).ok, false)
    assert.equal(guardRequest(apiRequest("/email-builder/preview/x", { cookie: sessionCookie() }, "GET"), { env, now: () => T0 }).ok, true)
  })
  test("limitation par session : au-delà du plafond → 429 + Retry-After ; une autre session n'est pas affectée", async () => {
    for (let index = 0; index < rateLimits.reference; index += 1) assert.equal((await run(apiRequest("/api/email-builder/reference", { origin: BUILDER, cookie: sessionCookie() }), "reference")).status, 200)
    const limited = await run(apiRequest("/api/email-builder/reference", { origin: BUILDER, cookie: sessionCookie() }), "reference")
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get("retry-after")) > 0)
    assert.equal((await run(apiRequest("/api/email-builder/reference", { origin: BUILDER, cookie: sessionCookie({ token: `hcca_${"B".repeat(43)}` }) }), "reference")).status, 200)
    assert.deepEqual(consumeRateLimit("x", 1, T0), { ok: true })
  })
  test("CHAQUE route IA, ancienne ou nouvelle, et chaque aperçu passe par la garde dans son propre code (le proxy n'est qu'un filtre)", () => {
    const guarded: Record<string, string> = {
      "app/api/email-builder/assistant/route.ts": "assistant",
      "app/api/email-builder/reference/route.ts": "reference",
      "app/api/email-builder/render/route.ts": "render",
      "app/api/generate/route.ts": "legacy",
      "app/api/generate-email/route.ts": "legacy",
      "app/api/edit-email/route.ts": "legacy",
      "app/api/export-email/route.ts": "legacy",
    }
    for (const [path, family] of Object.entries(guarded)) assert.match(code(path), new RegExp(`withBuilderSession\\(\\w+, "${family}"\\)\\(request\\)`), path)
    for (const path of ["app/email-builder/preview/[id]/route.ts", "app/(dashboard)/email-library/preview/[type]/route.ts"]) {
      const source = code(path)
      assert.match(source, /guardRequest\(request\)/, path)
      assert.match(source, /force-dynamic/, path)
      assert.ok(!/force-static|generateStaticParams/.test(source), `${path} n'est plus prérendue`)
    }
    const proxy = code("proxy.ts")
    for (const matcher of ["/email-builder/:path*", "/email-library/preview/:path*", "/api/email-builder/:path*", "/api/generate", "/api/generate-email", "/api/edit-email"]) assert.ok(proxy.includes(`"${matcher}"`), matcher)
  })
  test("aucune route n'émet d'en-tête CORS ; aucun jeton ni secret dans les réponses de refus", async () => {
    const refused = await run(apiRequest("/api/email-builder/assistant", { origin: BUILDER }))
    assert.equal(refused.headers.get("access-control-allow-origin"), null)
    const text = await refused.text()
    assert.ok(!text.includes("hcca_") && !text.includes(env.BUILDER_SESSION_SECRET))
    for (const path of ["lib/hcc/guard.ts", "lib/hcc/launch-handlers.ts", "proxy.ts"]) assert.ok(!/Access-Control-Allow/i.test(code(path)), path)
  })
})

/* En-têtes et frontières ------------------------------------------------------------------ */

describe("HCC — en-têtes, CSP et frontières", () => {
  test("CSP frame-ancestors 'self' (iframes internes conservées, intégration tierce refusée), nosniff, no-referrer sur /hcc", () => {
    const config = code("next.config.ts")
    assert.match(config, /frame-ancestors 'self'/)
    assert.ok(!/frame-ancestors 'none'/.test(config), "'none' casserait les aperçus en iframe du Builder")
    assert.match(config, /nosniff/)
    assert.match(config, /source: "\/hcc\/:path\*", headers: \[\{ key: "Referrer-Policy", value: "no-referrer" \}/)
    // les iframes internes restent de même origine
    assert.match(code("components/email-builder/entry-scenes.tsx"), /`\/email-builder\/preview\/\$\{id\}`/)
    assert.match(code("components/email-builder/lame-library-panel.tsx"), /`\/email-library\/preview\/\$\{lame\.type\}`/)
  })
  test("lib/hcc : aucun NEXT_PUBLIC, aucun import client, aucun secret journalisé, aucun appel au HCC hors de l'échange", () => {
    for (const path of ["lib/hcc/config.ts", "lib/hcc/crypto.ts", "lib/hcc/session.ts", "lib/hcc/exchange.ts", "lib/hcc/guard.ts", "lib/hcc/launch-handlers.ts", "lib/hcc/page-session.ts"]) {
      const source = code(path)
      assert.ok(!/NEXT_PUBLIC|"use client"|from "react"/.test(source), path)
      assert.ok(!/console\.(log|error)\([^)]*(token|code|state|secret|signature)/i.test(source), path)
    }
    assert.equal((code("lib/hcc/exchange.ts").match(/doFetch\(/g) ?? []).length, 1)
    assert.ok(!/@anthropic|anthropic/i.test(code("lib/hcc/guard.ts")))
  })
  test(".env.example documente les noms, sans valeur", () => {
    const example = readFileSync(join(root, ".env.example"), "utf8")
    for (const name of ["HCC_API_URL", "HCC_CLIENT_ID", "HCC_SIGNING_KEY_ID", "HCC_SIGNING_KEY", "BUILDER_SESSION_SECRET"]) assert.match(example, new RegExp(`^${name}=$`, "m"), name)
    assert.ok(!/=\S/.test(example.split("\n").filter((line) => !line.startsWith("#")).join("\n")), "aucune valeur")
  })
})
