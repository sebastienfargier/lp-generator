/**
 * POST /api/generate-email : le moteur réel (simulé ici), jamais la démo, sans
 * réseau. Le navigateur ne reçoit que l'email rendu ou une erreur courte.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type { EmailEngineError, EmailEngineResult, EmailGenerationErrorKind } from "../anthropic"
import { defaultEmailBrief, emailDemoPresets, generateDemoEmail, type EmailBrief } from "../demo-generator"
import { emailPublicErrors, handleEmailGeneration, type EmailEngine, type EmailGenerateResponse } from "../generate-handler"
import { runEmailGeneration } from "../generation"
import type { EmailGenerationRequest } from "../generation-request"
import { resolveEmailDraftToConfig } from "../draft-resolver"
import { draftRequest, referenceDraft } from "./draft-fixtures"

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

const brief: EmailBrief = {
  campaignName: draftRequest.campaignName,
  subject: "Et si vous exploriez de nouveaux métiers ?",
  brief: draftRequest.brief,
  audience: draftRequest.audience,
  objective: "decouverte-formations",
}

const resolved = resolveEmailDraftToConfig({ ...draftRequest, subject: brief.subject }, referenceDraft)
if (resolved.status !== "resolved") throw new Error("fixture non résolue")
const successResult: EmailEngineResult = {
  status: "success",
  config: resolved.config,
  draft: referenceDraft,
  model: "claude-sonnet-5-5",
  stopReason: "end_turn",
  requestId: "req_secret_123",
  usage: { inputTokens: 2800, outputTokens: 900, thinkingTokens: 100 },
}

/** Moteur simulé : enregistre les requêtes reçues. */
function fakeEngine(result: EmailEngineResult | (() => EmailEngineResult | Promise<EmailEngineResult>)) {
  const requests: EmailGenerationRequest[] = []
  const engine: EmailEngine = async (request) => {
    requests.push(request)
    return typeof result === "function" ? result() : result
  }
  return { requests, engine }
}

const post = (body: unknown, raw = false) =>
  new Request("http://localhost/api/generate-email", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) })

async function call(body: unknown, engine: EmailEngine, options: { raw?: boolean; log?: (entry: object) => void } = {}) {
  const logs: object[] = []
  const response = await handleEmailGeneration(post(body, options.raw), { engine, log: (entry) => logs.push(entry) })
  return { response, json: (await response.json()) as EmailGenerateResponse & { code?: string }, logs }
}

const engineError = (kind: EmailGenerationErrorKind, over: Partial<EmailEngineError> = {}): EmailEngineResult => ({
  status: "error",
  error: { kind, message: "Détail interne : sk-ant-api03-secret", output: '{"brut":"json de Claude"}', requestId: "req_secret_123", status: 500, issues: [{ path: "blocks.0.cta.destination", message: "interne" }], ...over },
})

describe("route : le moteur réel, simulé", () => {
  test("O. un brief valide → UN appel au moteur, avec la requête issue du brief → email rendu réel", async () => {
    const { requests, engine } = fakeEngine(successResult)
    const { response, json } = await call(brief, engine)
    assert.equal(response.status, 200)
    assert.equal(requests.length, 1)
    assert.deepEqual(requests[0], { campaignName: brief.campaignName, subject: brief.subject, brief: brief.brief, audience: brief.audience, objective: "decouverte-formations" })
    assert.equal(json.status, "success")
    if (json.status !== "success") return
    assert.equal(json.subject, brief.subject)
    assert.equal(json.preheader, referenceDraft.preheader)
    assert.equal(json.blockCount, 5)
    assert.ok(json.html.includes("Préparez votre prochaine étape, à votre rythme"))
    assert.ok(json.html.includes("https://demo-assets.invalid/email-demo-reconversion.jpg"))
    assert.ok(json.previewHtml.includes("/images/email-demo-reconversion.jpg") && !json.previewHtml.includes("demo-assets.invalid"))
    assert.equal(response.headers.get("Cache-Control"), "no-store")
  })

  test("P. le renderer réel produit le HTML : même sortie que renderEmail sur la configuration résolue", async () => {
    const { renderEmail } = await import("../renderer")
    const { json } = await call(brief, fakeEngine(successResult).engine)
    assert.equal(json.status === "success" && json.html, renderEmail(resolved.config))
  })

  test("la réponse de succès n'expose ni brouillon, ni usage, ni modèle, ni identifiant de requête, ni prompt", async () => {
    const { json } = await call(brief, fakeEngine(successResult).engine)
    const serialized = JSON.stringify(json)
    for (const secret of ["req_secret_123", "claude-sonnet", "inputTokens", "stopReason", "Tu rédiges le contenu", '"draft"', '"usage"', '"config"']) assert.ok(!serialized.includes(secret), secret)
    assert.deepEqual(Object.keys(json).sort(), ["blockCount", "html", "preheader", "previewHtml", "status", "subject"])
  })

  test("le corps invalide n'appelle jamais le moteur : JSON absent, trop gros, brief incomplet", async () => {
    const { requests, engine } = fakeEngine(successResult)
    for (const [label, body, raw] of [
      ["pas du JSON", "pas du json", true],
      ["trop gros", "x".repeat(100_001), true],
      ["brief vide", {}, false],
      ["champ en trop", { ...brief, facts: ["x"] }, false],
      ["objectif inconnu", { ...brief, objective: "autre" }, false],
      ["tableau", [], false],
    ] as const) {
      const { response, json } = await call(body, engine, { raw })
      assert.equal(response.status, 400, label)
      assert.equal(json.status, "error")
      assert.equal(json.code, "invalid-request", label)
    }
    assert.equal(requests.length, 0)
  })

  test("M. Promotion et campagnes visuelles de démonstration sont refusées proprement, sans appel ni offre fabriquée", async () => {
    const { requests, engine } = fakeEngine(successResult)
    for (const refused of [
      { ...brief, objective: "promotion" },
      emailDemoPresets.find((preset) => preset.id === "promotion")!.brief,
      emailDemoPresets.find((preset) => preset.id === "black-friday")!.brief,
      emailDemoPresets.find((preset) => preset.id === "studi-days")!.brief,
      emailDemoPresets.find((preset) => preset.id === "studi-meet")!.brief,
    ]) {
      const { response, json } = await call(refused, engine)
      assert.equal(response.status, 422)
      assert.equal(json.code, "unsupported")
      assert.equal(json.status === "error" && json.title, "Demande non prise en charge")
      assert.ok(json.status === "error" && json.issues[0]!.message.length > 20)
    }
    assert.equal(requests.length, 0)
  })

  test("les quatre presets de scénario non promotionnels passent au moteur ; seuls Promotion et les campagnes sont refusés", async () => {
    const scenarioIds = ["reconversion", "accompagnement", "evolution"]
    const { requests, engine } = fakeEngine(successResult)
    for (const id of scenarioIds) assert.equal((await call(emailDemoPresets.find((preset) => preset.id === id)!.brief, engine)).response.status, 200, id)
    assert.equal(requests.length, 3)
    assert.deepEqual(requests.map((request) => request.objective), ["decouverte-formations", "accompagnement", "evolution-carriere"])
  })
})

describe("route : erreurs publiques", () => {
  const kinds = Object.keys(emailPublicErrors) as EmailGenerationErrorKind[]

  test("K. chaque erreur du moteur a une erreur publique stable, sans détail interne ni secret", async () => {
    for (const kind of kinds) {
      const { response, json, logs } = await call(brief, fakeEngine(engineError(kind)).engine)
      assert.equal(json.status, "error", kind)
      assert.equal(response.status, emailPublicErrors[kind].status, kind)
      assert.equal(json.code, emailPublicErrors[kind].code, kind)
      const serialized = JSON.stringify(json)
      for (const leak of ["sk-ant", "secret", "json de Claude", "brut", "blocks.0", "Détail interne", "req_", "stack", "Error:"]) assert.ok(!serialized.includes(leak), `${kind} : ${leak}`)
      assert.ok(json.status === "error" && json.issues.length === 1 && json.issues[0]!.path === "génération")
      assert.equal(response.headers.get("Cache-Control"), "no-store")
      assert.ok(logs.length === 1 && !JSON.stringify(logs).includes("sk-ant") && !JSON.stringify(logs).includes("brut"), kind)
    }
  })

  test("codes publics : distincts pour configuration, fournisseur, sortie invalide, brouillon, assemblage, EmailConfig et validation finale", () => {
    const code = (kind: EmailGenerationErrorKind) => emailPublicErrors[kind].code
    assert.equal(code("missing-api-key"), "configuration")
    assert.equal(code("authentication"), "configuration")
    assert.equal(code("server"), "provider-error")
    assert.equal(code("rejected"), "provider-error")
    assert.equal(code("rate-limit"), "rate-limit")
    assert.equal(code("timeout"), "timeout")
    assert.equal(code("invalid-json"), "invalid-output")
    assert.equal(code("invalid-draft"), "invalid-draft")
    assert.equal(code("draft-resolution"), "unresolvable")
    assert.equal(code("invalid-config"), "invalid-email")
    assert.equal(code("validation-failed"), "validation-failed")
    assert.equal(code("unexpected"), "internal")
    assert.equal(new Set(["configuration", "provider-error", "invalid-output", "invalid-draft", "unresolvable", "invalid-email", "validation-failed"].map((c) => c)).size, 7)
  })

  test("L. clé absente → erreur de configuration claire, sans le nom d'un secret ni d'un fichier d'environnement", async () => {
    const { response, json } = await call(brief, fakeEngine(engineError("missing-api-key")).engine)
    assert.equal(response.status, 500)
    assert.equal(json.code, "configuration")
    const serialized = JSON.stringify(json)
    assert.ok(!/ANTHROPIC|\.env|sk-ant/.test(serialized))
    assert.match(serialized, /pas configuré/)
  })

  test("un moteur qui lève → erreur interne publique, rien de l'exception ne sort", async () => {
    const { response, json, logs } = await call(brief, fakeEngine(() => { throw new Error("boum sk-ant-secret") }).engine)
    assert.equal(response.status, 500)
    assert.equal(json.code, "internal")
    assert.ok(!JSON.stringify(json).includes("boum") && !JSON.stringify(logs).includes("boum"))
  })

  test("un rendu impossible → « rendering », sans détail du moteur de rendu", async () => {
    const broken = { ...resolved.config, blocks: [...resolved.config.blocks.slice(0, 1), { id: "x", type: "email-module-inconnue", slots: {} }, ...resolved.config.blocks.slice(1)] } as never
    const { response, json } = await call(brief, fakeEngine({ ...successResult, config: broken } as EmailEngineResult).engine)
    assert.equal(response.status, 500)
    assert.equal(json.code, "rendering")
    assert.ok(!JSON.stringify(json).includes("manifeste"))
  })

  test("N. aucun repli sur la démo : une erreur du moteur ne rend aucun email, même quand la démo saurait répondre", async () => {
    assert.equal(runEmailGeneration(brief).status, "success", "la démo répondrait")
    const { json } = await call(brief, fakeEngine(engineError("timeout")).engine)
    assert.equal(json.status, "error")
    assert.ok(!("html" in json) && !("previewHtml" in json) && !("subject" in json))
  })
})

describe("route et client : branchement", () => {
  test("O. la route délègue au gestionnaire du moteur réel, jamais à la démo", () => {
    const route = read("app/api/generate-email/route.ts")
    assert.match(route, /handleEmailGeneration\(request\)/)
    assert.ok(!/runEmailGeneration|demo-generator|generateDemoEmail|lib\/email\/generation"/.test(route))
    const handler = read("lib/email/generate-handler.ts")
    assert.ok(!/runEmailGeneration|generateDemoEmail/.test(handler))
    assert.match(handler, /generateEmailWithClaude/)
    assert.equal((handler.match(/engine\(/g) ?? []).length, 1, "un seul appel au moteur")
    assert.ok(!/ANTHROPIC|process\.env|NEXT_PUBLIC/.test(handler), "le gestionnaire ne lit aucun secret")
  })

  test("la clé Anthropic ne sort jamais : aucun composant client, aucune page, aucune variable publique ne l'importe", () => {
    for (const path of ["components/email/email-workspace.tsx", "components/email/email-brief-panel.tsx", "components/email/email-preview.tsx", "app/email-generator/page.tsx"]) {
      assert.ok(!/anthropic|ANTHROPIC|draft-prompt|generate-handler/i.test(read(path)), path)
    }
    assert.match(readFileSync(join(root, "components/email/email-workspace.tsx"), "utf8"), /^"use client"/)
  })

  test("Q. le client garde le dernier email valide : seul un succès le remplace, une erreur ne l'efface jamais", () => {
    const workspace = read("components/email/email-workspace.tsx")
    assert.equal((workspace.match(/setEmail\(/g) ?? []).length, 1)
    assert.match(workspace, /result\.status === "success"\) \{[^}]*setEmail\(result\)/)
    assert.match(workspace, /fetch\("\/api\/generate-email"/)
    // Le client lit toujours `status`, `title` et `issues` : la forme de l'erreur publique les porte.
    assert.match(workspace, /value\.status === "success" \|\| value\.status === "error"/)
  })

  test("la page garde son aperçu initial de démonstration (aucun appel Claude au chargement)", () => {
    const page = read("app/email-generator/page.tsx")
    assert.match(page, /runEmailGeneration\(defaultEmailBrief\)/)
    assert.ok(!/generate-handler|anthropic/i.test(page))
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
    assert.equal(runEmailGeneration(defaultEmailBrief).status, "success")
    for (const path of ["lib/email/demo-generator.ts", "lib/email/generation.ts", "lib/email/demo-assets.ts"]) {
      assert.ok(!/anthropic|draft-prompt|generate-handler|generation-draft|draft-resolver|image-catalog/.test(read(path)), path)
    }
  })

  test("domaine Email seul : aucun import depuis Landing dans les nouveaux modules", () => {
    for (const path of ["lib/email/anthropic.ts", "lib/email/anthropic-schema.ts", "lib/email/draft-prompt.ts", "lib/email/generate-handler.ts"]) {
      assert.ok(!/lib\/landing|from "@\/lib\/landing|\.\.\/landing/.test(read(path)), path)
    }
  })
})
