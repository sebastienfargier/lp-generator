/**
 * R4 — promotion / campagne commerciale. Hors ligne, sans Anthropic : `fetch`
 * est interdit, le fournisseur est simulé. Les valeurs des fixtures (montants,
 * pourcentages, codes DEMO, dates) sont des DONNÉES DE DÉMONSTRATION : jamais une
 * offre Studi.
 *
 * Ce que ces tests figent : l'offre appartient aux Promotion Facts, la copie
 * appartient à Claude, et aucune valeur commerciale ne passe de l'un à l'autre.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { DEFAULT_EMAIL_MODEL, EMAIL_MAX_TOKENS, type EmailClaudeClient } from "../anthropic"
import { generateEmailV2 } from "../anthropic-v2"
import { emailDestinations, emailDestinationUrl } from "../destinations"
import { emailDisclaimers } from "../disclaimers"
import { handleEmailGeneration, toEmailEngineRequest, toEmailRecipeRequest } from "../generate-handler"
import { emailGeneratorExamples } from "../generator-examples"
import { canGenerateEmail, emailPromotionDestinations, emailPromotionFormError, emailPromotionOfferTypes, toEmailRequestBody, type EmailGeneratorForm } from "../generator-form"
import { emailBank } from "../image-bank"
import { lintPromotionCopy } from "../promotion-copy"
import { PromotionDraftSchema, buildPromotionDraftJsonSchema, buildPromotionTransportSchema, promotionVisualIntents } from "../promotion-draft"
import {
  PromotionFactsSchema,
  formatPromotionDate,
  promotionDeadlineLabel,
  promotionDestinations,
  promotionOfferValue,
  promotionScopeSentence,
  promotionValueSlot,
  safeParseEmailPromotionRequest,
  type EmailPromotionRequest,
} from "../promotion-facts"
import { emailPromotionFixtures, promotionFixtureToday, resolveEmailPromotionFixture, type EmailPromotionFixtureId } from "../promotion-fixtures"
import { buildPromotionPrompt, checkPromotionRequest, promotionSystemPrompt } from "../promotion-prompt"
import { composePromotion, promotionSequences, promotionVariantFor, resolvePromotionDraft, validatePromotionConfig } from "../promotion-resolver"
import { buildEmailRecipePrompt } from "../recipe-prompts"
import { selectEmailRecipe } from "../recipe-selection"
import { emailRecipeIntents, emailRecipeTargets } from "../recipe-selection"
import { renderEmail } from "../renderer"
import { toPreviewHtml } from "../preview"
import { measure } from "./schema-metrics"

const root = process.cwd()
const nbsp = " "

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (id: EmailPromotionFixtureId) => emailPromotionFixtures.find((entry) => entry.id === id)!
const request = (id: EmailPromotionFixtureId, over: Json = {}) => ({ ...structuredClone(fixture(id).request), ...over }) as EmailPromotionRequest
const draft = (id: EmailPromotionFixtureId): Json => structuredClone(fixture(id).draft) as Json
const resolved = (id: EmailPromotionFixtureId) => {
  const { resolution } = resolveEmailPromotionFixture(id)
  if (resolution.status !== "resolved") throw new Error(`${id} : ${resolution.status} ${JSON.stringify("issues" in resolution ? resolution.issues : "")}`)
  return resolution
}
const ids = ["R4-A", "R4-B", "R4-C"] as const

/** Tous les textes d'une config : objet, préheader, texte, libellés, alt. */
const allTexts = (config: ReturnType<typeof resolved>["config"]) =>
  [config.subject, config.preheader, ...config.blocks.flatMap((block) => Object.values(block.slots as Record<string, Json>).flatMap((value) => [value.text, value.label, value.alt]))].filter((value): value is string => typeof value === "string")

const blockOf = (config: ReturnType<typeof resolved>["config"], id: string) => config.blocks.find((block) => block.id === id)! as unknown as { id: string; type: string; slots: Json }

/* -------------------------------------------------------------------------- */
/* Contrat Promotion Facts                                                    */
/* -------------------------------------------------------------------------- */

describe("R4 — contrat Promotion Facts", () => {
  const valid = { offer: { type: "percent", percent: 20 }, endDate: "2026-10-31", scope: "les formations diplômantes", destination: "catalogue-formations" }

  test("les fixtures sont conformes ; contrat minimal : valeur, date de fin, périmètre, destination ; code facultatif", () => {
    for (const { request: r } of emailPromotionFixtures) assert.ok(PromotionFactsSchema.safeParse(r.promotion).success)
    assert.ok(PromotionFactsSchema.safeParse(valid).success)
    assert.ok(PromotionFactsSchema.safeParse({ ...valid, code: "DEMO20" }).success)
    for (const key of ["offer", "endDate", "scope", "destination"]) {
      const rest = Object.fromEntries(Object.entries(valid as Json).filter(([name]) => name !== key))
      assert.ok(!PromotionFactsSchema.safeParse(rest).success, `${key} requis`)
    }
  })

  test("strict : tout champ réservé au resolver est refusé (mention légale, conditions, URL, image, lame, surface, classe, HTML)", () => {
    for (const key of ["legalMention", "legal", "conditions", "disclaimer", "url", "href", "image", "imageUrl", "lame", "block", "surface", "class", "html", "css", "price", "offerValue", "promoCode", "countdown"]) {
      assert.ok(!PromotionFactsSchema.safeParse({ ...valid, [key]: "x" }).success, key)
    }
  })

  test("deux types d'offre seulement, valeurs entières bornées ; jamais les deux à la fois", () => {
    const parse = (offer: unknown) => PromotionFactsSchema.safeParse({ ...valid, offer }).success
    assert.ok(parse({ type: "percent", percent: 1 }) && parse({ type: "percent", percent: 100 }) && parse({ type: "amount", amount: 1 }) && parse({ type: "amount", amount: 100000 }))
    for (const bad of [{ type: "percent", percent: 0 }, { type: "percent", percent: 101 }, { type: "percent", percent: 12.5 }, { type: "percent", percent: "20" }, { type: "amount", amount: 0 }, { type: "amount", amount: 100001 }, { type: "amount", amount: 49.9 }, { type: "amount", percent: 20 }, { type: "percent", amount: 500 }, { type: "percent", percent: 20, amount: 500 }, { type: "benefit", label: "x" }, { type: "percent" }, {}]) {
      assert.ok(!parse(bad), JSON.stringify(bad))
    }
  })

  test("code : capitales, chiffres, tirets, 2 à 20 caractères, jamais modifié (casse exacte)", () => {
    const parse = (code: unknown) => PromotionFactsSchema.safeParse({ ...valid, code }).success
    for (const good of ["DEMO20", "RENTREE-20", "AB", "A".repeat(20)]) assert.ok(parse(good), good)
    for (const bad of ["demo20", "Demo20", "DEMO 20", "DEMO_20", "-DEMO", "A", "A".repeat(21), "", "DÉMO", "<B>X</B>"]) assert.ok(!parse(bad), bad)
  })

  test("date de fin : AAAA-MM-JJ, date de calendrier réelle, obligatoire", () => {
    const parse = (endDate: unknown) => PromotionFactsSchema.safeParse({ ...valid, endDate }).success
    assert.ok(parse("2026-10-31") && parse("2028-02-29"))
    for (const bad of ["2026-02-30", "2026-13-01", "31/10/2026", "2026-10-31T10:00:00Z", "demain", "", undefined, 20261031]) assert.ok(!parse(bad), String(bad))
  })

  test("destination : liste fermée de destinations contrôlées existantes ; ni financement, ni blog, ni URL", () => {
    assert.deepEqual([...promotionDestinations], ["catalogue-formations", "alternance", "diplomes", "certificats"])
    for (const id of promotionDestinations) assert.ok(id in emailDestinations)
    const parse = (destination: unknown) => PromotionFactsSchema.safeParse({ ...valid, destination }).success
    for (const bad of ["financement", "financement-personnel", "cpf-formations-eligibles", "blog", "metiers", "inconnue", "https://www.studi.com/fr/formations", "/fr/formations", ""]) assert.ok(!parse(bad), bad)
  })

  test("périmètre : groupe nominal court, sans HTML ni URL", () => {
    const parse = (scope: unknown) => PromotionFactsSchema.safeParse({ ...valid, scope }).success
    assert.ok(parse("les formations diplômantes") && parse("les certificats professionnels"))
    for (const bad of ["", "ab", "x".repeat(81), "<b>les formations</b>", "voir https://example.com", "les formations www.example.com", "/images/x.jpg"]) assert.ok(!parse(bad), bad)
  })

  test("requête R4 : intention « promotion » littérale, Promotion Facts obligatoires, aucune information libre ni offre V1", () => {
    const base = request("R4-A")
    assert.ok(safeParseEmailPromotionRequest(base).success)
    for (const bad of [
      { ...base, intent: "discovery" },
      { ...base, intent: undefined },
      { ...base, promotion: undefined },
      { ...base, facts: [{ statement: "Un fait." }] },
      { ...base, offer: { summary: "x", disclaimer: "offre-promotionnelle" } },
      { ...base, emailType: "promo" },
      { ...base, target: "inconnue" },
      { ...base, visuals: [] },
    ]) assert.ok(!safeParseEmailPromotionRequest(bad).success)
  })
})

/* -------------------------------------------------------------------------- */
/* Valeurs exactes                                                            */
/* -------------------------------------------------------------------------- */

describe("R4 — valeurs affichées, déterministes", () => {
  test("20 % reste exactement 20 % ; 25 % est une autre valeur", () => {
    assert.equal(promotionOfferValue({ offer: { type: "percent", percent: 20 } }), `-20${nbsp}%`)
    assert.notEqual(promotionOfferValue({ offer: { type: "percent", percent: 20 } }), promotionOfferValue({ offer: { type: "percent", percent: 25 } }))
    assert.equal(promotionValueSlot({ offer: { type: "percent", percent: 20 } }), `-20${nbsp}%*`, "le marqueur relie la valeur à la mention légale")
  })

  test("500 € reste exactement 500 € ; 550 € est une autre valeur ; jamais « jusqu'à »", () => {
    assert.equal(promotionOfferValue({ offer: { type: "amount", amount: 500 } }), `-500${nbsp}€`)
    assert.notEqual(promotionOfferValue({ offer: { type: "amount", amount: 500 } }), promotionOfferValue({ offer: { type: "amount", amount: 550 } }))
    for (const value of [promotionOfferValue({ offer: { type: "amount", amount: 500 } }), promotionOfferValue({ offer: { type: "percent", percent: 20 } })]) assert.ok(!/jusqu|partir/i.test(value))
  })

  test("un montant à quatre chiffres garde ses milliers insécables : la valeur ne se coupe jamais en deux lignes", () => {
    assert.equal(promotionOfferValue({ offer: { type: "amount", amount: 1500 } }), `-1${nbsp}500${nbsp}€`)
    assert.ok(!/ /.test(promotionOfferValue({ offer: { type: "amount", amount: 12000 } })), "aucune espace ordinaire")
  })

  test("date : « 15 octobre 2026 », « 1er décembre 2026 » ; étiquette d'en-tête construite par le système", () => {
    assert.equal(formatPromotionDate("2026-10-15"), "15 octobre 2026")
    assert.equal(formatPromotionDate("2026-12-01"), "1er décembre 2026")
    assert.equal(formatPromotionDate("2027-02-09"), "9 février 2027")
    assert.equal(promotionDeadlineLabel({ endDate: "2026-10-31" }), "Offre valable jusqu'au 31 octobre 2026")
  })

  test("phrase de périmètre : « Offre valable sur … », point final normalisé", () => {
    assert.equal(promotionScopeSentence({ scope: "les formations diplômantes" }), "Offre valable sur les formations diplômantes.")
    assert.equal(promotionScopeSentence({ scope: "les formations diplômantes. " }), "Offre valable sur les formations diplômantes.")
  })
})

/* -------------------------------------------------------------------------- */
/* Refus avant tout appel                                                     */
/* -------------------------------------------------------------------------- */

describe("R4 — refus avant tout appel de modèle", () => {
  const check = (over: Json) => checkPromotionRequest({ ...request("R4-B"), ...over }, { today: promotionFixtureToday })
  const issues = (over: Json) => {
    const result = check(over)
    return result.status === "invalid" ? result.issues : []
  }

  test("une demande valide passe ; la date du jour est admise, la veille est refusée", () => {
    assert.equal(check({}).status, "valid")
    assert.equal(checkPromotionRequest(request("R4-B"), { today: "2026-11-15" }).status, "valid", "dernier jour")
    assert.equal(checkPromotionRequest(request("R4-B"), { today: "2026-11-16" }).status, "invalid", "date dépassée")
  })

  test("promotion sans valeur, destination inconnue, code vide, date invalide, champ réservé : refusés", () => {
    const base = request("R4-B")
    const bad = (promotion: Json) => checkPromotionRequest({ ...base, promotion: { ...base.promotion, ...promotion } }, { today: promotionFixtureToday }).status
    assert.equal(bad({ offer: undefined }), "invalid")
    assert.equal(bad({ destination: "inconnue" }), "invalid")
    assert.equal(bad({ code: "" }), "invalid", "un code vide n'est pas « sans code »")
    assert.equal(bad({ endDate: "2026-02-30" }), "invalid")
    assert.equal(bad({ legalMention: "Un texte légal libre." }), "invalid")
    assert.equal(bad({ url: "https://example.com" }), "invalid")
  })

  test("une valeur du brief qui diffère des Promotion Facts est refusée ; la même valeur est admise", () => {
    assert.ok(issues({ brief: "Une remise de -30 % pour les alternants." }).some((issue) => issue.path === "brief"))
    assert.ok(issues({ brief: "Une remise de 25 pour cent." }).length > 0)
    assert.ok(issues({ campaignName: "Offre 50 %" }).some((issue) => issue.path === "campaignName"))
    assert.equal(issues({ brief: "Une remise de -20 % pour les alternants." }).length, 0)
    const amount = checkPromotionRequest({ ...request("R4-A"), brief: "Une remise de 550 € à présenter." }, { today: promotionFixtureToday })
    assert.equal(amount.status, "invalid")
    assert.equal(checkPromotionRequest({ ...request("R4-A"), brief: "Une remise de 500 euros à présenter." }, { today: promotionFixtureToday }).status, "valid")
  })

  test("une date du brief qui diffère de la date de fin est refusée ; la même est admise", () => {
    assert.ok(issues({ brief: "Valable jusqu'au 30 novembre." }).some((issue) => issue.path === "brief"))
    assert.ok(issues({ brief: "Valable jusqu'au 01/12/2026." }).length > 0)
    assert.equal(issues({ brief: "Valable jusqu'au 15 novembre." }).length, 0)
    assert.equal(issues({ brief: "Valable jusqu'au 15 novembre 2026." }).length, 0)
    assert.ok(issues({ brief: "Valable jusqu'au 15 novembre 2027." }).length > 0)
  })

  test("un code du brief qui diffère du code de l'offre est refusé, de même un code sans code d'offre", () => {
    assert.ok(issues({ brief: "Utiliser le code PROMO10 à l'inscription." }).length > 0)
    assert.equal(issues({ brief: "Utiliser le code DEMO20 à l'inscription." }).length, 0)
    const noCode = checkPromotionRequest({ ...request("R4-A"), brief: "Avec le code RENTREE20." }, { today: promotionFixtureToday })
    assert.equal(noCode.status, "invalid")
  })

  test("un objet imposé qui presse, ou qui cite une autre valeur, est refusé ; la valeur exacte est admise", () => {
    assert.ok(issues({ subject: "Dernière chance : -20 %" }).some((issue) => issue.path === "subject"))
    assert.ok(issues({ subject: "-25 % sur tout" }).some((issue) => issue.path === "subject"))
    assert.equal(issues({ subject: "-20 % sur ta formation" }).length, 0)
  })

  test("le prompt n'est jamais construit pour une demande refusée ; le moteur la refuse sans appel", async () => {
    const prompt = buildPromotionPrompt({ ...request("R4-B"), brief: "Une remise de -30 %." }, { today: promotionFixtureToday })
    assert.equal(prompt.status, "invalid-request")
    let calls = 0
    const client: EmailClaudeClient = { messages: { create: async () => ((calls += 1), {} as Anthropic.Message) } }
    const result = await generateEmailV2({ ...request("R4-B"), brief: "Une remise de -30 %." }, { client, env: {} })
    assert.equal(result.status, "error")
    assert.equal(result.status === "error" ? result.error.kind : "", "invalid-request")
    assert.equal(calls, 0)
    const past = await generateEmailV2({ ...request("R4-B"), promotion: { ...request("R4-B").promotion, endDate: "2020-01-01" } }, { client, env: {} })
    assert.equal(past.status === "error" ? past.error.kind : "", "invalid-request")
    assert.equal(calls, 0)
  })

  test("l'ancien refus global « promotion » devient : promotion uniquement via le contrat R4", () => {
    const legacy = selectEmailRecipe({ campaignName: "x", brief: "y", audience: "z", objective: "decouverte-formations", emailType: "promo" } as never)
    assert.equal(legacy.status, "unsupported")
    assert.ok(legacy.status === "unsupported" && legacy.issues.some((issue) => issue.code === "promotion" && /intention « promotion »/.test(issue.message)))
    assert.ok(!(emailRecipeIntents as readonly string[]).includes("promotion"), "R1-R3 : intentions inchangées")
    const prompt = buildEmailRecipePrompt({ campaignName: "x", brief: "y", audience: "z", objective: "decouverte-formations", emailType: "promo" })
    assert.equal(prompt.status, "unsupported")
  })
})

/* -------------------------------------------------------------------------- */
/* Draft R4                                                                   */
/* -------------------------------------------------------------------------- */

describe("R4 — Draft compact et strict", () => {
  test("les fixtures sont des Drafts valides", () => {
    for (const id of ids) assert.ok(PromotionDraftSchema.safeParse(fixture(id).draft).success, id)
  })

  test("Claude ne peut produire ni valeur, ni code, ni prix, ni date, ni légal, ni URL, ni image, ni lame, ni surface : champ refusé", () => {
    for (const key of ["offerValue", "value", "price", "amount", "percent", "percentage", "promoCode", "code", "endDate", "deadline", "scope", "conditions", "legalMention", "disclaimer", "destination", "url", "href", "image", "imageUrl", "lame", "block", "surface", "class", "html", "css"]) {
      assert.ok(!PromotionDraftSchema.safeParse({ ...draft("R4-A"), [key]: "x" }).success, `racine.${key}`)
      assert.ok(!PromotionDraftSchema.safeParse({ ...draft("R4-A"), offer: { ...draft("R4-A").offer, [key]: "x" } }).success, `offer.${key}`)
      assert.ok(!PromotionDraftSchema.safeParse({ ...draft("R4-A"), closing: { ...draft("R4-A").closing, [key]: "x" } }).success, `closing.${key}`)
    }
  })

  test("HTML, URL et chemin d'image refusés dans tout champ de texte", () => {
    const paths: [string, (d: Json, value: string) => void][] = [
      ["subject", (d, value) => (d.subject = value)],
      ["preheader", (d, value) => (d.preheader = value)],
      ["offer.eyebrow", (d, value) => (d.offer.eyebrow = value)],
      ["offer.text", (d, value) => (d.offer.text = value)],
      ["offer.ctaLabel", (d, value) => (d.offer.ctaLabel = value)],
      ["support.title", (d, value) => (d.support.title = value)],
      ["support.items.0.text", (d, value) => (d.support.items[0].text = value)],
      ["closing.text", (d, value) => (d.closing.text = value)],
      ["closing.ctaLabel", (d, value) => (d.closing.ctaLabel = value)],
    ]
    for (const bad of ["<b>Offre</b>", "<script>x</script>", "Voir https://www.studi.com/fr/formations", "Voir www.studi.com", "/images/promo.jpg", "photo.jpeg", "<!-- note -->"]) {
      for (const [path, set] of paths) {
        const candidate = draft("R4-A")
        set(candidate, bad)
        assert.ok(!PromotionDraftSchema.safeParse(candidate).success, `${path} : ${bad}`)
      }
    }
  })

  test("trois appuis exactement, icônes de la liste, intention visuelle de la promotion, texte non vide", () => {
    const base = draft("R4-A")
    assert.ok(!PromotionDraftSchema.safeParse({ ...base, support: { ...base.support, items: base.support.items.slice(0, 2) } }).success)
    assert.ok(!PromotionDraftSchema.safeParse({ ...base, support: { ...base.support, items: [...base.support.items, base.support.items[0]] } }).success)
    assert.ok(!PromotionDraftSchema.safeParse({ ...base, support: { ...base.support, items: base.support.items.map((item: Json) => ({ ...item, icon: "rocket-launch" })) } }).success)
    assert.ok(!PromotionDraftSchema.safeParse({ ...base, visualIntent: "warm-reassurance" }).success)
    assert.ok(!PromotionDraftSchema.safeParse({ ...base, subject: "   " }).success)
    assert.deepEqual([...promotionVisualIntents], ["campaign-portrait", "career-movement"])
  })

  test("schéma Structured Output : aucun optionnel, aucune union, aucun motif, cinq objets, risque BAS", () => {
    const schema = buildPromotionTransportSchema()
    const metrics = measure(schema as Record<string, unknown>)
    assert.equal(metrics.optional, 0, "tous les champs sont requis")
    assert.equal(metrics.unions, 0, "ni anyOf ni oneOf")
    assert.equal(metrics.patterns, 0)
    assert.ok(metrics.objects <= 5, `objets : ${metrics.objects}`)
    assert.ok(metrics.properties <= 22, `propriétés : ${metrics.properties}`)
    assert.ok(metrics.depth <= 8, `profondeur : ${metrics.depth}`)
    const text = JSON.stringify(schema)
    assert.ok(!/oneOf|anyOf|minLength|maxLength|maxItems|"pattern"|\$schema/.test(text), "aucun mot-clé non pris en charge")
    assert.ok(text.length < 3000, `taille : ${text.length}`)
    assert.ok(!/offerValue|promoCode|endDate|legal|url|href|surface|class|html/i.test(text), "aucun champ de valeur commerciale ni de présentation")
    assert.equal(measure(buildPromotionDraftJsonSchema() as Record<string, unknown>).optional, 0)
  })
})

/* -------------------------------------------------------------------------- */
/* Copie                                                                      */
/* -------------------------------------------------------------------------- */

describe("R4 — copie de Claude", () => {
  const percent = { offer: { type: "percent", percent: 20 } as const, code: "DEMO20" }
  const noCode = { offer: { type: "percent", percent: 20 } as const }
  const rules = (text: string, field: "subject" | "preheader" | "body", facts: { offer: { type: "percent"; percent: number } | { type: "amount"; amount: number }; code?: string } = percent, context?: { hasDeadline?: boolean; hasCode?: boolean }) =>
    lintPromotionCopy(text, field, facts, context).map((issue) => issue.rule)

  test("une copie sobre passe, dans l'objet, le préheader et le corps", () => {
    for (const field of ["subject", "preheader", "body"] as const) assert.deepEqual(rules("Découvrez les formations concernées par l'offre.", field), [], field)
  })

  test("corps : aucun chiffre, symbole % ou €, ni nombre écrit en lettres", () => {
    for (const bad of ["Une remise de 20 % pour vous.", "Profitez de 20 pour cent.", "Dès 500 € de remise", "Une offre sur 3 formations", "Une remise de vingt pour cent", "Deux cents euros offerts", "Pendant trente jours", "Le tarif passe à 12 mois", "€", "100%"]) {
      assert.ok(rules(bad, "body").some((rule) => rule === "chiffre" || rule === "chiffre-lettres"), bad)
    }
  })

  test("objet et préheader : la valeur exacte de l'offre est admise, toute autre valeur est refusée (20 % ≠ 25 %, 500 € ≠ 550 €)", () => {
    assert.deepEqual(rules("-20 % sur votre formation", "subject"), [])
    assert.deepEqual(rules(`-20${nbsp}% sur votre formation`, "subject"), [])
    assert.deepEqual(rules("20 % sur votre formation", "preheader"), [])
    assert.ok(rules("-25 % sur votre formation", "subject").includes("chiffre"))
    assert.ok(rules("-2 % sur votre formation", "subject").includes("chiffre"))
    assert.ok(rules("-20 € sur votre formation", "subject").includes("chiffre"), "bonne valeur, mauvaise unité")
    assert.ok(rules("-20 % et 3 formations", "subject").includes("chiffre"))
    const amount = { offer: { type: "amount", amount: 500 } as const }
    assert.deepEqual(rules("-500 € pour démarrer", "subject", amount), [])
    assert.deepEqual(rules("500 euros pour démarrer", "subject", amount), [])
    assert.ok(rules("-550 € pour démarrer", "subject", amount).includes("chiffre"))
    assert.ok(rules("-500 % pour démarrer", "subject", amount).includes("chiffre"))
    assert.ok(rules("Un symbole € seul", "preheader", amount).includes("chiffre"))
    assert.ok(rules("Des milliers de formations", "preheader", amount).length === 0)
  })

  test("aucune date, aucun délai, aucun compte à rebours : la date de fin est affichée par le système", () => {
    for (const bad of ["Valable en octobre", "Jusqu'au 15 octobre", "Avant le 31 octobre", "À partir de demain", "Cette semaine seulement", "Ce mois-ci", "Dès le premier jour", "Il ne reste que quelques jours", "Plus que quelques jours", "Le compte à rebours est lancé", "Jusqu'à la fin du mois d'octobre", "D'ici la fin de l'année"]) {
      assert.ok(rules(bad, "body", noCode).length > 0, bad)
    }
  })

  test("aucune pression ni urgence factice", () => {
    for (const bad of ["Dernière chance", "Dépêchez-vous", "Aujourd'hui seulement", "Ne manquez pas cette offre", "Avant qu'il ne soit trop tard", "Vite, profitez-en", "Derniers jours", "Dernier jour pour en profiter", "Une offre exceptionnelle", "Un prix imbattable : le meilleur prix", "Offre exclusive"]) {
      assert.ok(rules(bad, "body").length > 0, bad)
    }
  })

  test("formulation d'échéance sans date : refusée si aucune date de fin contrôlée n'existe, admise sinon", () => {
    for (const text of ["Une offre limitée dans le temps", "Une offre pour une durée limitée", "L'offre se termine bientôt", "Pendant la durée de l'offre"]) {
      assert.ok(rules(text, "body", percent, { hasDeadline: false }).includes("echeance"), `${text} sans date de fin`)
      assert.ok(!rules(text, "body", percent, { hasDeadline: true }).includes("echeance"), `${text} avec date de fin`)
    }
    assert.ok(rules("Dépêchez-vous", "body", percent, { hasDeadline: true }).length > 0, "la pression est refusée même avec une date")
  })

  test("portée : « jusqu'à », « à partir de », « économisez » changent la valeur contrôlée : refusés", () => {
    for (const bad of ["Jusqu'à une belle remise", "À partir de maintenant", "Économisez sur votre formation", "Gagnez de l'argent", "Remise de bienvenue", "Une réduction de rentrée"]) {
      assert.ok(rules(bad, "body", noCode).length > 0, bad)
    }
    assert.deepEqual(rules("Une remise pour franchir le pas", "body", noCode), [])
  })

  test("code : jamais écrit par Claude ; le mot « code » seulement si l'offre porte un code ; aucune mention sans code", () => {
    assert.ok(rules("Utilisez DEMO20 à l'inscription", "body").includes("code"))
    assert.ok(rules("Utilisez demo20 à l'inscription", "body").includes("code"), "casse ignorée")
    assert.ok(rules("Utilisez BIENVENUE à l'inscription", "body").includes("code"), "un mot en capitales est la forme d'un code inventé")
    assert.ok(!rules("Découvrez Studi", "body").includes("code"), "une marque en casse normale n'est pas un code")
    assert.ok(rules("Le code DEMO20 vous attend", "subject").includes("code"))
    assert.ok(!rules("Utilisez le code à l'inscription", "body").includes("code"), "le mot seul est admis avec un code")
    for (const bad of ["Utilisez le code", "Un code promo vous attend", "Votre coupon", "Un bon de réduction"]) assert.ok(rules(bad, "body", noCode).includes("code"), bad)
    assert.ok(!rules("Une offre sur le catalogue", "body", noCode).includes("code"))
  })

  test("financement, gratuité, garanties, conseiller : aucun fait approuvé, aucune mention", () => {
    for (const bad of ["Un financement possible", "Éligible au CPF", "Compte personnel de formation", "Pris en charge par France Travail", "Paiement en plusieurs mensualités", "Facilités de paiement", "Sans frais", "Une formation gratuite", "Un cadeau de bienvenue", "Réussite garantie", "Un conseiller vous accompagne", "Un coach dédié", "Un accompagnement personnalisé", "Subvention disponible", "Votre OPCO"]) {
      assert.ok(rules(bad, "body", noCode).length > 0, bad)
    }
  })

  test("aucun texte de copie des fixtures ne déclenche une règle", () => {
    for (const id of ids) {
      const { request: r, draft: d } = fixture(id) as { request: EmailPromotionRequest; draft: Json }
      const bodies = [d.offer.eyebrow, d.offer.text, d.offer.ctaLabel, d.support.title, ...d.support.items.flatMap((item: Json) => [item.title, item.text]), d.closing.title, d.closing.text, d.closing.ctaLabel]
      for (const text of bodies) assert.deepEqual(lintPromotionCopy(text, "body", r.promotion), [], `${id} : ${text}`)
      assert.deepEqual(lintPromotionCopy(d.subject, "subject", r.promotion), [], `${id} : objet`)
      assert.deepEqual(lintPromotionCopy(d.preheader, "preheader", r.promotion), [], `${id} : préheader`)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Resolver : fixtures                                                        */
/* -------------------------------------------------------------------------- */

describe("R4 — fixtures de démonstration : Draft → EmailConfig → validation → rendu → aperçu", () => {
  test("trois fixtures réellement différentes, toutes marquées comme données de démonstration", () => {
    assert.equal(emailPromotionFixtures.length, 3)
    for (const entry of emailPromotionFixtures) {
      assert.equal(entry.demo, true, entry.id)
      const code = (entry.request.promotion as { code?: string }).code
      assert.ok(!code || /^DEMO/.test(code), `${entry.id} : code de démonstration`)
    }
    const variants = ids.map((id) => resolved(id).variant)
    assert.deepEqual(variants, ["banner", "offer-hero", "code-banner"])
    assert.deepEqual(ids.map((id) => fixture(id).request.promotion.offer.type), ["amount", "percent", "amount"])
    assert.deepEqual(ids.map((id) => (request(id).promotion as { code?: string }).code ?? null), [null, "DEMO20", "DEMO-CERTIF"])
    assert.equal(new Set(ids.map((id) => fixture(id).request.target)).size, 3, "trois cibles")
    assert.equal(new Set(ids.map((id) => fixture(id).request.promotion.destination)).size, 3, "trois destinations")
    assert.equal(new Set(ids.map((id) => resolved(id).config.blocks.map((block) => block.type).join())).size, 3, "trois séquences de lames")
  })

  for (const id of ids) {
    test(`${id} : EmailConfig valide, séquence de la composition, zone colorée unique, aucune correction`, () => {
      const r = resolved(id)
      assert.deepEqual(r.config.blocks.map((block) => block.type), [...promotionSequences[r.variant]])
      assert.equal(r.config.blocks.filter((block) => block.id === "offer").length, 1)
      assert.equal(validatePromotionConfig(r.config, request(id)).length, 0)
      assert.ok(r.config.blocks.length >= 6 && r.config.blocks.length <= 7)
      assert.equal(r.config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
      assert.equal(r.config.blocks[0]!.type, "email-module-header-seasonal-campaign")
    })

    test(`${id} : valeur, code, date, périmètre, destination et mention légale viennent des Promotion Facts, à l'identique`, () => {
      const r = resolved(id)
      const { promotion } = request(id)
      const offer = blockOf(r.config, "offer")
      assert.equal(offer.slots["valeur-cle"].text, promotionValueSlot(promotion))
      const codeSlots = r.config.blocks.flatMap((block) => Object.entries((block as unknown as { slots: Json }).slots).filter(([name]) => name === "code-promo-1"))
      if (promotion.code) assert.deepEqual(codeSlots.map(([, value]) => (value as Json).text), [promotion.code], "code exact, une seule fois")
      else assert.equal(codeSlots.length, 0, "sans code, aucun slot de code")
      assert.equal(blockOf(r.config, "header").slots.label.text, promotionDeadlineLabel(promotion))
      const scope = r.variant === "banner" ? offer.slots["texte-descriptif-2"].text : offer.slots["texte-descriptif"].text
      assert.ok(scope.endsWith(promotionScopeSentence(promotion)))
      const href = emailDestinationUrl(promotion.destination)
      const buttons = r.config.blocks.flatMap((block) => Object.entries((block as unknown as { slots: Json }).slots).filter(([name]) => name.startsWith("cta-")).map(([, value]) => (value as Json).href))
      assert.equal(buttons.length, 2)
      assert.ok(buttons.every((value) => value === href))
      assert.deepEqual(blockOf(r.config, "mentions-legales").slots, { "disclaimer-1": { disclaimer: "offre-promotionnelle", endDate: promotion.endDate } })
    })

    test(`${id} : rendu, aperçu et HTML exportable portent les valeurs exactes ; aucune URL de démonstration dans l'aperçu`, () => {
      const r = resolved(id)
      const { promotion } = request(id)
      const html = renderEmail(r.config)
      const preview = toPreviewHtml(html)
      const frenchEnd = promotion.endDate.split("-").reverse().join("/")
      for (const output of [html, preview]) {
        assert.ok(output.includes(promotionValueSlot(promotion).replace("*", "")) && output.includes("*"), "valeur")
        assert.ok(output.includes(promotionDeadlineLabel(promotion)), "date de fin")
        assert.ok(output.includes(`valable jusqu'au ${frenchEnd}`), "mention légale datée")
        assert.ok(output.includes("Offre soumise à conditions d&#39;éligibilité") || output.includes("Offre soumise à conditions d'éligibilité"), "mention légale du catalogue")
        if (promotion.code) assert.ok(output.includes(promotion.code))
        else assert.ok(!/\bCode\b[^<]*<strong/.test(output), "aucune ligne de code")
      }
      assert.ok(!preview.includes("demo-assets.invalid"))
      assert.ok(html.includes("demo-assets.invalid/email-v2/") || r.variant === "banner", "visuels canoniques de la banque")
      assert.equal((html.match(/class="lame" width="600"/g) ?? []).length, r.config.blocks.length)
    })

    test(`${id} : terminologie sans diagnostic, longueur dans la fourchette, images de la banque avec alt contrôlé`, () => {
      const r = resolved(id)
      assert.deepEqual(r.diagnostics, [], "aucun terme de marque à signaler")
      assert.deepEqual(r.policy.blocking, [])
      const images = r.config.blocks.flatMap((block) => Object.values((block as unknown as { slots: Json }).slots).filter((value) => "src" in (value as Json))) as { src: string; alt: string }[]
      assert.ok(images.length >= 1)
      for (const image of images) {
        assert.match(image.src, /^https:\/\/demo-assets\.invalid\/email-v2\/[a-z0-9-]+--(offer|band)\.jpg$/)
        const bankId = /email-v2\/(.+?)--/.exec(image.src)![1] as keyof typeof emailBank
        assert.equal(image.alt, emailBank[bankId].alt)
        assert.ok((promotionVisualIntents as readonly string[]).includes(emailBank[bankId].intent))
      }
    })

    test(`${id} : déterministe : même requête, même Draft, même EmailConfig et même HTML`, () => {
      const a = resolveEmailPromotionFixture(id).resolution
      const b = resolveEmailPromotionFixture(id).resolution
      assert.deepEqual(a, b)
      assert.equal(a.status === "resolved" ? renderEmail(a.config) : "", b.status === "resolved" ? renderEmail(b.config) : "x")
    })
  }

  test("la composition vient des faits et du nom de campagne, jamais de Claude ; sans code, toujours le bandeau", () => {
    assert.equal(promotionVariantFor({}, "n'importe quel nom"), "banner")
    assert.equal(promotionVariantFor({ code: "X1" }, "Offre alternance, démonstration B"), "offer-hero")
    assert.equal(promotionVariantFor({ code: "X1" }, "Offre certificats, démonstration C"), "code-banner")
    for (const id of ids) assert.equal(promotionVariantFor(request(id).promotion, request(id).campaignName), resolved(id).variant)
    // Le Draft ne peut pas changer la composition : seules les valeurs de ses champs changent le texte.
    const other = { ...draft("R4-B"), visualIntent: "campaign-portrait" }
    const r = resolvePromotionDraft(request("R4-B"), other)
    assert.ok(r.status === "resolved" && r.variant === "offer-hero")
  })

  test("l'intention visuelle choisit une image de la banque, le resolver choisit laquelle (déterministe, jamais Claude)", () => {
    for (const intent of promotionVisualIntents) {
      const r = resolvePromotionDraft(request("R4-B"), { ...draft("R4-B"), visualIntent: intent })
      assert.equal(r.status, "resolved", intent)
      if (r.status !== "resolved") continue
      const src = (blockOf(r.config, "offer").slots["image-1"] as { src: string }).src
      const bankId = /email-v2\/(.+?)--/.exec(src)![1] as keyof typeof emailBank
      assert.equal(emailBank[bankId].intent, intent)
    }
  })

  test("R4 se distingue de R2 et de R3 : une lame d'offre sombre, un header de campagne, une mention légale promotionnelle", () => {
    const types = (id: EmailPromotionFixtureId) => resolved(id).config.blocks.map((block) => block.type)
    for (const id of ids) {
      assert.ok(types(id).includes("email-module-header-seasonal-campaign"))
      assert.ok(types(id).some((type) => ["email-module-hero-offer-image-top", "email-module-banner-full", "email-module-discount-banner-full"].includes(type)))
      assert.ok(!types(id).includes("email-module-header-newsletter"))
    }
    assert.ok(emailDisclaimers["offre-promotionnelle"].text.includes("JJ/MM/AAAA"))
  })
})

/* -------------------------------------------------------------------------- */
/* Sécurité : ce que Claude ne peut pas faire passer                           */
/* -------------------------------------------------------------------------- */

describe("R4 — sécurité : aucune valeur commerciale ne vient de Claude", () => {
  const resolve = (id: EmailPromotionFixtureId, change: (draft: Json) => void) => {
    const candidate = draft(id)
    change(candidate)
    return resolvePromotionDraft(request(id), candidate)
  }
  const rulesOf = (result: ReturnType<typeof resolvePromotionDraft>) => (result.status === "invalid-recipe" ? result.issues.map((issue) => issue.code) : [result.status])

  test("20 % reste 20 % : un Draft dont le corps cite un pourcentage est refusé ; la valeur affichée reste celle des faits", () => {
    for (const bad of ["Une remise de 25 % vous attend.", "Une remise de 20 % vous attend.", "Une remise de vingt pour cent."]) {
      assert.ok(rulesOf(resolve("R4-B", (d) => (d.offer.text = bad))).includes("copy-chiffre") || rulesOf(resolve("R4-B", (d) => (d.offer.text = bad))).includes("copy-chiffre-lettres"), bad)
    }
    const ok = resolved("R4-B")
    assert.equal(blockOf(ok.config, "offer").slots["valeur-cle"].text, `-20${nbsp}%*`)
  })

  test("500 € reste 500 € : un objet qui cite 550 € est refusé ; la valeur exacte est admise dans l'objet", () => {
    assert.ok(rulesOf(resolve("R4-A", (d) => (d.subject = "-550 € pour démarrer votre reconversion"))).includes("copy-chiffre"))
    assert.ok(rulesOf(resolve("R4-A", (d) => (d.subject = "-50 € pour démarrer votre reconversion"))).includes("copy-chiffre"))
    assert.ok(rulesOf(resolve("R4-A", (d) => (d.subject = "Jusqu'à 500 € pour démarrer"))).some((code) => code.startsWith("copy-")), "« jusqu'à » change la portée")
    assert.equal(resolve("R4-A", (d) => (d.subject = "-500 € pour démarrer votre reconversion")).status, "resolved")
  })

  test("un Draft ne peut pas imposer un faux code : le champ est refusé, et un code écrit dans le texte l'est aussi", () => {
    assert.equal(resolve("R4-B", (d) => (d.code = "FAUX99")).status, "invalid-draft")
    assert.equal(resolve("R4-B", (d) => (d.offer.promoCode = "FAUX99")).status, "invalid-draft")
    for (const invented of ["Utilisez FAUX99 pour en profiter.", "Utilisez BIENVENUE pour en profiter.", "Le code SUPERPROMO vous attend."]) {
      assert.equal(resolve("R4-B", (d) => (d.offer.text = invented)).status, "invalid-recipe", `un code inventé est refusé : ${invented}`)
    }
    assert.ok(rulesOf(resolve("R4-B", (d) => (d.offer.text = "Utilisez BIENVENUE pour en profiter."))).includes("copy-code"))
    assert.ok(rulesOf(resolve("R4-B", (d) => (d.offer.text = "Utilisez DEMO20 pour en profiter."))).includes("copy-code"))
    assert.ok(rulesOf(resolve("R4-B", (d) => (d.subject = "DEMO20 vous attend"))).includes("copy-code"))
  })

  test("un Draft ne peut pas imposer un faux prix, une date, un périmètre, une mention légale, une URL ou une image", () => {
    for (const [key, value] of [["price", "99 €"], ["offerValue", "-99 €"], ["endDate", "2027-01-01"], ["scope", "tout"], ["legalMention", "Sans condition."], ["url", "https://example.com"], ["image", "/images/x.jpg"], ["surface", "marque"], ["lame", "email-module-banner-full"]] as const) {
      assert.equal(resolve("R4-B", (d) => (d[key] = value)).status, "invalid-draft", key)
    }
    assert.equal(resolve("R4-B", (d) => (d.offer.text = "<b>Offre</b>")).status, "invalid-draft")
    assert.equal(resolve("R4-B", (d) => (d.offer.text = "Voir https://example.com")).status, "invalid-draft")
    assert.equal(resolve("R4-B", (d) => (d.closing.text = "Voir /images/promo.jpg")).status, "invalid-draft")
  })

  test("un nombre libre dans la copie est refusé : titre d'appui, texte d'appui, clôture, bouton, surtitre", () => {
    const places: [string, (d: Json) => void][] = [
      ["offer.eyebrow", (d) => (d.offer.eyebrow = "Offre 2026")],
      ["offer.ctaLabel", (d) => (d.offer.ctaLabel = "Voir les 3 offres")],
      ["support.title", (d) => (d.support.title = "Trois raisons de choisir 1 formation")],
      ["support.items.1.text", (d) => (d.support.items[1].text = "Comparez 4 formations.")],
      ["closing.text", (d) => (d.closing.text = "Réponse sous 48 heures.")],
      ["closing.ctaLabel", (d) => (d.closing.ctaLabel = "Découvrir en 1 clic")],
      ["preheader", (d) => (d.preheader = "Plus de 400 formations à parcourir.")],
      ["subject", (d) => (d.subject = "7 jours pour décider")],
    ]
    for (const [label, change] of places) assert.ok(rulesOf(resolve("R4-B", change)).includes("copy-chiffre"), label)
  })

  test("une copie de deadline est refusée sans date de fin ; avec la date de fin, la date reste celle des faits, jamais écrite par Claude", () => {
    // Sans date de fin contrôlée : la formulation d'échéance est refusée (règle appliquée avec `hasDeadline: false`).
    assert.ok(lintPromotionCopy("Une offre limitée dans le temps.", "body", { offer: { type: "percent", percent: 20 } }, { hasDeadline: false }).length > 0)
    // Avec la date de fin : la date écrite par Claude est refusée, quelle qu'elle soit.
    for (const bad of ["Valable jusqu'au 15 novembre.", "Valable jusqu'au 30 novembre.", "Offre en novembre.", "Plus que quelques jours.", "Dernier jour demain."]) {
      assert.ok(rulesOf(resolve("R4-B", (d) => (d.offer.text = bad))).some((code) => code.startsWith("copy-")), bad)
    }
    const r = resolved("R4-B")
    assert.equal(blockOf(r.config, "header").slots.label.text, "Offre valable jusqu'au 15 novembre 2026")
  })

  test("aucune mention de code sans code : refusée dans toute la copie ; aucun slot de code dans la composition", () => {
    for (const bad of ["Utilisez le code à l'inscription.", "Votre code promo vous attend.", "Un coupon pour vous."]) {
      assert.ok(rulesOf(resolve("R4-A", (d) => (d.offer.text = bad))).includes("copy-code"), bad)
    }
    const slots = JSON.stringify(resolved("R4-A").config.blocks)
    assert.ok(!slots.includes("code-promo-1"))
    assert.ok(!/\bCode\b/.test(renderEmail(resolved("R4-A").config)), "aucune ligne de code dans le HTML")
  })

  test("aucune mention de financement sans fait contrôlé : refusée, y compris vers une destination financement (non disponible)", () => {
    for (const bad of ["Un financement est possible.", "Éligible au CPF.", "Facilités de paiement.", "Pris en charge à 100 %.", "Sans frais."]) {
      assert.ok(rulesOf(resolve("R4-A", (d) => (d.offer.text = bad))).some((code) => code.startsWith("copy-")), bad)
    }
    assert.ok(!(promotionDestinations as readonly string[]).includes("financement"))
    assert.ok(!PromotionFactsSchema.safeParse({ ...request("R4-A").promotion, destination: "financement" }).success)
    for (const id of ids) assert.ok(!/financ|cpf|france travail|mensualit/i.test(allTexts(resolved(id).config).join(" ")), id)
  })

  test("falsification de l'EmailConfig : valeur, code, date, destination, mention légale, lien, image : chacune est détectée à la validation", () => {
    const base = request("R4-B")
    const tamper = (change: (config: Json) => void, code: string) => {
      const config = structuredClone(resolved("R4-B").config) as unknown as Json
      change(config)
      const codes = validatePromotionConfig(config as never, base).map((issue) => issue.code)
      assert.ok(codes.includes(code), `${code} attendu, reçu ${codes.join(",")}`)
    }
    const slot = (config: Json, id: string) => config.blocks.find((block: Json) => block.id === id).slots
    tamper((config) => (slot(config, "offer")["valeur-cle"].text = "-25 %*"), "offer-value")
    tamper((config) => (slot(config, "offer")["valeur-cle"].text = "-20 %"), "offer-value")
    tamper((config) => (slot(config, "offer")["code-promo-1"].text = "DEMO25"), "promo-code")
    tamper((config) => (slot(config, "offer")["code-promo-1"].text = "demo20"), "promo-code")
    tamper((config) => (slot(config, "header").label.text = "Offre valable jusqu'au 31 décembre 2026"), "deadline")
    tamper((config) => (slot(config, "mentions-legales")["disclaimer-1"].endDate = "2027-01-01"), "legal")
    tamper((config) => (slot(config, "mentions-legales")["disclaimer-1"].disclaimer = "diplome-ou-rembourse"), "legal")
    tamper((config) => (slot(config, "offer")["cta-1"].href = "https://www.studi.com/fr/financement?[UTM À DÉFINIR — CRM]"), "destination")
    tamper((config) => (slot(config, "closing")["cta-1"].href = emailDestinationUrl("catalogue-formations")), "destination")
    tamper((config) => (slot(config, "offer")["lien-1"].href = "https://example.com/"), "destination")
    tamper((config) => (slot(config, "offer")["image-1"].src = "https://example.com/photo.jpg"), "image")
    tamper((config) => (slot(config, "offer")["image-1"].alt = "Une autre description."), "image")
    tamper((config) => (slot(config, "offer")["texte-descriptif"].text = "Texte sans la phrase de périmètre."), "scope")
    tamper((config) => config.blocks.splice(config.blocks.findIndex((block: Json) => block.id === "mentions-legales"), 1), "sequence")
    tamper((config) => (slot(config, "support")["texte-descriptif-1"].text = "Une remise de 30 % pour vous."), "copy-chiffre")
  })

  test("sans code dans les faits, un slot de code ajouté est refusé ; avec un code, un deuxième aussi", () => {
    const noCode = request("R4-A")
    const config = structuredClone(resolved("R4-A").config) as unknown as Json
    config.blocks.find((block: Json) => block.id === "support").slots["code-promo-1"] = { text: "DEMO50" }
    assert.ok(validatePromotionConfig(config as never, noCode).some((issue) => issue.code === "promo-code"))
  })
})

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

describe("R4 — prompt court et séparé", () => {
  const ready = (id: EmailPromotionFixtureId) => {
    const prompt = buildPromotionPrompt(request(id), { today: promotionFixtureToday })
    assert.equal(prompt.status, "ready")
    if (prompt.status !== "ready") throw new Error("prêt attendu")
    return prompt
  }

  test("Claude voit l'offre pour écrire autour, jamais le code ni la date ; la valeur n'y figure que pour l'objet et le préheader", () => {
    for (const id of ids) {
      const { user, system } = ready(id)
      const { promotion } = request(id)
      assert.ok(!user.includes(promotion.endDate), `${id} : date`)
      assert.ok(!/octobre|novembre|décembre/.test(user), `${id} : mois`)
      if (promotion.code) assert.ok(!user.includes(promotion.code) && !system.includes(promotion.code), `${id} : code`)
      assert.ok(user.includes(promotionOfferValue(promotion).replace(/ /g, " ")), `${id} : valeur`)
      assert.ok(user.includes(promotion.scope))
      assert.ok(!/https?:|\.jpg|legal|disclaimer|endDate|"code"/i.test(user), `${id} : aucun champ réservé`)
    }
  })

  test("le prompt est stable, court, et ne mentionne ni lame, ni HTML, ni surface, ni mention légale à écrire", () => {
    const first = ready("R4-B")
    assert.equal(first.user, ready("R4-B").user)
    assert.equal(first.system, promotionSystemPrompt)
    assert.ok(promotionSystemPrompt.length < 4200, `système : ${promotionSystemPrompt.length}`)
    assert.ok(first.user.length < 3200, `utilisateur : ${first.user.length}`)
    assert.ok(!/email-module|\blames?\b|<\w+>/i.test(promotionSystemPrompt))
    assert.match(promotionSystemPrompt, /n'écris ni le code, ni la date de fin/)
    assert.match(promotionSystemPrompt, /ni « jusqu'à », ni « à partir de », ni « économisez »/)
    assert.match(promotionSystemPrompt, /aucune mention de financement/)
    assert.deepEqual(first.transportSchema, buildPromotionTransportSchema())
  })

  test("contexte Brand : la voix de la cible (tutoiement des alternants), les règles, les formulations à risque, des intentions visuelles de promotion ; aucune claim ni destination à choisir", () => {
    const alternants = JSON.parse(ready("R4-B").user) as Json
    assert.equal(alternants.context.voice.address, "tutoiement")
    assert.equal((JSON.parse(ready("R4-A").user) as Json).context.voice.address, "vouvoiement")
    assert.deepEqual(alternants.context.visualIntents.map((entry: Json) => entry.intent).sort(), [...promotionVisualIntents].sort())
    assert.ok(!("claims" in alternants.context) && !("destinations" in alternants.context))
    assert.ok(alternants.context.avoid.length >= 8 && alternants.context.rules.length >= 5)
    assert.deepEqual(Object.keys(alternants.request).sort(), ["audience", "brief", "campaignName", "promotion"])
    assert.deepEqual(Object.keys(alternants.request.promotion).sort(), ["cta", "scope", "value"])
  })

  test("un objet imposé est transmis ; la promotion ne reçoit ni informations libres ni offre V1", () => {
    const prompt = buildPromotionPrompt({ ...request("R4-B"), subject: "-20 % sur ta formation" }, { today: promotionFixtureToday })
    assert.ok(prompt.status === "ready" && JSON.parse(prompt.user).request.subject === "-20 % sur ta formation")
    assert.equal(buildPromotionPrompt({ ...request("R4-B"), facts: [{ statement: "x" }] }, { today: promotionFixtureToday }).status, "invalid-request")
  })
})

/* -------------------------------------------------------------------------- */
/* Route et moteur (fournisseur simulé)                                       */
/* -------------------------------------------------------------------------- */

type Call = Anthropic.MessageCreateParamsNonStreaming

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
    usage: { input_tokens: 1800, output_tokens: 700, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
    ...over,
  }) as unknown as Anthropic.Message

const apiError = (status: number, text: string) => Anthropic.APIError.generate(status, { type: "error", error: { type: "api_error", message: text } }, `${status} ${text}`, new Headers())

/** Date de fin lointaine : la route compare la date de fin à l'horloge réelle. */
const farFuture = "2099-12-31"
const form = (over: Partial<EmailGeneratorForm> = {}): EmailGeneratorForm => {
  const example = emailGeneratorExamples.find((entry) => entry.id === "promotion")!.form
  return { ...example, promotion: { ...example.promotion, endDate: farFuture }, ...over }
}

async function viaRoute(payload: unknown, respond: (params: Call) => unknown) {
  const provider = fakeProvider(respond)
  const logs: object[] = []
  const response = await handleEmailGeneration(new Request("http://localhost/api/generate-email", { method: "POST", body: JSON.stringify(payload) }), {
    engine: (input) => generateEmailV2(input, { client: provider.client, env: {} }),
    log: (entry) => logs.push(entry),
  })
  return { provider, response, logs, json: (await response.json()) as Json }
}

/** Draft de la fixture qui correspond au formulaire de l'exemple (pourcentage et code : R4-B). */
const exampleDraft = () => {
  const d = draft("R4-B")
  d.subject = "-20 % sur votre formation"
  d.offer.text = "Vous développez vos compétences à côté du travail ? Cette offre vous aide à vous lancer."
  d.preheader = "Une offre de rentrée à découvrir dans le catalogue des formations concernées."
  d.closing.title = "À vous de choisir"
  d.closing.text = "Le catalogue détaille chaque formation concernée. Comparez-les, puis retenez celle qui vous convient."
  d.support.items[0].text = "Parcourez le catalogue et notez les formations qui vous intéressent."
  d.support.items[1].title = "Pensez à votre quotidien"
  d.support.items[1].text = "Repérez ce qui s'accorde avec votre activité professionnelle."
  d.support.items[2].text = "Lisez le détail de chaque formation avant de choisir."
  d.support.title = "Avant de vous décider"
  return d
}

describe("R4 — route /api/generate-email et moteur, avec un fournisseur simulé", () => {
  test("promotion → UN appel simulé, avec le prompt et le schéma de la promotion seulement ; réponse publique compacte", async () => {
    const { provider, response, json } = await viaRoute(toEmailRequestBody(form()), () => message(JSON.stringify(exampleDraft())))
    assert.equal(response.status, 200, JSON.stringify(json))
    assert.equal(provider.calls.length, 1, "exactement un appel")
    const params = provider.calls[0]!
    assert.equal(params.system, promotionSystemPrompt)
    assert.deepEqual(params.output_config, { format: { type: "json_schema", schema: buildPromotionTransportSchema() } })
    assert.equal(params.model, DEFAULT_EMAIL_MODEL)
    assert.equal(params.max_tokens, EMAIL_MAX_TOKENS)
    for (const key of ["tools", "tool_choice", "stream", "temperature"]) assert.ok(!(key in params), key)
    assert.deepEqual(Object.keys(json).sort(), ["blockCount", "html", "preheader", "previewHtml", "status", "subject"])
    assert.equal(json.subject, "-20 % sur votre formation")
    assert.ok(json.html.includes("-20&nbsp;%") || json.html.includes(`-20${nbsp}%`) || json.html.includes("-20 %"))
    assert.ok(json.html.includes("DEMO20") && json.html.includes("31 décembre 2099") && json.html.includes("31/12/2099"))
    for (const hidden of ["recipe", "promotion", "draft", "context", "provenance", "usage", "requestId", "req_"]) assert.ok(!(hidden in json), hidden)
  })

  test("la requête du moteur porte les Promotion Facts exacts du formulaire ; aucune information libre", async () => {
    const seen: unknown[] = []
    const provider = fakeProvider(() => message(JSON.stringify(exampleDraft())))
    await handleEmailGeneration(new Request("http://localhost/api/generate-email", { method: "POST", body: JSON.stringify(toEmailRequestBody(form())) }), {
      engine: async (input) => {
        seen.push(input)
        return generateEmailV2(input, { client: provider.client, env: {} })
      },
      log: () => {},
    })
    assert.equal(seen.length, 1)
    const input = seen[0] as EmailPromotionRequest
    assert.equal(input.intent, "promotion")
    assert.deepEqual(input.promotion, { offer: { type: "percent", percent: 20 }, code: "DEMO20", endDate: farFuture, scope: "les formations diplômantes", destination: "catalogue-formations" })
    assert.ok(!("facts" in input) && !("emailType" in input) && !("objective" in input))
    assert.equal(input.target, "actifs_en_poste")
    assert.equal(input.audience, "Actifs en poste")
  })

  test("refus avant tout appel : données d'offre absentes, informations libres, destination inconnue, date passée, brief contradictoire, champ réservé, offre sans promotion", async () => {
    const base = toEmailRequestBody(form())
    const cases: [string, unknown][] = [
      ["promotion absente", { ...base, promotion: undefined }],
      ["informations libres", { ...base, facts: ["Un fait."] }],
      ["destination inconnue", { ...base, promotion: { ...base.promotion, destination: "financement" } }],
      ["date passée", { ...base, promotion: { ...base.promotion, endDate: "2020-01-01" } }],
      ["date invalide", { ...base, promotion: { ...base.promotion, endDate: "2026-02-30" } }],
      ["code vide", { ...base, promotion: { ...base.promotion, code: "" } }],
      ["code en minuscules", { ...base, promotion: { ...base.promotion, code: "demo20" } }],
      ["brief contradictoire", { ...base, brief: "Une remise de -30 % pour tous." }],
      ["objet qui presse", { ...base, subject: "Dernière chance !" }],
      ["champ réservé", { ...base, promotion: { ...base.promotion, legalMention: "Texte libre." } }],
      ["recette imposée", { ...base, recipe: "promotion" }],
      ["offre sans promotion", { ...base, intent: "orientation" }],
      ["promotion avec une autre intention", { ...toEmailRequestBody(form({ intent: "preuves" })), promotion: base.promotion }],
    ]
    for (const [label, body] of cases) {
      const { provider, response, json } = await viaRoute(body, () => message(JSON.stringify(exampleDraft())))
      assert.equal(response.status, 400, label)
      assert.equal(json.code, "invalid-request", label)
      assert.equal(provider.calls.length, 0, `${label} : aucun appel`)
    }
  })

  test("sortie invalide, copie non conforme ou refus du fournisseur : une seule tentative, aucune relance, aucun repli, erreur publique stable", async () => {
    const outputs: [string, () => unknown, number, string][] = [
      ["JSON invalide", () => message("{ pas du json"), 422, "invalid-output"],
      ["sortie vide", () => message(null), 422, "invalid-output"],
      ["Draft qui porte un code", () => message(JSON.stringify({ ...exampleDraft(), code: "FAUX" })), 422, "invalid-draft"],
      ["copie avec un chiffre", () => message(JSON.stringify({ ...exampleDraft(), offer: { ...exampleDraft().offer, text: "Une remise de 25 % pour vous." } })), 422, "validation-failed"],
      ["objet avec une autre valeur", () => message(JSON.stringify({ ...exampleDraft(), subject: "-25 % sur votre formation" })), 422, "validation-failed"],
      ["copie avec une date", () => message(JSON.stringify({ ...exampleDraft(), preheader: "Offre valable jusqu'au 15 novembre." })), 422, "validation-failed"],
    ]
    for (const [label, respond, status, code] of outputs) {
      const { provider, response, json, logs } = await viaRoute(toEmailRequestBody(form()), respond)
      assert.equal(provider.calls.length, 1, `${label} : un seul appel, aucune relance`)
      assert.equal(response.status, status, label)
      assert.equal(json.code, code, label)
      assert.equal(logs.length, 1)
      assert.ok(!JSON.stringify(json).includes("DEMO20"), `${label} : rien du contenu ne sort`)
    }
    for (const status of [429, 500, 529]) {
      const { provider, response, json } = await viaRoute(toEmailRequestBody(form()), () => {
        throw apiError(status, "secret interne")
      })
      assert.equal(provider.calls.length, 1, `HTTP ${status} : aucune relance`)
      assert.ok(response.status >= 429)
      assert.ok(!JSON.stringify(json).includes("secret interne"))
    }
  })

  test("sans clé ni client injecté, la promotion est refusée avant tout réseau (aucun appel fetch)", async () => {
    const result = await generateEmailV2(request("R4-B", { promotion: { ...request("R4-B").promotion, endDate: farFuture } }), { env: {} })
    assert.equal(result.status === "error" ? result.error.kind : "", "missing-api-key")
    assert.equal(fetchGuard.mock.callCount(), 0)
  })

  test("R1, R2 et R3 : la route et le moteur ne changent pas pour les autres intentions (corps sans promotion)", () => {
    const body = toEmailRequestBody(emailGeneratorExamples.find((entry) => entry.id === "preuves")!.form)
    assert.ok(!("promotion" in body))
    const converted = toEmailRecipeRequest(body as never)
    assert.equal(converted.intent, "brand-proof")
    assert.deepEqual(toEmailEngineRequest(body as never), converted)
  })
})

/* -------------------------------------------------------------------------- */
/* Interface                                                                  */
/* -------------------------------------------------------------------------- */

describe("R4 — formulaire Promotion", () => {
  const example = emailGeneratorExamples.find((entry) => entry.id === "promotion")!

  test("l'exemple Promo préremplit sans appel, est marqué comme illustration, et passe la validation du client", () => {
    assert.equal(example.label, "Promo")
    assert.equal(example.illustrative, true)
    assert.ok(canGenerateEmail(example.form))
    assert.equal(example.form.promotion.code, "DEMO20", "code de démonstration, remplaçable")
    assert.equal(emailPromotionFormError(example.form.promotion), null)
    const body = toEmailRequestBody(example.form)
    assert.ok(PromotionFactsSchema.safeParse(body.promotion).success)
    assert.ok(!("facts" in body))
  })

  test("types d'offre et destinations de l'interface : ceux du contrat, sans les recopier de travers", () => {
    assert.deepEqual(emailPromotionDestinations.map((entry) => entry.value), [...promotionDestinations])
    for (const entry of emailPromotionDestinations) assert.equal(entry.label, emailDestinations[entry.value].label)
    assert.deepEqual(emailPromotionOfferTypes.map((entry) => entry.value).sort(), ["amount", "percent"])
    assert.deepEqual([...emailRecipeTargets], ["reconversion", "actifs_en_poste", "alternants", "b2b_rh", "demandeurs_emploi"])
  })

  test("validation du client : type, valeur entière, pourcentage ≤ 100, code, date, périmètre, destination ; le bouton reste inactif tant que l'offre est incomplète", () => {
    const base = example.form.promotion
    const error = (over: Partial<typeof base>) => emailPromotionFormError({ ...base, ...over })
    assert.equal(error({}), null)
    assert.ok(error({ offerType: "" }))
    for (const value of ["", "0", "-5", "12,5", "abc", "20 %"]) assert.ok(error({ value }), value)
    assert.ok(error({ offerType: "percent", value: "101" }))
    assert.equal(error({ offerType: "amount", value: "500" }), null)
    assert.ok(error({ code: "demo 20" }))
    assert.equal(error({ code: "" }), null)
    assert.ok(error({ endDate: "" }))
    assert.ok(error({ scope: "ab" }))
    assert.ok(error({ destination: "" }))
    assert.equal(canGenerateEmail({ ...example.form, promotion: { ...base, endDate: "" } }), false)
    assert.equal(canGenerateEmail({ ...example.form, promotion: { ...base, destination: "" } }), false)
  })

  test("corps de requête : le montant et le pourcentage deviennent des nombres, le code est omis s'il est vide, les informations libres n'existent pas", () => {
    const base = example.form
    const percent = toEmailRequestBody(base).promotion!
    assert.deepEqual(percent.offer, { type: "percent", percent: 20 })
    const amount = toEmailRequestBody({ ...base, promotion: { ...base.promotion, offerType: "amount", value: " 500 ", code: " " } }).promotion!
    assert.deepEqual(amount.offer, { type: "amount", amount: 500 })
    assert.ok(!("code" in amount))
    const body = toEmailRequestBody({ ...base, facts: "Un fait libre." })
    assert.ok(!("facts" in body), "une promotion n'envoie pas d'informations libres")
    assert.ok(!("promotion" in toEmailRequestBody({ ...base, intent: "orientation", promotion: base.promotion })), "hors promotion, aucune donnée d'offre")
  })

  test("l'interface distingue le contenu à générer des données de l'offre, sans exposer R4 ni la recette", () => {
    const panel = readFileSync(join(root, "components/email/email-brief-panel.tsx"), "utf8")
    const visible = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "")
    assert.match(panel, /Contenu à générer/)
    assert.match(panel, /Données de l&apos;offre/)
    assert.match(panel, /l&apos;IA ne les écrit ni ne les modifie/)
    assert.match(panel, /Valeurs d&apos;illustration/)
    assert.ok(!/\bR4\b|recette|recipe/i.test(visible))
    assert.match(panel, /\{!isPromotion && \(/, "les informations libres disparaissent avec la promotion")
  })
})

/* -------------------------------------------------------------------------- */
/* Frontières                                                                 */
/* -------------------------------------------------------------------------- */

describe("R4 — frontières du domaine", () => {
  const files = readdirSync(join(root, "lib/email")).filter((name) => /^promotion-.*\.ts$/.test(name))
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

  test("modules R4 : Email uniquement, sans Landing, sans réseau, sans Anthropic, sans lecture de fichier", () => {
    assert.deepEqual(files.sort(), ["promotion-copy.ts", "promotion-draft.ts", "promotion-facts.ts", "promotion-fixtures.ts", "promotion-prompt.ts", "promotion-resolver.ts"])
    for (const name of files) {
      const source = strip(readFileSync(join(root, "lib/email", name), "utf8"))
      assert.ok(!/lib\/landing|\.\.\/landing|node:fs|fetch\(|@anthropic-ai|process\.env|messages\.create/.test(source), name)
    }
  })

  test("la couche Brand n'est importée que par les recettes d'origine : aucun module R4 ne la lit directement", () => {
    for (const name of files) assert.ok(!/lib\/brand|\.\.\/brand/.test(readFileSync(join(root, "lib/email", name), "utf8")), name)
  })

  test("R1, R2 et R3 : leurs schémas, prompts et recettes ne mentionnent pas la promotion", () => {
    for (const name of ["recipes.ts", "recipe-drafts.ts", "recipe-prompts.ts", "recipe-validation.ts"]) {
      assert.ok(!/promotion(?!al)|promo-code|offer-hero/i.test(strip(readFileSync(join(root, "lib/email", name), "utf8"))), name)
    }
  })

  test("le Draft de la promotion n'est pas un cinquième champ des Drafts existants : trois recettes, trois intentions, inchangées", () => {
    assert.deepEqual([...emailRecipeIntents], ["discovery", "editorial", "brand-proof"])
    assert.equal(typeof composePromotion, "function")
    assert.equal(typeof resolvePromotionDraft, "function")
  })
})
