/**
 * P0 mode HCC : verrou de production, session expirée, confirmation des conflits, versions nommées masquées.
 * Logique pure + route de sauvegarde (HCC simulé) + inspection du branchement des composants. Aucun réseau.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, describe, mock, test } from "node:test"

import { builderDocument, builderReducer, createBuilderState, type BuilderAction, type BuilderState } from "../builder-state"
import { buildDemoDocument } from "../demo-document"
import { guardLockedDispatch, hccLockMessages, isAllowedWhileLocked, lockOfFailure, savePhaseLabels, shouldAutosave, unsavedAtLockMessage } from "../hcc-save"
import { readHccConfig } from "../../hcc/config"
import { handleHccDocumentSave } from "../../hcc/document-handlers"
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
const env = { HCC_API_URL: "https://hcc.example", HCC_CLIENT_ID: "email-builder-poc", HCC_SIGNING_KEY_ID: "k1", HCC_SIGNING_KEY: b64(1), BUILDER_SESSION_SECRET: b64(2), NODE_ENV: "test" }
const config = readHccConfig(env)
const BUILDER = "https://builder.example"
const T0 = 1_791_465_600_000
const ASSET = "ast_exemple"
const TOKEN = `hcca_${"A".repeat(43)}`
const session = (over: Partial<BuilderSession> = {}): BuilderSession => ({ v: 1, token: TOKEN, expiresAt: T0 + 600_000, assetId: ASSET, assetName: "Relance", userId: "usr_1", userName: "Prénom", permissions: { canEdit: true, canPublish: true }, ...over })
const cookieValue = () => sealSession(config.keys.cookie, session())

function fakeHcc(...replies: [number, unknown][]) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const [status, body] = replies[Math.min(calls.length - 1, replies.length - 1)]!
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }) as typeof globalThis.fetch
  return { fetch, calls }
}
const saveRequest = (body: unknown) =>
  new Request(`${BUILDER}/api/email-builder/hcc/document`, { method: "PUT", headers: { "Content-Type": "application/json", origin: BUILDER, cookie: `${SESSION_COOKIE}=${cookieValue()}` }, body: JSON.stringify(body) })
const save = (body: unknown, fetch: typeof globalThis.fetch) => handleHccDocumentSave(saveRequest(body), { env, fetch, now: () => T0 })
const valid = (over: Record<string, unknown> = {}) => ({ assetId: ASSET, baseRevision: 3, statutEditorial: "draft", document: buildDemoDocument(), ...over })

/* A. Verrou de production ----------------------------------------------------------------- */

describe("P0 HCC — production verrouillée", () => {
  test("le HCC répond « statut_non_modifiable » → la route renvoie le code fermé `locked`, que l'éditeur traduit en verrou", async () => {
    const response = await save(valid(), fakeHcc([409, { error: { code: "statut_non_modifiable" } }]).fetch)
    const body = (await response.json()) as { status: string; code: string }
    assert.equal(response.status, 409)
    assert.deepEqual([body.status, body.code], ["error", "locked"])
    assert.equal(lockOfFailure(body.code), "locked")
  })
  test("seuls `locked` et `session` verrouillent : conflit, réseau, limite, document invalide restent relançables", () => {
    assert.equal(lockOfFailure("locked"), "locked")
    assert.equal(lockOfFailure("session"), "expired")
    for (const code of ["conflict", "unavailable", "rate_limited", "invalid_document", "too_large", "not_found", "invalid_response", "asset", "invalid_request"]) assert.equal(lockOfFailure(code), null, code)
  })
  test("plus aucun enregistrement automatique sous verrou", () => {
    for (const phase of ["locked", "expired"] as const) assert.equal(shouldAutosave({ dirty: true, phase, empty: false, inFlight: false }), false, phase)
  })
  test("aucune nouvelle mutation : sous verrou, le réducteur ne reçoit que les gestes sans effet sur le document", () => {
    const document = buildDemoDocument()
    let state: BuilderState = createBuilderState(document)
    const dispatch = guardLockedDispatch(true, (action) => {
      state = builderReducer(state, action)
    })
    const blockId = document.config.blocks[1]!.id
    const refused: BuilderAction[] = [
      { type: "operation", operation: { type: "remove-block", blockId } },
      { type: "operation", operation: { type: "move-block", blockId, toIndex: 0 } },
      { type: "start-edit", blockId, slot: "x" },
      { type: "commit-edit", blockId, slot: "x", draft: { text: "Piratage" } },
      { type: "undo" },
      { type: "redo" },
      { type: "set-status", status: "ready" },
      { type: "save-version", name: "V", at: "2026-10-12T00:00:00.000Z" },
      { type: "restart-from", id: "v1" },
      { type: "open-library" },
      { type: "open-images", blockId, slot: "image" },
      { type: "assistant-send", text: "Réécris tout" },
      { type: "apply-proposal", id: "p1" },
    ]
    const before = JSON.stringify(builderDocument(state))
    for (const action of refused) {
      assert.equal(isAllowedWhileLocked(action), false, action.type)
      dispatch(action)
    }
    assert.equal(JSON.stringify(builderDocument(state)), before, "document inchangé")
    assert.equal(state.status, "draft")
    assert.equal(state.panel, null)
    assert.equal(state.assistant.pending, false)
    for (const action of [{ type: "select-block", blockId }, { type: "escape" }, { type: "close-panel" }, { type: "dismiss-notice" }, { type: "assistant-fail", message: "x" }] as BuilderAction[]) assert.equal(isAllowedWhileLocked(action), true, action.type)
    // sans verrou : comportement inchangé
    const free = guardLockedDispatch(false, (action) => {
      state = builderReducer(state, action)
    })
    free({ type: "set-status", status: "review" })
    assert.equal(state.status, "review")
  })
  test("messages : production verrouillée et session expirée distincts ; modifications non enregistrées signalées sans promesse de récupération", () => {
    assert.equal(hccLockMessages.locked.text, "Cette production n'est plus modifiable dans le HCC. Retourne dans le HCC pour consulter son statut.")
    assert.match(hccLockMessages.expired.text, /expiré/)
    assert.equal(hccLockMessages.expired.link, "Rouvrir depuis le HCC")
    assert.notEqual(hccLockMessages.locked.text, hccLockMessages.expired.text)
    assert.notEqual(savePhaseLabels.locked, savePhaseLabels.expired)
    for (const lock of ["locked", "expired"] as const) {
      assert.match(unsavedAtLockMessage[lock], /n'ont pas (pu être )?(été )?enregistrées/)
      assert.ok(!/récupér(é|ées) après|seront récupérées|sauvegardées automatiquement/.test(unsavedAtLockMessage[lock].replace("ne seront pas récupérées", "")), "aucune promesse")
    }
  })
  test("branchement : verrou tenu par le shell, lecture seule partout, autosave et sauvegarde coupés, lien HCC sûr", () => {
    const shell = code("components/email-builder/builder-shell.tsx")
    assert.match(shell, /useState<HccLock \| null>\(null\)/)
    assert.match(shell, /onLock: \(next: HccLock\) => setLock\(\(current\) => current \?\? next\)/, "le premier verrou est définitif")
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /const readOnly = builderReadOnly\(state\) \|\| hccLocked/)
    assert.match(workspace, /const dispatch = guardLockedDispatch\(hccLocked, baseDispatch\)/)
    assert.match(workspace, /restartEnabled=\{!hccLocked\}/)
    assert.equal((workspace.match(/baseDispatch\(/g) ?? []).length, 1, "un seul appel direct : la fermeture automatique d'une notification")
    const bar = code("components/email-builder/hcc-save-bar.tsx")
    assert.match(bar, /if \(inFlight\.current \|\| lock\) return/)
    assert.match(bar, /if \(lock \|\| !shouldAutosave/)
    assert.match(bar, /const locked = lockOfFailure\(result\.code\)/)
    assert.match(bar, /\{dirty && <p className="text-destructive">\{unsavedAtLockMessage\[lock\]\}<\/p>\}/)
    assert.match(bar, /href=\{hccHome\}/)
    assert.ok(!/token|hcca_|HCC_API_URL|process\.env/.test(bar), "aucun jeton ni configuration côté client")
  })
})

/* B. Session expirée --------------------------------------------------------------------- */

describe("P0 HCC — session expirée", () => {
  test("le HCC répond 401 (jeton expiré ou révoqué) → code `session` → verrou `expired`", async () => {
    const response = await save(valid(), fakeHcc([401, { error: { code: "invalid_token" } }]).fetch)
    assert.equal(response.status, 401)
    assert.equal(lockOfFailure(((await response.json()) as { code: string }).code), "expired")
  })
  test("session Builder échue (cookie) : même code `session`, sans appel au HCC", async () => {
    const hcc = fakeHcc([200, { revision: 4, updatedAt: "t" }])
    const expired = new Request(`${BUILDER}/api/email-builder/hcc/document`, { method: "PUT", headers: { "Content-Type": "application/json", origin: BUILDER, cookie: `${SESSION_COOKIE}=${sealSession(config.keys.cookie, session({ expiresAt: T0 - 1 }))}` }, body: JSON.stringify(valid()) })
    const response = await handleHccDocumentSave(expired, { env, fetch: hcc.fetch, now: () => T0 })
    assert.equal(lockOfFailure(((await response.json()) as { code: string }).code), "expired")
    assert.equal(hcc.calls.length, 0)
  })
  test("lien de retour : fiche HCC construite depuis l'origine CONFIGURÉE et l'asset de la session (jamais l'en-tête Host), sans jeton", async () => {
    const result = await loadEditorDocument({ cookieValue: cookieValue(), assetId: ASSET, env, fetch: fakeHcc([200, { document: null, schemaVersion: null, statutEditorial: null, baseVersion: null, revision: 0, updatedAt: null }]).fetch, now: () => T0 })
    assert.equal(result.status, "ready")
    if (result.status === "ready") {
      assert.equal(result.hccHome, "https://hcc.example/mes-creations/ast_exemple")
      assert.ok(!JSON.stringify(result).includes("hcca_"))
    }
    assert.ok(!/headers\.get\("host"\)|x-forwarded/i.test(code("lib/hcc/editor-load.ts")))
  })
})

/* C. Conflit de révision ------------------------------------------------------------------ */

describe("P0 HCC — conflit : remplacement confirmé, révisions respectées", () => {
  test("confirmation obligatoire : « Garder mes modifications » ouvre une fenêtre (Annuler / Confirmer), jamais un enregistrement direct", () => {
    const bar = code("components/email-builder/hcc-save-bar.tsx")
    assert.match(bar, /onClick=\{\(\) => setConfirming\(true\)\}>\s*Garder mes modifications/)
    assert.match(bar, /<DialogClose render=\{<Button type="button" variant="outline" \/>\}>Annuler<\/DialogClose>/)
    assert.match(bar, /Confirmer le remplacement/)
    assert.match(bar, /La version enregistrée dans le HCC a changé/)
    assert.match(bar, /peut remplacer des modifications faites ailleurs/)
    // la seule sauvegarde avec une révision distante est dans le bouton de confirmation
    assert.equal((bar.match(/save\(failure\.revision\)/g) ?? []).length, 1)
    assert.match(bar, /setConfirming\(false\)\s*if \(failure\?\.kind === "conflict" && failure\.revision !== null\) void save\(failure\.revision\)/)
    assert.equal(shouldAutosave({ dirty: true, phase: "conflict", empty: false, inFlight: false }), false, "aucun écrasement automatique")
  })
  test("annulation : aucune écriture (le conflit seul n'appelle le HCC qu'une fois)", async () => {
    const hcc = fakeHcc([409, { error: { code: "revision_conflict" }, revision: 4 }])
    await save(valid(), hcc.fetch)
    assert.equal(hcc.calls.length, 1)
  })
  test("confirmation : la sauvegarde part avec la révision vue au conflit ; si le HCC a encore changé, NOUVEAU conflit (aucune écriture forcée)", async () => {
    const hcc = fakeHcc([409, { error: { code: "revision_conflict" }, revision: 4 }], [409, { error: { code: "revision_conflict" }, revision: 5 }], [200, { revision: 6, updatedAt: "t" }])
    const first = (await (await save(valid({ baseRevision: 3 }), hcc.fetch)).json()) as { status: string; revision: number }
    assert.deepEqual(first, { status: "conflict", revision: 4, message: "Le document a été modifié ailleurs depuis ton dernier enregistrement." })
    const confirmed = await save(valid({ baseRevision: first.revision }), hcc.fetch)
    assert.equal(confirmed.status, 409)
    assert.equal(((await confirmed.json()) as { revision: number }).revision, 5, "nouveau conflit signalé")
    assert.equal(JSON.parse(String(hcc.calls[1]!.init.body)).baseRevision, 4)
    const third = await save(valid({ baseRevision: 5 }), hcc.fetch)
    assert.deepEqual(await third.json(), { status: "saved", revision: 6, updatedAt: "t" })
    for (const call of hcc.calls) assert.ok(!/force|override/i.test(String(call.init.body)))
  })
})

/* D. Versions nommées ----------------------------------------------------------------------- */

describe("P0 HCC — versions nommées masquées en mode HCC", () => {
  test("la barre du haut masque le menu des versions en mode HCC ; aucun autre accès (bannière de consultation inatteignable)", () => {
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /versionsEnabled=\{!hcc\}/)
    const topbar = code("components/email-builder/builder-topbar.tsx")
    assert.match(topbar, /versionsEnabled = true/, "Builder autonome : comportement inchangé par défaut")
    assert.match(topbar, /\{versionsEnabled && <VersionsMenu /)
    // aucun raccourci clavier n'enregistre ni ne consulte de version
    assert.ok(!/save-version|view-version/.test(workspace.split("function onKeyDown")[1]!.split("return (")[0]!))
    assert.equal((workspace.match(/type: "save-version"/g) ?? []).length, 1, "seulement depuis le menu des versions")
  })
  test("statut : présenté comme statut de rédaction en mode HCC, jamais comme une validation du HCC", () => {
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /statusHint=\{hcc \? "Statut de rédaction dans le Builder : la validation officielle de la production se fait dans le HCC\." : undefined\}/)
    assert.match(code("components/email-builder/status-menu.tsx"), /\$\{hint \? "Statut de rédaction" : "Statut"\}/)
    assert.match(code("components/email-builder/hcc-save-bar.tsx"), /le statut de la production et sa validation se gèrent dans le HCC/)
  })
})
