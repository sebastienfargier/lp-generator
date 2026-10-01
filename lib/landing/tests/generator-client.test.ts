/**
 * Comportement du client de /generator, sans React ni réseau : l'appel unique
 * à l'API et l'état de la page (loading, success, error, conservation du
 * dernier résultat valide).
 */
import assert from "node:assert/strict"
import { describe, mock, test } from "node:test"

import { emptyGeneratorBrief } from "../brief"
import { requestLandingGeneration } from "../generate-client"
import { canGenerate, generatorReducer, initialGeneratorState, type GeneratorState } from "../generator-state"
import { resolveLandingDraft } from "../draft-resolver"
import { landingGenerateEndpoint, publicErrorCodes, type PublicGenerationError } from "../public-api"
import { context, request, validDraft } from "./fixtures"
import { generationDraftFor } from "./generate-fixtures"

const brief = { projectName: "  Reconversion RH ", brief: " Un brief. ", audience: " Salariés ", objective: "discover-trainings" }
const resolution = resolveLandingDraft(request, generationDraftFor(validDraft()), context)
assert.ok(resolution.status === "resolved")
const config = resolution.config

/** `fetch` simulé : enregistre les appels, répond ou lève. */
function fakeFetch(respond: () => unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const value = respond()
    if (value instanceof Error) throw value
    return value as Response
  }) as typeof fetch
  return { calls, fetchImpl }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const failure = (error: PublicGenerationError, status: number) => json({ ok: false, error }, status)

describe("requestLandingGeneration : un seul POST", () => {
  test("succès : un POST sur /api/generate avec les quatre champs du brief, et la configuration reçue", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    const outcome = await requestLandingGeneration(brief, fetchImpl)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, landingGenerateEndpoint)
    assert.equal(calls[0]!.url, "/api/generate")
    assert.equal(calls[0]!.init.method, "POST")
    assert.deepEqual(calls[0]!.init.headers, { "Content-Type": "application/json" })
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { projectName: "Reconversion RH", brief: "Un brief.", audience: "Salariés", objective: "discover-trainings" })
    assert.deepEqual(outcome, { status: "success", config })
  })

  test("le corps ne contient que le brief : ni faits, ni clé, ni champ de plus", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    await requestLandingGeneration({ ...brief, extra: "x", facts: [{ value: "x" }] } as typeof brief, fetchImpl)
    assert.deepEqual(Object.keys(JSON.parse(calls[0]!.init.body as string)), ["projectName", "brief", "audience", "objective"])
  })

  test("aucune relance, quel que soit l'échec : erreur publique, 429, 500, réseau, réponse illisible", async () => {
    const responses: (() => unknown)[] = [
      () => failure({ code: "rate-limit", message: "Trop de demandes." }, 429),
      () => failure({ code: "internal", message: "Erreur." }, 500),
      () => failure({ code: "timeout", message: "Trop long." }, 504),
      () => new TypeError("Failed to fetch"),
      () => new Response("<html>502</html>", { status: 502 }),
      () => json({ ok: true, config: { version: 2 } }),
    ]
    for (const respond of responses) {
      const { calls, fetchImpl } = fakeFetch(respond)
      const outcome = await requestLandingGeneration(brief, fetchImpl)
      assert.equal(outcome.status, "error")
      assert.equal(calls.length, 1, "un seul POST, jamais de relance")
    }
  })

  test("sans fetch injecté, le fetch global du moment est utilisé, une seule fois", async () => {
    const original = globalThis.fetch
    const spy = mock.method(globalThis, "fetch", async () => json({ ok: true, config }))
    try {
      assert.equal((await requestLandingGeneration(brief)).status, "success")
      assert.equal(spy.mock.callCount(), 1)
    } finally {
      spy.mock.restore()
      assert.equal(globalThis.fetch, original)
    }
  })
})

describe("requestLandingGeneration : réponses", () => {
  test("erreur publique relayée telle quelle : code, message, champs", async () => {
    const error: PublicGenerationError = { code: "invalid-request", message: "Vérifiez.", fields: [{ path: "brief", message: "Le brief est requis." }] }
    const { fetchImpl } = fakeFetch(() => failure(error, 400))
    assert.deepEqual(await requestLandingGeneration(brief, fetchImpl), { status: "error", error })
  })

  test("chaque code public connu est relayé", async () => {
    for (const code of publicErrorCodes) {
      const { fetchImpl } = fakeFetch(() => failure({ code, message: "Message." }, 500))
      const outcome = await requestLandingGeneration(brief, fetchImpl)
      assert.deepEqual(outcome, { status: "error", error: { code, message: "Message." } }, code)
    }
  })

  test("rien d'autre que code, message et champs n'est relayé : pile, sortie brute, identifiants ignorés", async () => {
    const { fetchImpl } = fakeFetch(() => json({ ok: false, error: { code: "internal", message: "Erreur.", stack: "PILE", raw: "SORTIE-BRUTE", requestId: "req_x", fields: [{ path: "brief", message: "m", secret: "S" }, "pas-un-champ"] }, debug: "D" }, 500))
    const outcome = await requestLandingGeneration(brief, fetchImpl)
    assert.deepEqual(outcome, { status: "error", error: { code: "internal", message: "Erreur.", fields: [{ path: "brief", message: "m" }] } })
    assert.ok(!JSON.stringify(outcome).includes("PILE") && !JSON.stringify(outcome).includes("SORTIE-BRUTE") && !JSON.stringify(outcome).includes("req_x"))
  })

  test("échec réseau : erreur publique « network », sans le détail de l'exception", async () => {
    const { fetchImpl } = fakeFetch(() => new TypeError("Failed to fetch https://interne"))
    const outcome = await requestLandingGeneration(brief, fetchImpl)
    assert.deepEqual(outcome, { status: "error", error: { code: "network", message: "Connexion impossible. Vérifiez votre réseau et réessayez." } })
  })

  test("réponse illisible ou inattendue : « invalid-response », le renderer ne reçoit rien", async () => {
    const unreadable = [
      () => new Response("pas du json", { status: 200 }),
      () => json("texte"),
      () => json(null),
      () => json([]),
      () => json({ ok: true }),
      () => json({ ok: true, config: null }),
      () => json({ ok: true, config: { version: 1, id: "x", title: "x", sections: [] } }),
      () => json({ ok: true, config: { ...config, sections: [{ ...config.sections[0], className: "x" }] } }),
      () => json({ ok: false }),
      () => json({ ok: false, error: { code: "code-inconnu", message: "m" } }),
      () => json({ ok: false, error: { code: "internal" } }),
      () => json({ ok: "oui" }),
    ]
    for (const respond of unreadable) {
      const { fetchImpl } = fakeFetch(respond)
      const outcome = await requestLandingGeneration(brief, fetchImpl)
      assert.equal(outcome.status, "error")
      if (outcome.status === "error") assert.equal(outcome.error.code, "invalid-response")
    }
  })

  test("la configuration reçue est revalidée avant d'atteindre le renderer", async () => {
    const withExtra = { ...config, sections: config.sections.map((section) => ({ ...section, props: { ...section.props, style: { color: "red" } } })) }
    const { fetchImpl } = fakeFetch(() => json({ ok: true, config: withExtra }))
    assert.equal((await requestLandingGeneration(brief, fetchImpl)).status, "error")
  })
})

describe("état de la page", () => {
  const apiError: PublicGenerationError = { code: "unavailable", message: "Indisponible." }
  const loading = generatorReducer(initialGeneratorState, { type: "start" })

  test("EMPTY : état initial, aucune configuration, aucune erreur", () => {
    assert.deepEqual(initialGeneratorState, { status: "idle", config: null, error: null })
  })

  test("LOADING : start passe en chargement et efface l'erreur", () => {
    assert.deepEqual(loading, { status: "loading", config: null, error: null })
    const afterError: GeneratorState = { status: "error", config, error: apiError }
    assert.deepEqual(generatorReducer(afterError, { type: "start" }), { status: "loading", config, error: null })
  })

  test("pas de double soumission : start pendant un appel ne change rien (même objet)", () => {
    assert.equal(generatorReducer(loading, { type: "start" }), loading)
  })

  test("SUCCESS : la configuration devient l'état courant", () => {
    assert.deepEqual(generatorReducer(loading, { type: "success", config }), { status: "success", config, error: null })
  })

  test("ERROR sans résultat précédent : erreur affichée, aperçu toujours vide", () => {
    assert.deepEqual(generatorReducer(loading, { type: "failure", error: apiError }), { status: "error", config: null, error: apiError })
  })

  test("ERROR après un succès : la dernière configuration valide est conservée", () => {
    const success = generatorReducer(loading, { type: "success", config })
    const second = generatorReducer(success, { type: "start" })
    assert.equal(second.config, config, "l'aperçu reste affiché pendant la nouvelle génération")
    const failed = generatorReducer(second, { type: "failure", error: apiError })
    assert.deepEqual(failed, { status: "error", config, error: apiError })
    assert.equal(failed.config, config)
  })

  test("un succès ultérieur remplace la configuration et efface l'erreur", () => {
    const failed: GeneratorState = { status: "error", config, error: apiError }
    const other = { ...config, id: "autre-page", title: "Autre page" }
    const next = generatorReducer(generatorReducer(failed, { type: "start" }), { type: "success", config: other })
    assert.deepEqual(next, { status: "success", config: other, error: null })
  })

  test("un résultat tardif hors chargement est ignoré", () => {
    assert.equal(generatorReducer(initialGeneratorState, { type: "success", config }), initialGeneratorState)
    assert.equal(generatorReducer(initialGeneratorState, { type: "failure", error: apiError }), initialGeneratorState)
    const success: GeneratorState = { status: "success", config, error: null }
    assert.equal(generatorReducer(success, { type: "failure", error: apiError }), success)
  })

  test("le réducteur est pur : il n'altère pas l'état reçu", () => {
    const state: GeneratorState = { status: "error", config, error: apiError }
    const snapshot = JSON.stringify(state)
    generatorReducer(state, { type: "start" })
    assert.equal(JSON.stringify(state), snapshot)
  })
})

describe("canGenerate : validation légère", () => {
  test("les quatre champs doivent être renseignés ; le serveur reste l'autorité", () => {
    assert.equal(canGenerate(emptyGeneratorBrief), false)
    assert.equal(canGenerate({ ...emptyGeneratorBrief, objective: "discover-trainings" }), false)
    assert.equal(canGenerate(brief), true)
    for (const key of ["projectName", "brief", "audience", "objective"] as const) {
      assert.equal(canGenerate({ ...brief, [key]: "   " }), false, key)
      assert.equal(canGenerate({ ...brief, [key]: "" }), false, key)
    }
  })
})
