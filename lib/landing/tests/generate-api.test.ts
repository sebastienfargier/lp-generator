/**
 * POST /api/generate, sans réseau : le moteur est injecté. Le navigateur ne
 * reçoit que la configuration ou une erreur courte, jamais le diagnostic.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { generateLandingWithClaude, type LandingGenerationError, type LandingGenerationErrorKind, type LandingGenerationResult } from "../anthropic"
import { handleLandingGeneration, publicErrors, type LandingEngine } from "../generate-handler"
import { publicErrorCodes } from "../public-api"
import { LandingPageSchema } from "../schemas"
import { context, prompt, request, validDraft } from "./fixtures"
import { resolveLandingDraft } from "../draft-resolver"
import { generationDraftFor } from "./generate-fixtures"

const root = process.cwd()
// Construite à l'exécution : aucune clé, même factice, n'est écrite en dur dans le dépôt.
const FAKE_KEY = ["sk-ant", "api03", "XXXXXXXXXXXXXXXX"].join("-")
const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const resolution = resolveLandingDraft(request, generationDraftFor(validDraft()), context)
assert.ok(resolution.status === "resolved")
const config = resolution.config

const post = (body: unknown, raw = false) =>
  new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) })

/** Appelle la route avec un moteur simulé et un journal muet ; compte les appels du moteur. */
async function call(input: Request, engine: LandingEngine = async () => ({ status: "success", config } as never)) {
  const engineCalls: unknown[] = []
  const logs: unknown[] = []
  const response = await handleLandingGeneration(input, {
    engine: async (value) => {
      engineCalls.push(value)
      return engine(value)
    },
    log: (entry) => logs.push(entry),
  })
  const text = await response.text()
  return { response, text, body: JSON.parse(text) as Record<string, unknown>, engineCalls, logs }
}

/** Erreur de moteur bourrée de diagnostic interne, pour prouver qu'il ne sort pas. */
const leakyError = (kind: LandingGenerationErrorKind): LandingGenerationResult => ({
  status: "error",
  error: {
    kind,
    message: `MESSAGE-INTERNE ${FAKE_KEY}`,
    issues: [{ path: "sections.0.secret", message: "ISSUE-INTERNE" }],
    status: 418,
    requestId: "req_SECRET123",
    usage: { inputTokens: 5662, outputTokens: 700, thinkingTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    output: "SORTIE-BRUTE-DU-MODELE",
    resolved: { fuite: "CONFIG-RESOLUE-REFUSEE" },
  } satisfies LandingGenerationError,
})

describe("requête valide → configuration seule", () => {
  test("200 avec { ok: true, config }, rien d'autre ; un seul appel du moteur, avec la requête validée", async () => {
    const { response, body, engineCalls, logs } = await call(post(request))
    assert.equal(response.status, 200)
    assert.deepEqual(Object.keys(body), ["ok", "config"])
    assert.equal(body.ok, true)
    assert.deepEqual(body.config, config)
    assert.ok(LandingPageSchema.safeParse(body.config).success)
    assert.equal(engineCalls.length, 1)
    assert.deepEqual(engineCalls[0], request)
    assert.deepEqual(logs, [])
    assert.equal(response.headers.get("Cache-Control"), "no-store")
    assert.match(response.headers.get("Content-Type") ?? "", /application\/json/)
  })

  test("aucune fuite : ni brouillon, ni prompt, ni contexte, ni tokens, ni identifiant, ni modèle", async () => {
    const full = { status: "success", config, draft: validDraft(), model: "claude-sonnet-5-5", stopReason: "end_turn", requestId: "req_SECRET123", usage: { inputTokens: 5662, outputTokens: 700 } }
    const { text } = await call(post(request), async () => full as never)
    for (const hidden of ["draft", "req_SECRET123", "inputTokens", "outputTokens", "usage", "claude-sonnet-5-5", "end_turn", "stopReason", "destination", prompt.system.slice(0, 40)]) {
      assert.ok(!text.includes(hidden), hidden)
    }
    assert.ok(!text.includes('"supportingText":"Une reconversion se prépare."') || text.includes('"config"'))
  })

  test("des faits validés sont transmis au moteur ; une clé inconnue est refusée sans appel", async () => {
    const withFacts = { ...request, facts: [{ label: "Format", value: "100 % en ligne" }] }
    assert.deepEqual((await call(post(withFacts))).engineCalls[0], withFacts)
    const extra = await call(post({ ...request, className: "x" }))
    assert.equal(extra.response.status, 400)
    assert.equal(extra.engineCalls.length, 0)
  })
})

describe("requête invalide → 400, aucun appel du moteur", () => {
  const cases: [string, Request][] = [
    ["JSON illisible", post("{ pas du json", true)],
    ["corps vide", post("", true)],
    ["JSON qui n'est pas un objet", post([request])],
    ["null", post(null)],
    ["brief vide", post({ ...request, brief: "   " })],
    ["nom du projet absent", post({ brief: request.brief, audience: request.audience, objective: request.objective })],
    ["audience trop longue", post({ ...request, audience: "x".repeat(301) })],
    ["corps démesuré", post("x".repeat(100_001), true)],
  ]
  for (const [name, input] of cases) {
    test(`${name}`, async () => {
      const { response, body, engineCalls } = await call(input)
      assert.equal(response.status, 400)
      assert.equal(engineCalls.length, 0)
      assert.equal(body.ok, false)
      const error = body.error as { code: string; message: string }
      assert.equal(error.code, "invalid-request")
      assert.match(error.message, /vérifiez/)
    })
  }

  test("champs fautifs signalés, avec leur chemin dans le formulaire", async () => {
    const { body } = await call(post({ ...request, brief: "", audience: "  " }))
    const fields = (body.error as { fields: { path: string; message: string }[] }).fields
    assert.deepEqual(fields.map((field) => field.path).sort(), ["audience", "brief"])
    assert.ok(fields.every((field) => field.message.length > 0))
  })

  test("problème à la racine de la requête (clé inconnue) : signalé sans l'attribuer à un champ du formulaire", async () => {
    const { body } = await call(post({ ...request, className: "x" }))
    const fields = (body.error as { fields: { path: string }[] }).fields
    assert.deepEqual(fields.map((field) => field.path), ["requête"])
  })

  test("objectif non pris en charge : refusé, y compris les trois objectifs historiques du formulaire", async () => {
    for (const objective of ["lead-generation", "documentation-download", "contact", "vente", ""]) {
      const { response, body, engineCalls } = await call(post({ ...request, objective }))
      assert.equal(response.status, 400, objective)
      assert.equal(engineCalls.length, 0, objective)
      assert.ok((body.error as { fields: { path: string }[] }).fields.some((field) => field.path === "objective"), objective)
    }
    assert.equal((await call(post({ ...request, objective: "discover-trainings" }))).response.status, 200)
  })
})

describe("traduction des erreurs du moteur en erreurs publiques", () => {
  const table: Record<LandingGenerationErrorKind, [number, string]> = {
    "invalid-request": [400, "invalid-request"],
    impossible: [500, "configuration"],
    "missing-api-key": [500, "configuration"],
    authentication: [500, "configuration"],
    "rate-limit": [429, "rate-limit"],
    rejected: [500, "internal"],
    server: [503, "unavailable"],
    "api-error": [502, "unavailable"],
    timeout: [504, "timeout"],
    network: [502, "network"],
    refusal: [422, "refused"],
    truncated: [422, "generation-failed"],
    interrupted: [422, "generation-failed"],
    "empty-output": [422, "generation-failed"],
    "invalid-json": [422, "generation-failed"],
    "invalid-draft": [422, "generation-failed"],
    "draft-resolution": [422, "generation-failed"],
    "invalid-landing": [422, "generation-failed"],
    unexpected: [500, "internal"],
  }

  for (const [kind, [status, code]] of Object.entries(table) as [LandingGenerationErrorKind, [number, string]][]) {
    test(`${kind} → HTTP ${status}, ${code}`, async () => {
      const { response, body, engineCalls } = await call(post(request), async () => leakyError(kind))
      assert.equal(response.status, status)
      assert.equal(engineCalls.length, 1, "un seul appel, aucune relance")
      assert.equal(body.ok, false)
      const error = body.error as Record<string, unknown>
      assert.equal(error.code, code)
      assert.equal(error.message, publicErrors[kind].message)
      assert.ok((publicErrorCodes as readonly string[]).includes(code))
    })
  }

  test("la table est complète et sans doublon d'intention : chaque erreur du moteur a une traduction", () => {
    assert.deepEqual(Object.keys(publicErrors).sort(), Object.keys(table).sort())
  })

  test("messages courts, en français, sans jargon technique", () => {
    for (const mapping of Object.values(publicErrors)) {
      assert.ok(mapping.message.length > 20 && mapping.message.length < 130, mapping.message)
      assert.ok(!/anthropic|claude|api|sdk|token|json|schema|draft|brouillon|prompt|http|clé/i.test(mapping.message), mapping.message)
    }
  })

  test("aucune fuite : ni sortie brute, ni diagnostic, ni identifiant, ni clé, ni détail du moteur", async () => {
    for (const kind of Object.keys(table) as LandingGenerationErrorKind[]) {
      const { text } = await call(post(request), async () => leakyError(kind))
      for (const hidden of ["SORTIE-BRUTE", "CONFIG-RESOLUE", "MESSAGE-INTERNE", "ISSUE-INTERNE", "req_SECRET", "sk-ant", "inputTokens", "usage", "requestId", "resolved", "sections.0.secret", "output", prompt.system.slice(0, 40)]) {
        assert.ok(!text.includes(hidden), `${kind} : ${hidden}`)
      }
      const error = (JSON.parse(text) as { error: Record<string, unknown> }).error
      assert.deepEqual(Object.keys(error).sort(), ["code", "message"], kind)
    }
  })

  test("les champs fautifs viennent de la validation de la requête, jamais du moteur", async () => {
    for (const kind of Object.keys(table) as LandingGenerationErrorKind[]) {
      const { body } = await call(post(request), async () => leakyError(kind))
      assert.ok(!("fields" in (body.error as Record<string, unknown>)), kind)
    }
    const { body } = await call(post({ ...request, brief: "" }))
    assert.ok("fields" in (body.error as Record<string, unknown>))
  })

  test("le moteur qui lève une exception : 500 générique, rien de l'exception ne sort, un seul appel", async () => {
    const { response, text, engineCalls, logs } = await call(post(request), async () => {
      throw new TypeError("BUG-INTERNE avec la pile")
    })
    assert.equal(response.status, 500)
    assert.equal(engineCalls.length, 1)
    assert.ok(!text.includes("BUG-INTERNE") && !text.includes("TypeError") && !text.includes("stack"))
    assert.deepEqual(logs, [{ kind: "engine-threw" }])
  })

  test("journal serveur : type, statut et identifiant de requête seulement, jamais le contenu", async () => {
    const { logs } = await call(post(request), async () => leakyError("rate-limit"))
    assert.deepEqual(logs, [{ kind: "rate-limit", status: 418, requestId: "req_SECRET123" }])
    assert.ok(!JSON.stringify(logs).includes("SORTIE-BRUTE") && !JSON.stringify(logs).includes("sk-ant"))
  })
})

describe("avec le vrai moteur et un client Anthropic simulé", () => {
  const messageOf = (output: unknown, over: Record<string, unknown> = {}) =>
    ({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text: JSON.stringify(output), citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 5662, output_tokens: 700, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
      ...over,
    }) as unknown as Anthropic.Message

  async function withClient(respond: () => unknown) {
    const calls: unknown[] = []
    const engine: LandingEngine = (input) =>
      generateLandingWithClaude(input, {
        env: {},
        client: {
          messages: {
            create: async (params) => {
              calls.push(params)
              return respond() as Anthropic.Message
            },
          },
        },
      })
    const result = await call(post(request), engine)
    return { ...result, anthropicCalls: calls }
  }

  test("brouillon valide → un appel Anthropic → 200 avec la config résolue, pas le brouillon", async () => {
    const { response, body, anthropicCalls, text } = await withClient(() => messageOf(validDraft()))
    assert.equal(response.status, 200)
    assert.equal(anthropicCalls.length, 1)
    assert.deepEqual(Object.keys(body), ["ok", "config"])
    assert.ok(LandingPageSchema.safeParse(body.config).success)
    assert.equal((body.config as { version: number }).version, 1)
    assert.ok(!text.includes('"section":"editorial-hero"'), "le brouillon ne sort pas")
  })

  test("erreurs Anthropic → statuts publics : rate limit, délai, authentification, surcharge", async () => {
    const apiError = (status: number, type: string) => Anthropic.APIError.generate(status, { type: "error", error: { type, message: "détail interne" } }, `${status} détail interne`, new Headers({ "request-id": "req_SECRET123" }))
    const cases: [() => unknown, number, string][] = [
      [() => { throw apiError(429, "rate_limit_error") }, 429, "rate-limit"],
      [() => { throw new Anthropic.APIConnectionTimeoutError() }, 504, "timeout"],
      [() => { throw new Anthropic.APIConnectionError({ message: "ECONNRESET" }) }, 502, "network"],
      [() => { throw apiError(401, "authentication_error") }, 500, "configuration"],
      [() => { throw apiError(529, "overloaded_error") }, 503, "unavailable"],
    ]
    for (const [respond, status, code] of cases) {
      const { response, body, anthropicCalls, text } = await withClient(respond)
      assert.equal(response.status, status)
      assert.equal(anthropicCalls.length, 1, "aucune relance")
      assert.equal((body.error as { code: string }).code, code)
      assert.ok(!text.includes("détail interne") && !text.includes("req_SECRET123"))
    }
  })

  test("brouillon invalide et configuration finale invalide → 422, sans fuite de la sortie", async () => {
    const invalidDraft = await withClient(() => messageOf({ sections: [], interne: "SORTIE-BRUTE" }))
    assert.equal(invalidDraft.response.status, 422)
    assert.ok(!invalidDraft.text.includes("SORTIE-BRUTE"))
    const lateHero = await withClient(() => messageOf({ sections: [validDraft().sections[2], validDraft().sections[0]] }))
    assert.equal(lateHero.response.status, 422)
    assert.equal((lateHero.body.error as { code: string }).code, "generation-failed")
    assert.ok(!lateHero.text.includes("editorial-hero") && !lateHero.text.includes("première section"))
  })

  test("clé absente → 500 configuration, aucun appel Anthropic", async () => {
    const result = await call(post(request), (input) => generateLandingWithClaude(input, { env: {} }))
    assert.equal(result.response.status, 500)
    assert.equal((result.body.error as { code: string }).code, "configuration")
    assert.ok(!result.text.includes("ANTHROPIC_API_KEY"))
  })
})

describe("la route Next", () => {
  const route = readFileSync(join(root, "app/api/generate/route.ts"), "utf8")

  test("n'exporte que POST, appelle le gestionnaire, et n'importe ni le SDK ni le moteur directement", () => {
    assert.deepEqual([...route.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map((match) => match[1]), ["POST"])
    assert.match(route, /handleLandingGeneration\(request\)/)
    assert.ok(!/@anthropic-ai\/sdk|landing\/anthropic"|process\.env/.test(route))
  })

  test("route Landing seulement : rien d'Email", () => {
    assert.ok(!/email/i.test(route.replace(/\/\*[\s\S]*?\*\//g, "")))
    assert.ok(!/email/i.test(readFileSync(join(root, "lib/landing/generate-handler.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")))
  })

  test("aucun accès à la clé dans le gestionnaire : seul le moteur la lit", () => {
    const handler = readFileSync(join(root, "lib/landing/generate-handler.ts"), "utf8")
    assert.ok(!/ANTHROPIC_API_KEY|process\.env/.test(handler.replace(/\/\*[\s\S]*?\*\//g, "")))
  })
})
