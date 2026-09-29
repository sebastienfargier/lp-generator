/**
 * Scénario Promotion du mode démo : une seule donnée commerciale, la valeur
 * fictive « -50 % » décidée pour la démo. Aucun code, date, compte à
 * rebours, prix ni disclaimer n'est inventé.
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
const types = (brief: EmailBrief) => generateDemoEmail(brief).blocks.map((block) => block.type)
/** Tous les textes visibles de la config : textes, libellés, objet, préheader. */
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
    assert.deepEqual(emailDemoPresets.map((preset) => preset.id), ["reconversion", "accompagnement", "evolution", "promotion"])
    assert.deepEqual(emailDemoObjectives.map((objective) => objective.value), ["decouverte-formations", "accompagnement", "evolution-carriere", "promotion"])
    assert.equal(emailObjectives.length, 3)
    assert.equal(safeParseEmailGenerationRequest({ ...emailBriefToGenerationRequest(presets.reconversion!), objective: "promotion" }).success, false)
    const request = emailBriefToGenerationRequest(promotion)
    assert.deepEqual({ objective: request.objective, emailType: request.emailType, offer: request.offer }, { objective: "decouverte-formations", emailType: "promo", offer: undefined })
  })

  test("valeur fictive regroupée dans le générateur, provenance démo", () => {
    assert.deepEqual(promotionDemoOffer, { value: "-50 %", source: "demo" })
    assert.ok(!JSON.stringify(config).includes('"source"'))
  })

  test("EmailConfig Zod valide, 5 à 7 lames, footer unique et dernier", () => {
    const parsed = safeParseEmailConfig(config)
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
    assert.ok(config.blocks.length >= 5 && config.blocks.length <= 7)
    assert.equal(config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
    assert.equal(config.blocks.filter((block) => block.type === "email-module-footer-compact-legal").length, 1)
  })

  test("-50 % dans le slot valeur-cle du bandeau, exactement", () => {
    const offre = config.blocks.find((block) => block.type === "email-module-banner-full")
    assert.deepEqual((offre?.slots as Record<string, unknown>)["valeur-cle"], { text: "-50 %" })
  })

  test("aucun autre pourcentage, chiffre ou prix", () => {
    for (const value of texts) {
      const rest = value.replaceAll("-50 %", "")
      assert.ok(!/\d|%|€|\beuros?\b|gratuit|prix/i.test(rest), value)
    }
  })

  test("aucun code promo, date, compte à rebours ni urgence", () => {
    const forbidden = new Set(["code-promo-1", "compteur-1", "compteur-2", "compteur-3"])
    for (const block of config.blocks) {
      for (const slot of Object.keys(block.slots)) assert.ok(!forbidden.has(slot), `${block.id}.${slot}`)
      assert.ok(!/countdown|discount-banner|offer-image-top|legal-disclaimer/.test(block.type), block.type)
    }
    const all = texts.join(" ")
    assert.ok(!/PROMO|\b[A-Z]{3,}\d+\b/.test(all), "code promo")
    assert.ok(!/jusqu'au|avant le|plus que|derniers? jours?|limitée?|profitez-en|dès maintenant|aujourd'hui|expire|fin de l'offre/i.test(all), "urgence ou date")
    assert.ok(!/(^|[^a-zà-ÿ])(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)([^a-zà-ÿ]|$)/i.test(all), "date")
  })

  test("uniquement des destinations contrôlées ; un seul CTA, vers le catalogue", () => {
    const hrefs = [...JSON.stringify(config).matchAll(/"href":"([^"]+)"/g)].map((match) => match[1]!)
    for (const href of hrefs) assert.ok(allowedUrls.has(href), href)
    const ctas = config.blocks.flatMap((block) => ("cta-1" in block.slots ? [(block.slots as Record<string, { label: string; href: string }>)["cta-1"]!] : []))
    assert.deepEqual(new Set(ctas.map((cta) => `${cta.label} → ${cta.href}`)), new Set([`Découvrir les formations → ${emailDestinationUrl("catalogue-formations")}`]))
  })

  test("hero photo : un asset de démo contrôlé, au ratio de sa lame", () => {
    const hero = config.blocks.find((block) => block.id === "hero")
    assert.equal(hero?.type, emailDemoAssets.reconversion.lame)
    assert.deepEqual((hero?.slots as Record<string, unknown>)["image-1"], { src: emailDemoAssets.reconversion.src, alt: emailDemoAssets.reconversion.alt })
    assert.ok(!JSON.stringify(config).includes("/images/"))
  })

  test("composition différente des trois autres scénarios", () => {
    const others = ["reconversion", "accompagnement", "evolution"].map((id) => types(presets[id]!).join(" "))
    assert.ok(!others.includes(types(promotion).join(" ")))
    assert.ok(types(promotion).includes("email-module-banner-full"))
    for (const id of ["reconversion", "accompagnement", "evolution"]) assert.ok(!types(presets[id]!).includes("email-module-banner-full"), id)
  })

  test("renderer, aperçu et largeur 600", () => {
    const { html, previewHtml, blockCount } = success()
    assert.equal(blockCount, config.blocks.length)
    assert.ok(html.includes(">-50 %<") && previewHtml.includes(">-50 %<"))
    assert.ok(html.includes(emailDemoAssets.reconversion.src) && !html.includes("/images/"))
    assert.ok(previewHtml.includes(`src="${emailDemoAssets.reconversion.preview}"`) && !previewHtml.includes("demo-assets.invalid"))
    for (const output of [html, previewHtml]) {
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
