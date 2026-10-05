/**
 * Moteur Claude de la génération Email, SANS réseau : le client
 * `messages.create` est simulé. Un garde-fou fait échouer toute la suite si
 * `fetch` est appelé.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { validateEmailAgainst } from "../ai-prompt"
import {
  DEFAULT_EMAIL_MODEL,
  EMAIL_MAX_TOKENS,
  EMAIL_REQUEST_TIMEOUT_MS,
  generateEmailFromPrompt,
  generateEmailWithClaude,
  resolveEmailModel,
  type EmailClaudeClient,
  type EmailEngineError,
  type EmailEngineResult,
} from "../anthropic"
import { toAnthropicEmailJsonSchema } from "../anthropic-schema"
import {
  buildEmailDraftContext,
  buildEmailDraftPrompt,
  emailDraftSystemPrompt,
  unsupportedEmailDraftReasons,
  validateGeneratedDraftEmail,
} from "../draft-prompt"
import { resolveEmailDraftToConfig } from "../draft-resolver"
import { emailDestinationUrl } from "../destinations"
import { buildEmailDraftJsonSchema, emailDraftDestinations, emailDraftHeroBlocks } from "../generation-draft"
import { emailBriefToGenerationRequest } from "../generation-request"
import { defaultEmailBrief } from "../demo-generator"
import { resolveEmailImage } from "../image-catalog"
import { toPreviewHtml } from "../preview"
import { renderEmail } from "../renderer"
import type { EmailConfig } from "../types"
import { draftRequest, draftWith, referenceDraft } from "./draft-fixtures"
import { measure, type JsonSchema } from "./schema-metrics"

type Call = Anthropic.MessageCreateParamsNonStreaming

const root = process.cwd()
// Construite à l'exécution : aucune clé, même factice, n'est écrite en dur dans le dépôt.
const FAKE_KEY = ["sk-ant", "api03", "x".repeat(24)].join("-")

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

const apiError = (status: number, text: string, headers: Record<string, string> = {}) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "api_error", message: text } }, `${status} ${text}`, new Headers(headers))

const kindOf = (result: EmailEngineResult) => (result.status === "error" ? result.error.kind : "success")
const errorOf = (result: EmailEngineResult): EmailEngineError => {
  assert.equal(result.status, "error")
  return (result as { status: "error"; error: EmailEngineError }).error
}
const run = (output: unknown, request: unknown = draftRequest) => generateEmailWithClaude(request, { client: fakeClient(() => reply(output)).client, env: {} })

describe("moteur Email : flux complet avec un client simulé", () => {
  test("A. requête → contexte → appel simulé → Draft → resolver → EmailConfig → renderer → aperçu", async () => {
    const { calls, client } = fakeClient(() => reply(referenceDraft))
    const result = await generateEmailWithClaude(draftRequest, { client, env: {} })
    assert.equal(calls.length, 1, "un seul appel")
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.deepEqual(result.draft, referenceDraft)
    assert.deepEqual(result.config.blocks.map((block) => block.id), ["header", "hero", "etapes", "action", "footer"])
    const html = renderEmail(result.config)
    assert.ok(html.includes(referenceDraft.blocks[0]!.type === "hero" ? referenceDraft.blocks[0]!.title : ""))
    assert.ok(toPreviewHtml(html).includes("/images/email-demo-reconversion.jpg"))
  })

  test("B. paramètres de l'appel : modèle, plafond, system, user, Structured Outputs ; ni tools, ni streaming, ni température", async () => {
    const { calls, client } = fakeClient(() => reply(referenceDraft))
    await generateEmailWithClaude(draftRequest, { client, env: {} })
    const params = calls[0]!
    const prompt = buildEmailDraftPrompt(draftRequest)
    assert.equal(prompt.status, "ready")
    if (prompt.status !== "ready") return
    assert.equal(params.model, DEFAULT_EMAIL_MODEL)
    assert.equal(params.max_tokens, EMAIL_MAX_TOKENS)
    assert.equal(params.system, prompt.system)
    assert.deepEqual(params.messages, [{ role: "user", content: prompt.user }])
    assert.deepEqual(params.output_config, { format: { type: "json_schema", schema: prompt.transportSchema } })
    for (const key of ["tools", "tool_choice", "stream", "temperature", "thinking"]) assert.ok(!(key in params), key)
    assert.equal(resolveEmailModel({}), DEFAULT_EMAIL_MODEL)
    assert.equal(resolveEmailModel({ ANTHROPIC_MODEL: " autre-modele " }), "autre-modele")
    assert.equal(resolveEmailModel({ ANTHROPIC_MODEL: "  " }), DEFAULT_EMAIL_MODEL)
    assert.equal(EMAIL_REQUEST_TIMEOUT_MS, 180_000)
  })

  test("la réponse expose l'usage et le modèle sans prompt système, sans clé", async () => {
    const result = await generateEmailWithClaude(draftRequest, { client: fakeClient(() => reply(referenceDraft)).client, env: { ANTHROPIC_API_KEY: FAKE_KEY } })
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.deepEqual(result.usage, { inputTokens: 2800, outputTokens: 900, thinkingTokens: 100 })
    assert.equal(result.model, DEFAULT_EMAIL_MODEL)
    const serialized = JSON.stringify(result)
    assert.ok(!serialized.includes(FAKE_KEY) && !serialized.includes("Tu rédiges le contenu"))
  })

  test("I. l'objet imposé par la requête l'emporte ; le préheader est toujours celui du brouillon", async () => {
    const result = await generateEmailWithClaude({ ...draftRequest, subject: "Objet imposé par la demande" }, { client: fakeClient(() => reply(referenceDraft)).client, env: {} })
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.equal(result.config.subject, "Objet imposé par la demande")
    assert.equal(result.config.preheader, referenceDraft.preheader)
    assert.notEqual(result.config.subject, referenceDraft.subject)
  })

  test("J. footer, header, mentions légales et surface ne viennent jamais de Claude", async () => {
    const result = await run(referenceDraft)
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.deepEqual(result.config.blocks.map((block) => block.type).filter((type) => /header|footer|legal/.test(type)), ["email-module-header-newsletter", "email-module-footer-compact-legal"])
    assert.equal(result.config.blocks.filter((block) => "surface" in block).length, 1)
    const attempts: [string, unknown][] = [
      ["footer", { ...referenceDraft, blocks: [...referenceDraft.blocks, { type: "footer" }] }],
      ["header", { ...referenceDraft, blocks: [{ type: "header" }, ...referenceDraft.blocks] }],
      ["legal", { ...referenceDraft, blocks: [...referenceDraft.blocks, { type: "legal", title: "x", text: "y" }] }],
      ["surface", { ...referenceDraft, blocks: [{ ...referenceDraft.blocks[0]!, surface: "encre" }, ...referenceDraft.blocks.slice(1)] }],
      ["lame du manifeste", { ...referenceDraft, blocks: [...referenceDraft.blocks, { type: "email-module-footer-compact-legal", slots: {} }] }],
    ]
    for (const [label, output] of attempts) assert.equal(kindOf(await run(output)), "invalid-draft", label)
  })
})

describe("moteur Email : sorties refusées", () => {
  test("C. Draft invalide (texte vide, items manquants, champ en trop) → invalid-draft, avec chemins pour le serveur", async () => {
    const result = await run({ ...referenceDraft, subject: "" })
    assert.equal(kindOf(result), "invalid-draft")
    assert.ok(errorOf(result).issues!.some((issue) => issue.path === "subject"))
    for (const output of [
      { ...referenceDraft, blocks: [referenceDraft.blocks[0]] },
      { ...referenceDraft, extra: true },
      { ...referenceDraft, blocks: [referenceDraft.blocks[0], { ...referenceDraft.blocks[1]!, items: [] }] },
      {},
      [],
      "texte",
    ]) {
      assert.equal(kindOf(await run(output)), "invalid-draft")
    }
  })

  test("D. bloc hors vocabulaire → invalid-draft ; un EmailConfig produit directement n'est pas accepté", async () => {
    assert.equal(kindOf(await run({ ...referenceDraft, blocks: [referenceDraft.blocks[0], { type: "banner", title: "x", text: "y" }] })), "invalid-draft")
    const direct = resolveEmailDraftToConfig(draftRequest, referenceDraft)
    assert.equal(direct.status, "resolved")
    assert.equal(kindOf(await run(direct.status === "resolved" ? direct.config : null)), "invalid-draft")
  })

  test("E. destination invalide (URL, chemin, Liquid, id inconnu) → invalid-draft", async () => {
    for (const destination of ["https://www.studi.com/fr/formations", "/fr/formations", "{{ url }}", "[URL À CONFIRMER]", "inconnue", "parcours-decouverte"]) {
      const hero = { ...referenceDraft.blocks[0]!, cta: { label: "Voir", destination } }
      assert.equal(kindOf(await run({ ...referenceDraft, blocks: [hero, ...referenceDraft.blocks.slice(1)] })), "invalid-draft", destination)
    }
  })

  test("F-G. image inconnue ou incompatible avec un hero V1 → invalid-draft ; jamais de src, d'alt ni de chemin", async () => {
    for (const image of ["inconnue", "duo-ciel-bleu", "black-friday", "/images/email-demo-evolution.jpg", "https://demo-assets.invalid/email-demo-evolution.jpg"]) {
      const hero = { ...referenceDraft.blocks[0]!, image }
      assert.equal(kindOf(await run({ ...referenceDraft, blocks: [hero, ...referenceDraft.blocks.slice(1)] })), "invalid-draft", image)
    }
    for (const field of ["src", "alt", "href"]) {
      const hero = { ...referenceDraft.blocks[0]!, [field]: "https://exemple.com/x.jpg" }
      assert.equal(kindOf(await run({ ...referenceDraft, blocks: [hero, ...referenceDraft.blocks.slice(1)] })), "invalid-draft", field)
    }
  })

  test("validation finale : une image d'une autre lame, un src ou un alt libre, une icône ou un lien hors liste sont refusés après résolution", () => {
    const resolved = resolveEmailDraftToConfig(draftRequest, draftWith("canape-lumiere", referenceDraft.blocks[1]))
    assert.equal(resolved.status, "resolved")
    if (resolved.status !== "resolved") return
    const config = resolved.config
    assert.equal(validateGeneratedDraftEmail(config, draftRequest).status, "valid")
    const tamper = (change: (copy: EmailConfig) => void) => {
      const copy = structuredClone(config)
      change(copy)
      return validateGeneratedDraftEmail(copy, draftRequest)
    }
    const hero = (copy: EmailConfig) => copy.blocks[1]!.slots as Record<string, Record<string, string>>
    const otherImage = resolveEmailImage("tablette-interieur", "email-module-hero-promotional-image-medium")
    const messages = (result: ReturnType<typeof tamper>) => (result.status === "invalid" ? result.issues.map((issue) => `${issue.path} ${issue.message}`).join(" | ") : "valide")
    assert.match(messages(tamper((copy) => void (hero(copy)["image-1"] = otherImage))), /Image différente de celle du catalogue/)
    assert.match(messages(tamper((copy) => void (hero(copy)["image-1"]!.src = "https://exemple.com/a.jpg"))), /Visuel non fourni/)
    assert.match(messages(tamper((copy) => void (hero(copy)["image-1"]!.alt = "Un autre alt"))), /Image différente/)
    assert.match(messages(tamper((copy) => void (hero(copy)["cta-1"]!.href = "https://exemple.com/"))), /Lien hors des destinations/)
    assert.match(messages(tamper((copy) => void (hero(copy)["cta-1"]!.href = "[URL À CONFIRMER]"))), /Lien hors des destinations|Lien non confirmé/)
    assert.match(messages(tamper((copy) => void (hero(copy)["cta-1"]!.href = "{{ lien }}"))), /Lien hors des destinations/)
  })

  test("validation finale : une lame hors vocabulaire ou une icône hors liste sont refusées", () => {
    const withIcons = resolveEmailDraftToConfig(draftRequest, draftWith("canape-lumiere", {
      type: "icons",
      title: "Atouts",
      items: [1, 2, 3].map((n) => ({ icon: "users", title: `T${n}`, text: `Texte ${n}` })),
    }))
    assert.equal(withIcons.status, "resolved")
    if (withIcons.status !== "resolved") return
    const copy = structuredClone(withIcons.config)
    ;(copy.blocks[2]!.slots as Record<string, { icon: string }>)["icone-1"] = { icon: "rocket-launch" }
    const result = validateGeneratedDraftEmail(copy, draftRequest)
    assert.equal(result.status, "invalid")
    assert.ok(result.status === "invalid" && result.issues.some((issue) => issue.message.includes("Icône hors de la liste")))
  })

  test("H. un fait sensible dans un champ protégé (code promo, compteur, témoignage, partenaire) n'est jamais admis : ces lames sont hors du vocabulaire V1", () => {
    const code = { text: "PROMO50" }
    const cases: [string, Record<string, unknown>][] = [
      ["email-module-discount-banner-cards", { "sous-titre": { text: "S" }, "titre-principal": { text: "T" }, "texte-descriptif-1": { text: "D" }, "code-promo-1": code, "texte-descriptif-2": { text: "D2" } }],
      ["email-module-cta-and-testimonial", { "texte-descriptif": { text: "D" }, "cta-1": { label: "Voir", href: emailDestinationUrl("metiers") }, "icone-1": { icon: "users" }, temoignage: { text: "Génial" }, "temoignage-auteur": { text: "Anne" } }],
    ]
    const resolved = resolveEmailDraftToConfig(draftRequest, referenceDraft)
    assert.equal(resolved.status, "resolved")
    if (resolved.status !== "resolved") return
    for (const [type, slots] of cases) {
      const config = structuredClone(resolved.config) as unknown as { blocks: unknown[] }
      config.blocks.splice(2, 0, { id: "intrus", type, slots })
      const result = validateGeneratedDraftEmail(config, draftRequest)
      assert.equal(result.status, "invalid", type)
      assert.ok(result.status === "invalid" && result.issues.some((issue) => issue.message.includes("Lame hors des candidates")), type)
    }
    // Politique commune : même contrôle de recopie qu'avant, quand la lame est admise.
    const policy = { request: { ...draftRequest, offer: { summary: "Offre", code: "VRAI10", disclaimer: "financement-personnel" as const } }, candidates: new Map([["email-module-discount-banner-cards", {}]]), hrefs: new Set<string>(), visuals: new Set<string>(), disclaimers: new Set<string>() }
    const swapped = validateEmailAgainst({ version: 1, id: "x", name: "x", subject: "s", preheader: "p", blocks: [{ id: "a", type: "email-module-discount-banner-cards", slots: cases[0]![1] }, { id: "f", type: "email-module-footer-compact-legal", slots: {} }] }, policy)
    assert.equal(swapped.status, "invalid")
  })

  test("l'offre, le témoignage, le partenaire, les visuels fournis, la promo : hors V1, refusés avant tout appel", async () => {
    const unsupported = [
      { ...draftRequest, emailType: "promo" as const },
      { ...draftRequest, offer: { summary: "Offre", disclaimer: "financement-personnel" as const } },
      { ...draftRequest, testimonial: { quote: "Q", author: "A" } },
      { ...draftRequest, partner: { name: "P" } },
      { ...draftRequest, visuals: [{ src: "https://exemple.com/a.jpg", alt: "a" }] },
      { ...draftRequest, facts: [{ statement: "Remise.", disclaimer: "offre-promotionnelle" as const }] },
      { ...draftRequest, facts: ["financement-personnel", "financement-cpf-100", "financement-100-general"].map((disclaimer) => ({ statement: "x", disclaimer: disclaimer as never })) },
    ]
    for (const request of unsupported) {
      const { calls, client } = fakeClient(() => reply(referenceDraft))
      const result = await generateEmailWithClaude(request, { client, env: {} })
      assert.equal(kindOf(result), "unsupported")
      assert.equal(calls.length, 0)
      assert.ok(unsupportedEmailDraftReasons(request).length >= 1)
    }
    assert.deepEqual(unsupportedEmailDraftReasons(draftRequest), [])
    assert.deepEqual(unsupportedEmailDraftReasons({ ...draftRequest, facts: [{ statement: "Un fait.", disclaimer: "financement-personnel" }] }), [])
  })

  test("requête invalide → invalid-request sans appel ; réponse vide, tronquée, refusée, interrompue ou non JSON → erreurs dédiées", async () => {
    const none = fakeClient(() => reply(referenceDraft))
    assert.equal(kindOf(await generateEmailWithClaude({ campaignName: "x" }, { client: none.client, env: {} })), "invalid-request")
    assert.equal(none.calls.length, 0)
    const cases: [string, unknown, string][] = [
      ["vide", message(null), "empty-output"],
      ["tronquée", reply(referenceDraft, { stop_reason: "max_tokens" }), "truncated"],
      ["refus", reply(referenceDraft, { stop_reason: "refusal", stop_details: { category: "cyber" } }), "refusal"],
      ["interrompue", reply(referenceDraft, { stop_reason: "pause_turn" }), "interrupted"],
      ["non JSON", message("Voici votre email"), "invalid-json"],
    ]
    for (const [label, response, kind] of cases) {
      const result = await generateEmailWithClaude(draftRequest, { client: fakeClient(() => response).client, env: {} })
      assert.equal(kindOf(result), kind, label)
    }
  })

  test("un brouillon valide mais non résolvable, ou une configuration refusée, ne donne jamais un email", async () => {
    const facts = [{ statement: "Un fait.", disclaimer: "offre-promotionnelle" as const }]
    assert.equal(kindOf(await generateEmailWithClaude({ ...draftRequest, facts }, { client: fakeClient(() => reply(referenceDraft)).client, env: {} })), "unsupported")
    // Résolution : une date de fin exigée sans offre est écartée avant l'appel (périmètre) ; ici on force le resolver.
    assert.equal(resolveEmailDraftToConfig({ ...draftRequest, facts }, referenceDraft).status, "unresolvable")
  })
})

describe("moteur Email : erreurs fournisseur et configuration", () => {
  test("K. erreurs du fournisseur → types stables, messages sans clé, sans détail brut", async () => {
    const cases: [string, () => unknown, string][] = [
      ["401", () => apiError(401, "invalid x-api-key"), "authentication"],
      ["403", () => apiError(403, "forbidden"), "authentication"],
      ["429", () => apiError(429, "rate limited"), "rate-limit"],
      ["400", () => apiError(400, `compiled grammar is too large (${FAKE_KEY})`), "rejected"],
      ["500", () => apiError(500, "boom"), "server"],
      ["529", () => apiError(529, "overloaded"), "server"],
      ["418", () => apiError(418, "teapot"), "api-error"],
      ["délai", () => new Anthropic.APIConnectionTimeoutError(), "timeout"],
      ["connexion", () => new Anthropic.APIConnectionError({ message: "ECONNRESET" }), "network"],
      ["inconnue", () => new Error("secret interne"), "unexpected"],
    ]
    for (const [label, make, kind] of cases) {
      const client: EmailClaudeClient = { messages: { create: async () => Promise.reject(make()) } }
      const result = await generateEmailWithClaude(draftRequest, { client, env: { ANTHROPIC_API_KEY: FAKE_KEY } })
      assert.equal(kindOf(result), kind, label)
      const serialized = JSON.stringify(errorOf(result))
      assert.ok(!serialized.includes(FAKE_KEY) && !serialized.includes("secret interne"), label)
    }
  })

  test("L. clé absente → missing-api-key, sans appel ni réseau ; le client réel n'est créé qu'avec une clé", async () => {
    for (const env of [{}, { ANTHROPIC_API_KEY: "" }, { ANTHROPIC_API_KEY: "   " }]) {
      const result = await generateEmailWithClaude(draftRequest, { env })
      assert.equal(kindOf(result), "missing-api-key")
      assert.ok(!JSON.stringify(result).includes("sk-ant"))
    }
    const source = readFileSync(join(root, "lib/email/anthropic.ts"), "utf8")
    assert.match(source, /new Anthropic\(\{[^}]*maxRetries: 0/)
    assert.match(source, /process\.env/)
    assert.ok(!/NEXT_PUBLIC/.test(source))
    assert.ok(!/console\./.test(source), "aucun journal dans le moteur")
  })

  test("un seul appel, jamais de relance ni de correction, même après une réponse invalide", async () => {
    const { calls, client } = fakeClient(() => reply({ ...referenceDraft, subject: "" }))
    const result = await generateEmailWithClaude(draftRequest, { client, env: {} })
    assert.equal(kindOf(result), "invalid-draft")
    assert.equal(calls.length, 1)
    const source = readFileSync(join(root, "lib/email/anthropic.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    assert.ok(!/retry|retries(?!:)|while \(|for \(attempt/i.test(source.replace(/maxRetries: 0/, "")))
    assert.ok(!/demo-generator|generation"|runEmailGeneration|generateDemoEmail/.test(source), "aucun repli sur la démo")
  })

  test("generateEmailFromPrompt ne lève pas : un prompt invalide ou hors périmètre est un résultat", async () => {
    assert.equal(kindOf(await generateEmailFromPrompt(buildEmailDraftPrompt(null))), "invalid-request")
    assert.equal(kindOf(await generateEmailFromPrompt(buildEmailDraftPrompt({ ...draftRequest, emailType: "promo" }))), "unsupported")
  })
})

describe("prompt et contexte Email du mode Draft", () => {
  const ready = buildEmailDraftPrompt(draftRequest)
  const withFacts = buildEmailDraftPrompt({
    ...draftRequest,
    subject: "Et si vous exploriez de nouveaux métiers ?",
    facts: [
      { statement: "Le paiement peut être échelonné.", disclaimer: "financement-personnel" },
      { statement: "Les formations se suivent en ligne." },
      { statement: "Un conseiller répond aux questions." },
      { statement: "Le catalogue compte des formations par niveau." },
    ],
  })

  test("contexte exact : 7 blocs, 10 destinations par identifiant, 3 images, 8 icônes ; faits repris tels quels", () => {
    assert.equal(ready.status, "ready")
    assert.equal(withFacts.status, "ready")
    if (ready.status !== "ready" || withFacts.status !== "ready") return
    const context = buildEmailDraftContext()
    assert.deepEqual(ready.context, context)
    assert.deepEqual(context.blocks.map((block) => block.type), ["hero", "steps", "grid", "icons", "text", "feature", "cta"])
    assert.deepEqual(context.destinations.map((entry) => entry.id), [...emailDraftDestinations])
    assert.deepEqual(context.images.map((entry) => entry.id), ["tablette-interieur", "ecouteur-exterieur", "canape-lumiere"])
    assert.equal(context.icons.length, 8)
    for (const image of context.images) assert.deepEqual(Object.keys(image), ["id", "hint"])
    assert.deepEqual(JSON.parse(withFacts.user).request.facts, withFacts.request.facts)
    assert.equal(JSON.parse(withFacts.user).request.subject, "Et si vous exploriez de nouveaux métiers ?")
  })

  test("rien d'interdit n'est envoyé : ni URL, chemin, src, alt, surface, footer, lame du manifeste, HTML ni icône hors liste", () => {
    assert.equal(ready.status, "ready")
    if (ready.status !== "ready") return
    const sent = `${ready.system}\n${ready.user}`
    assert.ok(!/https?:|\/fr\/|\/images\/|demo-assets|\.jpg|\.invalid|email-module-|email-hero|<[a-z]|className|tailwind/i.test(sent), "ressource ou structure interne")
    for (const word of ["surface", "marque", "accent-1", "encre", "alt", "src", "href"]) assert.ok(!new RegExp(`"${word}"`).test(ready.user), word)
    assert.ok(!/rocket-launch|face-smile|wifi/.test(ready.user))
    assert.equal(JSON.parse(ready.user).context.destinations.length, 10)
  })

  test("le prompt système porte les règles de structure, de ressources, de style et de faits", () => {
    for (const rule of [
      /de 2 à 5 blocs/,
      /Le premier est le hero, le seul/,
      /chaque type au plus une fois/,
      /au plus, un autre bloc \(feature ou cta\)/,
      /id de context\.destinations/,
      /id de context\.images/,
      /nom de context\.icons/,
      /N'écris jamais d'URL/,
      /header, footer, mentions légales, surface ou couleur, HTML, CSS, classes/,
      /request\.subject/,
      /vouvoiement/,
    ]) assert.match(emailDraftSystemPrompt, rule)
    for (const forbidden of ["prix", "remise", "pourcentage", "durée", "statistique", "effectif", "nombre d'apprenants", "certification", "classement", "garantie", "témoignage", "partenaire", "date", "heure", "échéance", "code promo", "offre", "urgence", "exclusivité"]) {
      assert.ok(emailDraftSystemPrompt.includes(forbidden), forbidden)
    }
    assert.match(emailDraftSystemPrompt, /sauf s'il figure dans request\.facts : recopie-le alors à l'identique/)
    assert.ok(!/\b\d+ ?%|€/.test(emailDraftSystemPrompt))
  })

  test("budget du contexte (mesuré : système 1 779, contexte 2 439, message 2 741 minimal et 3 059 avec 4 faits)", () => {
    assert.equal(ready.status, "ready")
    assert.equal(withFacts.status, "ready")
    if (ready.status !== "ready" || withFacts.status !== "ready") return
    assert.ok(ready.system.length < 2100, `système : ${ready.system.length}`)
    assert.ok(JSON.stringify(ready.context).length < 2800, `contexte : ${JSON.stringify(ready.context).length}`)
    assert.ok(ready.user.length < 3200, `message minimal : ${ready.user.length}`)
    assert.ok(withFacts.user.length < 3600, `message avec faits : ${withFacts.user.length}`)
    assert.equal(withFacts.system, ready.system)
    assert.deepEqual(JSON.parse(withFacts.user).context, JSON.parse(ready.user).context, "le contexte ne dépend pas de la requête")
    assert.equal(ready.user, buildEmailDraftPrompt(draftRequest).status === "ready" ? (buildEmailDraftPrompt(draftRequest) as { user: string }).user : "", "déterministe")
  })

  test("le prompt du mode Draft n'a aucune prise sur la démo : requête issue d'un brief de démo, même moteur", () => {
    const bridged = buildEmailDraftPrompt(emailBriefToGenerationRequest(defaultEmailBrief))
    assert.equal(bridged.status, "ready")
    assert.equal(buildEmailDraftPrompt(emailBriefToGenerationRequest({ ...defaultEmailBrief, objective: "promotion" })).status, "unsupported")
  })
})

describe("schéma de sortie structurée réellement envoyé", () => {
  const original = buildEmailDraftJsonSchema() as JsonSchema
  const sent = toAnthropicEmailJsonSchema(original)
  const m = measure(sent)

  test("adaptation Anthropic : oneOf → anyOf, additionalProperties false partout, plus de longueurs ni de $schema ; l'original n'est pas modifié", () => {
    const serialized = JSON.stringify(sent)
    assert.ok(!/"oneOf"|"maxItems"|"\$schema"|"pattern"|"minLength"/.test(serialized))
    assert.ok(!/"minItems":[2-9]/.test(serialized))
    assert.match(serialized, /"anyOf"/)
    const everyObjectIsClosed = (node: unknown): boolean => {
      if (Array.isArray(node)) return node.every(everyObjectIsClosed)
      if (!node || typeof node !== "object") return true
      const object = node as Record<string, unknown>
      if (object.properties && object.additionalProperties !== false) return false
      return Object.values(object).every(everyObjectIsClosed)
    }
    assert.ok(everyObjectIsClosed(sent))
    assert.ok(JSON.stringify(original).includes('"oneOf"') && JSON.stringify(original).includes('"maxItems"'))
    assert.deepEqual(toAnthropicEmailJsonSchema(original), sent, "déterministe")
  })

  test("métriques réellement envoyées (mesuré : 3 175 octets, 3 370 dépliés, 14 objets, 45 propriétés, 7 alternatives, 0 optionnel, 0 pattern)", () => {
    assert.equal(m.alternatives, 7)
    assert.equal(m.unions, 1)
    assert.equal(m.optional, 0)
    assert.equal(m.patterns, 0)
    assert.ok(m.objects <= 16 && m.properties <= 52, `${m.objects} objets, ${m.properties} propriétés`)
    assert.ok(m.bytes <= 3600 && m.expandedBytes <= 3800, `${m.bytes} / ${m.expandedBytes}`)
    assert.ok(m.enumValues <= 50 && m.depth <= 10)
    const draft = measure(original)
    assert.equal(m.objects, draft.objects)
    assert.equal(m.properties, draft.properties)
    assert.ok(m.bytes < draft.bytes, "l'adaptation retire des mots-clés, n'en ajoute pas")
    // Limites documentées d'Anthropic : 24 paramètres optionnels, 16 paramètres à union.
    assert.ok(m.optional <= 24 && m.unions <= 16)
  })

  test("le transport ne contient aucun vocabulaire d'URL, de surface ni de shell", () => {
    const serialized = JSON.stringify(sent)
    for (const word of ["href", "src", "alt", "url", "surface", "footer", "header", "html", "className"]) assert.ok(!new RegExp(`"${word}"`, "i").test(serialized), word)
    assert.deepEqual(emailDraftHeroBlocks.length, 3)
  })
})
