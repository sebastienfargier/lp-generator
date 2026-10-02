/**
 * Garde-fous d'ajout d'une lame : le contrat, le renderer, le catalogue, la
 * bibliothèque et la décision de génération IA restent alignés. Aucun
 * nombre de lames n'est écrit ici : tout est dérivé des sources de données,
 * pour qu'ajouter une lame fasse échouer le test qui désigne l'oubli.
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { librarySections } from "../../../components/library/registry"
import { landingDraftSectionTypes } from "../generation-draft"
import { LandingPageSectionSchema } from "../schemas"
import { sectionCatalog } from "../section-catalog"
import { getSectionGeneration, nonGenerableSections } from "../section-generation"
import { context } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

type Alignment = {
  contract: readonly string[]
  renderer: readonly string[]
  catalog: readonly { type: string; name: string }[]
  library: readonly { type: string; slug: string; name: string }[]
  draft: readonly string[]
  excluded: Readonly<Record<string, string>>
}

/** Liste les incohérences entre les sources ; vide si tout est aligné. */
function findAlignmentIssues(input: Alignment): string[] {
  const issues: string[] = []
  const known = new Set(input.contract)
  const catalogTypes = input.catalog.map((entry) => entry.type)
  const libraryTypes = input.library.map((entry) => entry.type)

  for (const type of input.contract) {
    if (!input.renderer.includes(type)) issues.push(`${type} : absent du renderer`)
    if (!catalogTypes.includes(type)) issues.push(`${type} : absent de section-catalog`)
    if (!libraryTypes.includes(type)) issues.push(`${type} : absent de la bibliothèque`)
    const inDraft = input.draft.includes(type)
    const reason = input.excluded[type]
    if (!inDraft && reason === undefined) issues.push(`${type} : aucune décision de génération (ni Draft, ni exclusion)`)
    if (inDraft && reason !== undefined) issues.push(`${type} : à la fois dans le Draft et exclue`)
    if (reason !== undefined && reason.trim() === "") issues.push(`${type} : exclusion sans raison`)
  }

  const unknown = (source: string, types: readonly string[]) => {
    for (const type of types) if (!known.has(type)) issues.push(`${type} : présent dans ${source} mais absent du contrat`)
  }
  unknown("le renderer", input.renderer)
  unknown("section-catalog", catalogTypes)
  unknown("la bibliothèque", libraryTypes)
  unknown("le Draft", input.draft)
  unknown("les exclusions", Object.keys(input.excluded))

  for (const [source, values] of [["section-catalog", catalogTypes], ["la bibliothèque", libraryTypes], ["les slugs de la bibliothèque", input.library.map((entry) => entry.slug)]] as const) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index)
    for (const duplicate of new Set(duplicates)) issues.push(`${duplicate} : en double dans ${source}`)
  }
  for (const entry of input.library) {
    const catalogName = input.catalog.find((candidate) => candidate.type === entry.type)?.name
    if (catalogName !== undefined && catalogName !== entry.name) issues.push(`${entry.type} : nom « ${entry.name} » ≠ section-catalog « ${catalogName} »`)
  }
  return issues
}

const contract = LandingPageSectionSchema.options.map((option) => option.shape.type.value) as string[]
const rendererTypes = [...read("components/landing/section-renderer.tsx").matchAll(/case "([a-z-]+)":/g)].map((match) => match[1]!)
const real: Alignment = {
  contract,
  renderer: rendererTypes,
  catalog: sectionCatalog,
  library: librarySections,
  draft: landingDraftSectionTypes,
  excluded: nonGenerableSections,
}

describe("alignement des lames", () => {
  test("contrat, renderer, catalogue, bibliothèque et décision de génération sont alignés", () => {
    assert.ok(contract.length > 0)
    assert.deepEqual(findAlignmentIssues(real), [])
  })

  test("chaque lame de la bibliothèque a son composant, sa page d'exemple et un usage cohérent", () => {
    for (const entry of librarySections) {
      assert.ok(existsSync(join(root, "components/sections", entry.type)), `${entry.type} : composant`)
      assert.ok(existsSync(join(root, "app/examples", entry.slug, "page.tsx")), `${entry.slug} : page d'exemple`)
      assert.equal(entry.example, `/examples/${entry.slug}`, entry.slug)
      assert.equal(entry.importPath, `@/components/sections/${entry.type}`, entry.slug)
      assert.ok(entry.usage.includes(`<${entry.name}`), `${entry.slug} : usage`)
      assert.ok(entry.description.trim() !== "", `${entry.slug} : description`)
    }
  })

  test("aucun dossier de composants de section sans lame au contrat", () => {
    const folders = readdirSync(join(root, "components/sections")).filter((name) => statSync(join(root, "components/sections", name)).isDirectory())
    assert.deepEqual([...folders].sort(), [...contract].sort())
  })
})

describe("les garde-fous détectent un oubli", () => {
  const fictive = "fictive-section"
  const withFictive: Alignment = { ...real, contract: [...real.contract, fictive] }

  test("nouvelle lame au contrat seulement : tous les oublis sont signalés", () => {
    const issues = findAlignmentIssues(withFictive)
    for (const expected of ["absent du renderer", "absent de section-catalog", "absent de la bibliothèque", "aucune décision de génération"]) {
      assert.ok(issues.some((issue) => issue.startsWith(fictive) && issue.includes(expected)), expected)
    }
    assert.equal(issues.length, 4)
  })

  test("lame complète mais sans décision de génération : détectée", () => {
    const almost: Alignment = {
      ...withFictive,
      renderer: [...real.renderer, fictive],
      catalog: [...real.catalog, { type: fictive, name: "Fictive" }],
      library: [...real.library, { type: fictive, slug: fictive, name: "Fictive" }],
    }
    assert.deepEqual(findAlignmentIssues(almost), [`${fictive} : aucune décision de génération (ni Draft, ni exclusion)`])
    assert.deepEqual(findAlignmentIssues({ ...almost, excluded: { ...real.excluded, [fictive]: "Pas de source de données." } }), [])
    assert.deepEqual(findAlignmentIssues({ ...almost, draft: [...real.draft, fictive] }), [])
  })

  test("exclusion sans raison, double décision, lame inconnue du contrat, doublons, noms divergents", () => {
    const [first] = real.library
    assert.ok(findAlignmentIssues({ ...real, excluded: { ...real.excluded, "product-hero": "  " } }).some((issue) => issue.includes("exclusion sans raison")))
    assert.ok(findAlignmentIssues({ ...real, draft: [...real.draft, "product-hero"] }).some((issue) => issue.includes("à la fois dans le Draft et exclue")))
    assert.ok(findAlignmentIssues({ ...real, library: [...real.library, { type: "inconnue", slug: "inconnue", name: "X" }] }).some((issue) => issue.includes("absent du contrat")))
    assert.ok(findAlignmentIssues({ ...real, library: [...real.library, first!] }).some((issue) => issue.includes("en double")))
    assert.ok(findAlignmentIssues({ ...real, library: real.library.map((entry) => (entry === first ? { ...entry, name: "Autre" } : entry)) }).some((issue) => issue.includes("≠ section-catalog")))
  })

  test("getSectionGeneration refuse une lame sans décision", () => {
    assert.throws(() => getSectionGeneration(fictive as never), /sans décision de génération/)
  })
})

describe("décision de génération IA", () => {
  const draftTypes = [...landingDraftSectionTypes] as string[]

  test("chaque lame du contrat est dans UNE situation : générable ou exclue avec raison", () => {
    for (const type of contract) {
      const inDraft = draftTypes.includes(type)
      const reason = (nonGenerableSections as Record<string, string>)[type]
      assert.ok(inDraft !== (reason !== undefined), type)
      if (reason !== undefined) assert.ok(reason.trim().length > 0, `${type} : raison`)
    }
  })

  test("le statut de chaque lame de la bibliothèque est explicite", () => {
    for (const entry of librarySections) {
      const generation = getSectionGeneration(entry.type)
      assert.ok(generation.status === "generable" || (generation.status === "library-only" && generation.reason.trim() !== ""), entry.slug)
    }
  })

  test("les lames générables sont exactement celles du Draft", () => {
    const generable = librarySections.filter((entry) => getSectionGeneration(entry.type).status === "generable").map((entry) => entry.type)
    assert.deepEqual([...generable].sort(), [...draftTypes].sort())
  })

  test("le contexte donné à Claude ne propose que les lames générables", () => {
    const proposed = context.sections.map((section) => section.type)
    assert.deepEqual([...proposed].sort(), [...draftTypes].sort())
  })

  test("règle produit : huit lames générables, ProductHero et ProductGrid en bibliothèque uniquement", () => {
    assert.deepEqual(draftTypes, ["editorial-hero", "immersive-hero", "value-props", "pillars", "content-carousel", "audience-switcher", "narrative-split", "final-cta"])
    for (const type of draftTypes) assert.deepEqual(getSectionGeneration(type as never), { status: "generable" }, type)
    for (const type of ["product-hero", "product-grid"] as const) {
      const generation = getSectionGeneration(type)
      assert.equal(generation.status, "library-only", type)
      assert.match(generation.status === "library-only" ? generation.reason : "", /source produit contrôlée/, type)
    }
    assert.deepEqual(Object.keys(nonGenerableSections).sort(), ["product-grid", "product-hero"])
  })
})

describe("/library affiche le statut IA", () => {
  const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const status = code("components/library/generation-status.tsx")

  test("deux états lisibles, et la raison d'une lame non générable", () => {
    assert.match(status, /Générable par IA/)
    assert.match(status, /Bibliothèque uniquement/)
    assert.match(status, /generation\.status === "library-only"/)
    assert.match(status, /generation\.reason/)
  })

  test("carte et page de détail utilisent le même composant, la raison seulement sur le détail", () => {
    assert.match(code("app/(dashboard)/library/page.tsx"), /<GenerationStatus type=\{section\.type\} \/>/)
    assert.match(code("app/(dashboard)/library/[slug]/page.tsx"), /<GenerationStatus type=\{lame\.type\} showReason \/>/)
  })

  test("le statut reste côté serveur : aucun composant client n'importe la décision, ni le registre, ni le moteur", () => {
    assert.ok(!/^["']use client["']/.test(read("components/library/generation-status.tsx").trimStart()))
    const sources = (dir: string): string[] =>
      readdirSync(join(root, dir)).flatMap((name) => {
        const path = `${dir}/${name}`
        return statSync(join(root, path)).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
      })
    for (const path of [...sources("components"), ...sources("app")]) {
      if (!/^["']use client["']/.test(read(path).trimStart())) continue
      assert.ok(!/section-generation|library\/registry|library\/generation-status|landing\/anthropic|@anthropic-ai\/sdk/.test(code(path)), path)
    }
    assert.ok(!/anthropic/i.test(code("lib/landing/section-generation.ts")))
  })
})
