/**
 * Mode démo : brief → EmailConfig déterministe → Zod → HTML. Les invariants
 * du renderer sont couverts par renderer.test.ts ; ici, la génération et la
 * frontière serveur.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { defaultEmailBrief, generateDemoEmail, toEmailId, type EmailBrief } from "../demo-generator"
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

describe("mode démo — EmailConfig", () => {
  test("brief par défaut → config valide de 6 lames, footer en dernier", () => {
    const config = generateDemoEmail(defaultEmailBrief)
    assert.ok(safeParseEmailConfig(config).success)
    assert.deepEqual(config.blocks.map((block) => block.type), [
      "email-module-preheader",
      "email-module-header-newsletter",
      "email-module-hero-diagnostic-quiz",
      "email-module-numbered-list",
      "email-module-text-only",
      "email-module-footer-compact-legal",
    ])
    assert.equal(config.subject, defaultEmailBrief.subject)
    assert.equal(config.id, "reconversion-professionnelle")
  })

  test("déterministe : même brief, même HTML", () => {
    assert.equal(success(defaultEmailBrief).html, success(defaultEmailBrief).html)
  })

  test("l'objectif choisit le CTA et la page de destination", () => {
    assert.match(slotText(defaultEmailBrief, "hero", "cta-1"), /Découvrir les formations.*\/fr\/formations/)
    assert.match(slotText({ ...defaultEmailBrief, objective: "accompagnement" }, "hero", "cta-1"), /\/fr\/accompagnement/)
    assert.match(slotText({ ...defaultEmailBrief, objective: "evolution-carriere" }, "hero", "cta-1"), /\/fr\/coaching-carriere/)
    assert.match(slotText({ ...defaultEmailBrief, objective: "evolution-carriere" }, "cloture", "titre-section"), /Préparez la suite/)
  })

  test("l'audience est reprise et choisit la surface du hero", () => {
    assert.match(slotText(defaultEmailBrief, "etapes", "sous-titre"), /Professionnels en poste/)
    const heroSurface = (brief: EmailBrief) => {
      const hero = generateDemoEmail(brief).blocks.find((block) => block.id === "hero")
      return hero && "surface" in hero ? hero.surface : undefined
    }
    assert.equal(heroSurface(defaultEmailBrief), "marque")
    assert.equal(heroSurface({ ...defaultEmailBrief, audience: "Demandeurs d'emploi" }), "accent-2-soft")
  })

  test("le brief choisit le thème du hero", () => {
    assert.match(slotText(defaultEmailBrief, "hero", "titre-principal"), /Changer de métier/)
    assert.match(slotText({ ...defaultEmailBrief, brief: "Accompagner une évolution de carrière" }, "hero", "titre-principal"), /évoluer votre carrière/)
  })

  test("aucun chiffre, prix ni pourcentage inventé dans le contenu", () => {
    const values = generateDemoEmail(defaultEmailBrief).blocks.flatMap((block) =>
      Object.values(block.slots as Record<string, { text?: string; label?: string }>)
        .flatMap((value) => [value.text, value.label])
        .filter((text): text is string => typeof text === "string")
    )
    assert.ok(values.length > 10)
    for (const text of values) assert.ok(!/\d|€|%/.test(text), text)
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
