/**
 * Scénario Promotion du mode démo : deux données commerciales fictives,
 * « -50 % » et « DEMO50 », décidées pour la démo, portées par la lame Offer
 * hero-offer-image-top. Aucune date, compte à rebours, prix, condition ni
 * disclaimer n'est inventé. La photo Promotion (recadrage 2:1 de
 * content-4.jpg) suit le mécanisme .invalid des autres scénarios.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { emailDemoAssets } from "../demo-assets"
import {
  emailDemoObjectives,
  emailDemoPresets,
  emailObjectives,
  generateDemoEmail,
  promotionDemoOffer,
  type EmailBrief,
} from "../demo-generator"
import { emailDestinations, emailDestinationUrl } from "../destinations"
import { runEmailGeneration } from "../generation"
import { emailBriefToGenerationRequest, safeParseEmailGenerationRequest } from "../generation-request"
import { safeParseEmailConfig } from "../schemas"

const presets = Object.fromEntries(emailDemoPresets.map((preset) => [preset.id, preset.brief])) as Record<string, EmailBrief>
const promotion = presets.promotion!
const config = generateDemoEmail(promotion)
const hero = config.blocks.find((block) => block.id === "hero")!
const heroSlots = hero.slots as Record<string, unknown>
const photo = emailDemoAssets.promotion
const types = (brief: EmailBrief) => generateDemoEmail(brief).blocks.map((block) => block.type)
/** Tous les textes visibles de la config : textes, libellés, alt, objet, préheader. */
const texts = [
  config.subject,
  config.preheader,
  ...config.blocks.flatMap((block) =>
    Object.values(block.slots as Record<string, { text?: string; label?: string; alt?: string }>).flatMap((value) => [value.text, value.label, value.alt])
  ),
].filter((value): value is string => typeof value === "string")
const allowedUrls = new Set<string>((Object.keys(emailDestinations) as (keyof typeof emailDestinations)[]).map((id) => emailDestinationUrl(id)))
const success = () => {
  const result = runEmailGeneration(promotion)
  if (result.status !== "success") throw new Error(JSON.stringify(result))
  return result
}

describe("mode démo — Promotion", () => {
  test("quatre exemples et quatre objectifs ; le contrat IA garde ses trois objectifs", () => {
    assert.deepEqual(emailDemoPresets.filter((preset) => preset.group === "scenario").map((preset) => preset.id), ["reconversion", "accompagnement", "evolution", "promotion"])
    assert.deepEqual(emailDemoObjectives.map((objective) => objective.value), ["decouverte-formations", "accompagnement", "evolution-carriere", "promotion"])
    assert.equal(emailObjectives.length, 3)
    assert.equal(safeParseEmailGenerationRequest({ ...emailBriefToGenerationRequest(presets.reconversion!), objective: "promotion" }).success, false)
  })

  test("valeurs fictives regroupées dans le générateur, jamais transmises au contrat IA", () => {
    assert.deepEqual(promotionDemoOffer, { value: "-50 %", code: "DEMO50", source: "demo" })
    assert.ok(!JSON.stringify(config).includes('"source"'))
    const request = emailBriefToGenerationRequest(promotion)
    assert.deepEqual({ objective: request.objective, emailType: request.emailType, offer: request.offer }, { objective: "decouverte-formations", emailType: "promo", offer: undefined })
    assert.ok(!JSON.stringify(request).includes("DEMO50"))
  })

  test("composition : header de campagne, hero offre, atouts, footer", () => {
    assert.deepEqual(types(promotion), [
      "email-module-header-seasonal-campaign",
      "email-module-hero-offer-image-top",
      "email-module-icons-list",
      "email-module-footer-compact-legal",
    ])
    assert.equal(config.blocks.filter((block) => block.type === "email-module-footer-compact-legal").length, 1)
  })

  test("EmailConfig Zod valide", () => {
    const parsed = safeParseEmailConfig(config)
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
  })

  test("hero : -50 % dans valeur-cle, DEMO50 dans code-promo-1, exactement", () => {
    assert.deepEqual(heroSlots["valeur-cle"], { text: "-50 %" })
    assert.deepEqual(heroSlots["code-promo-1"], { text: "DEMO50" })
  })

  test("aucun autre pourcentage, chiffre, prix ni code", () => {
    for (const value of texts) {
      const rest = value.replaceAll("-50 %", "").replaceAll("DEMO50", "")
      assert.ok(!/\d|%|€|\beuros?\b|gratuit|prix/i.test(rest), value)
      assert.ok(!/\b[A-Z]{3,}\d+\b/.test(rest), value)
    }
  })

  test("aucune date, compte à rebours, urgence ni disclaimer", () => {
    const forbidden = new Set(["compteur-1", "compteur-2", "compteur-3"])
    for (const block of config.blocks) {
      for (const slot of Object.keys(block.slots)) assert.ok(!forbidden.has(slot), `${block.id}.${slot}`)
      assert.ok(!/countdown|legal-disclaimer/.test(block.type), block.type)
    }
    const all = texts.join(" ")
    assert.ok(!/jusqu'au|avant le|plus que|derniers? jours?|limitée?|profitez-en|dès maintenant|aujourd'hui|expire|fin de l'offre|non cumulable|conditions/i.test(all), "urgence, date ou conditions")
    assert.ok(!/(^|[^a-zà-ÿ])(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)([^a-zà-ÿ]|$)/i.test(all), "date")
  })

  test("CTA catalogue et lien secondaire Parcours Découverte, destinations contrôlées", () => {
    for (const [, href] of JSON.stringify(config).matchAll(/"href":"([^"]+)"/g)) assert.ok(allowedUrls.has(href!), href)
    assert.deepEqual(heroSlots["cta-1"], { label: "Découvrir les formations", href: emailDestinationUrl("catalogue-formations") })
    assert.deepEqual(heroSlots["lien-1"], { label: "Voir le Parcours Découverte", href: emailDestinationUrl("parcours-decouverte") })
    const ctas = config.blocks.filter((block) => "cta-1" in block.slots)
    assert.deepEqual(ctas.map((block) => block.id), ["hero"])
  })

  test("photo : asset de démo contrôlé, cadre 600 × 300, sans chemin local dans la config", () => {
    assert.equal(photo.src, "https://demo-assets.invalid/email-demo-promotion.jpg")
    assert.equal(photo.lame, "email-module-hero-offer-image-top")
    assert.deepEqual(photo.frame, { width: 600, height: 300 })
    assert.deepEqual(heroSlots["image-1"], { src: photo.src, alt: photo.alt })
    assert.ok(photo.alt.length > 0)
    assert.ok(!JSON.stringify(config).includes("/images/"))
  })

  test("composition différente des trois autres ; lame Offer propre à Promotion", () => {
    const others = ["reconversion", "accompagnement", "evolution"].map((id) => types(presets[id]!))
    for (const other of others) {
      assert.notDeepEqual(other, types(promotion))
      assert.ok(!other.includes("email-module-hero-offer-image-top"))
    }
  })

  test("renderer, aperçu et largeur 600", () => {
    const { html, previewHtml, blockCount } = success()
    assert.equal(blockCount, 4)
    assert.ok(html.includes(`src="${photo.src}"`) && !html.includes("/images/"))
    assert.ok(previewHtml.includes(`src="${photo.preview}"`) && !previewHtml.includes("demo-assets.invalid"))
    for (const output of [html, previewHtml]) {
      assert.ok(output.includes(">-50 %<") && output.includes(">DEMO50<"))
      assert.equal((output.match(/class="lame" width="600"/g) ?? []).length, config.blocks.length)
      assert.ok(output.includes("@media only screen and (max-width:599px)") && !output.includes("640"))
    }
  })

  test("déterministe : même formulaire, même EmailConfig, même HTML", () => {
    assert.deepEqual(generateDemoEmail({ ...promotion }), config)
    assert.equal(success().html, success().html)
    assert.equal(success().previewHtml, success().previewHtml)
  })
})
