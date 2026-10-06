/**
 * POST /api/generate-email : le moteur Email V2 (simulé ici), jamais la démo
 * ni le moteur V1, sans réseau. Le navigateur ne reçoit que l'email rendu ou
 * une erreur courte. Les parcours complets avec un fournisseur simulé sont
 * dans `email-v2-runtime.test.ts`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type { EmailEngineError, EmailGenerationErrorKind } from "../anthropic"
import type { EmailV2EngineResult } from "../anthropic-v2"
import { emailDemoPresets, generateDemoEmail, defaultEmailBrief } from "../demo-generator"
import { emailPublicErrors, handleEmailGeneration, toEmailRecipeRequest, type EmailEngine, type EmailGenerateResponse } from "../generate-handler"
import { runEmailGeneration } from "../generation"
import { emailGeneratorExamples } from "../generator-examples"
import { toEmailRequestBody } from "../generator-form"
import { emailRecipeDraftFixtures, resolveEmailRecipeDraftFixture } from "../recipe-draft-fixtures"
import type { EmailRecipeRequest } from "../recipe-selection"
import { renderEmail } from "../renderer"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const orientation = emailGeneratorExamples.find((example) => example.id === "orientation")!
const body = toEmailRequestBody({ ...orientation.form, subject: "Et si vous exploriez de nouveaux métiers ?" })

const resolved = resolveEmailRecipeDraftFixture("D-R1-A").resolution
if (resolved.status !== "resolved") throw new Error("fixture non résolue")
const successResult: EmailV2EngineResult = {
  status: "success",
  config: resolved.config,
  recipe: "discovery-reassurance",
  diagnostics: [],
  model: "claude-sonnet-5-5",
  stopReason: "end_turn",
  requestId: "req_secret_123",
  usage: { inputTokens: 2800, outputTokens: 900, thinkingTokens: 100 },
}

/** Moteur simulé : enregistre les requêtes reçues. */
function fakeEngine(result: EmailV2EngineResult | (() => EmailV2EngineResult | Promise<EmailV2EngineResult>)) {
  const requests: EmailRecipeRequest[] = []
  const engine: EmailEngine = async (request) => {
    requests.push(request as EmailRecipeRequest)
    return typeof result === "function" ? result() : result
  }
  return { requests, engine }
}

const post = (payload: unknown, raw = false) =>
  new Request("http://localhost/api/generate-email", { method: "POST", body: raw ? (payload as string) : JSON.stringify(payload) })

async function call(payload: unknown, engine: EmailEngine, options: { raw?: boolean } = {}) {
  const logs: object[] = []
  const response = await handleEmailGeneration(post(payload, options.raw), { engine, log: (entry) => logs.push(entry) })
  return { response, json: (await response.json()) as EmailGenerateResponse & { code?: string }, logs }
}

const engineError = (kind: EmailGenerationErrorKind, over: Partial<EmailEngineError> = {}): EmailV2EngineResult => ({
  status: "error",
  error: { kind, message: "Détail interne : sk-ant-api03-secret", output: '{"brut":"json de Claude"}', requestId: "req_secret_123", status: 500, issues: [{ path: "blocks.0.cta.destination", message: "interne" }], ...over },
})

describe("route : le moteur V2, simulé", () => {
  test("un brief valide → UN appel au moteur, avec la requête V2 issue du formulaire → email rendu réel", async () => {
    const { requests, engine } = fakeEngine(successResult)
    const { response, json } = await call(body, engine)
    assert.equal(response.status, 200)
    assert.equal(requests.length, 1)
    assert.deepEqual(requests[0], {
      campaignName: orientation.form.campaignName,
      subject: "Et si vous exploriez de nouveaux métiers ?",
      brief: orientation.form.brief,
      audience: "Personnes en reconversion",
      target: "reconversion",
      intent: "discovery",
      objective: "decouverte-formations",
    })
    assert.equal(json.status, "success")
    if (json.status !== "success") return
    assert.equal(json.subject, resolved.config.subject)
    assert.equal(json.preheader, resolved.config.preheader)
    assert.equal(json.blockCount, resolved.config.blocks.length)
    assert.equal(json.html, renderEmail(resolved.config), "le renderer réel produit le HTML")
    assert.ok(json.html.includes("https://demo-assets.invalid/email-v2/"), "images de la banque V2 dans le HTML canonique")
    assert.ok(json.previewHtml.includes("/images/email/v2/") && !json.previewHtml.includes("demo-assets.invalid"), "aperçu : dérivés V2 résolus")
    assert.equal(response.headers.get("Cache-Control"), "no-store")
  })

  test("chaque intention du formulaire devient une requête V2 déterministe ; la cible contrôlée part avec son libellé", () => {
    const base = { campaignName: "C", brief: "B" }
    const request = (intent: string, target: string) => toEmailRecipeRequest({ ...base, intent, target } as never)
    assert.deepEqual(request("orientation", "alternants"), { ...base, audience: "Alternants", target: "alternants", intent: "discovery", objective: "decouverte-formations" })
    assert.deepEqual(request("accompagnement", "demandeurs_emploi"), { ...base, audience: "Demandeurs d'emploi", target: "demandeurs_emploi", intent: "discovery", objective: "accompagnement" })
    assert.deepEqual(request("newsletter", "actifs_en_poste"), { ...base, audience: "Actifs en poste", target: "actifs_en_poste", intent: "editorial", emailType: "newsletter" })
    assert.deepEqual(request("preuves", "b2b_rh"), { ...base, audience: "Entreprises / RH", target: "b2b_rh", intent: "brand-proof" })
    assert.deepEqual(request("preuves", "b2b_rh"), request("preuves", "b2b_rh"), "déterministe")
    assert.deepEqual(toEmailRecipeRequest({ ...base, intent: "preuves", target: "alternants", facts: ["Un fait."], subject: "Un objet" } as never).facts, [{ statement: "Un fait." }])
  })

  test("la réponse de succès n'expose ni recette, ni brouillon, ni usage, ni modèle, ni identifiant de requête, ni prompt, ni diagnostic", async () => {
    const { json } = await call(body, fakeEngine(successResult).engine)
    const serialized = JSON.stringify(json)
    for (const secret of ["req_secret_123", "claude-sonnet", "inputTokens", "stopReason", "Tu rédiges le contenu", '"draft"', '"usage"', '"config"', "discovery-reassurance", "recipe", "diagnostics", "provenance"]) assert.ok(!serialized.includes(secret), secret)
    assert.deepEqual(Object.keys(json).sort(), ["blockCount", "html", "preheader", "previewHtml", "status", "subject"])
  })

  test("le corps invalide n'appelle jamais le moteur : JSON absent, trop gros, brief incomplet, champ en trop, intention ou cible inconnue, ancien format", async () => {
    const { requests, engine } = fakeEngine(successResult)
    for (const [label, payload, raw] of [
      ["pas du JSON", "pas du json", true],
      ["trop gros", "x".repeat(100_001), true],
      ["brief vide", {}, false],
      ["champ en trop", { ...body, emailType: "promo" }, false],
      ["intention inconnue", { ...body, intent: "promotion" }, false],
      ["cible inconnue", { ...body, target: "etudiants" }, false],
      ["cible absente", { ...body, target: undefined }, false],
      ["ancien format libre", { campaignName: "C", brief: "B", audience: "Adultes", objective: "decouverte-formations" }, false],
      ["recette imposée", { ...body, recipe: "brand-proof" }, false],
      ["claim imposée", { ...body, claims: ["catalogue-formations"] }, false],
      ["surface imposée", { ...body, surface: "marque" }, false],
      ["tableau", [], false],
    ] as const) {
      const { response, json } = await call(payload, engine, { raw })
      assert.equal(response.status, 400, label)
      assert.equal(json.status, "error")
      assert.equal(json.code, "invalid-request", label)
    }
    assert.equal(requests.length, 0)
  })

  test("aucune promotion ni campagne visuelle : elles ne sont pas exprimables dans le corps, aucun appel", async () => {
    const { requests, engine } = fakeEngine(successResult)
    for (const refused of [
      { ...body, intent: "promotion" },
      { ...body, intent: "promo" },
      { ...body, offer: { summary: "x" } },
      { ...body, visual: "black-friday" },
      emailDemoPresets.find((preset) => preset.id === "promotion")!.brief,
      emailDemoPresets.find((preset) => preset.id === "studi-days")!.brief,
    ]) {
      const { response, json } = await call(refused, engine)
      assert.equal(response.status, 400)
      assert.equal(json.code, "invalid-request")
    }
    assert.equal(requests.length, 0)
  })

  test("les quatre exemples de l'interface passent au moteur, une fois chacun (la date de fin de l'exemple Promo est repoussée : la route la compare à l'horloge)", async () => {
    const { requests, engine } = fakeEngine(successResult)
    for (const example of emailGeneratorExamples) {
      const form = example.form.intent === "promotion" ? { ...example.form, promotion: { ...example.form.promotion, endDate: "2099-12-31" } } : example.form
      assert.equal((await call(toEmailRequestBody(form), engine)).response.status, 200, example.id)
    }
    assert.equal(requests.length, 4)
    assert.deepEqual(requests.map((request) => request.intent), ["discovery", "editorial", "brand-proof", "promotion"])
  })

  test("toutes les fixtures de Draft donnent un email que la route sait rendre", async () => {
    for (const fixture of emailRecipeDraftFixtures) {
      const result = resolveEmailRecipeDraftFixture(fixture.id).resolution
      assert.ok(result.status === "resolved")
      const { json } = await call(body, fakeEngine({ status: "success", config: result.config, recipe: fixture.recipe, diagnostics: result.diagnostics, model: "m", stopReason: "end_turn" }).engine)
      assert.equal(json.status, "success", fixture.id)
    }
  })
})

describe("route : erreurs publiques", () => {
  const kinds = Object.keys(emailPublicErrors) as EmailGenerationErrorKind[]

  test("chaque erreur du moteur a une erreur publique stable, sans détail interne ni secret", async () => {
    for (const kind of kinds) {
      const { response, json, logs } = await call(body, fakeEngine(engineError(kind)).engine)
      assert.equal(json.status, "error", kind)
      assert.equal(response.status, emailPublicErrors[kind].status, kind)
      assert.equal(json.code, emailPublicErrors[kind].code, kind)
      const serialized = JSON.stringify(json)
      for (const leak of ["sk-ant", "secret", "json de Claude", "brut", "blocks.0", "Détail interne", "req_", "stack", "Error:", "Zod", "recette", "recipe"]) assert.ok(!serialized.includes(leak), `${kind} : ${leak}`)
      assert.ok(json.status === "error" && json.issues.length === 1 && json.issues[0]!.path === "génération")
      assert.equal(response.headers.get("Cache-Control"), "no-store")
      assert.ok(logs.length === 1 && !JSON.stringify(logs).includes("sk-ant") && !JSON.stringify(logs).includes("brut"), kind)
    }
  })

  test("codes publics : configuration, fournisseur, sortie invalide, brouillon, assemblage, EmailConfig, validation finale et règle de marque sont distincts", () => {
    const code = (kind: EmailGenerationErrorKind) => emailPublicErrors[kind].code
    assert.equal(code("unsupported"), "unsupported")
    assert.equal(code("missing-api-key"), "configuration")
    assert.equal(code("authentication"), "configuration")
    assert.equal(code("server"), "provider-error")
    assert.equal(code("rejected"), "provider-error")
    assert.equal(code("rate-limit"), "rate-limit")
    assert.equal(code("timeout"), "timeout")
    assert.equal(code("refusal"), "refused")
    assert.equal(code("invalid-json"), "invalid-output")
    assert.equal(code("invalid-draft"), "invalid-draft")
    assert.equal(code("draft-resolution"), "unresolvable")
    assert.equal(code("invalid-config"), "invalid-email")
    assert.equal(code("validation-failed"), "validation-failed")
    assert.equal(code("brand-violation"), "brand-violation")
    assert.equal(code("unexpected"), "internal")
    assert.equal(new Set(["configuration", "provider-error", "invalid-output", "invalid-draft", "unresolvable", "invalid-email", "validation-failed", "brand-violation"]).size, 8)
  })

  test("clé absente → erreur de configuration claire, sans le nom d'un secret ni d'un fichier d'environnement", async () => {
    const { response, json } = await call(body, fakeEngine(engineError("missing-api-key")).engine)
    assert.equal(response.status, 500)
    assert.equal(json.code, "configuration")
    const serialized = JSON.stringify(json)
    assert.ok(!/ANTHROPIC|\.env|sk-ant/.test(serialized))
    assert.match(serialized, /pas configuré/)
  })

  test("un moteur qui lève → erreur interne publique, rien de l'exception ne sort", async () => {
    const { response, json, logs } = await call(body, fakeEngine(() => { throw new Error("boum sk-ant-secret") }).engine)
    assert.equal(response.status, 500)
    assert.equal(json.code, "internal")
    assert.ok(!JSON.stringify(json).includes("boum") && !JSON.stringify(logs).includes("boum"))
  })

  test("un rendu impossible → « rendering », sans détail du moteur de rendu", async () => {
    const broken = { ...resolved.config, blocks: [...resolved.config.blocks.slice(0, 1), { id: "x", type: "email-module-inconnue", slots: {} }, ...resolved.config.blocks.slice(1)] } as never
    const { response, json } = await call(body, fakeEngine({ ...successResult, config: broken } as EmailV2EngineResult).engine)
    assert.equal(response.status, 500)
    assert.equal(json.code, "rendering")
    assert.ok(!JSON.stringify(json).includes("manifeste"))
  })

  test("aucun repli : une erreur du moteur ne rend aucun email, même quand la démo ou le moteur V1 saurait répondre ; un seul appel", async () => {
    assert.equal(runEmailGeneration(defaultEmailBrief).status, "success", "la démo répondrait")
    const { requests, engine } = fakeEngine(engineError("timeout"))
    const { json } = await call(body, engine)
    assert.equal(json.status, "error")
    assert.ok(!("html" in json) && !("previewHtml" in json) && !("subject" in json))
    assert.equal(requests.length, 1, "pas de relance")
  })
})

describe("route et client : branchement", () => {
  test("la route délègue au gestionnaire du moteur V2, jamais à la démo ni au moteur V1", () => {
    const route = read("app/api/generate-email/route.ts")
    assert.match(route, /handleEmailGeneration\(request\)/)
    assert.ok(!/runEmailGeneration|demo-generator|generateDemoEmail|lib\/email\/generation"/.test(route))
    const handler = read("lib/email/generate-handler.ts")
    assert.ok(!/runEmailGeneration|generateDemoEmail|generateEmailWithClaude/.test(handler))
    assert.match(handler, /generateEmailV2/)
    assert.equal((handler.match(/engine\(/g) ?? []).length, 1, "un seul appel au moteur")
    assert.ok(!/ANTHROPIC|process\.env|NEXT_PUBLIC/.test(handler), "le gestionnaire ne lit aucun secret")
  })

  test("la clé Anthropic ne sort jamais : aucun composant client, aucune page, aucune variable publique ne l'importe (types seulement)", () => {
    for (const path of ["components/email/email-workspace.tsx", "components/email/email-brief-panel.tsx", "components/email/email-preview.tsx", "app/email-generator/page.tsx", "lib/email/generator-form.ts", "lib/email/generator-state.ts", "lib/email/generator-examples.ts"]) {
      const runtime = read(path).replace(/^import type [^\n]*\n/gm, "")
      assert.ok(!/anthropic|ANTHROPIC|draft-prompt|generate-handler|process\.env/i.test(runtime), path)
    }
    assert.match(readFileSync(join(root, "components/email/email-workspace.tsx"), "utf8"), /^"use client"/)
  })

  test("le client garde le dernier email valide : seul un succès le remplace (réducteur pur), une erreur ne l'efface jamais", () => {
    const workspace = read("components/email/email-workspace.tsx")
    assert.match(workspace, /useReducer\(emailGeneratorReducer, initialEmailGeneratorState\)/)
    assert.match(workspace, /fetch\("\/api\/generate-email"/)
    assert.equal((workspace.match(/fetch\(/g) ?? []).length, 1)
    assert.match(workspace, /email=\{state\.email\}|state\.email\?\.previewHtml/)
    assert.ok(!/setEmail|useEffect|setTimeout|setInterval/.test(workspace), "aucun état d'email local, aucun effet, aucune minuterie")
  })
})

describe("la démo déterministe reste testable séparément", () => {
  test("les sept presets historiques produisent toujours leur email via le moteur de démo ; la démo n'importe rien du moteur Claude", () => {
    assert.equal(emailDemoPresets.length, 7)
    for (const preset of emailDemoPresets) {
      const result = runEmailGeneration(preset.brief)
      assert.equal(result.status, "success", preset.id)
      assert.deepEqual(generateDemoEmail(preset.brief), generateDemoEmail(preset.brief))
    }
    for (const path of ["lib/email/demo-generator.ts", "lib/email/generation.ts", "lib/email/demo-assets.ts"]) {
      assert.ok(!/anthropic|draft-prompt|generate-handler|generation-draft|draft-resolver|image-catalog/.test(read(path)), path)
    }
  })

  test("domaine Email seul : aucun import depuis Landing dans les modules du moteur V2", () => {
    for (const path of ["lib/email/anthropic.ts", "lib/email/anthropic-v2.ts", "lib/email/anthropic-schema.ts", "lib/email/draft-prompt.ts", "lib/email/generate-handler.ts"]) {
      assert.ok(!/lib\/landing|from "@\/lib\/landing|\.\.\/landing/.test(read(path)), path)
    }
  })
})
