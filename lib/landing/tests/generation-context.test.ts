/**
 * Contexte de génération Landing : ressources fermées, sérialisable,
 * déterministe, sans logique « objectif → sections ».
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { landingDestinations, landingDestinationUrl, landingExcludedDestinations, landingOrigin } from "../destinations"
import { buildLandingGenerationContext, explainLandingSectionSelection } from "../generation-context"
import { landingImages } from "../image-catalog"
import { LandingPageSectionSchema } from "../schemas"
import { getSectionCatalogForPrompt, sectionCatalog } from "../section-catalog"
import { context, request } from "./fixtures"

const root = process.cwd()
const types = context.sections.map((section) => section.type)
const serialized = JSON.stringify(context)

describe("contexte de génération", () => {
  test("sérialisable sans traitement, déterministe", () => {
    assert.deepEqual(JSON.parse(serialized), context)
    assert.equal(JSON.stringify(buildLandingGenerationContext(request)), serialized)
    assert.equal(JSON.stringify(buildLandingGenerationContext({ ...request })), serialized)
  })

  test("structure : sections, destinations, images, règles", () => {
    assert.deepEqual(Object.keys(context), ["sections", "destinations", "images", "rules"])
    assert.deepEqual(Object.keys(context.rules), ["composition", "resources"])
    assert.ok(context.rules.composition.length > 0 && context.rules.resources.length > 0)
  })

  test("aucune donnée de style, de composant ni de balisage", () => {
    assert.ok(!/className|tailwind|style=|class=|#[0-9a-f]{6}\b|<\/?[a-z][a-z0-9-]*[\s>]/i.test(serialized))
    assert.ok(!/=>|function\s*\(|React|JSX/.test(serialized))
  })

  test("aucune logique objectif → sections : même contexte pour tout brief", () => {
    // Le constructeur ne lit jamais l'objectif : on lui en donne d'autres (hors contrat
    // de requête, d'où le cast) pour prouver qu'aucune section n'en dépend.
    const objectives = ["discover-trainings", "lead-generation", "documentation-download", "contact"] as const
    for (const objective of objectives) {
      const other = { ...request, objective: objective as typeof request.objective, brief: `Autre brief ${objective}` }
      assert.equal(JSON.stringify(buildLandingGenerationContext(other)), serialized, objective)
    }
    const withFacts = { ...request, facts: [{ value: "100 % en ligne" }] }
    assert.equal(JSON.stringify(buildLandingGenerationContext(withFacts)), serialized)
  })
})

describe("sections candidates", () => {
  test("réutilise le catalogue du prompt, sans le dupliquer", () => {
    const catalog = getSectionCatalogForPrompt()
    for (const section of context.sections) {
      assert.deepEqual(section, catalog.sections.find((entry) => entry.type === section.type))
    }
    assert.deepEqual(context.rules.composition, catalog.rules)
  })

  test("neuf sections candidates, dont deux heroes : le modèle garde le choix", () => {
    assert.deepEqual(types, ["editorial-hero", "immersive-hero", "value-props", "pillars", "content-carousel", "audience-switcher", "narrative-split", "destination-cards", "final-cta"])
    assert.equal(context.sections.filter((section) => section.isHero).length, 2)
    for (const type of types) assert.ok(sectionCatalog.some((entry) => entry.type === type))
  })

  test("sections commerciales (produit, prix, partenaire) non candidates, raison donnée", () => {
    for (const type of ["product-hero", "product-grid"] as const) {
      assert.ok(!types.includes(type), type)
      assert.match(explainLandingSectionSelection()[type]!, /source produit contrôlée/)
    }
    assert.deepEqual(Object.keys(explainLandingSectionSelection()).sort(), ["product-grid", "product-hero"])
  })

  test("le contrat garde toutes ses sections : seul le moteur IA en propose moins", () => {
    // Le nombre vient des sources ; la décision lame par lame est vérifiée dans section-alignment.test.ts.
    assert.equal(sectionCatalog.length, LandingPageSectionSchema.options.length)
    assert.ok(types.length < LandingPageSectionSchema.options.length)
  })

  test("sans image disponible, les sections qui en exigent sont écartées", () => {
    const bare = buildLandingGenerationContext(request, { images: [], destinations: [] })
    // La clôture et DestinationCards n'exigent aucune image : les heroes, le carrousel, les profils et NarrativeSplit sont écartés.
    assert.deepEqual(bare.sections.map((section) => section.type), ["value-props", "pillars", "destination-cards", "final-cta"])
    assert.match(explainLandingSectionSelection({ images: [], destinations: [] })["editorial-hero"]!, /aucune image/)
  })
})

describe("destinations contrôlées", () => {
  const destinations = Object.keys(landingDestinations) as (keyof typeof landingDestinations)[]

  test("ids stables, urls absolues studi.com/fr sans suivi, uniques", () => {
    assert.deepEqual(context.destinations.map((destination) => destination.id), destinations)
    assert.equal(new Set(context.destinations.map((destination) => destination.url)).size, destinations.length)
    for (const destination of context.destinations) {
      assert.ok(destination.url.startsWith(`${landingOrigin}/fr/`) && !destination.url.includes("?"), destination.url)
      assert.equal(destination.url, landingDestinationUrl(destination.id as (typeof destinations)[number]))
    }
  })

  test("chaque entrée porte sa provenance ; les destinations non vérifiées sont exclues", () => {
    for (const id of destinations) assert.match(landingDestinations[id].source, /sources-studi\.md §/, id)
    const urls = new Set(context.destinations.map((destination) => destination.url))
    for (const { href } of landingExcludedDestinations) {
      assert.ok(!href.startsWith("http") || !urls.has(href), href)
      assert.ok(!context.destinations.some((destination) => destination.url.endsWith(href)), href)
    }
    assert.ok(landingExcludedDestinations.some((excluded) => excluded.href.startsWith("/formations/")))
  })

  test("aucune destination de contact, de formulaire ni de téléchargement", () => {
    assert.ok(!context.destinations.some((destination) => /contact|formulaire|telecharg|documentation|lead/i.test(destination.id + destination.url)))
    assert.ok(context.rules.resources.some((entry) => entry.id === "no-contact"))
  })
})

describe("images contrôlées", () => {
  test("dix photos Landing présentes sur disque, ids uniques, avec alt", () => {
    assert.equal(landingImages.length, 10)
    assert.equal(new Set(landingImages.map((image) => image.id)).size, 10)
    for (const image of landingImages) {
      assert.ok(existsSync(join(root, "public", image.src)), image.src)
      assert.ok(image.alt.length > 10, image.id)
    }
    assert.deepEqual(context.images, landingImages.map((image) => ({ ...image })))
  })

  test("aucun asset Email : ni email-demo, ni logos, ni icônes, ni campagnes", () => {
    for (const image of landingImages) {
      assert.match(image.src, /^\/images\/(audience|content|hero)-[a-z0-9-]+\.jpg$/, image.src)
      assert.ok(!/email|logos|icones|black-friday|studi-days|studi-meet/i.test(image.src + image.alt), image.src)
    }
  })
})

describe("indépendance des domaines", () => {
  test("la génération Landing n'importe ni Email ni les données d'exemple", () => {
    for (const file of ["destinations", "image-catalog", "generation-request", "generation-context", "generation-draft", "draft-resolver", "ai-prompt", "generation-validation", "anthropic-schema", "anthropic"]) {
      const source = readFileSync(join(root, "lib/landing", `${file}.ts`), "utf8")
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]!)
      for (const specifier of imports) assert.ok(!/email|\.\/demo$|\/demo"/.test(specifier), `${file} : ${specifier}`)
    }
  })
})
