/**
 * Diagnostic d'un 422 « validation-failed » de la génération R4, hors ligne.
 *
 * Origine : un smoke réel (cible Reconversion, 15 %, périmètre « Formations
 * éligibles à l'offre ») a renvoyé 422 sans dire quelle règle avait refusé la
 * copie de Claude. Ces tests figent :
 * - la demande du smoke est VALIDE (aucun appel n'était évitable côté entrée) ;
 * - un corpus de sorties simulées : copie sûre acceptée, chaque promesse
 *   interdite refusée, de façon déterministe ;
 * - la parité prompt / contrôle : ce que le contrôle refuse est nommé dans le
 *   prompt, et le contexte de marque n'offre jamais à Claude une alternative que
 *   le contrôle refuserait ;
 * - l'observabilité : le journal serveur donne l'étape, la règle, le champ et
 *   l'extrait refusé ; la réponse publique reste générique ;
 * - la composition V1.5 n'intervient pas dans la génération.
 *
 * Aucun appel réseau, aucun appel Anthropic : `fetch` est interdit.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type Anthropic from "@anthropic-ai/sdk"

import { generateEmailV2 } from "../anthropic-v2"
import { EmailGenerateBodySchema, handleEmailGeneration, toEmailEngineRequest, toValidationLog } from "../generate-handler"
import { toEmailRequestBody } from "../generator-form"
import { lintPromotionCopy } from "../promotion-copy"
import { buildPromotionPrompt, checkPromotionRequest, promotionSystemPrompt } from "../promotion-prompt"
import { promotionVariantFor, resolvePromotionDraft } from "../promotion-resolver"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

/** Valeurs de démonstration : la demande du smoke (formulaire → corps → requête du moteur). */
const smokeForm = {
  campaignName: "Offre spéciale reconversion",
  intent: "promotion",
  target: "reconversion",
  brief:
    "Créer un email promotionnel destiné aux personnes qui envisagent une reconversion professionnelle. L'offre doit être immédiatement compréhensible, avec un ton motivant, rassurant et concret, sans pression artificielle.",
  subject: "",
  facts: "",
  promotion: { offerType: "percent", value: "15", code: "RECONVERSION15", endDate: "2026-10-31", scope: "Formations éligibles à l'offre", destination: "catalogue-formations" },
} as const
const today = "2026-10-06"
const request = () => {
  const parsed = EmailGenerateBodySchema.safeParse(toEmailRequestBody(smokeForm as never))
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues))
  return toEmailEngineRequest(parsed.data!) as Parameters<typeof resolvePromotionDraft>[0]
}

/** Une copie sûre : aucune règle de copie ne la refuse. */
const safeDraft = (): Json => ({
  subject: "-15 % pour votre projet de reconversion",
  preheader: "Une offre pour avancer dans votre reconversion : parcourez le catalogue des formations concernées.",
  visualIntent: "career-movement",
  offer: { eyebrow: "Offre reconversion", text: "Vous envisagez de changer de voie ? Cette offre peut vous aider à franchir le pas, avec une formation en phase avec votre projet professionnel.", ctaLabel: "Voir les formations" },
  support: {
    title: "Pour y voir plus clair",
    items: [
      { icon: "magnifying-glass", title: "Explorez le catalogue", text: "Parcourez les formations par domaine et repérez celles qui vous parlent." },
      { icon: "handshake-simple", title: "Pensez à votre projet", text: "Rapprochez chaque formation du métier que vous souhaitez exercer plus tard." },
      { icon: "stopwatch", title: "Comparez à votre rythme", text: "Lisez le détail de chaque formation avant de faire votre choix." },
    ],
  },
  closing: { title: "À vous de choisir", text: "Le catalogue détaille chaque formation. Comparez-les, puis retenez celle qui correspond à votre situation et à vos envies.", ctaLabel: "Parcourir le catalogue" },
})

/* -------------------------------------------------------------------------- */
/* La demande du smoke                                                        */
/* -------------------------------------------------------------------------- */

describe("diagnostic 422 — la demande du smoke", () => {
  test("le formulaire du smoke donne une demande valide : cible, offre, code, date, périmètre, destination et brief passent tous les contrôles d'entrée", () => {
    const body = toEmailRequestBody(smokeForm as never) as Json
    assert.deepEqual(body.promotion, { offer: { type: "percent", percent: 15 }, code: "RECONVERSION15", endDate: "2026-10-31", scope: "Formations éligibles à l'offre", destination: "catalogue-formations" })
    assert.equal(body.target, "reconversion")
    const check = checkPromotionRequest(request(), { today })
    assert.equal(check.status, "valid", check.status === "invalid" ? JSON.stringify(check.issues) : "")
    const prompt = buildPromotionPrompt(request(), { today })
    assert.equal(prompt.status, "ready")
  })

  test("la composition de la recette de cette demande est « code-banner » ; le périmètre du système n'est jamais contrôlé comme de la copie de Claude", () => {
    assert.equal(promotionVariantFor(request().promotion, request().campaignName), "code-banner")
    const resolution = resolvePromotionDraft(request(), safeDraft())
    assert.equal(resolution.status, "resolved", resolution.status === "resolved" ? "" : JSON.stringify(resolution.issues))
    const offer = (resolution as Json).config.blocks.find((block: Json) => block.id === "offer")
    assert.ok(offer.slots["texte-descriptif"].text.endsWith("Offre valable sur Formations éligibles à l'offre."), "« éligibles » est écrit par le système, sans refus")
  })
})

/* -------------------------------------------------------------------------- */
/* Corpus de sorties simulées                                                 */
/* -------------------------------------------------------------------------- */

describe("diagnostic 422 — corpus de sorties Claude simulées (déterministe)", () => {
  type Case = { id: string; label: string; mutate: (draft: Json) => void; expected: "PASS" | "BLOCK"; rule?: string }
  const corpus: Case[] = [
    { id: "A", label: "copie totalement sûre", mutate: () => {}, expected: "PASS" },
    { id: "B", label: "« emploi garanti »", mutate: (d) => (d.offer.text = "Un emploi garanti après votre reconversion, grâce à cette offre."), expected: "BLOCK", rule: "copy-garantie" },
    { id: "C", label: "« formation gratuite »", mutate: (d) => (d.offer.text = "Une formation gratuite pour votre reconversion."), expected: "BLOCK", rule: "copy-gratuit" },
    { id: "D", label: "« financé à 100 % »", mutate: (d) => (d.support.items[0].text = "Votre formation peut être financée à 100 % selon votre profil."), expected: "BLOCK", rule: "copy-financement" },
    { id: "E", label: "chiffre non sourcé", mutate: (d) => (d.closing.text = "Rejoignez 12 000 personnes déjà reconverties avec Studi."), expected: "BLOCK", rule: "copy-chiffre" },
    { id: "F", label: "nouvelle date", mutate: (d) => (d.closing.text = "Profitez de l'offre avant le 15 novembre pour vous lancer."), expected: "BLOCK", rule: "copy-date" },
    { id: "G", label: "nouveau pourcentage", mutate: (d) => (d.subject = "-25 % pour votre reconversion"), expected: "BLOCK", rule: "copy-chiffre" },
    { id: "H", label: "nouveau code", mutate: (d) => (d.offer.text = "Utilisez le code BIENVENUE pour vous lancer dans votre reconversion."), expected: "BLOCK", rule: "copy-code" },
    { id: "I", label: "urgence artificielle", mutate: (d) => (d.offer.text = "Dernière chance : dépêchez-vous de profiter de cette offre de reconversion."), expected: "BLOCK", rule: "copy-pression" },
    { id: "J", label: "wording reconversion sûr", mutate: (d) => (d.offer.text = "Changer de métier se prépare. Cette offre peut vous aider à avancer vers une nouvelle voie professionnelle."), expected: "PASS" },
    { id: "K", label: "« insertion professionnelle »", mutate: (d) => (d.support.items[1].text = "Pensez à votre insertion professionnelle future et au métier visé."), expected: "PASS" },
    { id: "L", label: "périmètre exact réutilisé dans la copie (« éligibles »)", mutate: (d) => (d.closing.text = "Parcourez les formations éligibles à l'offre, puis choisissez celle qui vous convient."), expected: "BLOCK", rule: "copy-financement" },
    { id: "M", label: "paraphrase du périmètre sans mot interdit", mutate: (d) => (d.closing.text = "Toutes les formations concernées par cette remise sont à découvrir dans le catalogue."), expected: "PASS" },
    { id: "N", label: "« métier de demain » (référence temporelle)", mutate: (d) => (d.closing.text = "Choisissez la formation du métier de demain."), expected: "BLOCK", rule: "copy-date" },
    { id: "O", label: "« accompagné à chaque étape » (ancienne alternative du lexique)", mutate: (d) => (d.closing.text = "Choisissez en étant accompagné à chaque étape de votre reconversion."), expected: "BLOCK", rule: "copy-service" },
    { id: "P", label: "« finançable » (ancienne alternative du lexique)", mutate: (d) => (d.support.items[2].text = "Découvrez les formations finançables via les dispositifs publics."), expected: "BLOCK", rule: "copy-financement" },
    { id: "Q", label: "« un mois » (nombre en lettres)", mutate: (d) => (d.closing.text = "Prenez un mois pour comparer, puis lancez-vous."), expected: "BLOCK", rule: "copy-chiffre-lettres" },
    { id: "R", label: "« unique » (emphase)", mutate: (d) => (d.offer.text = "Votre reconversion est unique : cette offre peut vous aider à avancer."), expected: "BLOCK", rule: "copy-hype" },
  ]

  for (const entry of corpus) {
    test(`${entry.id} — ${entry.label} → ${entry.expected}`, () => {
      const draft = safeDraft()
      entry.mutate(draft)
      const first = resolvePromotionDraft(request(), draft)
      const second = resolvePromotionDraft(request(), structuredClone(draft))
      assert.equal(first.status === "resolved" ? "PASS" : "BLOCK", entry.expected, first.status === "resolved" ? "" : JSON.stringify(first.issues))
      assert.deepEqual(second.status === "resolved" ? [] : second.issues, first.status === "resolved" ? [] : first.issues, "déterministe")
      if (entry.expected === "BLOCK") {
        assert.equal(first.status, "invalid-recipe")
        assert.ok((first as Json).issues.some((issue: Json) => issue.code === entry.rule), `${entry.rule} attendu : ${JSON.stringify((first as Json).issues.map((issue: Json) => issue.code))}`)
      }
    })
  }

  test("une valeur commerciale, le code, la date, le périmètre et le légal ne se modifient pas : le resolver les pose, la copie ne peut pas les dire autrement", () => {
    const resolution = resolvePromotionDraft(request(), safeDraft())
    assert.equal(resolution.status, "resolved")
    const text = JSON.stringify((resolution as Json).config.blocks)
    assert.ok(text.includes("-15") && text.includes("RECONVERSION15") && text.includes("31 octobre 2026") && text.includes("2026-10-31"))
  })
})

/* -------------------------------------------------------------------------- */
/* Parité prompt / contrôle                                                   */
/* -------------------------------------------------------------------------- */

describe("diagnostic 422 — parité prompt / contrôle de copie", () => {
  const facts = request().promotion

  /** Chaque règle du contrôle : un exemple refusé, et ce que le prompt en dit. */
  const matrix: { rule: string; blocked: string; prompt: RegExp }[] = [
    { rule: "chiffre", blocked: "Rejoignez 12 000 personnes.", prompt: /aucun chiffre, ni % ni €/ },
    { rule: "chiffre-lettres", blocked: "Prenez un mois pour comparer.", prompt: /nombre en toutes lettres suivi d'une durée/ },
    { rule: "date", blocked: "Le métier de demain se prépare.", prompt: /« demain », « ce mois », « cette semaine », tout mois ou jour de la semaine/ },
    { rule: "jusqua", blocked: "Jusqu'à la rentrée.", prompt: /ni « jusqu'à », ni « à partir de »/ },
    { rule: "economie", blocked: "Économisez sur votre formation.", prompt: /ni « économisez »/ },
    { rule: "pression", blocked: "Dernière chance de vous lancer.", prompt: /aucune pression ni urgence/ },
    { rule: "hype", blocked: "Une offre unique, profitez-en.", prompt: /« unique », « exclusif », « profitez-en »/ },
    { rule: "financement", blocked: "Des formations éligibles, prise en charge possible.", prompt: /aucune mention de financement[\s\S]*« éligible », « prise en charge », « sans frais »/ },
    { rule: "gratuit", blocked: "Une formation gratuite.", prompt: /de gratuité/ },
    { rule: "garantie", blocked: "Un résultat garanti.", prompt: /de garantie/ },
    { rule: "service", blocked: "Un conseiller vous répond.", prompt: /de conseiller ou de service précis[\s\S]*« accompagné à chaque étape », « accompagnement personnalisé »/ },
    { rule: "code", blocked: "Utilisez le code BIENVENUE.", prompt: /n'écris ni le code[\s\S]*tout mot en capitales/ },
  ]

  for (const entry of matrix) {
    test(`règle « ${entry.rule} » : le contrôle la refuse ET le prompt la nomme`, () => {
      assert.ok(lintPromotionCopy(entry.blocked, "body", facts).some((issue) => issue.rule === entry.rule), `${entry.rule} : « ${entry.blocked} » devrait être refusé`)
      assert.match(promotionSystemPrompt, entry.prompt)
    })
  }

  test("le contexte de marque d'une promotion ne propose JAMAIS à Claude une alternative, une règle de ton ou un point clé que le contrôle de copie refuserait", () => {
    for (const target of ["reconversion", "actifs_en_poste", "alternants", "b2b_rh", "demandeurs_emploi"] as const) {
      const prompt = buildPromotionPrompt({ ...request(), target, audience: target }, { today })
      assert.equal(prompt.status, "ready", target)
      if (prompt.status !== "ready") continue
      const context = prompt.context
      for (const entry of context.avoid) {
        if (!entry.instead) continue
        assert.deepEqual(lintPromotionCopy(entry.instead, "body", facts, { hasCode: false }).map((issue) => issue.rule), [], `${target} : alternative « ${entry.instead} » refusée par le contrôle`)
      }
      for (const point of context.voice.audience?.keyPoints ?? []) assert.deepEqual(lintPromotionCopy(point, "body", facts, { hasCode: false }), [], `${target} : « ${point} »`)
      assert.deepEqual(lintPromotionCopy(context.voice.tone, "body", facts, { hasCode: false }), [], `${target} : ton`)
    }
  })

  test("le terme à éviter reste dans le contexte même quand son alternative est retirée (le garde-fou n'est pas affaibli)", () => {
    const prompt = buildPromotionPrompt(request(), { today })
    if (prompt.status !== "ready") throw new Error("prompt")
    const terms = prompt.context.avoid.map((entry) => entry.term)
    for (const expected of ["garanti / assuré", "gratuit", "100% financé", "sans effort"]) assert.ok(terms.includes(expected), expected)
    const free = prompt.context.avoid.find((entry) => entry.term === "gratuit")!
    assert.equal("instead" in free, false, "« finançable / jusqu'à 100 %* » n'est plus proposé")
    assert.equal(prompt.context.avoid.find((entry) => entry.term === "coach personnel / mentor dédié")?.instead, "accompagnement pédagogique / équipe pédagogique")
  })

  test("le prompt reste court et ne contient ni le code ni la date", () => {
    assert.ok(promotionSystemPrompt.length < 4200, `${promotionSystemPrompt.length}`)
    const prompt = buildPromotionPrompt(request(), { today })
    if (prompt.status !== "ready") throw new Error("prompt")
    assert.ok(!prompt.user.includes("RECONVERSION15") && !prompt.user.includes("2026-10-31") && !prompt.system.includes("RECONVERSION15"))
  })
})

/* -------------------------------------------------------------------------- */
/* Observabilité                                                              */
/* -------------------------------------------------------------------------- */

const message = (value: unknown) =>
  ({
    id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(value), citations: null }],
    stop_reason: "end_turn", stop_sequence: null, stop_details: null,
    usage: { input_tokens: 900, output_tokens: 200, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
  }) as unknown as Anthropic.Message

async function runHandler(draft: unknown) {
  const calls: unknown[] = []
  const logs: Json[] = []
  const client = { messages: { create: async (params: unknown) => (calls.push(params), message(draft)) } }
  const response = await handleEmailGeneration(new Request("http://localhost/api/generate-email", { method: "POST", body: JSON.stringify(toEmailRequestBody(smokeForm as never)) }), {
    engine: (input) => generateEmailV2(input, { client, env: { ANTHROPIC_API_KEY: "sk-ant-test-0000000000000000" } }),
    log: (entry) => logs.push(entry as Json),
  })
  return { calls, logs, response, body: (await response.json()) as Json }
}

describe("diagnostic 422 — observabilité serveur", () => {
  test("un refus de copie : 422 générique pour le navigateur ; le journal serveur dit l'étape, la règle, le champ et l'extrait refusé", async () => {
    const draft = safeDraft()
    draft.closing.text = "Parcourez les formations éligibles à l'offre, puis choisissez celle qui vous convient."
    draft.offer.text = "Une formation gratuite pour votre reconversion."
    const { calls, logs, response, body } = await runHandler(draft)
    assert.equal(calls.length, 1, "un seul appel, aucune relance")
    assert.equal(response.status, 422)
    assert.equal(body.code, "validation-failed")
    assert.deepEqual(body.issues, [{ path: "génération", message: "L'email généré ne respecte pas les règles de contenu. Réessayez." }], "la réponse publique ne dit rien de plus")
    assert.equal(logs.length, 1)
    assert.equal(logs[0]!.kind, "validation-failed")
    assert.deepEqual(logs[0]!.issues, [
      { stage: "recipe", rule: "copy-gratuit", path: "blocks.offer.slots.texte-descriptif", match: "gratuite" },
      { stage: "recipe", rule: "copy-financement", path: "blocks.closing.slots.texte-descriptif", match: "eligibles" },
    ])
  })

  test("un refus de structure (étape « recipe », règle « sequence » ou « density ») et un Draft hors contrat (étape « draft ») sont aussi décrits", async () => {
    const short = safeDraft()
    short.offer.text = "Une offre."
    short.closing.text = "Voyez le catalogue."
    for (const item of short.support.items) item.text = "Voyez."
    const dense = await runHandler(short)
    assert.equal(dense.response.status, 422)
    assert.ok((dense.logs[0]!.issues as Json[]).some((issue) => issue.stage === "recipe" && issue.rule === "density" && issue.path === "blocks"))

    const broken = safeDraft()
    delete broken.closing
    const invalid = await runHandler(broken)
    assert.equal(invalid.body.code, "invalid-draft")
    assert.ok((invalid.logs[0]!.issues as Json[]).every((issue) => issue.stage === "draft" && typeof issue.path === "string"))
  })

  test("le journal ne contient ni clé, ni prompt, ni HTML, ni brouillon complet ; les extraits sont bornés", async () => {
    const draft = safeDraft()
    draft.closing.text = "Un texte long ".repeat(30) + "garanti."
    const { logs } = await runHandler(draft)
    const printed = JSON.stringify(logs)
    assert.ok(!/sk-ant|ANTHROPIC_API_KEY|<html|<table|promotionSystemPrompt|Tu rédiges/.test(printed))
    for (const issue of (logs[0]!.issues ?? []) as Json[]) assert.ok((issue.match ?? "").length <= 60)
    assert.ok(printed.length < 1200, `${printed.length}`)
  })

  test("toValidationLog : une erreur sans règle (réseau, fournisseur) n'ajoute rien ; au plus douze règles", () => {
    assert.equal(toValidationLog({ kind: "timeout", message: "x" }), undefined)
    assert.equal(toValidationLog({ kind: "validation-failed", message: "x" }), undefined)
    const many = Array.from({ length: 30 }, (_, index) => ({ path: `p${index}`, message: "x", code: "copy-date" }))
    assert.equal(toValidationLog({ kind: "validation-failed", message: "x", issues: many })!.length, 12)
  })

  test("une génération valide ne journalise rien", async () => {
    const { logs, response } = await runHandler(safeDraft())
    assert.equal(response.status, 200)
    assert.deepEqual(logs, [])
  })

  test("le journal par défaut écrit une ligne par règle : [email-generation-validation] stage=… rule=… path=… match=…", async () => {
    const lines: string[] = []
    const spy = mock.method(console, "error", (...args: unknown[]) => void lines.push(args.map(String).join(" ")))
    try {
      const draft = safeDraft()
      draft.offer.text = "Une formation gratuite pour votre reconversion."
      const client = { messages: { create: async () => message(draft) } }
      await handleEmailGeneration(new Request("http://localhost/api/generate-email", { method: "POST", body: JSON.stringify(toEmailRequestBody(smokeForm as never)) }), {
        engine: (input) => generateEmailV2(input, { client, env: { ANTHROPIC_API_KEY: "sk-ant-test-0000000000000000" } }),
      })
    } finally {
      spy.mock.restore()
    }
    assert.ok(lines.some((line) => line.startsWith("[email-generation] ") && line.includes('"kind":"validation-failed"') && !line.includes("issues")))
    assert.ok(lines.some((line) => line === "[email-generation-validation] stage=recipe rule=copy-gratuit path=blocks.offer.slots.texte-descriptif match=gratuite"))
    assert.ok(!lines.some((line) => /sk-ant/.test(line)))
  })
})

/* -------------------------------------------------------------------------- */
/* Composition V1.5                                                           */
/* -------------------------------------------------------------------------- */

describe("diagnostic 422 — la composition V1.5 n'intervient pas dans la génération", () => {
  test("V1.5 COMPOSITION NOT INVOLVED IN GENERATION FAILURE : aucun module du chemin de génération R4 n'importe composition", () => {
    for (const name of ["generate-handler", "anthropic-v2", "anthropic", "promotion-prompt", "promotion-resolver", "promotion-copy", "promotion-draft", "promotion-facts", "recipe-brand-context"]) {
      assert.ok(!/from "\.\/composition"/.test(source(`lib/email/${name}.ts`)), `${name}.ts`)
    }
    assert.ok(!/applyEmailComposition|visibleEmail|safeParseEmailComposition|emptyEmailComposition/.test(source("lib/email/generate-handler.ts")))
  })
})
