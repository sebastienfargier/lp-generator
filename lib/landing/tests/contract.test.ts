/**
 * Contrat Landing : LandingPageConfig → Zod reste l'autorité, et le catalogue
 * des sections couvre exactement les sections du contrat et du renderer.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { demoLandingPage } from "../demo"
import { LandingPageSectionSchema, safeParseLandingPage } from "../schemas"
import { getSectionCatalogForPrompt, sectionCatalog } from "../section-catalog"

const root = process.cwd()
const sectionTypes = LandingPageSectionSchema.options.map((option) => option.shape.type.value)
const editorialHero = demoLandingPage.sections[0]!

describe("LandingPageConfig → Zod", () => {
  test("la page d'exemple statique (/examples/generated-landing) est valide", () => {
    const parsed = safeParseLandingPage(demoLandingPage)
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
  })

  test("une page minimale à une section est valide", () => {
    const page = { version: 1, id: "minimale", title: "Page minimale", sections: [{ ...editorialHero, props: { ...editorialHero.props, primaryAction: { label: "Voir", href: "#hero" } } }] }
    assert.ok(safeParseLandingPage(page).success)
  })

  test("refusés : clé inconnue (className), ancre sans cible, id en double, hero hors tête", () => {
    const withClass = { ...demoLandingPage, sections: [{ ...editorialHero, props: { ...editorialHero.props, className: "text-red-500" } }] }
    assert.equal(safeParseLandingPage(withClass).success, false)
    const brokenAnchor = { ...demoLandingPage, sections: [{ ...editorialHero, props: { ...editorialHero.props, primaryAction: { label: "Voir", href: "#absente" } } }] }
    assert.equal(safeParseLandingPage(brokenAnchor).success, false)
    const duplicate = { ...demoLandingPage, sections: [demoLandingPage.sections[1]!, demoLandingPage.sections[1]!] }
    assert.equal(safeParseLandingPage(duplicate).success, false)
    const heroSecond = { ...demoLandingPage, sections: [demoLandingPage.sections[1]!, editorialHero] }
    assert.equal(safeParseLandingPage(heroSecond).success, false)
    assert.equal(safeParseLandingPage({ ...demoLandingPage, version: 2 }).success, false)
  })
})

describe("bibliothèque de sections", () => {
  test("8 sections : contrat, catalogue et renderer alignés", () => {
    assert.equal(sectionTypes.length, 8)
    assert.deepEqual(sectionCatalog.map((entry) => entry.type).sort(), [...sectionTypes].sort())
    const renderer = readFileSync(join(root, "components/landing/section-renderer.tsx"), "utf8")
    for (const type of sectionTypes) assert.ok(renderer.includes(`case "${type}"`), type)
  })

  test("chaque section a son composant dans components/sections", () => {
    for (const type of sectionTypes) assert.ok(existsSync(join(root, "components/sections", type)), type)
    for (const file of ["landing-page-renderer.tsx", "section-renderer.tsx", "icon-resolver.ts"]) {
      assert.ok(existsSync(join(root, "components/landing", file)), file)
    }
  })

  test("catalogue pour le prompt : sérialisable, sans design", () => {
    const catalog = getSectionCatalogForPrompt()
    assert.equal(catalog.sections.length, 8)
    const serialized = JSON.stringify(catalog)
    assert.deepEqual(JSON.parse(serialized), catalog)
    assert.ok(!/className|tailwind|style=|#[0-9a-f]{6}\b/i.test(serialized))
  })
})
