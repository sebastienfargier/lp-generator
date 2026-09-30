/**
 * Mode démo : brief → EmailConfig déterministe → Zod → HTML. Les invariants
 * du renderer sont couverts par renderer.test.ts ; ici, la génération et la
 * frontière serveur.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { defaultEmailBrief, emailDemoPresets, generateDemoEmail, promotionDemoOffer, toEmailId, type EmailBrief } from "../demo-generator"
import { emailDestinations, emailDestinationUrl } from "../destinations"
import { runEmailGeneration } from "../generation"
import { safeParseEmailConfig } from "../schemas"
import { internalAttribute } from "./fixtures"

const success = (brief: EmailBrief) => {
  const result = runEmailGeneration(brief)
  assert.equal(result.status, "success", JSON.stringify(result))
  if (result.status !== "success") throw new Error("génération en échec")
  return result
}
const slotText = (brief: EmailBrief, blockId: string, slot: string) => {
  const block = generateDemoEmail(brief).blocks.find((candidate) => candidate.id === blockId)
  return JSON.stringify((block?.slots as Record<string, unknown>)[slot])
}

// Scénarios par objectif ; les campagnes visuelles ont leurs tests (campaigns.test.ts).
const scenarioPresets = emailDemoPresets.filter((preset) => preset.group === "scenario")
const presets = Object.fromEntries(scenarioPresets.map((preset) => [preset.id, preset.brief])) as Record<string, EmailBrief>
const types = (brief: EmailBrief) => generateDemoEmail(brief).blocks.map((block) => block.type)
const allowedUrls = new Set<string>((Object.keys(emailDestinations) as (keyof typeof emailDestinations)[]).map((id) => emailDestinationUrl(id)))
const zoneOf = (brief: EmailBrief) =>
  generateDemoEmail(brief).blocks.flatMap((block) => ("surface" in block && block.surface ? [`${block.id}:${block.surface}`] : []))

describe("mode démo — scénarios", () => {
  test("quatre exemples, un par objectif ; le premier est le brief initial", () => {
    assert.deepEqual(scenarioPresets.map((preset) => preset.brief.objective), ["decouverte-formations", "accompagnement", "evolution-carriere", "promotion"])
    assert.deepEqual(emailDemoPresets[0].brief, defaultEmailBrief)
  })

  test("chaque scénario : EmailConfig valide, 4 à 7 lames, footer unique et dernier", () => {
    for (const [name, brief] of Object.entries(presets)) {
      const config = generateDemoEmail(brief)
      const parsed = safeParseEmailConfig(config)
      assert.ok(parsed.success, `${name} : ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`)
      // Promotion : 4 lames (hero Offer complet), aucune ajoutée pour le compte.
      assert.ok(config.blocks.length >= (name === "promotion" ? 4 : 5) && config.blocks.length <= 7, name)
      assert.equal(config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
      assert.equal(config.blocks.filter((block) => block.type === "email-module-footer-compact-legal").length, 1)
      assert.equal(config.subject, brief.subject)
    }
  })

  test("quatre compositions, zones colorées et préheaders distincts", () => {
    const compositions = Object.values(presets).map((brief) => types(brief).join(" "))
    assert.equal(new Set(compositions).size, 4)
    assert.deepEqual(Object.values(presets).map(zoneOf), [["hero:marque"], ["encart:marque"], ["hero:encre"], ["atouts:accent-1"]])
    assert.equal(new Set(Object.values(presets).map((brief) => generateDemoEmail(brief).preheader)).size, 4)
    assert.ok(!Object.values(presets).some((brief) => types(brief).includes("email-module-icons-grid")))
  })

  test("l'objectif choisit le scénario, avant les mots du brief", () => {
    const accompagnement = { ...presets.accompagnement!, brief: "Parler de reconversion et d'évolution de carrière." }
    assert.deepEqual(types(accompagnement), types(presets.accompagnement!))
    assert.match(slotText(accompagnement, "hero", "cta-1"), /\/fr\/accompagnement/)
    assert.match(slotText(presets.evolution!, "hero", "cta-1"), /\/fr\/coaching-carriere/)
    assert.match(slotText(defaultEmailBrief, "hero", "cta-1"), /\/fr\/formations/)
  })

  test("le brief choisit la variante d'accroche, dans le scénario", () => {
    assert.match(slotText(defaultEmailBrief, "hero", "titre-principal"), /Changer de métier/)
    assert.match(slotText({ ...defaultEmailBrief, brief: "Aider à reprendre des études." }, "hero", "titre-principal"), /Reprendre une formation/)
    assert.match(slotText({ ...presets.accompagnement!, brief: "Présenter la méthode à distance." }, "hero", "titre-principal"), /méthode/)
  })

  test("données saisies reprises : campagne, objet, audience ; zone d'empathie", () => {
    const custom = { ...presets.evolution!, campaignName: "Cap sur 2027", subject: "Votre prochaine étape", audience: "Managers en poste" }
    const config = generateDemoEmail(custom)
    assert.equal(config.subject, "Votre prochaine étape")
    assert.equal(config.id, "cap-sur-2027")
    assert.match(slotText(custom, "header", "label"), /Cap sur 2027/)
    assert.match(slotText(custom, "leviers", "sous-titre"), /Managers en poste/)
    assert.deepEqual(zoneOf({ ...presets.accompagnement!, audience: "Demandeurs d'emploi" }), ["encart:accent-2-soft"])
  })

  test("déterministe : même brief, même HTML", () => {
    for (const brief of Object.values(presets)) assert.equal(success(brief).html, success(brief).html)
  })

  test("uniquement des destinations contrôlées", () => {
    for (const brief of Object.values(presets)) {
      for (const [, href] of JSON.stringify(generateDemoEmail(brief)).matchAll(/"href":"([^"]+)"/g)) {
        assert.ok(allowedUrls.has(href!), href)
      }
    }
  })

  test("aucun fait inventé : ni chiffre, prix, pourcentage, date ou code (hors valeurs fictives Promotion)", () => {
    for (const [name, brief] of Object.entries(presets)) {
      const values = generateDemoEmail(brief).blocks.flatMap((block) =>
        Object.values(block.slots as Record<string, { text?: string; label?: string }>)
          .flatMap((value) => [value.text, value.label])
          .filter((value): value is string => typeof value === "string")
      )
      assert.ok(values.length > 8, name)
      // « Compétences 360 » est un nom de service des sources, pas un chiffre ;
      // les valeurs fictives ne sont admises que dans le scénario Promotion.
      const allowed = (value: string) =>
        name === "promotion"
          ? value.replaceAll(promotionDemoOffer.value, "").replaceAll(promotionDemoOffer.code, "")
          : value.replace("Compétences 360", "")
      for (const value of values) assert.ok(!/\d|€|%/.test(allowed(value)), `${name} : ${value}`)
      assert.ok(!/garanti|gratuit|coach dédié|personnalisé|100 %/i.test(values.join(" ")), name)
    }
  })

  test("HTML renderable et aperçu transformable pour chaque scénario", () => {
    for (const brief of Object.values(presets)) {
      const result = success(brief)
      assert.ok(result.html.startsWith("<!DOCTYPE html>") && !internalAttribute.test(result.html))
      assert.ok(result.previewHtml.includes("/logos/logo_studi_sombre_lowres.png"))
      assert.ok(!/\shref=/.test(result.previewHtml))
    }
  })

  test("identifiant stable dérivé du nom de campagne", () => {
    assert.equal(toEmailId("Rentrée 2026 — Actifs"), "rentree-2026-actifs")
    assert.equal(toEmailId("2026"), "email-2026")
  })
})

describe("mode démo — frontière serveur", () => {
  test("succès : HTML complet, objet échappé, sans attribut interne", () => {
    const result = success({ ...defaultEmailBrief, subject: "Studi & vous : <5 min" })
    assert.ok(result.html.startsWith("<!DOCTYPE html>"))
    assert.ok(result.html.includes("<title>Studi &amp; vous : &lt;5 min</title>"))
    assert.ok(!internalAttribute.test(result.html) && !/<script/i.test(result.html))
    assert.equal(result.blockCount, 6)
  })

  test("brief incomplet : erreur lisible, aucun HTML", () => {
    const result = runEmailGeneration({ ...defaultEmailBrief, subject: "   " })
    assert.equal(result.status, "error")
    if (result.status === "error") {
      assert.equal(result.title, "Brief incomplet")
      assert.deepEqual(result.issues, [{ path: "subject", message: "L'objet est requis." }])
    }
  })

  test("entrée inconnue refusée (objectif, clé en trop, non-objet)", () => {
    assert.equal(runEmailGeneration({ ...defaultEmailBrief, objective: "promo" }).status, "error")
    assert.equal(runEmailGeneration({ ...defaultEmailBrief, html: "<b>x</b>" }).status, "error")
    assert.equal(runEmailGeneration(null).status, "error")
  })
})
