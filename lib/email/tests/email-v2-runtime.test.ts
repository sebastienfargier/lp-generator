/**
 * Moteur Email V2 branché au produit, de bout en bout, avec un FOURNISSEUR
 * SIMULÉ : formulaire → requête V2 → recette → prompt et schéma de la recette
 * → exactement UN `messages.create` simulé → Draft → resolver → EmailConfig →
 * validation de recette → diagnostics de terminologie → rendu → aperçu →
 * réponse publique. Aucun appel Anthropic réel : `fetch` est interdit, le
 * client est injecté.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { approvedClaims } from "../../brand/claims"
import { createClient, DEFAULT_EMAIL_MODEL, EMAIL_MAX_TOKENS, EMAIL_REQUEST_TIMEOUT_MS, type EmailClaudeClient } from "../anthropic"
import { brandPolicyFailure, generateEmailV2, type EmailV2EngineResult } from "../anthropic-v2"
import { emailDestinationUrl } from "../destinations"
import { handleEmailGeneration, toEmailRecipeRequest, type EmailGenerateResponse } from "../generate-handler"
import { emailGeneratorExamples } from "../generator-examples"
import { toEmailRequestBody, type EmailGeneratorForm } from "../generator-form"
import { emailBank, emailBankImageIdFromSrc } from "../image-bank"
import { emailRecipeDraftFixtures } from "../recipe-draft-fixtures"
import { buildRecipeTransportSchema } from "../recipe-drafts"
import { brandProofSystemPrompt, buildEmailRecipePrompt, discoverySystemPrompt, newsletterSystemPrompt } from "../recipe-prompts"
import { describeEmailRecipeConfig } from "../recipe-validation"
import { emailRecipeIds, type EmailRecipeId } from "../recipes"
import { renderEmail } from "../renderer"
import type { EmailBlock } from "../types"

type Call = Anthropic.MessageCreateParamsNonStreaming

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

/** Fournisseur simulé : enregistre chaque appel, répond ou lève. */
function fakeProvider(respond: (params: Call) => unknown) {
  const calls: Call[] = []
  const client: EmailClaudeClient = {
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
    model: DEFAULT_EMAIL_MODEL,
    content: text === null ? [] : [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 2800, output_tokens: 900, output_tokens_details: { thinking_tokens: 100 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
    ...over,
  }) as unknown as Anthropic.Message

const reply = (output: unknown, over: Record<string, unknown> = {}) => message(JSON.stringify(output), over)

const apiError = (status: number, text: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "api_error", message: text } }, `${status} ${text}`, new Headers())

const exampleForm = (id: string, over: Partial<EmailGeneratorForm> = {}): EmailGeneratorForm => ({ ...emailGeneratorExamples.find((example) => example.id === id)!.form, ...over })
const draftOf = (id: string) => emailRecipeDraftFixtures.find((fixture) => fixture.id === id)!.draft as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const post = (payload: unknown) => new Request("http://localhost/api/generate-email", { method: "POST", body: JSON.stringify(payload) })

/** Parcours HTTP complet avec un fournisseur simulé : le gestionnaire appelle le moteur V2 réel. */
async function viaRoute(payload: unknown, respond: (params: Call) => unknown) {
  const provider = fakeProvider(respond)
  const logs: object[] = []
  const response = await handleEmailGeneration(post(payload), { engine: (request) => generateEmailV2(request, { client: provider.client, env: {} }), log: (entry) => logs.push(entry) })
  return { provider, response, json: (await response.json()) as EmailGenerateResponse & { code?: string }, logs }
}

/** Le moteur seul, pour inspecter l'EmailConfig, la recette et les diagnostics (jamais renvoyés au navigateur). */
async function viaEngine(form: EmailGeneratorForm, respond: (params: Call) => unknown) {
  const provider = fakeProvider(respond)
  const body = toEmailRequestBody(form)
  const result = await generateEmailV2(toEmailRecipeRequest(body as never), { client: provider.client, env: {} })
  return { provider, result }
}

const success = (result: EmailV2EngineResult) => {
  assert.equal(result.status, "success", result.status === "error" ? JSON.stringify(result.error) : "")
  if (result.status !== "success") throw new Error("succès attendu")
  return result
}

const publicKeys = ["blockCount", "html", "preheader", "previewHtml", "status", "subject"]
const systemOf: Record<EmailRecipeId, string> = { "discovery-reassurance": discoverySystemPrompt, "editorial-newsletter": newsletterSystemPrompt, "brand-proof": brandProofSystemPrompt }
const otherSchemaFields: Record<EmailRecipeId, string[]> = {
  "discovery-reassurance": ["edition", "rubriques", "claims", "support"],
  "editorial-newsletter": ["visualIntent", "steps", "benefits", "claims", "support"],
  "brand-proof": ["edition", "rubriques", "steps", "benefits"],
}

type Case = { label: string; form: EmailGeneratorForm; draft: string; recipe: EmailRecipeId }
const cases: Case[] = [
  { label: "R1 : orientation", form: exampleForm("orientation"), draft: "D-R1-A", recipe: "discovery-reassurance" },
  { label: "R2 : newsletter, édition bandeau", form: exampleForm("newsletter"), draft: "D-R2-A", recipe: "editorial-newsletter" },
  { label: "R2 : newsletter, édition frise de portraits", form: exampleForm("newsletter"), draft: "D-R2-B", recipe: "editorial-newsletter" },
  { label: "R3 : preuves, deux claims", form: exampleForm("preuves"), draft: "D-R3-B", recipe: "brand-proof" },
  { label: "R3 : preuves, trois claims", form: exampleForm("preuves"), draft: "D-R3-A", recipe: "brand-proof" },
]

describe("moteur V2 : bout en bout avec un fournisseur simulé", () => {
  for (const { label, form, draft, recipe } of cases) {
    test(`${label} : une requête, UN appel simulé, le prompt et le schéma de la recette seulement, réponse publique compacte`, async () => {
      const { provider, response, json } = await viaRoute(toEmailRequestBody(form), () => reply(draftOf(draft)))
      assert.equal(response.status, 200)
      assert.equal(provider.calls.length, 1, "exactement un appel")

      // Le prompt et le schéma de la recette sont ceux envoyés.
      const params = provider.calls[0]!
      assert.equal(params.system, systemOf[recipe])
      const expected = buildEmailRecipePrompt(toEmailRecipeRequest(toEmailRequestBody(form) as never))
      assert.ok(expected.status === "ready" && expected.recipe === recipe)
      if (expected.status !== "ready") return
      assert.deepEqual(params.messages, [{ role: "user", content: expected.user }])
      assert.deepEqual(params.output_config, { format: { type: "json_schema", schema: buildRecipeTransportSchema(recipe) } })
      assert.equal(params.model, DEFAULT_EMAIL_MODEL)
      assert.equal(params.max_tokens, EMAIL_MAX_TOKENS)
      for (const key of ["tools", "tool_choice", "stream", "temperature"]) assert.ok(!(key in params), key)

      // Seul le schéma de la recette part : aucun champ des autres recettes, aucune union.
      const sent = JSON.stringify(params.output_config)
      for (const field of otherSchemaFields[recipe]) assert.ok(!sent.includes(`"${field}"`), `${recipe} : champ « ${field} » d'une autre recette`)
      assert.ok(!/"anyOf"|"oneOf"/.test(sent))
      for (const other of emailRecipeIds.filter((id) => id !== recipe)) assert.notDeepEqual(params.output_config, { format: { type: "json_schema", schema: buildRecipeTransportSchema(other) } })

      // Réponse publique : l'email rendu, rien d'interne.
      assert.deepEqual(Object.keys(json).sort(), publicKeys)
      assert.equal(json.status, "success")
      if (json.status !== "success") return
      assert.ok(json.html.includes("demo-assets.invalid/email-v2/"), "images de la banque V2 dans le HTML canonique")
      assert.ok(!json.previewHtml.includes("demo-assets.invalid"))
      const previews = [...json.previewHtml.matchAll(/src="(\/images\/email\/v2\/[a-z0-9-]+--[a-z0-9-]+\.jpg)"/g)].map((match) => match[1]!)
      assert.ok(previews.length >= 1)
      for (const path of previews) assert.ok(existsSync(join(root, "public", path)), `${path} : dérivé local`)
      assert.ok(!/ressources|images-banq|hf_|\/images\/email\/v2\/[^"]*\.png/.test(json.previewHtml), "aucune source brute")
      const serialized = JSON.stringify(json)
      for (const leak of [expected.system.slice(0, 40), "provenance", "documentId", "transportSchema", "inputTokens", "msg_test", DEFAULT_EMAIL_MODEL, recipe, '"draft"', "claims"]) assert.ok(!serialized.includes(leak), `fuite : ${leak}`)
    })
  }

  test("R1 : l'EmailConfig suit la recette — image V2 chaleureuse ou de mouvement, deux boutons vers la destination du hero, une zone marque sur le hero", async () => {
    const { provider, result } = await viaEngine(exampleForm("orientation"), () => reply(draftOf("D-R1-A")))
    assert.equal(provider.calls.length, 1)
    const ok = success(result)
    assert.equal(ok.recipe, "discovery-reassurance")
    const description = describeEmailRecipeConfig(ok.config)
    assert.deepEqual(description.strongZones, ["hero"])
    assert.equal((ok.config.blocks[1] as { surface?: string }).surface, "marque")
    assert.equal(description.buttons, 2)
    assert.deepEqual(description.buttonDestinations, [emailDestinationUrl("metiers")])
    for (const id of description.imageIds) assert.ok(["warm-reassurance", "career-movement"].includes(emailBank[id as keyof typeof emailBank].intent))
    assert.equal(description.claimIds.length, 0, "aucune claim en R1")
    assert.deepEqual(ok.diagnostics.filter((entry) => entry.level === "error"), [])
    assert.equal(renderEmail(ok.config).includes("demo-assets.invalid/email-v2/"), true)
  })

  test("R2 : édition bandeau — hero newsletter à un visuel et section illustrée ; édition frise — hero à cinq portraits prédéfinis, choisis par le code", async () => {
    const banner = success((await viaEngine(exampleForm("newsletter"), () => reply(draftOf("D-R2-A")))).result)
    const strip = success((await viaEngine(exampleForm("newsletter"), () => reply(draftOf("D-R2-B")))).result)
    assert.equal(banner.recipe, "editorial-newsletter")
    assert.deepEqual(describeEmailRecipeConfig(banner.config).sequence.slice(1, 3), ["email-hero-newsletter-variant-02", "email-module-text-only"])
    assert.ok(describeEmailRecipeConfig(banner.config).sequence.includes("email-module-text-and-cta-variant-02"))
    assert.deepEqual(describeEmailRecipeConfig(banner.config).imageIds.map((id) => emailBank[id as keyof typeof emailBank].intent), ["editorial-work", "editorial-work"])
    assert.equal(describeEmailRecipeConfig(strip.config).imageIds.length, 5)
    assert.ok(describeEmailRecipeConfig(strip.config).sequence.includes("email-hero-newsletter-variant-01"))
    for (const result of [banner, strip]) {
      assert.equal(describeEmailRecipeConfig(result.config).buttonDestinations.length, 1)
      assert.equal(describeEmailRecipeConfig(result.config).claimIds.length, 0)
      assert.equal((result.config.blocks.find((block) => block.id === "hero") as { surface?: string }).surface, "marque")
    }
  })

  test("R3 : les claims sont copiées à l'identique depuis Brand — deux en bandeaux de chiffres clés (projection contrôlée), trois en liste ; un seul bouton", async () => {
    const two = success((await viaEngine(exampleForm("preuves"), () => reply(draftOf("D-R3-B")))).result)
    const three = success((await viaEngine(exampleForm("preuves"), () => reply(draftOf("D-R3-A")))).result)
    for (const [result, draft] of [[two, draftOf("D-R3-B")], [three, draftOf("D-R3-A")]] as const) {
      assert.equal(result.recipe, "brand-proof")
      const text = JSON.stringify(result.config)
      const bands = result.config.blocks.flatMap((block) => (block.type === "email-module-benefits-compact-highlights" ? [`${(block.slots as Record<string, { text: string }>)["valeur-cle"]!.text.replace(/\u00a0/g, " ")} ${(block.slots as Record<string, { text: string }>)["label"]!.text}`] : []))
      for (const id of draft.claims as string[]) {
        const statement = approvedClaims.find((claim) => claim.id === id)!.statement
        assert.ok(text.includes(JSON.stringify(statement).slice(1, -1)) || bands.includes(statement), id)
      }
      assert.deepEqual(describeEmailRecipeConfig(result.config).claimIds.sort(), [...draft.claims].sort())
      assert.equal(describeEmailRecipeConfig(result.config).buttons, 1)
      assert.equal(describeEmailRecipeConfig(result.config).strongZones.length, 1)
      assert.equal(describeEmailRecipeConfig(result.config).imageIds.every((id) => emailBank[id as keyof typeof emailBank].intent === "campaign-portrait"), true)
      assert.deepEqual(describeEmailRecipeConfig(result.config).disclaimers, [], "aucune claim approuvée n'appelle de mention légale")
    }
    assert.ok(describeEmailRecipeConfig(three.config).sequence.includes("email-module-numbered-list"))
    const surfaces = (config: EmailV2EngineResult & { status: "success" }) => config.config.blocks.filter((block: EmailBlock) => (block as { surface?: string }).surface).map((block: EmailBlock) => block.id)
    assert.equal(surfaces(three).length, 1)
    assert.equal(surfaces(two).length, 0, "deux bandeaux sombres par construction : aucune surface à poser")
    assert.equal(describeEmailRecipeConfig(two.config).sequence.filter((type) => type === "email-module-benefits-compact-highlights").length, 2)
  })

  test("la cible contrôlée décide de la voix : tutoiement pour les alternants, vouvoiement sinon ; surface douce pour les demandeurs d'emploi ; l'audience libre n'y est pour rien", async () => {
    const voice = async (target: GeneratorTarget) => {
      const provider = fakeProvider(() => reply(draftOf("D-R1-A")))
      await generateEmailV2(toEmailRecipeRequest(toEmailRequestBody(exampleForm("orientation", { target })) as never), { client: provider.client, env: {} })
      const user = JSON.parse(provider.calls[0]!.messages[0]!.content as string) as { request: { audience: string }; context: { voice: { address: string; tone: string } } }
      return user
    }
    type GeneratorTarget = EmailGeneratorForm["target"] & string
    assert.equal((await voice("alternants")).context.voice.address, "tutoiement")
    for (const target of ["reconversion", "actifs_en_poste", "b2b_rh", "demandeurs_emploi"] as const) assert.equal((await voice(target)).context.voice.address, "vouvoiement", target)
    assert.match((await voice("demandeurs_emploi")).context.voice.tone, /Empathique/)
    assert.equal((await voice("alternants")).request.audience, "Alternants")
    const soft = success((await viaEngine(exampleForm("orientation", { target: "demandeurs_emploi" }), () => reply(draftOf("D-R1-A")))).result)
    assert.equal((soft.config.blocks.find((block) => block.id === "hero") as { surface?: string }).surface, "accent-2-soft")
    const standard = success((await viaEngine(exampleForm("orientation", { target: "alternants" }), () => reply(draftOf("D-R1-A")))).result)
    assert.equal((standard.config.blocks.find((block) => block.id === "hero") as { surface?: string }).surface, "marque")
  })

  test("les informations à reprendre arrivent au modèle séparées des claims, et leurs chiffres sont admis tels quels", async () => {
    const form = exampleForm("orientation", { facts: "Les conseillers répondent sous 48 heures." })
    const draft = structuredClone(draftOf("D-R1-A"))
    draft.closing.text = "Les conseillers répondent sous 48 heures : posez-leur vos questions."
    const { provider, result } = await viaEngine(form, () => reply(draft))
    success(result)
    const user = JSON.parse(provider.calls[0]!.messages[0]!.content as string) as { request: { facts: string[] }; context: { claims?: unknown } }
    assert.deepEqual(user.request.facts, ["Les conseillers répondent sous 48 heures."])
    assert.equal(user.context.claims, undefined)
    const { result: invented } = await viaEngine(exampleForm("orientation"), () => reply(draft))
    assert.equal(invented.status === "error" && invented.error.kind, "validation-failed", "sans le fait, le chiffre est refusé")
  })
})

describe("moteur V2 : exactement un appel, aucune relance, aucun repli", () => {
  const goodBody = toEmailRequestBody(exampleForm("orientation"))

  test("un Draft invalide → UN appel, erreur publique, aucun email, aucune relance", async () => {
    const draft = { ...structuredClone(draftOf("D-R1-A")), surface: "accent-1" }
    const { provider, response, json } = await viaRoute(goodBody, () => reply(draft))
    assert.equal(provider.calls.length, 1)
    assert.equal(response.status, 422)
    assert.equal(json.code, "invalid-draft")
    assert.ok(!("html" in json) && !("previewHtml" in json))
  })

  test("une validation finale qui échoue (chiffre inventé) → UN appel, erreur publique, aucune relance", async () => {
    const draft = structuredClone(draftOf("D-R1-A"))
    draft.hero.text = "Plus de 95 % des apprenants se disent satisfaits."
    const { provider, response, json } = await viaRoute(goodBody, () => reply(draft))
    assert.equal(provider.calls.length, 1)
    assert.equal(response.status, 422)
    assert.equal(json.code, "validation-failed")
    assert.ok(!JSON.stringify(json).includes("95"))
  })

  test("une claim invalide ou hors recette → UN appel, Draft invalide ; le Draft d'une autre recette est refusé", async () => {
    const preuves = toEmailRequestBody(exampleForm("preuves"))
    for (const claims of [["catalogue-formations", "plus-de-300-formations"], ["catalogue-formations", "financement-dispositifs"], ["catalogue-formations", "catalogue-formations"], ["catalogue-formations"]]) {
      const draft = { ...structuredClone(draftOf("D-R3-B")), claims, support: claims.map(() => "Un texte.") }
      const { provider, json } = await viaRoute(preuves, () => reply(draft))
      assert.equal(provider.calls.length, 1)
      assert.equal(json.code, "invalid-draft", JSON.stringify(claims))
    }
    const { provider, json } = await viaRoute(preuves, () => reply(draftOf("D-R1-A")))
    assert.equal(provider.calls.length, 1)
    assert.equal(json.code, "invalid-draft")
  })

  test("JSON illisible, sortie tronquée, refus du modèle → UN appel chacun, codes publics distincts", async () => {
    const cases: [string, () => Anthropic.Message, string][] = [
      ["json invalide", () => message("pas du json"), "invalid-output"],
      ["sortie vide", () => message(null), "invalid-output"],
      ["tronquée", () => reply(draftOf("D-R1-A"), { stop_reason: "max_tokens" }), "invalid-output"],
      ["refus", () => reply(draftOf("D-R1-A"), { stop_reason: "refusal", stop_details: { category: "x" } }), "refused"],
    ]
    for (const [label, respond, code] of cases) {
      const { provider, json } = await viaRoute(goodBody, respond)
      assert.equal(provider.calls.length, 1, label)
      assert.equal(json.code, code, label)
    }
  })

  test("erreurs du fournisseur : limite, serveur, rejet, délai, réseau, authentification → UN appel, aucune relance, codes publics", async () => {
    const throwing: [string, () => never, string][] = [
      ["limite", () => { throw apiError(429, "trop") }, "rate-limit"],
      ["serveur", () => { throw apiError(500, "boum") }, "provider-error"],
      ["surcharge", () => { throw apiError(529, "surchargé") }, "provider-error"],
      ["rejet", () => { throw apiError(400, "schéma refusé sk-ant-api03-secret") }, "provider-error"],
      ["délai", () => { throw new Anthropic.APIConnectionTimeoutError() }, "timeout"],
      ["réseau", () => { throw new Anthropic.APIConnectionError({ message: "ECONNRESET" }) }, "provider-error"],
      ["authentification", () => { throw apiError(401, "clé refusée") }, "configuration"],
    ]
    for (const [label, respond, code] of throwing) {
      const { provider, json, logs } = await viaRoute(goodBody, respond)
      assert.equal(provider.calls.length, 1, label)
      assert.equal(json.code, code, label)
      assert.ok(!JSON.stringify(json).includes("sk-ant") && !JSON.stringify(logs).includes("sk-ant"), label)
      assert.ok(!("html" in json), `${label} : aucun repli`)
    }
  })

  test("configuration absente → erreur de configuration sans appel ; demande invalide ou non prise en charge → aucun appel", async () => {
    const missing = await generateEmailV2(toEmailRecipeRequest(goodBody as never), { env: {} })
    assert.equal(missing.status === "error" && missing.error.kind, "missing-api-key")
    const provider = fakeProvider(() => reply(draftOf("D-R1-A")))
    for (const [label, request, kind] of [
      ["requête invalide", { brief: "x" }, "invalid-request"],
      ["promotion", { ...toEmailRecipeRequest(goodBody as never), emailType: "promo" }, "unsupported"],
      ["offre", { ...toEmailRecipeRequest(goodBody as never), offer: { summary: "x", disclaimer: "offre-promotionnelle", endDate: "2026-12-01" } }, "unsupported"],
      ["mention légale d'un fait", { ...toEmailRecipeRequest(goodBody as never), facts: [{ statement: "Un fait.", disclaimer: "chiffres-performance" }] }, "unsupported"],
      ["sans intention", { campaignName: "C", brief: "B", audience: "A" }, "unsupported"],
    ] as const) {
      const result = await generateEmailV2(request, { client: provider.client, env: {} })
      assert.equal(result.status === "error" && result.error.kind, kind, label)
    }
    assert.equal(provider.calls.length, 0, "aucun appel pour une demande refusée")
    const refused = await viaRoute({ ...goodBody, intent: "promotion" }, () => reply(draftOf("D-R1-A")))
    assert.equal(refused.provider.calls.length, 0)
    assert.equal(refused.json.code, "invalid-request")
  })

  test("politique de marque : seule une erreur d'une règle APPROUVÉE bloque ; conflits, brouillons, avertissements et règles en revue ne bloquent pas", async () => {
    const diagnostic = (sourceStatus: "approved" | "in-review" | "draft", level: "error" | "warning" | "known-conflict" = "error") => ({ level, ruleId: "gratuit", path: "subject", match: "gratuit", label: "« gratuit » : trompeur", sourceStatus, sourceDocumentId: "lexique-marque" })
    const meta = { requestId: "req_1" }
    assert.equal(brandPolicyFailure({ blocking: [] }, meta, "{}"), undefined)
    const blocked = brandPolicyFailure({ blocking: [diagnostic("approved")] }, meta, "{}")
    assert.ok(blocked && blocked.status === "error" && blocked.error.kind === "brand-violation")
    // Aujourd'hui aucune règle n'est approuvée : un texte « gratuit » passe, en diagnostic.
    const draft = structuredClone(draftOf("D-R1-A"))
    draft.hero.text = "Une formation gratuite pour un emploi garanti, sans effort."
    const { provider, result } = await viaEngine(exampleForm("orientation"), () => reply(draft))
    assert.equal(provider.calls.length, 1)
    const ok = success(result)
    assert.ok(ok.diagnostics.some((entry) => entry.ruleId === "gratuit" && entry.level === "error" && entry.sourceStatus !== "approved"))
    assert.ok(JSON.stringify(ok.config).includes("formation gratuite"), "aucune correction automatique")
    const { json } = await viaRoute(toEmailRequestBody(exampleForm("orientation")), () => reply(draft))
    assert.equal(json.status, "success", "la route n'expose pas les diagnostics et ne bloque pas")
  })

  test("le client est celui d'Anthropic configuré une fois : maxRetries 0, délai existant, un seul appel `messages.create` dans le moteur", () => {
    const sdk = createClient("sk-ant-api03-" + "x".repeat(24)) as unknown as { maxRetries: number; timeout: number }
    assert.equal(sdk.maxRetries, 0)
    assert.equal(sdk.timeout, EMAIL_REQUEST_TIMEOUT_MS)
    const v2 = code("lib/email/anthropic-v2.ts")
    assert.equal((v2.match(/messages\.create\(/g) ?? []).length, 1)
    assert.ok(!/maxRetries|retry|retries|setTimeout|while \(|for await/.test(v2))
    assert.match(v2, /createClient\(apiKey\)/)
    assert.ok(!/new Anthropic\(/.test(v2), "pas de second client configuré")
    assert.ok(!/generateEmailWithClaude|generateEmailFromPrompt|buildEmailDraftPrompt|safeParseEmailGenerationDraft|resolveEmailGenerationDraft/.test(v2), "aucun repli sur le moteur V1")
    assert.ok(!/ANTHROPIC_API_KEY.*console|console\.(log|error)/.test(v2))
  })

  test("le moteur V1 reste dans le dépôt et fonctionne toujours ; il n'est plus appelé par la route", () => {
    for (const path of ["lib/email/draft-prompt.ts", "lib/email/generation-draft.ts", "lib/email/draft-resolver.ts", "lib/email/image-catalog.ts", "lib/email/anthropic.ts"]) assert.ok(existsSync(join(root, path)), path)
    assert.ok(!/generateEmailWithClaude/.test(code("lib/email/generate-handler.ts")))
  })

  test("l'aperçu résout les dérivés V2 et garde les visuels de démonstration V1", async () => {
    const { toPreviewHtml } = await import("../preview")
    const html = toPreviewHtml('<img src="https://demo-assets.invalid/email-demo-reconversion.jpg"><img src="https://demo-assets.invalid/email-v2/quai-gare--large.jpg">')
    assert.ok(html.includes("/images/email-demo-reconversion.jpg") && html.includes("/images/email/v2/quai-gare--large.jpg"))
    assert.equal(emailBankImageIdFromSrc("https://demo-assets.invalid/email-v2/quai-gare--large.jpg"), "quai-gare")
  })
})
