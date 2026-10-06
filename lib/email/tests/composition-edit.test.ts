/**
 * Édition de composition (V1.5) : opérations structurelles et visuelles
 * contrôlées, hors ligne. `fetch` est interdit, le fournisseur est simulé :
 * aucun appel Anthropic. Les valeurs de l'offre R4 (20 %, DEMO20, dates) sont
 * des données d'illustration.
 *
 * Ce que ces tests figent : Claude exprime des intentions (énumérations
 * courtes) ; le système choisit, valide et applique les composants Studi ; les
 * Promotion Facts et les preuves de marque ne bougent jamais ; une opération
 * impossible ou interdite ne change rien ; l'export et l'historique suivent
 * exactement la version visible.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { DEFAULT_EMAIL_MODEL, type EmailClaudeClient } from "../anthropic"
import {
  applyEmailComposition,
  buildEndDateBlock,
  compositionCapabilities,
  compositionSurfaceVariants,
  compositionViolations,
  describeLayout,
  emptyEmailComposition,
  safeParseEmailComposition,
  type CompositionOperation,
  type EmailComposition,
} from "../composition"
import { checkEditInstruction } from "../edit-guard"
import { editEmailV2, type EmailEditResult } from "../edit-engine"
import { editableFields } from "../edit-fields"
import { handleEmailEdit } from "../edit-handler"
import { buildEditTransportSchema } from "../edit-patch"
import { emailEditorReducer, initialEmailEditorState, type EmailEditorAction, type EmailEditorState } from "../editor-state"
import { toEmailExportBody } from "../export-client"
import { handleEmailExport } from "../export-handler"
import { emailBank, emailBankImageIdFromSrc } from "../image-bank"
import { emailPromotionFixtures } from "../promotion-fixtures"
import { resolvePromotionDraft } from "../promotion-resolver"
import { emailRecipeDraftFixtures, resolveEmailRecipeDraftFixture } from "../recipe-draft-fixtures"
import { toEmailEngineRequest } from "../generate-handler"
import { emailGeneratorExamples } from "../generator-examples"
import { toEmailRequestBody } from "../generator-form"
import type { EmailConfig } from "../types"
import { measure } from "./schema-metrics"

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

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Call = Anthropic.MessageCreateParamsNonStreaming

const farFuture = "2099-12-31"
const op = (opName: CompositionOperation["op"], target: CompositionOperation["target"], value: CompositionOperation["value"]): CompositionOperation => ({ op: opName, target, value })
const comp = (...operations: CompositionOperation[]): EmailComposition => ({ operations })

/* ---- Emails de départ ------------------------------------------------------------------------------------------- */

const promoRequest = (id: "R4-A" | "R4-B" | "R4-C" = "R4-B"): Json => {
  const fixture = emailPromotionFixtures.find((entry) => entry.id === id)!
  const request = structuredClone(fixture.request) as Json
  request.promotion.endDate = farFuture
  return request
}
const promoDraft = (id: "R4-A" | "R4-B" | "R4-C" = "R4-B"): Json => structuredClone(emailPromotionFixtures.find((entry) => entry.id === id)!.draft) as Json
const promoBase = (id: "R4-A" | "R4-B" | "R4-C" = "R4-B"): EmailConfig => {
  const resolution = resolvePromotionDraft(promoRequest(id) as never, promoDraft(id))
  if (resolution.status !== "resolved") throw new Error(resolution.status)
  return resolution.config
}
const recipeBase = (id: string): EmailConfig => {
  const { resolution } = resolveEmailRecipeDraftFixture(id as never)
  if (resolution.status !== "resolved") throw new Error(`${id} : ${resolution.status}`)
  return resolution.config
}
const R4 = { family: "promotion" as const, promotion: { endDate: farFuture } }
const apply = (base: EmailConfig, composition: EmailComposition, context: Parameters<typeof applyEmailComposition>[2] = R4) => {
  const result = applyEmailComposition(base, composition, context)
  if (!result.ok) throw new Error(result.message)
  return result.config
}
const refused = (base: EmailConfig, composition: EmailComposition, context: Parameters<typeof applyEmailComposition>[2] = R4) => {
  const result = applyEmailComposition(base, composition, context)
  assert.equal(result.ok, false, JSON.stringify(composition))
  return result.ok ? "" : result.message
}
const ids = (config: EmailConfig) => config.blocks.map((block) => (block as unknown as { id: string }).id)
const raw = (config: EmailConfig, id: string) => config.blocks.find((block) => (block as unknown as { id: string }).id === id) as unknown as { id: string; type: string; surface?: string; slots: Json }
const visibleText = (config: EmailConfig) => JSON.stringify(config.blocks.map((block) => (block as unknown as { slots: Json }).slots))

/* -------------------------------------------------------------------------- */
/* Audit : countdown, surfaces, capacités                                     */
/* -------------------------------------------------------------------------- */

describe("composition — audit des lames et décision countdown", () => {
  const template = (name: string) => readFileSync(join(root, "lib/email/templates", `${name}.html`), "utf8")

  test("les deux lames hero-countdown sont des cases STATIQUES : trois compteurs et leurs libellés, aucun script, aucune horloge, aucune image animée", () => {
    for (const name of ["email-module-hero-countdown-variant-01", "email-module-hero-countdown-variant-02"]) {
      const html = template(name)
      assert.deepEqual([...html.matchAll(/data-slot="(compteur-\d|label-\d)"/g)].map((match) => match[1]), ["compteur-1", "label-1", "compteur-2", "label-2", "compteur-3", "label-3"])
      assert.ok(!/<script|setInterval|setTimeout|Date\(|countdown\.js|\.gif/i.test(html), `${name} : aucun mécanisme dynamique`)
      assert.ok(!/<img/i.test(html), `${name} : aucune image (un compte à rebours dynamique en exigerait une, générée à l'ouverture)`)
    }
    assert.ok(!/data-slot="cta-1"/.test(template("email-module-hero-countdown-variant-01")))
    assert.ok(/data-slot="cta-1"/.test(template("email-module-hero-countdown-variant-02")), "la variante 02 ajouterait un troisième bouton")
  })

  test("décision : un vrai compte à rebours est UNSAFE (valeurs figées, fausses dès le lendemain, export non déterministe) ; aucun module de composition ne lit l'horloge", () => {
    const source = code("lib/email/composition.ts")
    assert.ok(!/new Date|Date\.now|Intl\.|performance\.now|setTimeout|setInterval/.test(source), "aucune lecture de l'horloge")
    // La même date de fin donne toujours les mêmes cases, quelle que soit l'heure.
    const first = JSON.stringify(buildEndDateBlock({ endDate: "2026-11-15" }))
    const realDate = globalThis.Date
    try {
      globalThis.Date = class extends realDate { constructor(...args: [number?]) { super(...((args.length ? args : [1893456000000]) as [number])) } } as unknown as DateConstructor
      assert.equal(JSON.stringify(buildEndDateBlock({ endDate: "2026-11-15" })), first)
    } finally {
      globalThis.Date = realDate
    }
  })

  test("le bloc « fin de l'offre » : jour, mois, année de endDate, libellés fixes, aucun nombre calculé, aucune durée", () => {
    const block = buildEndDateBlock({ endDate: "2026-11-05" }) as unknown as { slots: Json; type: string }
    assert.equal(block.type, "email-module-hero-countdown-variant-01")
    assert.deepEqual(Object.entries(block.slots).map(([name, value]) => [name, value.text]), [
      ["compteur-1", "05"], ["label-1", "Jour"], ["compteur-2", "11"], ["label-2", "Mois"], ["compteur-3", "2026"], ["label-3", "Année"],
      ["titre-principal", "Fin de l'offre"], ["texte-descriptif", "Offre valable jusqu'au 5 novembre 2026."],
    ])
    assert.ok(!/jours? restants?|heures?|minutes?|plus que|dans \d/i.test(JSON.stringify(block.slots)))
  })

  test("surfaces : sept surfaces fermées ; les lames d'offre sont à couleurs FIXES ; jaune = Accent 1 (#EDF878), seulement sur les blocs configurables", () => {
    for (const lame of ["email-module-hero-offer-image-top", "email-module-banner-full", "email-module-discount-banner-full"]) {
      assert.equal((emailBlockManifestOf(lame) as { surfaceMode: string }).surfaceMode, "fixed", lame)
    }
    for (const lame of ["email-module-hero-countdown-variant-01", "email-module-icons-list", "email-module-text-and-cta-variant-01", "email-module-text-and-cta-variant-02"]) {
      assert.equal((emailBlockManifestOf(lame) as { surfaceMode: string }).surfaceMode, "configurable", lame)
    }
    assert.deepEqual({ ...compositionSurfaceVariants }, { clair: "page", jaune: "accent-1", vert: "marque", sombre: "encre" })
  })
})

function emailBlockManifestOf(lame: string) {
  const source = readFileSync(join(root, "lib/email/manifest.ts"), "utf8")
  const start = source.indexOf(`"${lame}": {`)
  const mode = /surfaceMode: "(fixed|configurable)"/.exec(source.slice(start, start + 600))?.[1]
  return { surfaceMode: mode }
}

describe("composition — capacités par famille (décidées avant l'appel)", () => {
  test("R4 : date de fin, appuis, surfaces et image ; jamais un nom de lame", () => {
    const caps = compositionCapabilities("promotion", promoBase())!
    assert.deepEqual(caps.operations, ["add-section", "remove-section", "change-surface", "change-image"])
    assert.deepEqual(caps.targets, ["end-date", "support", "closing", "main-image"])
    assert.deepEqual(caps.values, ["default", "clair", "jaune", "vert", "sombre", "alternative", "campaign-portrait", "career-movement"])
    assert.ok(!JSON.stringify(caps).includes("email-module"))
  })

  test("R1, R3 et R2 bandeau : l'image seulement ; R2 frise de portraits : aucune opération ; R3 : jamais de structure ni de couleur", () => {
    for (const id of ["D-R1-A", "D-R3-B", "D-R3-A", "D-R2-A"]) {
      const caps = compositionCapabilities(id.startsWith("D-R1") ? "discovery-reassurance" : id.startsWith("D-R2") ? "editorial-newsletter" : "brand-proof", recipeBase(id))
      assert.deepEqual(caps?.operations, ["change-image"], id)
      assert.deepEqual(caps?.targets, ["main-image"], id)
    }
    assert.equal(compositionCapabilities("editorial-newsletter", recipeBase("D-R2-B")), undefined, "frise : pas d'image remplaçable")
    assert.deepEqual(compositionCapabilities("brand-proof", recipeBase("D-R3-B"))!.values, ["alternative", "campaign-portrait", "editorial-work"])
  })

  test("la mise en page décrite à Claude : des rôles et des états, ni lame, ni couleur, ni fichier", () => {
    const layout = describeLayout("promotion", promoBase())
    assert.deepEqual(layout.sections, [{ role: "end-date", present: false, surface: "clair" }, { role: "support", present: true, surface: "clair" }, { role: "closing", present: true, surface: "clair" }])
    assert.equal(layout.mainImage?.intent, "career-movement")
    assert.ok(!/email-module|\.jpg|#[0-9A-F]{6}|--offer/i.test(JSON.stringify(layout)))
  })
})

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

describe("composition — application déterministe", () => {
  test("add-section end-date : le bloc se place SOUS l'offre, ses valeurs viennent de endDate, l'offre et le reste sont intacts", () => {
    const base = promoBase()
    const out = apply(base, comp(op("add-section", "end-date", "default")))
    assert.deepEqual(ids(out), ["header", "offer", "date-block", "support", "closing", "mentions-legales", "footer"])
    assert.equal(raw(out, "date-block").slots["compteur-3"].text, "2099")
    assert.equal(raw(out, "date-block").slots["compteur-1"].text, "31")
    for (const id of ids(base)) assert.deepEqual(raw(out, id), raw(base, id), `${id} inchangé`)
    assert.deepEqual(base, promoBase(), "la base n'est jamais mutée")
  })

  test("remove-section support puis add-section support : les appuis reviennent à leur place, tels que le resolver les a composés", () => {
    const base = promoBase()
    const removed = apply(base, comp(op("remove-section", "support", "default")))
    assert.deepEqual(ids(removed), ["header", "offer", "closing", "mentions-legales", "footer"])
    const restored = apply(base, comp(op("remove-section", "support", "default"), op("add-section", "support", "default")))
    assert.deepEqual(restored, base)
  })

  test("change-surface : jaune, vert, sombre, clair sur un bloc configurable ; une seule zone colorée (la nouvelle remplace l'ancienne) ; le panneau d'offre ne change jamais", () => {
    const base = promoBase()
    for (const [variant, surface] of Object.entries(compositionSurfaceVariants)) {
      const out = apply(base, comp(op("add-section", "end-date", "default"), op("change-surface", "end-date", variant as never)))
      assert.equal(raw(out, "date-block").surface, surface === "page" ? undefined : surface, variant)
      assert.deepEqual(raw(out, "offer"), raw(base, "offer"), "le panneau d'offre est identique")
    }
    const moved = apply(base, comp(op("change-surface", "support", "jaune"), op("change-surface", "closing", "vert")))
    assert.equal(raw(moved, "support").surface, undefined, "l'ancienne zone colorée est redevenue claire")
    assert.equal(raw(moved, "closing").surface, "marque")
    assert.equal(moved.blocks.filter((block) => (block as unknown as { surface?: string }).surface).length, 1)
    assert.equal(raw(apply(base, comp(op("change-surface", "closing", "jaune"), op("change-surface", "closing", "clair"))), "closing").surface, undefined)
  })

  test("change-image : une autre image de la banque, jamais la même, jamais un doublon, alt contrôlé, dérivé existant ; alternative cyclique", () => {
    const base = promoBase()
    const imageOf = (config: EmailConfig) => emailBankImageIdFromSrc(raw(config, "offer").slots["image-1"].src)!
    const first = apply(base, comp(op("change-image", "main-image", "alternative")))
    const second = apply(base, comp(op("change-image", "main-image", "alternative"), op("change-image", "main-image", "alternative")))
    assert.notEqual(imageOf(first), imageOf(base))
    assert.notEqual(imageOf(second), imageOf(first))
    for (const config of [first, second]) {
      const slot = raw(config, "offer").slots["image-1"]
      const id = imageOf(config)
      assert.equal(slot.alt, emailBank[id].alt)
      assert.match(slot.src, /^https:\/\/demo-assets\.invalid\/email-v2\/[a-z-]+--offer\.jpg$/)
      assert.ok(existsSync(join(root, "public/images/email/v2", `${id}--offer.jpg`)))
      assert.ok(["campaign-portrait", "career-movement"].includes(emailBank[id].intent))
    }
    // Cinq images « offer » : on revient à la première après un tour complet.
    const loop = apply(base, comp(...Array.from({ length: 5 }, () => op("change-image", "main-image", "alternative"))))
    assert.equal(imageOf(loop), imageOf(base))
    // Une intention précise.
    for (const intent of ["campaign-portrait", "career-movement"] as const) {
      const out = apply(base, comp(op("change-image", "main-image", intent)))
      assert.equal(emailBank[imageOf(out)].intent, intent)
      assert.notEqual(imageOf(out), imageOf(base))
    }
    assert.deepEqual(visibleText({ ...first, blocks: first.blocks.filter((block) => (block as unknown as { id: string }).id !== "offer") }), visibleText({ ...base, blocks: base.blocks.filter((block) => (block as unknown as { id: string }).id !== "offer") }), "seul le visuel de l'offre a changé")
  })

  test("variante sans photo (R4-A, R4-C) : l'image principale est l'illustration de la conclusion ; R1, R3, R2 bandeau : l'image du hero ; la frise est exclue", () => {
    const a = apply(promoBase("R4-A"), comp(op("change-image", "main-image", "alternative")))
    assert.notEqual(raw(a, "closing").slots["image-1"].src, raw(promoBase("R4-A"), "closing").slots["image-1"].src)
    for (const [id, family] of [["D-R1-A", "discovery-reassurance"], ["D-R3-B", "brand-proof"], ["D-R2-A", "editorial-newsletter"]] as const) {
      const base = recipeBase(id)
      const out = apply(base, comp(op("change-image", "main-image", "alternative")), { family })
      assert.notEqual(JSON.stringify(out), JSON.stringify(base), id)
      assert.deepEqual(out.blocks.map((block) => block.type), base.blocks.map((block) => block.type))
    }
    assert.match(refused(recipeBase("D-R2-B"), comp(op("change-image", "main-image", "alternative")), { family: "editorial-newsletter" }), /pas disponible/)
  })

  test("R3 : une image change, les preuves, leurs valeurs et libellés restent identiques", () => {
    const base = recipeBase("D-R3-B")
    const out = apply(base, comp(op("change-image", "main-image", "alternative")), { family: "brand-proof" })
    const proofs = (config: EmailConfig) => JSON.stringify(config.blocks.filter((block) => block.type === "email-module-benefits-compact-highlights"))
    assert.equal(proofs(out), proofs(base))
    assert.ok(proofs(out).includes("apprenants en cours de formation"))
  })

  test("refus : opération, cible ou valeur hors capacité ; doublon ; bloc absent ; combinaison incohérente ; la base n'est pas modifiée", () => {
    const base = promoBase()
    const cases: [string, EmailComposition][] = [
      ["ajouter la conclusion", comp(op("add-section", "closing", "default"))],
      ["retirer la conclusion", comp(op("remove-section", "closing", "default"))],
      ["retirer l'image", comp(op("remove-section", "main-image", "default"))],
      ["ajouter deux fois", comp(op("add-section", "end-date", "default"), op("add-section", "end-date", "default"))],
      ["retirer un bloc absent", comp(op("remove-section", "end-date", "default"))],
      ["recolorer un bloc absent", comp(op("change-surface", "end-date", "jaune"))],
      ["recolorer l'image", comp(op("change-surface", "main-image", "jaune"))],
      ["variante inexistante pour une surface", comp(op("change-surface", "support", "alternative"))],
      ["variante de couleur pour une image", comp(op("change-image", "main-image", "jaune"))],
      ["intention pour une section", comp(op("add-section", "end-date", "jaune"))],
      ["intention visuelle hors de la famille", comp(op("change-image", "main-image", "warm-reassurance"))],
      ["rétablir des appuis déjà présents", comp(op("add-section", "support", "default"))],
    ]
    for (const [label, composition] of cases) assert.ok(refused(base, composition).length > 10, label)
    assert.deepEqual(base, promoBase())
    // Hors R4 : aucune section, aucune couleur.
    assert.match(refused(recipeBase("D-R3-B"), comp(op("add-section", "end-date", "default")), { family: "brand-proof" }), /pas disponible/)
    assert.match(refused(recipeBase("D-R3-B"), comp(op("change-surface", "closing", "jaune")), { family: "brand-proof" }), /pas disponible/)
    assert.match(refused(recipeBase("D-R1-A"), comp(op("remove-section", "support", "default")), { family: "discovery-reassurance" }), /pas disponible/)
  })

  test("le bloc de fin d'offre exige une date de fin contrôlée : sans elle, refus", () => {
    assert.match(refused(promoBase(), comp(op("add-section", "end-date", "default")), { family: "promotion" }), /date de fin contrôlée/)
  })

  test("l'état de composition est strict, borné, et se lit tel quel : champ en trop, couleur libre, URL, nom de lame refusés", () => {
    assert.ok(safeParseEmailComposition(undefined).success && safeParseEmailComposition(null).success && safeParseEmailComposition(emptyEmailComposition).success)
    assert.ok(safeParseEmailComposition(comp(op("change-surface", "support", "jaune"))).success)
    for (const bad of [
      { operations: [{ op: "change-surface", target: "support", value: "#FF0000" }] },
      { operations: [{ op: "change-surface", target: "support", value: "rgb(255,0,0)" }] },
      { operations: [{ op: "change-image", target: "main-image", value: "https://evil.example/x.png" }] },
      { operations: [{ op: "add-section", target: "email-module-banner-full", value: "default" }] },
      { operations: [{ op: "html", target: "support", value: "default" }] },
      { operations: [{ op: "add-section", target: "end-date", value: "default", html: "<b>x</b>" }] },
      { operations: [], extra: true },
      { operations: Array.from({ length: 25 }, () => op("change-image", "main-image", "alternative")) },
      "texte",
    ]) assert.equal(safeParseEmailComposition(bad).success, false, JSON.stringify(bad).slice(0, 80))
  })

  test("compositionViolations : un bloc modifié, un texte changé, un lien, une valeur, le légal ou l'ordre ne passent pas", () => {
    const base = promoBase()
    const context = R4
    const withOp = apply(base, comp(op("add-section", "end-date", "default")))
    assert.deepEqual(compositionViolations(base, withOp, [op("add-section", "end-date", "default")], context, new Map()), [])
    const tamper = (change: (config: Json) => void, operations: CompositionOperation[] = [op("add-section", "end-date", "default")]) => {
      const config = structuredClone(withOp) as unknown as Json
      change(config)
      return compositionViolations(base, config as never, operations, context, new Map()).length
    }
    const block = (config: Json, id: string) => config.blocks.find((entry: Json) => entry.id === id)
    assert.ok(tamper((config) => (block(config, "offer").slots["valeur-cle"].text = "-30 %*")) > 0, "valeur")
    assert.ok(tamper((config) => (block(config, "offer").slots["code-promo-1"].text = "PROMO30")) > 0, "code")
    assert.ok(tamper((config) => (block(config, "mentions-legales").slots["disclaimer-1"].endDate = "2099-01-01")) > 0, "légal")
    assert.ok(tamper((config) => (block(config, "closing").slots["cta-1"].href = "https://evil.example/")) > 0, "lien")
    assert.ok(tamper((config) => (block(config, "closing").slots["texte-descriptif"].text = "Autre texte")) > 0, "texte")
    assert.ok(tamper((config) => (block(config, "date-block").slots["compteur-3"].text = "2030")) > 0, "bloc ajouté falsifié")
    assert.ok(tamper((config) => config.blocks.reverse()) > 0, "ordre")
    assert.ok(tamper((config) => (block(config, "closing").surface = "marque")) > 0, "surface non demandée")
    assert.ok(tamper((config) => (block(config, "offer").slots["image-1"].src = "https://demo-assets.invalid/email-v2/autre--offer.jpg")) > 0, "image non demandée")
    assert.ok(tamper((config) => config.blocks.splice(config.blocks.findIndex((entry: Json) => entry.id === "mentions-legales"), 1)) > 0, "légal retiré")
    assert.ok(tamper((config) => config.blocks.splice(config.blocks.findIndex((entry: Json) => entry.id === "offer"), 1)) > 0, "offre retirée")
  })
})

/* -------------------------------------------------------------------------- */
/* Garde-fous avant appel                                                     */
/* -------------------------------------------------------------------------- */

describe("composition — garde-fous avant appel", () => {
  const r4 = { address: "tutoiement" as const, protectedTokens: ["DEMO20", "-20 %", "15 novembre 2026", "15/11/2026"], capabilities: { image: true, surface: true, sections: true } }
  const r3 = { address: "vouvoiement" as const, protectedTokens: ["59 000"], capabilities: { image: true } }
  const r1 = { address: "vouvoiement" as const, capabilities: { image: true } }
  const textOnly = { address: "vouvoiement" as const }
  const refusedBy = (instruction: string, context: Parameters<typeof checkEditInstruction>[1], codes?: string[]) => {
    const refusal = checkEditInstruction(instruction, context)
    assert.ok(refusal, `refus attendu : ${instruction}`)
    if (codes) assert.ok(codes.includes(refusal!.code), `${instruction} : ${refusal!.code}`)
  }

  test("les demandes de démonstration passent pour R4", () => {
    for (const instruction of [
      "Ajoute un countdown sous l'offre.",
      "Ajoute un compte à rebours.",
      "Ajoute un bloc date de fin sous l'offre.",
      "Supprime le bloc avantages.",
      "Retire les appuis.",
      "Remets le bloc avantages.",
      "Supprime le countdown.",
      "Essaie une version plus jaune.",
      "Essaie une version plus verte.",
      "Je veux quelque chose de plus énergique.",
      "Essaie une autre image.",
      "Change l'image.",
      "Rends l'accroche plus dynamique.",
      "Passe le bloc de fin d'offre en sombre.",
    ]) assert.equal(checkEditInstruction(instruction, r4), undefined, instruction)
  })

  test("refus évidents, pour toutes les familles : HTML, CSS, couleur hex, URL, fichier, composant inconnu", () => {
    for (const context of [r4, r3, r1, textOnly]) {
      refusedBy("Ajoute une section HTML.", context, ["literal"])
      refusedBy("Ajoute une lame <b>inconnue</b>.", context, ["literal"])
      refusedBy("Passe le fond en #FF0000.", context, ["literal"])
      refusedBy("Utilise le fond rgb(255, 0, 0).", context, ["literal"])
      refusedBy("Utilise cette image https://example.com/photo.jpg", context, ["literal"])
      refusedBy("Utilise l'image photo.png", context, ["literal"])
      refusedBy("Mets /images/secret.jpg", context, ["literal"])
      refusedBy("Ajoute du CSS pour agrandir le titre", context, ["literal"])
    }
    refusedBy("Ajoute une lame email-module-banner-full", r4, ["structure", "literal", "media"])
    refusedBy("Ajoute une lame inconnue.", r4, ["structure"])
  })

  test("refus : faux countdown (date, durée), légal, offre, code, preuves", () => {
    refusedBy("Ajoute un countdown jusqu'au 15 décembre.", r4, ["date"])
    refusedBy("Ajoute 3 jours au countdown.", r4, ["value"])
    refusedBy("Ajoute un countdown de 48 heures.", r4, ["value"])
    refusedBy("Prolonge le countdown jusqu'au 20 novembre.", r4, ["date"])
    refusedBy("Change la date du countdown.", r4, ["date"])
    refusedBy("Supprime le légal.", r4, ["legal"])
    refusedBy("Supprime les mentions légales.", r4, ["legal"])
    refusedBy("Change l'offre à 30 %.", r4, ["value"])
    refusedBy("Remplace DEMO20.", r4, ["value", "code"])
    refusedBy("Remplace DEMO20 par PROMO30.", r4, ["value", "code"])
    refusedBy("Ajoute un troisième chiffre.", r3, ["structure"])
    refusedBy("Remplace 59 000 par 70 000.", r3, ["value"])
    refusedBy("Supprime un bouton.", r4, ["structure"])
    refusedBy("Supprime le footer.", r4, ["media"])
  })

  test("le panneau d'offre a des couleurs fixes ; seules les variantes de la marque existent ; hors R4, aucune couleur", () => {
    refusedBy("Passe le bloc promo sur une variante plus sombre.", r4, ["media"])
    refusedBy("Change la couleur du panneau de l'offre.", r4, ["media"])
    refusedBy("Essaie une version plus rouge.", r4, ["media"])
    refusedBy("Passe le fond en bleu.", r4, ["media"])
    refusedBy("Essaie une version plus jaune.", r3, ["media"])
    refusedBy("Essaie une version plus jaune.", r1, ["media"])
    refusedBy("Change la couleur du fond.", r1, ["media"])
    refusedBy("Essaie une version plus jaune.", textOnly, ["media"])
  })

  test("hors R4, ni countdown, ni suppression de section ; l'image n'est modifiable que si l'email a la capacité", () => {
    for (const context of [r3, r1, textOnly]) {
      refusedBy("Ajoute un countdown sous l'offre.", context, ["structure"])
      refusedBy("Supprime le bloc avantages.", context, ["structure"])
    }
    assert.equal(checkEditInstruction("Essaie une autre image.", r3), undefined)
    assert.equal(checkEditInstruction("Essaie une autre image.", r1), undefined)
    refusedBy("Change l'image.", textOnly, ["media"])
    refusedBy("Remplace la photo.", textOnly, ["media"])
  })
})

/* -------------------------------------------------------------------------- */
/* Schéma Structured Output                                                   */
/* -------------------------------------------------------------------------- */

describe("composition — schéma Structured Output compact", () => {
  const paths = (config: EmailConfig, family: Parameters<typeof editableFields>[0], draft: unknown) => editableFields(family, draft, config).map((field) => field.path)

  test("trois objets, huit propriétés, énumérations courtes, aucune union, aucun optionnel, risque BAS ; jamais les 36 lames", () => {
    const cases: [string, EmailConfig, Parameters<typeof editableFields>[0], unknown][] = [
      ["R4", promoBase(), "promotion", promoDraft()],
      ["R3", recipeBase("D-R3-B"), "brand-proof", emailRecipeDraftFixtures.find((entry) => entry.id === "D-R3-B")!.draft],
      ["R1", recipeBase("D-R1-A"), "discovery-reassurance", emailRecipeDraftFixtures.find((entry) => entry.id === "D-R1-A")!.draft],
    ]
    for (const [name, config, family, draft] of cases) {
      const caps = compositionCapabilities(family, config)!
      const schema = buildEditTransportSchema(paths(config, family, draft), caps)
      const metrics = measure(schema as Record<string, unknown>)
      assert.equal(metrics.objects, 3, name)
      assert.equal(metrics.properties, 8, name)
      assert.equal(metrics.optional, 0, name)
      assert.equal(metrics.unions, 0, name)
      assert.equal(metrics.patterns, 0, name)
      assert.equal(metrics.enums, 4, `${name} : champs, opération, cible, valeur`)
      assert.ok(metrics.depth <= 7, `${name} : profondeur ${metrics.depth}`)
      assert.ok(metrics.bytes < 2600, `${name} : ${metrics.bytes} octets`)
      const text = JSON.stringify(schema)
      assert.ok(!/oneOf|anyOf|minLength|maxLength|maxItems|"pattern"|\$schema|email-module/.test(text), name)
      assert.ok(caps.operations.length <= 4 && caps.targets.length <= 4 && caps.values.length <= 9, name)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Moteur : R4, une opération à la fois puis en chaîne                        */
/* -------------------------------------------------------------------------- */

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
const message = (text: string | null) =>
  ({
    id: "msg_test", type: "message", role: "assistant", model: DEFAULT_EMAIL_MODEL,
    content: text === null ? [] : [{ type: "text", text, citations: null }],
    stop_reason: "end_turn", stop_sequence: null, stop_details: null,
    usage: { input_tokens: 900, output_tokens: 200, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
  }) as unknown as Anthropic.Message
const reply = (summary: string, edits: [string, string][], operations: CompositionOperation[] = []) => message(JSON.stringify({ summary, edits: edits.map(([field, text]) => ({ field, text })), operations }))

type State = { draft: Json; composition: EmailComposition }
async function editOnce(state: State, instruction: string, response: Anthropic.Message | (() => never), request: Json = promoRequest()) {
  const provider = fakeProvider(() => (typeof response === "function" ? response() : response))
  const result = await editEmailV2({ request: request as never, draft: state.draft, composition: state.composition, instruction }, { client: provider.client, env: {} })
  return { provider, result }
}
const ok = (result: EmailEditResult) => {
  assert.equal(result.status, "success", result.status === "error" ? JSON.stringify(result.error) : "")
  if (result.status !== "success") throw new Error("succès attendu")
  return result
}
const failure = (result: EmailEditResult) => {
  assert.equal(result.status, "error")
  if (result.status !== "error") throw new Error("erreur attendue")
  return result.error
}
const start = (id: "R4-A" | "R4-B" | "R4-C" = "R4-B"): State => ({ draft: promoDraft(id), composition: emptyEmailComposition })
/** Valeurs protégées d'un email : tout ce qui n'est pas une copie éditoriale. */
const protectedProjection = (config: EmailConfig) => {
  const offer = raw(config, "offer")
  const legal = raw(config, "mentions-legales")
  return JSON.stringify({
    value: offer.slots["valeur-cle"].text,
    code: offer.slots["code-promo-1"]?.text ?? null,
    header: raw(config, "header").slots,
    legal: legal.slots,
    secondary: offer.slots["lien-1"] ?? null,
    ctas: config.blocks.flatMap((block) => Object.entries((block as unknown as { slots: Json }).slots).filter(([name]) => name.startsWith("cta-")).map(([, value]) => (value as Json).href)),
    footer: raw(config, "footer").slots,
    offerType: offer.type,
    scope: [offer.slots["texte-descriptif"]?.text, offer.slots["texte-descriptif-2"]?.text].filter(Boolean).map((text) => String(text).split(" Offre valable sur ").pop()),
  })
}

describe("composition — scénarios R4 (démonstration), provider simulé", () => {
  test("R4-A « Rends l'accroche plus dynamique. » : texte seul, aucune opération, composition inchangée", async () => {
    const { result } = await editOnce(start(), "Rends l'accroche plus dynamique.", reply("Accroche plus dynamique", [["offer.text", "Cap sur la rentrée : lance-toi dans l'alternance avec un coup d'élan."]]))
    const out = ok(result)
    assert.deepEqual(out.composition, emptyEmailComposition)
    assert.deepEqual(out.changed, ["offer.text"])
    assert.equal(protectedProjection(out.config), protectedProjection(promoBase()))
  })

  test("R4-B « Ajoute un countdown sous l'offre. » : le bloc de fin d'offre apparaît sous l'offre ; offre, code, date, légal, destination, lien secondaire et image inchangés", async () => {
    const before = promoBase()
    const { provider, result } = await editOnce(start(), "Ajoute un countdown sous l'offre.", reply("Bloc de fin d'offre ajouté sous l'offre", [], [op("add-section", "end-date", "default")]))
    const out = ok(result)
    assert.equal(provider.calls.length, 1)
    assert.deepEqual(ids(out.config), ["header", "offer", "date-block", "support", "closing", "mentions-legales", "footer"])
    assert.deepEqual(out.composition, comp(op("add-section", "end-date", "default")))
    assert.equal(protectedProjection(out.config), protectedProjection(before))
    assert.deepEqual(raw(out.config, "offer"), raw(before, "offer"))
    assert.deepEqual(out.draft, promoDraft(), "le Draft n'a pas bougé : seule la composition a changé")
    assert.deepEqual(out.changed, ["add-section:end-date:default"])
    assert.ok(raw(out.config, "date-block").slots["texte-descriptif"].text.endsWith("31 décembre 2099."))
  })

  test("R4-C « Essaie une version plus jaune. » : le bloc de fin d'offre passe en jaune (Accent 1) ; le panneau d'offre garde sa couleur", async () => {
    const afterAdd = ok((await editOnce(start(), "Ajoute un countdown.", reply("ok", [], [op("add-section", "end-date", "default")]))).result)
    const { result } = await editOnce({ draft: afterAdd.draft as Json, composition: afterAdd.composition! }, "Essaie une version plus jaune.", reply("Bloc de fin d'offre en jaune", [], [op("change-surface", "end-date", "jaune")]))
    const out = ok(result)
    assert.equal(raw(out.config, "date-block").surface, "accent-1")
    assert.equal(protectedProjection(out.config), protectedProjection(promoBase()))
    assert.deepEqual(raw(out.config, "offer"), raw(promoBase(), "offer"))
  })

  test("R4-D « Essaie une autre image. » : une autre image de la banque, composition mémorisée, protégé inchangé", async () => {
    const before = promoBase()
    const { result } = await editOnce(start(), "Essaie une autre image.", reply("Autre image", [], [op("change-image", "main-image", "alternative")]))
    const out = ok(result)
    assert.notEqual(raw(out.config, "offer").slots["image-1"].src, raw(before, "offer").slots["image-1"].src)
    assert.equal(protectedProjection(out.config), protectedProjection(before))
    assert.equal(out.config.blocks.length, before.blocks.length)
  })

  test("« Supprime le bloc avantages. » : les appuis disparaissent, le reste est identique ; « Remets-les » les rétablit", async () => {
    const removed = ok((await editOnce(start(), "Supprime le bloc avantages.", reply("Appuis retirés", [], [op("remove-section", "support", "default")]))).result)
    assert.deepEqual(ids(removed.config), ["header", "offer", "closing", "mentions-legales", "footer"])
    assert.equal(protectedProjection(removed.config), protectedProjection(promoBase()))
    const back = ok((await editOnce({ draft: removed.draft as Json, composition: removed.composition! }, "Remets le bloc avantages.", reply("Appuis rétablis", [], [op("add-section", "support", "default")]))).result)
    assert.deepEqual(back.config, promoBase())
  })

  test("chaîne V1 → copie → fin d'offre → jaune → image → sans appuis : chaque version cumule les précédentes, texte, structure, surface, image", async () => {
    let state = start()
    const steps: [string, Anthropic.Message][] = [
      ["Rends l'accroche plus dynamique.", reply("Accroche", [["offer.text", "Cap sur la rentrée : lance-toi avec un coup d'élan."]])],
      ["Ajoute un countdown sous l'offre.", reply("Fin d'offre", [], [op("add-section", "end-date", "default")])],
      ["Essaie une version plus jaune.", reply("Jaune", [], [op("change-surface", "end-date", "jaune")])],
      ["Essaie une autre image.", reply("Image", [], [op("change-image", "main-image", "alternative")])],
      ["Supprime le bloc avantages.", reply("Sans appuis", [], [op("remove-section", "support", "default")])],
    ]
    const versions: EmailConfig[] = []
    for (const [instruction, response] of steps) {
      const out = ok((await editOnce(state, instruction, response)).result)
      state = { draft: out.draft as Json, composition: out.composition! }
      versions.push(out.config)
    }
    const final = versions.at(-1)!
    assert.deepEqual(ids(final), ["header", "offer", "date-block", "closing", "mentions-legales", "footer"])
    assert.equal(raw(final, "date-block").surface, "accent-1")
    assert.ok(raw(final, "offer").slots["texte-descriptif"].text.startsWith("Cap sur la rentrée"))
    assert.notEqual(raw(final, "offer").slots["image-1"].src, raw(promoBase(), "offer").slots["image-1"].src)
    for (const config of versions) assert.equal(protectedProjection(config), protectedProjection(promoBase()), "protégé identique à chaque version")
    assert.equal(state.composition.operations.length, 4)
    // Une seule zone colorée configurée, jamais deux à la suite : le schéma EmailConfig l'a vérifié à chaque version.
    assert.equal(final.blocks.filter((block) => (block as unknown as { surface?: string }).surface).length, 1)
  })

  test("deux consignes en une : texte et opération dans le même patch ; un seul appel", async () => {
    const { provider, result } = await editOnce(start(), "Rends l'accroche plus dynamique et ajoute un countdown.", reply("Les deux", [["offer.text", "Cap sur la rentrée : lance-toi avec un coup d'élan."]], [op("add-section", "end-date", "default")]))
    const out = ok(result)
    assert.equal(provider.calls.length, 1)
    assert.deepEqual(out.changed, ["offer.text", "add-section:end-date:default"])
  })

  test("variantes sans photo R4-A, R4-C : l'image change dans la conclusion illustrée", async () => {
    for (const id of ["R4-A", "R4-C"] as const) {
      const request = promoRequest(id)
      const state = start(id)
      const out = ok((await editOnce(state, "Essaie une autre image.", reply("Autre image", [], [op("change-image", "main-image", "alternative")]), request)).result)
      assert.notEqual(raw(out.config, "closing").slots["image-1"].src, raw(promoBase(id), "closing").slots["image-1"].src, id)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Moteur : refus, erreurs, protections                                       */
/* -------------------------------------------------------------------------- */

describe("composition — refus et rejets sans mutation", () => {
  test("demandes interdites : refusées AVANT appel, aucune version, aucune donnée protégée touchée", async () => {
    const instructions = [
      "Ajoute une section HTML.", "Ajoute une lame inconnue.", "Passe le fond en #FF0000.", "Utilise cette image https://example.com/a.jpg",
      "Ajoute un countdown jusqu'au 15 décembre.", "Ajoute 3 jours au countdown.", "Supprime le légal.", "Change l'offre à 30 %.", "Remplace DEMO20.",
      "Passe le bloc promo sur une variante plus sombre.", "Essaie une version plus rouge.",
    ]
    for (const instruction of instructions) {
      const { provider, result } = await editOnce(start(), instruction, reply("x", [], [op("add-section", "end-date", "default")]))
      assert.equal(failure(result).kind, "edit-refused", instruction)
      assert.equal(provider.calls.length, 0, `${instruction} : aucun appel`)
    }
  })

  test("Claude ne peut exprimer que des énumérations : opération, cible, valeur ou champ hors liste sont rejetés (schéma)", async () => {
    const bad: [string, Json][] = [
      ["lame brute", { op: "add-section", target: "email-module-banner-full", value: "default" }],
      ["couleur hex", { op: "change-surface", target: "support", value: "#FF0000" }],
      ["couleur libre", { op: "change-surface", target: "support", value: "rouge" }],
      ["panneau d'offre", { op: "change-surface", target: "offer", value: "jaune" }],
      ["url", { op: "change-image", target: "main-image", value: "https://example.com/a.jpg" }],
      ["fichier", { op: "change-image", target: "main-image", value: "quai-gare--offer.jpg" }],
      ["opération inconnue", { op: "move-section", target: "support", value: "default" }],
      ["html", { op: "add-section", target: "end-date", value: "<b>x</b>" }],
      ["champ en trop", { op: "add-section", target: "end-date", value: "default", date: "2099-01-01" }],
      ["date libre", { op: "add-section", target: "end-date", value: "2026-12-15" }],
    ]
    for (const [label, operation] of bad) {
      const { result } = await editOnce(start(), "Rends l'accroche plus dynamique.", message(JSON.stringify({ summary: "x", edits: [], operations: [operation] })))
      assert.equal(failure(result).kind, "invalid-draft", label)
    }
  })

  test("opérations impossibles sur cet email : refus propre avec motif, aucune version (déjà présent, absent, intention hors famille)", async () => {
    const present = ok((await editOnce(start(), "Ajoute un countdown.", reply("x", [], [op("add-section", "end-date", "default")]))).result)
    const state = { draft: present.draft as Json, composition: present.composition! }
    const again = failure((await editOnce(state, "Ajoute un countdown.", reply("x", [], [op("add-section", "end-date", "default")]))).result)
    assert.equal(again.kind, "edit-refused")
    assert.match(again.reason ?? "", /déjà/)
    const absent = failure((await editOnce(start(), "Supprime le countdown.", reply("x", [], [op("remove-section", "end-date", "default")]))).result)
    assert.equal(absent.kind, "edit-refused")
    assert.match(absent.reason ?? "", /pas dans l'email/)
    const intent = failure((await editOnce(start(), "Essaie une image plus posée.", reply("x", [], [op("change-image", "main-image", "warm-reassurance")]))).result)
    assert.equal(intent.kind, "invalid-draft", "intention hors de la liste de la famille : rejetée par le schéma")
  })

  test("patch vide : « rien à faire » ; le résumé du modèle explique (par exemple une couleur absente) ; aucune version", async () => {
    const { result } = await editOnce(start(), "Rends le bloc plus énergique.", reply("Aucune variante de couleur ne correspond au panneau de l'offre.", []))
    const error = failure(result)
    assert.equal(error.kind, "no-change")
    assert.match(error.reason ?? "", /Aucune variante/)
  })

  test("un patch qui mêle une opération permise à une copie interdite est rejeté en entier", async () => {
    const { result } = await editOnce(start(), "Ajoute un countdown.", reply("x", [["offer.text", "Profitez de -30 % jusqu'au 15 novembre."]], [op("add-section", "end-date", "default")]))
    assert.equal(failure(result).kind, "validation-failed")
  })

  test("une composition cliente falsifiée est revalidée : opération inconnue, trop longue, incohérente avec l'email : refusée sans appel", async () => {
    const bad: unknown[] = [
      { operations: [{ op: "change-surface", target: "offer", value: "jaune" }] },
      { operations: [{ op: "remove-section", target: "end-date", value: "default" }] },
      { operations: [{ op: "add-section", target: "end-date", value: "default" }, { op: "add-section", target: "end-date", value: "default" }] },
      { operations: Array.from({ length: 30 }, () => op("change-image", "main-image", "alternative")) },
      "texte",
      { html: "<b>x</b>" },
    ]
    for (const composition of bad) {
      const provider = fakeProvider(() => reply("x", [], []))
      const result = await editEmailV2({ request: promoRequest() as never, draft: promoDraft(), composition, instruction: "Raccourcis l'email." }, { client: provider.client, env: {} })
      assert.equal(failure(result).kind, "invalid-request")
      assert.equal(provider.calls.length, 0)
    }
  })

  test("un seul appel, aucune relance, erreurs du fournisseur : la composition courante n'est pas touchée", async () => {
    for (const make of [() => { throw Anthropic.APIError.generate(429, { type: "error", error: { type: "api_error", message: "x" } }, "429 x", new Headers()) }, () => { throw Anthropic.APIError.generate(529, { type: "error", error: { type: "api_error", message: "x" } }, "529 x", new Headers()) }]) {
      const { provider, result } = await editOnce(start(), "Ajoute un countdown.", make as never)
      assert.equal(result.status, "error")
      assert.equal(provider.calls.length, 1)
    }
  })

  test("R3 : « essaie une autre image » change l'image, jamais une preuve ; ajouter une section ou changer une couleur est refusé ; les valeurs affichées sont inchangées", async () => {
    const fixture = emailRecipeDraftFixtures.find((entry) => entry.id === "D-R3-B")!
    const request = structuredClone(fixture.request) as Json
    const draft = structuredClone(fixture.draft) as Json
    const run = (instruction: string, response: Anthropic.Message) => {
      const provider = fakeProvider(() => response)
      return editEmailV2({ request: request as never, draft, instruction }, { client: provider.client, env: {} }).then((result) => ({ provider, result }))
    }
    const image = ok((await run("Essaie une autre image.", reply("Autre image", [], [op("change-image", "main-image", "alternative")]))).result)
    const baseProofs = JSON.stringify(recipeBase("D-R3-B").blocks.filter((block) => block.type === "email-module-benefits-compact-highlights"))
    assert.equal(JSON.stringify(image.config.blocks.filter((block) => block.type === "email-module-benefits-compact-highlights")), baseProofs)
    assert.notEqual(JSON.stringify(image.config), JSON.stringify(recipeBase("D-R3-B")))
    for (const instruction of ["Ajoute un countdown.", "Essaie une version plus jaune.", "Supprime le bloc avantages.", "Ajoute un troisième chiffre."]) {
      const refusal = failure((await run(instruction, reply("x", [], []))).result)
      assert.equal(refusal.kind, "edit-refused", instruction)
    }
    // Même si le modèle tentait add-section : l'énumération de R3 ne la contient pas.
    const tamper = await run("Essaie une autre image.", message(JSON.stringify({ summary: "x", edits: [], operations: [{ op: "add-section", target: "end-date", value: "default" }] })))
    assert.equal(failure(tamper.result).kind, "invalid-draft")
  })

  test("R2 frise de portraits : aucune opération disponible ; l'image ne peut pas changer", async () => {
    const fixture = emailRecipeDraftFixtures.find((entry) => entry.id === "D-R2-B")!
    const provider = fakeProvider(() => reply("x", [], []))
    const result = await editEmailV2({ request: structuredClone(fixture.request) as never, draft: structuredClone(fixture.draft), instruction: "Essaie une autre image." }, { client: provider.client, env: {} })
    assert.equal(failure(result).kind, "edit-refused")
    assert.equal(provider.calls.length, 0)
  })
})

/* -------------------------------------------------------------------------- */
/* Historique, annuler, rétablir, export                                      */
/* -------------------------------------------------------------------------- */

describe("composition — historique et export suivent la version visible", () => {
  const form = () => {
    const example = emailGeneratorExamples.find((entry) => entry.id === "promotion")!.form
    return { ...example, promotion: { ...example.promotion, endDate: farFuture } }
  }
  const generation = () => toEmailRequestBody(form())
  const env = { EMAIL_ASSETS_BASE_URL: "https://assets.example.test", NODE_ENV: "production" } as const
  const email = (draft: unknown, composition?: unknown) => ({ status: "success" as const, subject: "S", preheader: "P", blockCount: 6, html: "<p/>", previewHtml: "<p/>", draft, ...(composition !== undefined ? { composition } : {}) })
  const run = (state: EmailEditorState, ...actions: EmailEditorAction[]) => actions.reduce(emailEditorReducer, state)
  const exportOf = async (state: EmailEditorState) => {
    const response = await handleEmailExport(new Request("http://localhost/api/export-email", { method: "POST", body: JSON.stringify(toEmailExportBody(state)) }), { env, log: () => {} })
    assert.equal(response.status, 200)
    return ((await response.json()) as Json).html as string
  }

  /** Le draft de l'exemple Promo (cible Actifs en poste, vouvoiement), en cohérence avec la demande que reconstruit la route. */
  const draft = (): Json => {
    const value = promoDraft()
    value.subject = "-20 % sur les formations"
    value.preheader = "Une offre de rentrée à découvrir dans le catalogue des formations concernées."
    value.offer = { eyebrow: "Offre rentrée", text: "Vous développez vos compétences à côté du travail ? Cette offre vous aide à vous lancer.", ctaLabel: "Voir les formations" }
    value.closing = { title: "À vous de choisir", text: "Le catalogue détaille chaque formation. Comparez-les, puis retenez celle qui vous convient.", ctaLabel: "Parcourir le catalogue" }
    value.support = { title: "Avant de vous décider", items: [{ icon: "magnifying-glass", title: "Repérez", text: "Parcourez le catalogue et notez ce qui vous intéresse." }, { icon: "handshake-simple", title: "Pensez à votre quotidien", text: "Repérez ce qui s'accorde avec votre activité." }, { icon: "stopwatch", title: "Comparez", text: "Lisez le détail de chaque formation avant de choisir." }] }
    return value
  }
  const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ")

  test("V1 → fin d'offre (V2) → jaune (V3) → image (V4) → sans appuis (V5) : chaque export est exactement la version visible ; annuler et rétablir ne coûtent aucun appel", async () => {
    const d = draft()
    const c2 = comp(op("add-section", "end-date", "default"))
    const c3 = comp(op("add-section", "end-date", "default"), op("change-surface", "end-date", "jaune"))
    const c4 = comp(...c3.operations, op("change-image", "main-image", "alternative"))
    const c5 = comp(...c4.operations, op("remove-section", "support", "default"))
    let state = run(initialEmailEditorState, { type: "generated", email: email(d), generation: generation() })
    const exports: string[] = [await exportOf(state)]
    for (const [label, composition] of [["V2", c2], ["V3", c3], ["V4", c4], ["V5", c5]] as const) {
      state = run(state, { type: "edit-start" }, { type: "edit-success", email: email(d, composition), instruction: label, summary: label })
      exports.push(await exportOf(state))
    }
    const [v1, v2, v3, v4, v5] = exports as [string, string, string, string, string]
    assert.ok(!v1.includes("Fin de l'offre"))
    assert.ok(v2.includes("Fin de l'offre") && v2.includes("Offre valable jusqu'au 31 décembre 2099."))
    assert.ok(/background:#EDF878/i.test(v3) && !/background:#EDF878/i.test(v2), "V3 : la surface jaune est dans le HTML exporté")
    assert.notEqual(v4.match(/--offer\.jpg/)?.[0] && v4.match(/email\/v2\/[a-z-]+--offer\.jpg/)?.[0], v3.match(/email\/v2\/[a-z-]+--offer\.jpg/)?.[0], "V4 : une autre image absolue")
    assert.ok(v4.includes("https://assets.example.test/images/email/v2/") && !v4.includes("demo-assets.invalid"))
    assert.ok(v4.includes("Avant de vous décider") && !v5.includes("Avant de vous décider"), "V5 : sans appuis")
    // Annuler : chaque export précédent, à l'octet près.
    for (const expected of [v4, v3, v2, v1]) {
      state = run(state, { type: "undo" })
      assert.equal(await exportOf(state), expected)
    }
    // Rétablir : chaque version suivante.
    for (const expected of [v2, v3, v4, v5]) {
      state = run(state, { type: "redo" })
      assert.equal(await exportOf(state), expected)
    }
    // Les valeurs protégées sont identiques à chaque version.
    for (const html of exports) {
      const text = textOf(html)
      assert.ok(text.includes("-20 %*") && text.includes("DEMO20") && text.includes("31/12/2099") && text.includes("Offre soumise à conditions d'éligibilité"))
      assert.equal((text.match(/DEMO20/g) ?? []).length, 1)
      assert.ok(html.includes("https://www.studi.com/fr/formations") && html.includes("https://www.studi.com/fr/parcours-decouverte"))
    }
    assert.equal(fetchGuard.mock.callCount(), 0, "aucun appel : annuler, rétablir et exporter n'utilisent aucun modèle")
  })

  test("l'export applique la composition côté serveur : une composition falsifiée ou inapplicable est refusée ; aucun champ de composition n'est un HTML", async () => {
    const d = draft()
    const body = (composition: unknown) => new Request("http://localhost/api/export-email", { method: "POST", body: JSON.stringify({ generation: generation(), draft: d, composition }) })
    for (const bad of [{ operations: [{ op: "change-surface", target: "offer", value: "jaune" }] }, { operations: [{ op: "remove-section", target: "end-date", value: "default" }] }, { operations: "x" }, { html: "<script>x</script>" }]) {
      const response = await handleEmailExport(body(bad), { env, log: () => {} })
      assert.ok(response.status === 400 || response.status === 422, JSON.stringify(bad))
      assert.ok(!("html" in ((await response.json()) as Json)))
    }
    const good = await handleEmailExport(body(comp(op("add-section", "end-date", "default"))), { env, log: () => {} })
    assert.equal(good.status, 200)
  })

  test("route /api/edit-email : la composition revient dans la réponse publique et sert à l'édition suivante", async () => {
    const d = draft()
    const respond = (response: Anthropic.Message) => {
      const provider = fakeProvider(() => response)
      return handleEmailEdit(new Request("http://localhost/api/edit-email", { method: "POST", body: JSON.stringify({ instruction: "Ajoute un countdown sous l'offre.", generation: generation(), draft: d }) }), { engine: (input) => editEmailV2(input, { client: provider.client, env: {} }), log: () => {} })
    }
    const response = await respond(reply("Fin d'offre ajoutée", [], [op("add-section", "end-date", "default")]))
    const json = (await response.json()) as Json
    assert.equal(response.status, 200, JSON.stringify(json))
    assert.deepEqual(json.composition, comp(op("add-section", "end-date", "default")))
    assert.deepEqual(json.changed, ["add-section:end-date:default"])
    assert.ok(json.html.includes("Fin de l'offre") && json.previewHtml.includes("Fin de l'offre"))
    assert.ok(!/DEMO20|2099-12-31|endDate/.test(JSON.stringify({ draft: json.draft, composition: json.composition })))
    // Un refus avant appel : 422, aucun appel, motif lisible.
    const refusal = await handleEmailEdit(new Request("http://localhost/api/edit-email", { method: "POST", body: JSON.stringify({ instruction: "Ajoute un countdown jusqu'au 15 décembre.", generation: generation(), draft: d }) }), { engine: (input) => editEmailV2(input, { client: fakeProvider(() => reply("x", [])).client, env: {} }), log: () => {} })
    const refusalJson = (await refusal.json()) as Json
    assert.equal(refusal.status, 422)
    assert.equal(refusalJson.code, "edit-refused")
  })

  test("l'historique garde la composition de chaque version : le corps d'édition et d'export envoient celle de la version affichée", () => {
    const d = draft()
    const state = run(initialEmailEditorState, { type: "generated", email: email(d), generation: generation() }, { type: "edit-start" }, { type: "edit-success", email: email(d, comp(op("add-section", "end-date", "default"))), instruction: "x", summary: "y" })
    assert.deepEqual(toEmailExportBody(state).composition, comp(op("add-section", "end-date", "default")))
    assert.equal("composition" in toEmailExportBody(run(state, { type: "undo" })), false, "V1 : aucune composition")
  })
})

describe("composition — requête et frontières", () => {
  test("une promotion expirée n'est plus éditable ; la date de fin ne se change que dans les données de l'offre", async () => {
    const request = promoRequest()
    request.promotion.endDate = "2020-01-01"
    const { result } = await editOnce(start(), "Ajoute un countdown.", reply("x", [], [op("add-section", "end-date", "default")]), request)
    assert.equal(failure(result).kind, "invalid-request")
    assert.equal(toEmailEngineRequest(toEmailRequestBody({ ...emailGeneratorExamples[3]!.form }) as never).intent, "promotion")
  })

  test("modules de composition : Email uniquement, sans réseau, sans Anthropic, sans lecture de fichier ; les recettes et leurs resolvers ne la connaissent pas", () => {
    const source = code("lib/email/composition.ts")
    assert.ok(!/lib\/landing|\.\.\/landing|lib\/brand|node:fs|fetch\(|@anthropic-ai|process\.env/.test(source))
    for (const name of ["recipes.ts", "recipe-drafts.ts", "recipe-prompts.ts", "recipe-resolver.ts", "recipe-validation.ts", "promotion-resolver.ts", "promotion-prompt.ts", "promotion-draft.ts", "promotion-facts.ts", "renderer.ts", "preview.ts"]) {
      assert.ok(!/from "\.\/composition"/.test(code(`lib/email/${name}`)), name)
    }
  })
})
