/**
 * Pipeline Claude de la génération Landing, SANS réseau : le client
 * `messages.create` est simulé. Un garde-fou fait échouer toute la suite si
 * `fetch` est appelé.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { buildLandingAiPrompt, buildLandingPromptContext } from "../ai-prompt"
import {
  DEFAULT_LANDING_MODEL,
  generateLandingFromPrompt,
  generateLandingWithClaude,
  LANDING_MAX_TOKENS,
  resolveLandingModel,
  type LandingClaudeClient,
  type LandingGenerationError,
  type LandingGenerationResult,
} from "../anthropic"
import { toAnthropicJsonSchema } from "../anthropic-schema"
import { resolveLandingDraft } from "../draft-resolver"
import { context, draftCta, draftOf, draftSection, prompt, request, validDraft } from "./fixtures"

type Call = Anthropic.MessageCreateParamsNonStreaming

const root = process.cwd()
// Construite à l'exécution : aucune clé, même factice, n'est écrite en dur dans le dépôt.
const FAKE_KEY = ["sk-ant", "api03", "x".repeat(24)].join("-")
const OTHER_FAKE_KEY = ["sk-ant", "api03", "ABCDEFGHIJKLMNOP"].join("-")

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

/** Client simulé : enregistre les appels, répond ou lève. */
function fakeClient(respond: (params: Call) => unknown) {
  const calls: Call[] = []
  const client: LandingClaudeClient = {
    messages: {
      create: async (params) => {
        calls.push(params)
        return respond(params) as Anthropic.Message
      },
    },
  }
  return { calls, client }
}

const message = (text: string | null, over: Record<string, unknown> = {}) =>
  ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_LANDING_MODEL,
    content: text === null ? [] : [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 2400,
      output_tokens: 1800,
      output_tokens_details: { thinking_tokens: 300 },
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    },
    ...over,
  }) as unknown as Anthropic.Message

const reply = (output: unknown, over: Record<string, unknown> = {}) => message(JSON.stringify(output), over)

const apiError = (status: number, type: string, text = "détail", headers: Record<string, string> = { "request-id": "req_test" }) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type, message: text } }, `${status} ${text}`, new Headers(headers))

async function run(respond: (params: Call) => unknown, input: unknown = request, env: Record<string, string | undefined> = {}) {
  const { calls, client } = fakeClient(respond)
  const result = await generateLandingWithClaude(input, { client, env })
  return { calls, result }
}

function failed(result: LandingGenerationResult): LandingGenerationError {
  assert.equal(result.status, "error", JSON.stringify(result))
  return result.status === "error" ? result.error : (undefined as never)
}

/* -------------------------------------------------------------------------- */

describe("succès", () => {
  test("requête valide → un seul appel → LandingPageConfig validée", async () => {
    const { calls, result } = await run(() => reply(validDraft()))
    assert.equal(calls.length, 1)
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    // Le brouillon de Claude, puis sa résolution déterministe : jamais le JSON de Claude pris pour la config.
    assert.deepEqual(result.draft, validDraft())
    const resolution = resolveLandingDraft(request, result.draft, context)
    assert.ok(resolution.status === "resolved")
    assert.deepEqual(result.config, resolution.config)
    assert.notDeepEqual(result.config, result.draft)
    assert.equal(result.config.version, 1)
    assert.equal(result.config.id, "reconversion-rh")
    assert.deepEqual(result.config.sections.map((entry) => entry.id), ["editorial-hero", "pillars", "value-props"])
    assert.equal(result.model, DEFAULT_LANDING_MODEL)
    assert.equal(result.stopReason, "end_turn")
    assert.deepEqual(result.usage, { inputTokens: 2400, outputTokens: 1800, thinkingTokens: 300, cacheReadTokens: null, cacheCreationTokens: null })
  })

  test("forme exacte de messages.create : modèle, max_tokens, system, user, output_config.format", async () => {
    const { calls } = await run(() => reply(validDraft()))
    const [params] = calls
    assert.deepEqual(Object.keys(params!).sort(), ["max_tokens", "messages", "model", "output_config", "system"])
    assert.equal(params!.model, DEFAULT_LANDING_MODEL)
    assert.equal(params!.max_tokens, LANDING_MAX_TOKENS)
    assert.equal(params!.system, prompt.system)
    assert.deepEqual(params!.messages, [{ role: "user", content: prompt.user }])
    assert.deepEqual(JSON.parse(params!.messages[0]!.content as string), { request: prompt.request, context: buildLandingPromptContext(prompt.context) })
  })

  test("le schéma envoyé est celui du brouillon, adapté ; le schéma complet de LandingPageConfig n'est plus envoyé", async () => {
    const { calls } = await run(() => reply(validDraft()))
    const sent = calls[0]!.output_config!.format!.schema
    const serialized = JSON.stringify(sent)
    assert.deepEqual(Object.keys(sent.properties as object), ["sections"])
    for (const sections of ["section", "items", "cta", "destination", "image"]) assert.ok(serialized.includes(`"${sections}"`), sections)
    for (const technical of ["version", "href", "src", "alt", "logo", "badge", "icon", "position", "defaultValue", "primaryAction", "visual", "props"]) {
      assert.ok(!serialized.includes(`"${technical}"`), technical)
    }
    const consts = [...serialized.matchAll(/"const":"([^"]+)"/g)].map((match) => match[1])
    assert.deepEqual(consts.sort(), context.sections.map((entry) => entry.type).sort())
  })

  test("le schéma Anthropic (adapté) est bien celui passé dans output_config.format", async () => {
    const { calls } = await run(() => reply(validDraft()))
    const config = calls[0]!.output_config!
    assert.deepEqual(Object.keys(config), ["format"])
    assert.equal(config.format!.type, "json_schema")
    assert.deepEqual(config.format!.schema, toAnthropicJsonSchema(prompt.outputSchema as unknown as Record<string, unknown>))
    const sent = JSON.stringify(config.format!.schema)
    assert.ok(!sent.includes('"oneOf"') && !sent.includes('"\\\\S"') && !sent.includes("exclusiveMinimum") && !sent.includes('"$schema"'))
    assert.notDeepEqual(config.format!.schema, prompt.outputSchema)
  })

  test("aucun réglage hors besoin : ni température, ni tools, ni thinking, ni effort", async () => {
    const { calls } = await run(() => reply(validDraft()))
    for (const key of ["temperature", "top_p", "top_k", "tools", "tool_choice", "thinking", "stream", "metadata", "cache_control", "stop_sequences"]) {
      assert.ok(!(key in calls[0]!), key)
    }
  })
})

describe("modèle configurable, défini en un seul endroit", () => {
  test("ANTHROPIC_MODEL prime, sinon le modèle par défaut vérifié", async () => {
    assert.equal(DEFAULT_LANDING_MODEL, "claude-sonnet-5-5")
    assert.equal(resolveLandingModel({}), DEFAULT_LANDING_MODEL)
    assert.equal(resolveLandingModel({ ANTHROPIC_MODEL: "   " }), DEFAULT_LANDING_MODEL)
    assert.equal(resolveLandingModel({ ANTHROPIC_MODEL: " claude-autre " }), "claude-autre")
    const { calls } = await run(() => reply(validDraft()), request, { ANTHROPIC_MODEL: "claude-autre" })
    assert.equal(calls[0]!.model, "claude-autre")
    const { calls: defaultCalls } = await run(() => reply(validDraft()), request, { ANTHROPIC_MODEL: "" })
    assert.equal(defaultCalls[0]!.model, DEFAULT_LANDING_MODEL)
  })

  test("le modèle qui répond est celui rapporté", async () => {
    const { result } = await run(() => reply(validDraft(), { model: "claude-reponse" }))
    assert.ok(result.status === "success" && result.model === "claude-reponse")
  })

  test("l'identifiant n'est écrit qu'une fois dans le code Landing", () => {
    const hits = landingSources().filter((path) => readFileSync(join(root, path), "utf8").includes('"claude-sonnet-5-5"'))
    assert.deepEqual(hits, ["lib/landing/anthropic.ts"])
  })
})

describe("aucun appel quand la demande ne peut pas aboutir", () => {
  test("invalid-request → zéro appel", async () => {
    for (const input of [null, "brief", {}, { ...request, brief: "  " }, { ...request, objective: "contact" }, { ...request, className: "x" }]) {
      const { calls, result } = await run(() => reply(validDraft()), input)
      assert.equal(calls.length, 0, JSON.stringify(input))
      const error = failed(result)
      assert.equal(error.kind, "invalid-request")
      assert.ok(error.issues && error.issues.length > 0)
    }
  })

  test("impossible → zéro appel", async () => {
    const { calls, client } = fakeClient(() => reply(validDraft()))
    const result = await generateLandingFromPrompt({ status: "impossible", context, reasons: ["Aucune section candidate."] }, { client, env: {} })
    assert.equal(calls.length, 0)
    assert.deepEqual([failed(result).kind, failed(result).message], ["impossible", "Aucune section candidate."])
  })

  test("clé absente → erreur explicite, zéro appel", async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: "" }, { ANTHROPIC_API_KEY: "   " }]) {
      const result = await generateLandingWithClaude(request, { env })
      const error = failed(result)
      assert.equal(error.kind, "missing-api-key")
      assert.match(error.message, /ANTHROPIC_API_KEY/)
    }
  })

  test("invalid-request prime sur la clé absente : aucun secret n'est requis pour juger la demande", async () => {
    assert.equal(failed(await generateLandingWithClaude(null, { env: {} })).kind, "invalid-request")
  })
})

describe("réponse inexploitable", () => {
  test("sans texte : content vide, bloc de réflexion seul, texte blanc", async () => {
    for (const response of [message(null), message("   "), message(null, { content: [{ type: "thinking", thinking: "…", signature: "s" }] })]) {
      const { calls, result } = await run(() => response)
      assert.equal(calls.length, 1)
      assert.equal(failed(result).kind, "empty-output")
    }
  })

  test("JSON invalide : erreur typée, texte conservé pour inspection serveur", async () => {
    for (const text of ["{ pas du json", "```json\n{}\n```", "Voici la page :"]) {
      const error = failed((await run(() => message(text))).result)
      assert.equal(error.kind, "invalid-json")
      assert.equal(error.output, text)
    }
  })

  test("le texte de plusieurs blocs est joint ; la réflexion est ignorée", async () => {
    const json = JSON.stringify(validDraft())
    const content = [
      { type: "thinking", thinking: "…", signature: "s" },
      { type: "text", text: json.slice(0, 40), citations: null },
      { type: "text", text: json.slice(40), citations: null },
    ]
    assert.equal((await run(() => message(null, { content }))).result.status, "success")
  })
})

describe("brouillon invalide : refusé avant toute résolution", () => {
  const hero = draftSection["editorial-hero"]()
  const cases: [string, unknown, RegExp][] = [
    ["propriété inconnue (className)", draftOf({ ...hero, className: "text-red-500" }), /./],
    ["section inconnue", draftOf({ ...hero, section: "product-grid" }), /./],
    ["image inventée", draftOf({ ...hero, image: "hero-inventee" }), /image/],
    ["chemin d'image brut", draftOf({ ...hero, image: "/images/hero-bilan.jpg" }), /image/],
    ["destination inventée", draftOf({ ...hero, cta: { ...draftCta, destination: "inventee" } }), /destination/],
    ["href brut", draftOf({ ...hero, cta: { label: "Voir", href: "https://www.studi.com/fr/formations" } }), /destination|href/],
    ["ancre interne", draftOf({ ...hero, cta: { label: "Voir", destination: "#pillars" } }), /destination/],
    ["texte vide", draftOf({ ...hero, title: "   " }), /vide/],
    ["liste vide", draftOf(draftSection["value-props"](), { ...draftSection.pillars(), items: [] }), /élément/],
    ["LandingPageConfig complète au lieu d'un brouillon", { version: 1, id: "x", title: "x", sections: [{ id: "hero", type: "editorial-hero", props: {} }] }, /./],
    ["JSON valide qui n'est pas un objet", [validDraft()], /./],
  ]
  for (const [name, output, expected] of cases) {
    test(`${name} → invalid-draft, un seul appel, aucune relance`, async () => {
      const { calls, result } = await run(() => reply(output))
      assert.equal(calls.length, 1)
      const error = failed(result)
      assert.equal(error.kind, "invalid-draft")
      assert.ok(error.issues!.length > 0 && error.issues!.every((issue) => issue.path && issue.message))
      assert.match(JSON.stringify(error.issues), expected)
      assert.equal(error.output, JSON.stringify(output))
      assert.equal(error.resolved, undefined)
    })
  }

  test("une LandingPageConfig valide n'est JAMAIS acceptée comme brouillon : le JSON de Claude n'est pas la config", async () => {
    const config = { version: 1, id: "reconversion-rh", title: "Reconversion RH", sections: [{ id: "hero", type: "editorial-hero", props: { title: "x" } }] }
    assert.equal(failed((await run(() => reply(config))).result).kind, "invalid-draft")
  })
})

describe("résolution impossible : un brouillon valide, des ressources absentes", () => {
  const narrow = (mutate: (ready: typeof prompt) => typeof prompt) => mutate(prompt)
  const cases: [string, typeof prompt, string, RegExp][] = [
    ["image absente du contexte", narrow((ready) => ({ ...ready, context: { ...ready.context, images: ready.context.images.filter((image) => image.id !== "hero-apprenante") } })), "sections.0.image", /hero-apprenante/],
    ["destination absente du contexte", narrow((ready) => ({ ...ready, context: { ...ready.context, destinations: ready.context.destinations.filter((destination) => destination.id !== "catalogue-formations") } })), "sections.0.cta.destination", /catalogue-formations/],
    ["section non candidate", narrow((ready) => ({ ...ready, context: { ...ready.context, sections: ready.context.sections.filter((entry) => entry.type !== "pillars") } })), "sections.1.section", /pillars/],
  ]
  for (const [name, fabricated, path, expected] of cases) {
    test(`${name} → draft-resolution, un seul appel, aucune validation finale`, async () => {
      const { calls, client } = fakeClient(() => reply(validDraft()))
      const result = await generateLandingFromPrompt(fabricated, { client, env: {} })
      assert.equal(calls.length, 1)
      const error = failed(result)
      assert.equal(error.kind, "draft-resolution")
      assert.ok(error.issues!.some((issue) => issue.path === path && expected.test(issue.message)), JSON.stringify(error.issues))
      assert.equal(error.output, JSON.stringify(validDraft()))
      assert.equal(error.resolved, undefined)
    })
  }
})

describe("configuration finale invalide : le contrat applicatif reste l'autorité", () => {
  test("hero qui n'est pas en tête → invalid-landing, avec la configuration résolue pour inspection", async () => {
    const draft = draftOf(draftSection["value-props"](), draftSection["editorial-hero"]())
    const { calls, result } = await run(() => reply(draft))
    assert.equal(calls.length, 1)
    const error = failed(result)
    assert.equal(error.kind, "invalid-landing")
    assert.match(JSON.stringify(error.issues), /première section/)
    assert.ok(error.issues!.some((issue) => issue.path === "sections.1.type"))
    assert.equal(error.output, JSON.stringify(draft))
    const resolved = error.resolved as { version: number; sections: { id: string }[] }
    assert.equal(resolved.version, 1)
    assert.deepEqual(resolved.sections.map((entry) => entry.id), ["value-props", "editorial-hero"])
  })

  test("deux heroes → invalid-landing", async () => {
    const draft = draftOf(draftSection["editorial-hero"](), draftSection["immersive-hero"]())
    const error = failed((await run(() => reply(draft))).result)
    assert.equal(error.kind, "invalid-landing")
    assert.match(JSON.stringify(error.issues), /seul hero/)
  })

  test("deux validations distinctes : le brouillon (invalid-draft), puis la configuration (invalid-landing)", async () => {
    const draftFailure = failed((await run(() => reply({ sections: [] }))).result)
    const finalFailure = failed((await run(() => reply(draftOf(draftSection.pillars(), draftSection["immersive-hero"]())))).result)
    assert.deepEqual([draftFailure.kind, finalFailure.kind], ["invalid-draft", "invalid-landing"])
  })

  test("un brouillon qui se résout en une page valide réussit, répétitions comprises", async () => {
    const draft = draftOf(draftSection["immersive-hero"](), draftSection.pillars(), draftSection.pillars(), draftSection["audience-switcher"]())
    const { result } = await run(() => reply(draft))
    assert.equal(result.status, "success")
    if (result.status === "success") assert.deepEqual(result.config.sections.map((entry) => entry.id), ["immersive-hero", "pillars", "pillars-2", "audience-switcher"])
  })
})

describe("arrêts du modèle", () => {
  test("refusal : erreur typée avec la catégorie, même si un JSON valide l'accompagne", async () => {
    const { calls, result } = await run(() => reply(validDraft(), { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } }))
    assert.equal(calls.length, 1)
    const error = failed(result)
    assert.equal(error.kind, "refusal")
    assert.match(error.message, /cyber/)
    assert.deepEqual(error.usage?.inputTokens, 2400)
  })

  test("max_tokens : réponse tronquée, jamais validée même si elle ressemble à un JSON complet", async () => {
    assert.equal(failed((await run(() => reply(validDraft(), { stop_reason: "max_tokens" }))).result).kind, "truncated")
    assert.equal(failed((await run(() => message('{"version":1,"id":', { stop_reason: "max_tokens" }))).result).kind, "truncated")
  })

  test("tout autre arrêt que end_turn : interrompu", async () => {
    for (const stop_reason of ["pause_turn", "tool_use", "model_context_window_exceeded", null]) {
      assert.equal(failed((await run(() => reply(validDraft(), { stop_reason }))).result).kind, "interrupted", String(stop_reason))
    }
  })
})

describe("erreurs de l'API Anthropic", () => {
  const table: [string, () => unknown, string, number | undefined][] = [
    ["authentification 401", () => apiError(401, "authentication_error"), "authentication", 401],
    ["permission 403", () => apiError(403, "permission_error"), "authentication", 403],
    ["rate limit 429", () => apiError(429, "rate_limit_error"), "rate-limit", 429],
    ["requête rejetée 400", () => apiError(400, "invalid_request_error", "schema too complex"), "rejected", 400],
    ["modèle introuvable 404", () => apiError(404, "not_found_error", "model: claude-faux"), "rejected", 404],
    ["erreur serveur 500", () => apiError(500, "api_error"), "server", 500],
    ["indisponible 503", () => apiError(503, "api_error"), "server", 503],
    ["surcharge 529", () => apiError(529, "overloaded_error"), "server", 529],
    ["délai dépassé", () => new Anthropic.APIConnectionTimeoutError(), "timeout", undefined],
    ["connexion impossible", () => new Anthropic.APIConnectionError({ message: "ECONNRESET" }), "network", undefined],
    ["autre statut 418", () => apiError(418, "teapot"), "api-error", 418],
    ["erreur inattendue", () => new TypeError("bug interne"), "unexpected", undefined],
    ["valeur levée non-Error", () => "chaîne", "unexpected", undefined],
  ]
  for (const [name, thrown, kind, status] of table) {
    test(`${name} → ${kind}, un seul appel, aucune relance`, async () => {
      const { calls, result } = await run(() => {
        throw thrown()
      })
      assert.equal(calls.length, 1)
      const error = failed(result)
      assert.equal(error.kind, kind)
      assert.equal(error.status, status)
      assert.ok(error.message.length > 0)
    })
  }

  test("identifiant de requête transmis pour le support", async () => {
    const error = failed((await run(() => { throw apiError(429, "rate_limit_error", "x", { "request-id": "req_abc123" }) })).result)
    assert.equal(error.requestId, "req_abc123")
  })

  test("surcharge 529 distinguée dans le message", async () => {
    assert.match(failed((await run(() => { throw apiError(529, "overloaded_error") })).result).message, /surchargé/)
  })
})

describe("secrets et prompt", () => {
  test("la clé est masquée dans les messages d'erreur, et ne sort jamais", async () => {
    const leaky = apiError(400, "invalid_request_error", `clé ${FAKE_KEY} refusée, autre ${OTHER_FAKE_KEY}`)
    const { result } = await run(() => { throw leaky }, request, { ANTHROPIC_API_KEY: FAKE_KEY })
    const serialized = JSON.stringify(result)
    assert.ok(!serialized.includes(FAKE_KEY) && !/sk-ant-[A-Za-z0-9_-]{10,}/.test(serialized))
    assert.match(failed(result).message, /\[clé masquée\]/)
  })

  test("les messages de l'API sont bornés", async () => {
    const { result } = await run(() => { throw apiError(400, "invalid_request_error", "x".repeat(5000)) })
    assert.ok(failed(result).message.length < 700)
  })

  test("ni le prompt système, ni la clé dans aucun résultat", async () => {
    const outcomes = [
      (await run(() => reply(validDraft()), request, { ANTHROPIC_API_KEY: FAKE_KEY })).result,
      (await run(() => message("{"), request, { ANTHROPIC_API_KEY: FAKE_KEY })).result,
      (await run(() => { throw apiError(500, "api_error") }, request, { ANTHROPIC_API_KEY: FAKE_KEY })).result,
      await generateLandingWithClaude(request, { env: {} }),
    ]
    for (const result of outcomes) {
      const serialized = JSON.stringify(result)
      assert.ok(!serialized.includes(prompt.system.slice(0, 60)), serialized.slice(0, 80))
      assert.ok(!serialized.includes(FAKE_KEY))
    }
  })

  test("l'appel est unique et sans relance du SDK", () => {
    const source = readFileSync(join(root, "lib/landing/anthropic.ts"), "utf8")
    // Dans l'appel du constructeur, pas dans un commentaire.
    assert.match(source, /new Anthropic\(\{[^}]*maxRetries: 0/)
    assert.equal((source.match(/messages\.create\(/g) ?? []).length, 1)
  })
})

describe("garde-fous du dépôt", () => {
  test("aucune variable NEXT_PUBLIC liée à Anthropic, aucune clé en dur", () => {
    const files = [...landingSources(), ...walk("app"), ...walk("components"), "package.json"]
    for (const path of files) {
      const source = readFileSync(join(root, path), "utf8")
      assert.ok(!/NEXT_PUBLIC_ANTHROPIC/i.test(source), path)
      assert.ok(!/sk-ant-[A-Za-z0-9_-]{10,}/.test(source), path)
    }
    // Les tests non plus : aucune clé, même factice, en toutes lettres.
    for (const path of walk("lib/landing/tests")) {
      assert.ok(!/sk-ant-[A-Za-z0-9_-]{10,}/.test(readFileSync(join(root, path), "utf8")), path)
    }
    assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /^\.env\*/m)
  })

  test("serveur seulement : ni app/ ni composants n'importent le module Anthropic, aucun composant client non plus", () => {
    for (const path of [...walk("app"), ...walk("components"), ...walk("lib").filter((file) => !file.startsWith("lib/landing/") && !file.startsWith("lib/email/"))]) {
      const source = readFileSync(join(root, path), "utf8")
      assert.ok(!/landing\/anthropic|@anthropic-ai\/sdk/.test(source), path)
    }
    for (const path of landingSources()) {
      const source = readFileSync(join(root, path), "utf8")
      if (/^["']use client["']/.test(source.trimStart())) assert.ok(!/anthropic/i.test(source), path)
    }
  })

  test("le smoke test n'est lancé par aucun script de test, de lint ni de build", () => {
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>
    for (const name of ["test:landing", "test:email", "lint", "build"]) assert.ok(!/smoke|anthropic/i.test(scripts[name]!), name)
    assert.match(scripts["smoke:landing"]!, /smoke-test\.ts/)
    for (const path of walk("lib/landing/tests")) assert.ok(!/smoke-test/.test(readFileSync(join(root, path), "utf8")) || path.endsWith("anthropic-pipeline.test.ts"), path)
    assert.ok(!/\.test\.ts$/.test("lib/landing/smoke-test.ts"))
  })

  test("la requête de test est celle d'un prompt réel", () => {
    assert.equal(buildLandingAiPrompt(request).status, "ready")
  })
})

/* -------------------------------------------------------------------------- */

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) return walk(path)
    return /\.(ts|tsx|mjs)$/.test(name) ? [path] : []
  })
}

/** Sources Landing hors tests : modules et smoke test. */
function landingSources(): string[] {
  return readdirSync(join(root, "lib/landing"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join("lib/landing", name))
}
