/**
 * Catalogue métier des lames : exhaustif, cohérent avec le manifeste, et
 * sans rien que le modèle ne doive produire (HTML, classes, couleurs, URLs).
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { emailDisclaimers } from "../disclaimers"
import { emailBlockManifest, emailIconNames } from "../manifest"
import {
  emailEditorialGuidance,
  emailSectionCatalog,
  emailStructuralRules,
  getEmailSectionCatalogForPrompt,
} from "../section-catalog"
import { emailSurfaces } from "../surfaces"

type Entry = {
  family: string
  surfaceMode: string
  slots: Record<string, string>
  optional?: readonly string[]
}

const manifestTypes = Object.keys(emailBlockManifest)
const catalogTypes = Object.keys(emailSectionCatalog)
const prompt = getEmailSectionCatalogForPrompt()
const serialized = JSON.stringify(prompt)
const section = (type: string) => prompt.sections.find((candidate) => candidate.type === type)

describe("catalogue des lames", () => {
  test("36 lames, exactement celles du manifeste, sans doublon", () => {
    assert.equal(catalogTypes.length, 36)
    assert.deepEqual([...catalogTypes].sort(), [...manifestTypes].sort())
    assert.equal(new Set(prompt.sections.map((entry) => entry.type)).size, 36)
  })

  test("chaque entrée a un nom, un rôle et au moins un cas d'usage", () => {
    for (const [type, entry] of Object.entries(emailSectionCatalog)) {
      assert.ok(entry.name && entry.role && entry.useWhen.length > 0, type)
    }
  })

  test("données techniques dérivées du manifeste, dans son ordre", () => {
    assert.deepEqual(prompt.sections.map((entry) => entry.type), manifestTypes)
    for (const entry of prompt.sections) {
      const technical = (emailBlockManifest as Record<string, Entry>)[entry.type]!
      const optional = new Set(technical.optional ?? [])
      assert.equal(entry.family, technical.family)
      assert.equal(entry.surface, technical.surfaceMode)
      assert.deepEqual(
        entry.slots,
        Object.entries(technical.slots).map(([slot, kind]) => `${slot}${optional.has(slot) ? "?" : ""}: ${kind}`)
      )
    }
    assert.ok(section("email-module-legal-disclaimer")!.slots.includes("disclaimer-2?: disclaimer"))
  })

  test("restrictions de surface : product-details sur Page uniquement", () => {
    for (const type of ["email-module-product-details-variant-01", "email-module-product-details-variant-02"]) {
      const entry = section(type)!
      assert.deepEqual(entry.onlySurfaces, ["page"])
      assert.ok(entry.limitations?.some((limit) => /surface colorée/.test(limit)))
    }
    for (const entry of prompt.sections) {
      for (const surface of entry.onlySurfaces ?? []) assert.ok(emailSurfaces.includes(surface))
      if (entry.onlySurfaces) assert.equal(entry.surface, "configurable")
    }
  })

  test("limitation de contraste d'icons-grid documentée", () => {
    const entry = section("email-module-icons-grid")!
    assert.ok(entry.limitations?.some((limit) => /trait sombre/.test(limit) && /carré sombre/.test(limit)))
    assert.ok(entry.avoidWhen?.length)
  })
})

describe("règles globales", () => {
  test("contraintes structurelles et recommandations présentes, séparées", () => {
    const structural = emailStructuralRules.join(" ")
    assert.match(structural, /footer, en dernière position/)
    assert.match(structural, /immédiatement avant le footer/)
    assert.match(structural, /header n'est pas obligatoire/)
    assert.match(emailEditorialGuidance.join(" "), /Un seul CTA principal/)
    assert.deepEqual(prompt.structuralRules, emailStructuralRules)
    assert.deepEqual(prompt.editorialGuidance, emailEditorialGuidance)
  })

  test("vocabulaire contrôlé : surfaces, icônes, types de slots", () => {
    assert.deepEqual(prompt.surfaces, emailSurfaces)
    assert.deepEqual(prompt.iconNames, emailIconNames)
    assert.deepEqual(Object.keys(prompt.slotKinds).sort(), ["asset:icone", "asset:visuel", "cta", "cta:fleche", "disclaimer", "lien", "texte"])
  })

  test("disclaimers référencés par identifiant, sans texte juridique", () => {
    assert.deepEqual(prompt.disclaimers.map((entry) => entry.id), Object.keys(emailDisclaimers))
    assert.equal(prompt.disclaimers.find((entry) => entry.id === "offre-promotionnelle")?.requiresEndDate, true)
    for (const { text } of Object.values(emailDisclaimers)) {
      assert.ok(!serialized.includes(text.slice(0, 40)), text.slice(0, 40))
    }
  })
})

describe("sortie pour le prompt", () => {
  test("sérialisable et stable", () => {
    assert.deepEqual(JSON.parse(serialized), prompt)
    assert.equal(JSON.stringify(getEmailSectionCatalogForPrompt()), serialized)
  })

  test("aucun HTML, classe, couleur hex ni URL CDN à produire", () => {
    assert.ok(!/<\/?[a-z][a-z0-9-]*[\s>]/i.test(serialized), "HTML")
    assert.ok(!/className|class=|style=/.test(serialized), "classes ou styles")
    assert.ok(!/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.test(serialized), "couleur hex")
    assert.ok(!/URL_CDN|cdn\.|\/logos\/|\/icones\//i.test(serialized), "URL CDN ou chemin local")
    assert.ok(!/https?:\/\/[a-z]/i.test(serialized), "URL concrète")
  })
})
