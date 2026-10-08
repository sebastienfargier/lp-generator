/**
 * Sauvegarde réelle Email Builder → HCC (contrat §5.2, §5.3 ; HCC @ 969a81c) : client documentaire signé, route de
 * sauvegarde du Builder, chargement initial de l'éditeur, logique d'enregistrement. HCC simulé par un `fetch` injecté.
 */
import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, describe, mock, test } from "node:test"

import { buildDemoDocument } from "../demo-document"
import { createBlankDocument } from "../document"
import { saveKey, shouldAutosave } from "../hcc-save"
import { readHccConfig } from "../../hcc/config"
import { handleHccDocumentSave } from "../../hcc/document-handlers"
import { documentPath, fetchHccDocument, saveHccDocument } from "../../hcc/documents"
import { loadEditorDocument } from "../../hcc/editor-load"
import { resetRateLimits } from "../../hcc/guard"
import { sealSession, SESSION_COOKIE, type BuilderSession } from "../../hcc/session"

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

const b64 = (seed: number) => Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + seed) % 256)).toString("base64url")
const env = { HCC_API_URL: "http://localhost:3000", HCC_CLIENT_ID: "email-builder-local", HCC_SIGNING_KEY_ID: "2026-10", HCC_SIGNING_KEY: b64(1), BUILDER_SESSION_SECRET: b64(2), NODE_ENV: "test" }
const config = readHccConfig(env)
const BUILDER = "http://localhost:3001"
const T0 = 1_791_465_600_000
const ASSET = "ast_exemple"
const TOKEN = `hcca_${"A".repeat(43)}`
const session = (over: Partial<BuilderSession> = {}): BuilderSession => ({ v: 1, token: TOKEN, expiresAt: T0 + 600_000, assetId: ASSET, assetName: "Relance", userId: "usr_1", userName: "Prénom", permissions: { canEdit: true, canPublish: true }, ...over })
const cookieValue = (over: Partial<BuilderSession> = {}) => sealSession(config.keys.cookie, session(over))

type Call = { url: string; init: RequestInit }
/** HCC simulé : une file de réponses, appels enregistrés. */
function fakeHcc(...replies: [number, unknown][]) {
  const calls: Call[] = []
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const [status, body] = replies[Math.min(calls.length - 1, replies.length - 1)]!
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}
const offline = (async () => {
  throw new TypeError("fetch failed")
}) as typeof globalThis.fetch
const initial = { document: null, schemaVersion: null, statutEditorial: null, baseVersion: null, revision: 0, updatedAt: null }
const stored = (document: unknown, revision = 3, statut = "review") => ({ document, schemaVersion: 1, statutEditorial: statut, baseVersion: null, revision, updatedAt: "2026-10-09T08:00:00.000Z" })

/** Vérifie la signature d'un appel comme le HCC (`verifierSignature`) : chaîne, corps brut, nonce, Bearer, pas d'Origin. */
function assertSigned(call: Call, method: string, path: string) {
  const headers = new Headers(call.init.headers)
  const body = typeof call.init.body === "string" ? call.init.body : ""
  assert.equal(call.url, `http://localhost:3000${path}`)
  assert.equal(call.init.method, method)
  assert.equal(call.init.redirect, "error")
  assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`)
  assert.equal(headers.has("origin"), false)
  assert.match(headers.get("hcc-nonce")!, /^[A-Za-z0-9_-]{22,64}$/)
  const chain = [method, path, headers.get("hcc-timestamp"), headers.get("hcc-nonce"), createHash("sha256").update(body, "utf8").digest("hex"), "email-builder-local", ""].join("\n")
  assert.equal(headers.get("hcc-signature"), `v1=${createHmac("sha256", config.signingKey).update(chain).digest("hex")}`)
  assert.equal(headers.get("hcc-client-id"), "email-builder-local")
  assert.equal(headers.get("hcc-key-id"), "2026-10")
  return { headers, body }
}

/* Client documentaire ---------------------------------------------------------- */

describe("HCC documents — client signé (GET / PUT)", () => {
  test("GET : Bearer + signature du corps vide ; document initial (null, révision 0) ; document enregistré", async () => {
    const hcc = fakeHcc([200, initial], [200, stored(buildDemoDocument())])
    const first = await fetchHccDocument(config, TOKEN, ASSET, { fetch: hcc.fetch, now: () => T0 })
    assert.deepEqual(first, { ok: true, value: { document: null, schemaVersion: null, statutEditorial: null, revision: 0, updatedAt: null } })
    assertSigned(hcc.calls[0]!, "GET", documentPath(ASSET))
    const second = await fetchHccDocument(config, TOKEN, ASSET, { fetch: hcc.fetch, now: () => T0 })
    assert.equal(second.ok && second.value.revision, 3)
    assert.notEqual(new Headers(hcc.calls[0]!.init.headers).get("hcc-nonce"), new Headers(hcc.calls[1]!.init.headers).get("hcc-nonce"), "nonce unique par requête")
  })
  test("GET : réponse incohérente (document sans révision, révision sans document, forme invalide) → invalid_response", async () => {
    for (const body of [{ ...initial, revision: 2 }, stored(buildDemoDocument(), 0), { revision: "1" }, "pas du json"]) {
      const result = await fetchHccDocument(config, TOKEN, ASSET, { fetch: fakeHcc([200, body]).fetch })
      assert.deepEqual(result, { ok: false, reason: "invalid_response" }, JSON.stringify(body).slice(0, 40))
    }
  })
  test("PUT : corps brut signé exactement comme envoyé ; 200 → révision ; 409 → conflit avec la révision courante", async () => {
    const hcc = fakeHcc([200, { revision: 1, updatedAt: "x" }], [409, { error: { code: "revision_conflict", message: "Le document a changé." }, revision: 5 }])
    const document = buildDemoDocument()
    const saved = await saveHccDocument(config, TOKEN, ASSET, { document, statutEditorial: "draft", baseRevision: 0 }, { fetch: hcc.fetch })
    assert.deepEqual(saved, { ok: true, revision: 1, updatedAt: "x" })
    const { headers, body } = assertSigned(hcc.calls[0]!, "PUT", documentPath(ASSET))
    assert.equal(headers.get("content-type"), "application/json")
    assert.deepEqual(JSON.parse(body), { document, schemaVersion: 1, statutEditorial: "draft", baseRevision: 0 })
    assert.deepEqual(await saveHccDocument(config, TOKEN, ASSET, { document, statutEditorial: "draft", baseRevision: 1 }, { fetch: hcc.fetch }), { ok: false, reason: "conflict", revision: 5 })
  })
  test("erreurs HCC → raisons fermées ; réseau → unavailable ; asset mal formé → aucun appel", async () => {
    const cases: [number, unknown, string][] = [
      [401, { error: { code: "invalid_token" } }, "session"],
      [404, { error: { code: "not_found" } }, "not_found"],
      [409, { error: { code: "statut_non_modifiable" } }, "locked"],
      [413, { error: { code: "payload_too_large" } }, "too_large"],
      [422, { error: { code: "invalid_document" } }, "invalid_document"],
      [429, { error: { code: "rate_limited" } }, "rate_limited"],
      [503, { error: { code: "client_non_configure" } }, "unavailable"],
    ]
    for (const [status, body, reason] of cases) assert.deepEqual(await saveHccDocument(config, TOKEN, ASSET, { document: {}, statutEditorial: "draft", baseRevision: 0 }, { fetch: fakeHcc([status, body]).fetch }), { ok: false, reason }, String(status))
    assert.deepEqual(await fetchHccDocument(config, TOKEN, ASSET, { fetch: offline }), { ok: false, reason: "unavailable" })
    const hcc = fakeHcc([200, initial])
    assert.deepEqual(await fetchHccDocument(config, TOKEN, "../autre", { fetch: hcc.fetch }), { ok: false, reason: "not_found" })
    assert.equal(hcc.calls.length, 0)
  })
})

/* Chargement initial ----------------------------------------------------------------- */

describe("HCC documents — chargement de /email-builder/[assetId]", () => {
  const load = (fetch: typeof globalThis.fetch, over: { cookie?: string | undefined; asset?: string; now?: number } = {}) =>
    loadEditorDocument({ cookieValue: "cookie" in over ? over.cookie : cookieValue(), assetId: over.asset ?? ASSET, env, fetch, now: () => over.now ?? T0 })

  test("asset neuf (révision 0, document null) : écran de départ, AUCUNE écriture", async () => {
    const hcc = fakeHcc([200, initial])
    const result = await load(hcc.fetch)
    assert.equal(result.status, "ready")
    if (result.status === "ready") {
      assert.equal(result.document, null)
      assert.equal(result.revision, 0)
      assert.ok(!JSON.stringify(result).includes("hcca_"), "jamais le jeton vers la page")
    }
    assert.deepEqual(hcc.calls.map((call) => call.init.method), ["GET"], "lecture seule")
  })
  test("document enregistré : chargé tel quel avec sa révision et son statut ; jamais remplacé par un document initial", async () => {
    const saved = buildDemoDocument()
    const hcc = fakeHcc([200, stored(saved, 7, "review")])
    const result = await load(hcc.fetch)
    assert.equal(result.status, "ready")
    if (result.status === "ready") {
      assert.deepEqual(result.document, saved)
      assert.equal(result.revision, 7)
      assert.equal(result.editorialStatus, "review")
    }
    assert.equal(hcc.calls.length, 1)
  })
  test("document enregistré illisible : page d'erreur, l'éditeur ne s'ouvre pas (pas d'écrasement possible)", async () => {
    const result = await load(fakeHcc([200, stored({ schemaVersion: 1, config: { blocks: "x" }, facts: {}, provenance: {}, blockMeta: {}, registry: {} })]).fetch)
    assert.deepEqual(result, { status: "redirect", to: "/hcc/erreur?raison=document_invalide" })
  })
  test("sans session, session expirée, AUTRE ASSET, HCC 401/404/indisponible : redirections fixes, aucun appel inutile", async () => {
    const hcc = fakeHcc([200, initial])
    assert.deepEqual(await load(hcc.fetch, { cookie: undefined }), { status: "redirect", to: "/hcc/requis" })
    assert.deepEqual(await load(hcc.fetch, { cookie: cookieValue({ expiresAt: T0 - 1 }) }), { status: "redirect", to: "/hcc/expire" })
    assert.deepEqual(await load(hcc.fetch, { asset: "ast_autre" }), { status: "redirect", to: "/hcc/requis" })
    assert.equal(hcc.calls.length, 0, "aucun appel au HCC sans session valide pour cet asset")
    assert.deepEqual(await load(fakeHcc([401, { error: { code: "invalid_token" } }]).fetch), { status: "redirect", to: "/hcc/expire" })
    assert.deepEqual(await load(fakeHcc([404, { error: { code: "not_found" } }]).fetch), { status: "redirect", to: "/hcc/requis" })
    assert.deepEqual(await load(offline), { status: "redirect", to: "/hcc/erreur?raison=hcc_indisponible" })
  })
})

/* Route de sauvegarde du Builder ----------------------------------------------------------- */

describe("HCC documents — PUT /api/email-builder/hcc/document", () => {
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${BUILDER}/api/email-builder/hcc/document`, { method: "PUT", headers: { "Content-Type": "application/json", origin: BUILDER, cookie: `${SESSION_COOKIE}=${cookieValue()}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) })
  const save = (body: unknown, fetch: typeof globalThis.fetch, headers: Record<string, string> = {}, now = T0) => handleHccDocumentSave(request(body, headers), { env, fetch, now: () => now })
  const valid = (over: Record<string, unknown> = {}) => ({ assetId: ASSET, baseRevision: 0, statutEditorial: "draft", document: buildDemoDocument(), ...over })

  test("première sauvegarde (révision 0 → 1), relecture, modification et nouvelle sauvegarde (1 → 2)", async () => {
    const document = buildDemoDocument()
    const hcc = fakeHcc([200, { revision: 1, updatedAt: "t1" }], [200, stored(document, 1, "draft")], [200, { revision: 2, updatedAt: "t2" }])
    const first = await save(valid({ document }), hcc.fetch)
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { status: "saved", revision: 1, updatedAt: "t1" })
    const reread = await loadEditorDocument({ cookieValue: cookieValue(), assetId: ASSET, env, fetch: hcc.fetch, now: () => T0 })
    assert.equal(reread.status === "ready" && reread.revision, 1)
    assert.deepEqual(reread.status === "ready" && reread.document, document)
    const changed = structuredClone(document)
    changed.config.name = "Relance modifiée"
    const second = await save(valid({ document: changed, baseRevision: 1, statutEditorial: "review" }), hcc.fetch)
    assert.deepEqual(await second.json(), { status: "saved", revision: 2, updatedAt: "t2" })
    assert.deepEqual(JSON.parse(String(hcc.calls[2]!.init.body)), { document: changed, schemaVersion: 1, statutEditorial: "review", baseRevision: 1 })
  })
  test("conflit de révision : 409 avec la révision courante du HCC, rien n'est réécrit automatiquement", async () => {
    const hcc = fakeHcc([409, { error: { code: "revision_conflict", message: "Le document a changé." }, revision: 4 }])
    const response = await save(valid({ baseRevision: 2 }), hcc.fetch)
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), { status: "conflict", revision: 4, message: "Le document a été modifié ailleurs depuis ton dernier enregistrement." })
    assert.equal(hcc.calls.length, 1, "aucune nouvelle tentative")
  })
  test("erreur réseau, statut verrouillé, session HCC expirée : erreurs explicites, relançables", async () => {
    assert.equal((await save(valid(), offline)).status, 502)
    const locked = await save(valid(), fakeHcc([409, { error: { code: "statut_non_modifiable" } }]).fetch)
    assert.equal(((await locked.json()) as { code: string }).code, "locked")
    const expired = await save(valid(), fakeHcc([401, { error: { code: "invalid_token" } }]).fetch)
    assert.equal(expired.status, 401)
    assert.match(((await expired.json()) as { message: string }).message, /rouvre l'Email Builder depuis le HCC/)
  })
  test("session Builder expirée ou absente : 401 sans appel au HCC ; origine étrangère : 403", async () => {
    const hcc = fakeHcc([200, { revision: 1, updatedAt: "t" }])
    assert.equal((await save(valid(), hcc.fetch, { cookie: `${SESSION_COOKIE}=${cookieValue({ expiresAt: T0 - 1 })}` })).status, 401)
    assert.equal((await save(valid(), hcc.fetch, { cookie: "" })).status, 401)
    assert.equal((await save(valid(), hcc.fetch, { origin: "https://evil.example" })).status, 403)
    assert.equal(hcc.calls.length, 0)
  })
  test("autre asset refusé (403) ; corps invalide (400) ; document invalide (422) ; trop gros (413) : aucun appel au HCC", async () => {
    const hcc = fakeHcc([200, { revision: 1, updatedAt: "t" }])
    assert.equal((await save(valid({ assetId: "ast_autre" }), hcc.fetch)).status, 403)
    for (const body of ["{", valid({ baseRevision: -1 }), valid({ statutEditorial: "published" }), valid({ extra: 1 }), { ...valid(), assetId: undefined }]) assert.equal((await save(body, hcc.fetch)).status, 400)
    assert.equal((await save(valid({ document: { schemaVersion: 1 } }), hcc.fetch)).status, 422)
    const huge = buildDemoDocument()
    huge.config.name = "x".repeat(520 * 1024)
    assert.equal((await save(valid({ document: huge }), hcc.fetch)).status, 413)
    assert.equal(hcc.calls.length, 0)
  })
  test("jeton jamais exposé : ni dans les réponses, ni dans ce que le navigateur envoie", async () => {
    for (const reply of [[200, { revision: 1, updatedAt: "t" }], [409, { error: { code: "revision_conflict" }, revision: 2 }], [401, { error: { code: "invalid_token" } }]] as [number, unknown][]) {
      const text = await (await save(valid(), fakeHcc(reply).fetch)).text()
      assert.ok(!text.includes("hcca_") && !text.includes(env.HCC_SIGNING_KEY), text)
    }
    const component = code("components/email-builder/hcc-save-bar.tsx")
    assert.match(component, /JSON\.stringify\(\{ assetId, baseRevision, statutEditorial: status, document \}\)/)
    for (const path of ["components/email-builder/hcc-save-bar.tsx", "components/email-builder/builder-shell.tsx", "components/email-builder/builder-workspace.tsx", "app/email-builder/[assetId]/page.tsx"]) assert.ok(!/\btoken\b|hcca_|HCC_SIGNING|signRequest|lib\/hcc\/(crypto|documents|session|config)/.test(code(path)), path)
  })
})

/* Logique d'enregistrement ----------------------------------------------------------------- */

describe("HCC documents — logique d'enregistrement côté éditeur", () => {
  test("autosave : seulement un travail modifié, non vide, sans écriture en cours, hors erreur et conflit", () => {
    assert.equal(shouldAutosave({ dirty: true, phase: "dirty", empty: false, inFlight: false }), true)
    assert.equal(shouldAutosave({ dirty: false, phase: "saved", empty: false, inFlight: false }), false)
    assert.equal(shouldAutosave({ dirty: true, phase: "dirty", empty: true, inFlight: false }), false, "jamais un email vide")
    assert.equal(shouldAutosave({ dirty: true, phase: "saving", empty: false, inFlight: true }), false, "une seule écriture à la fois")
    assert.equal(shouldAutosave({ dirty: true, phase: "error", empty: false, inFlight: false }), false, "reprise explicite après erreur")
    assert.equal(shouldAutosave({ dirty: true, phase: "conflict", empty: false, inFlight: false }), false, "jamais d'écrasement automatique")
  })
  test("empreinte : identique pour le même contenu et statut, différente sinon", () => {
    const document = buildDemoDocument()
    assert.equal(saveKey(document, "draft"), saveKey(structuredClone(document), "draft"))
    assert.notEqual(saveKey(document, "draft"), saveKey(document, "review"))
    assert.notEqual(saveKey(document, "draft"), saveKey(createBlankDocument(), "draft"))
  })
  test("branchement : document enregistré → Builder ouvert dessus ; création neuve → écran de départ ; barre de sauvegarde visible avec les quatre états", () => {
    const shell = code("components/email-builder/builder-shell.tsx")
    assert.match(shell, /hcc\?\.document \? \{ screen: "builder" as const, opened: 1, document: hcc\.document \} : createShell\(\)/)
    assert.match(shell, /key: hcc\?\.document \? saveKey\(hcc\.document, hcc\.editorialStatus\) : null/)
    assert.match(code("components/email-builder/builder-workspace.tsx"), /hcc && <HccSaveBar \{\.\.\.hcc\} document=\{document\} status=\{state\.status\} empty=\{empty\} \/>/)
    const bar = code("components/email-builder/hcc-save-bar.tsx")
    for (const piece of ["Enregistrer dans le HCC", "Réessayer", "Garder mes modifications", "Recharger depuis le HCC", "beforeunload", "inFlight.current = true"]) assert.ok(bar.includes(piece), piece)
    const labels = code("lib/email-builder/hcc-save.ts")
    for (const label of ["Modifications non enregistrées", "Enregistrement…", "Enregistré dans le HCC", "Erreur de sauvegarde"]) assert.ok(labels.includes(label), label)
    assert.match(code("app/api/email-builder/hcc/document/route.ts"), /handleHccDocumentSave\(request\)/)
  })
})
