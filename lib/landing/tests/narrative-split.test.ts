/**
 * Lame NarrativeSplit : une idée, une image. Contrat final, Draft, côté de
 * l'image calculé par le résolveur (rang parmi les NarrativeSplit), contexte
 * sans image, catalogue, bibliothèque et composant.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { librarySections } from "../../../components/library/registry"
import { resolveLandingDraft } from "../draft-resolver"
import { buildLandingGenerationContext, explainLandingSectionSelection } from "../generation-context"
import { landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { validateGeneratedLanding } from "../generation-validation"
import { landingImages } from "../image-catalog"
import { safeParseLandingPage } from "../schemas"
import { getSectionCatalogEntry } from "../section-catalog"
import { getSectionGeneration } from "../section-generation"
import { context, draftOf, draftSection, page, picture, props, request, section } from "./fixtures"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

const hero = () => section("hero", "editorial-hero", props["editorial-hero"]())
const narrative = (id = "narrative-split", extra: object = {}) => section(id, "narrative-split", { ...props["narrative-split"](), ...extra })
const valid = (sections: unknown[]) => safeParseLandingPage(page(sections)).success

describe("NarrativeSplit : contrat final", () => {
  test("config valide ; surtitre facultatif ; visual et description requis", () => {
    assert.ok(valid([hero(), narrative()]))
    assert.ok(valid([hero(), section("n", "narrative-split", without(props["narrative-split"](), "eyebrow"))]))
    assert.equal(valid([hero(), section("n", "narrative-split", without(props["narrative-split"](), "visual"))]), false)
    assert.equal(valid([hero(), section("n", "narrative-split", without(props["narrative-split"](), "description"))]), false)
    assert.equal(valid([hero(), section("n", "narrative-split", without(props["narrative-split"](), "title"))]), false)
  })

  test("visualSide : « left » et « right » valides, toute autre valeur refusée, absent toléré", () => {
    assert.ok(valid([hero(), narrative("n", { visualSide: "left" })]))
    assert.ok(valid([hero(), narrative("n", { visualSide: "right" })]))
    for (const bad of ["center", "gauche", "", null, 1]) assert.equal(valid([hero(), narrative("n", { visualSide: bad })]), false, String(bad))
  })

  test("objet strict : aucun CTA, href, className, style, couleur, ratio ni position CSS", () => {
    for (const extra of [{ primaryAction: { label: "Voir", href: "https://www.studi.com/fr/formations" } }, { href: "#x" }, { cta: { label: "x" } }, { className: "x" }, { style: {} }, { color: "red" }, { aspect: "1/1" }, { position: "center" }]) {
      assert.equal(valid([hero(), narrative("n", extra)]), false, JSON.stringify(extra))
    }
  })

  test("l'image est contrôlée par la validation finale : hors catalogue refusée", () => {
    const bad = page([hero(), narrative("n", { visual: { src: "/images/inventee.jpg", alt: "x" } })])
    assert.equal(validateGeneratedLanding(bad, context).status, "invalid")
    assert.equal(validateGeneratedLanding(page([hero(), narrative()]), context).status, "valid")
  })

  test("aucune action : un href dans la lame n'existe pas, et la lame peut suivre une clôture seulement en dernier rang (règle de clôture inchangée)", () => {
    assert.equal(valid([hero(), section("cloture", "final-cta", props["final-cta"]()), narrative()]), false)
    assert.ok(valid([hero(), narrative(), section("cloture", "final-cta", props["final-cta"]())]))
  })
})

describe("NarrativeSplit : Draft", () => {
  const draft = (extra: object = {}) => draftOf(draftSection["editorial-hero"](), { ...draftSection["narrative-split"](), ...extra })
  const ok = (value: unknown) => safeParseLandingGenerationDraft(value).success

  test("un Draft valide : section, eyebrow, title, description, image (id du catalogue)", () => {
    assert.ok(ok(draft()))
    assert.ok((landingDraftSectionTypes as readonly string[]).includes("narrative-split"))
  })

  test("eyebrow, title, description et image sont requis", () => {
    for (const key of ["eyebrow", "title", "description", "image"]) {
      assert.equal(ok(draftOf(draftSection["editorial-hero"](), without(draftSection["narrative-split"](), key))), false, key)
    }
  })

  test("l'image est un id du catalogue : un chemin, une URL ou un id inconnu est refusé", () => {
    for (const bad of ["/images/hero-bilan.jpg", "https://exemple.com/x.jpg", "inconnue", ""]) assert.equal(ok(draft({ image: bad })), false, bad)
    for (const image of landingImages) assert.ok(ok(draft({ image: image.id })), image.id)
  })

  test("refusés : visualSide, src, alt, href, URL, CTA, style, layout, className, champs inconnus", () => {
    for (const extra of [{ visualSide: "left" }, { src: "/images/hero-bilan.jpg" }, { alt: "x" }, { href: "https://www.studi.com" }, { url: "https://www.studi.com" }, { cta: { label: "Voir", destination: "catalogue-formations" } }, { style: {} }, { layout: "split" }, { className: "x" }, { inconnu: 1 }]) {
      assert.equal(ok(draft(extra)), false, JSON.stringify(extra))
    }
  })
})

describe("NarrativeSplit : le résolveur calcule le côté de l'image par rang", () => {
  const resolve = (...sections: unknown[]) => {
    const parsed = safeParseLandingGenerationDraft(draftOf(...sections))
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved", JSON.stringify(result))
    return result.status === "resolved" ? result.config : (undefined as never)
  }
  const split = (image = "content-1") => ({ ...draftSection["narrative-split"](), image })
  const sides = (config: ReturnType<typeof resolve>) => config.sections.flatMap((entry) => (entry.type === "narrative-split" ? [`${entry.id}:${entry.props.visualSide}`] : []))

  test("1 → left ; 2 → left, right ; 3 → left, right, left ; 4 → right en dernier", () => {
    assert.deepEqual(sides(resolve(draftSection["editorial-hero"](), split())), ["narrative-split:left"])
    assert.deepEqual(sides(resolve(draftSection["editorial-hero"](), split(), split("content-2"))), ["narrative-split:left", "narrative-split-2:right"])
    assert.deepEqual(sides(resolve(draftSection["editorial-hero"](), split(), split("content-2"), split("content-3"))), ["narrative-split:left", "narrative-split-2:right", "narrative-split-3:left"])
    assert.deepEqual(sides(resolve(draftSection["editorial-hero"](), split(), split(), split(), split())).at(-1), "narrative-split-4:right")
  })

  test("le rang compte parmi les NarrativeSplit, pas la position dans la page", () => {
    const config = resolve(draftSection["editorial-hero"](), draftSection.pillars(), split(), draftSection["value-props"](), split("content-2"), draftSection["final-cta"]())
    assert.deepEqual(sides(config), ["narrative-split:left", "narrative-split-2:right"])
    assert.deepEqual(config.sections.map((entry) => entry.type), ["editorial-hero", "pillars", "narrative-split", "value-props", "narrative-split", "final-cta"])
  })

  test("le côté est absent du Draft et présent dans la configuration finale ; src et alt viennent du catalogue", () => {
    assert.ok(!("visualSide" in draftSection["narrative-split"]()))
    const config = resolve(draftSection["editorial-hero"](), split("content-3"))
    const entry = config.sections[1]!
    assert.ok(entry.type === "narrative-split")
    assert.equal(entry.props.visualSide, "left")
    const catalogued = landingImages.find((image) => image.id === "content-3")!
    assert.deepEqual(entry.props.visual, picture({ src: catalogued.src, alt: catalogued.alt }))
    assert.equal(entry.props.eyebrow, draftSection["narrative-split"]().eyebrow)
    assert.ok(!("primaryAction" in entry.props) && !JSON.stringify(entry.props).includes("href"))
  })

  test("pipeline : EditorialHero → NS → NS → Pillars → FinalCta : validé, clôture dernière, aucun CTA dans les NS", () => {
    const config = resolve(draftSection["editorial-hero"](), split(), split("content-2"), draftSection.pillars(), draftSection["final-cta"]())
    assert.deepEqual(config.sections.map((entry) => entry.type), ["editorial-hero", "narrative-split", "narrative-split", "pillars", "final-cta"])
    assert.deepEqual(sides(config), ["narrative-split:left", "narrative-split-2:right"])
    assert.equal(validateGeneratedLanding(config, context).status, "valid")
    for (const entry of config.sections) if (entry.type === "narrative-split") assert.ok(!JSON.stringify(entry).includes("http"))
  })

  test("une image absente du contexte est signalée, jamais inventée", () => {
    const parsed = safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), split()))
    assert.ok(parsed.success)
    const bare = { ...context, images: [] }
    assert.equal(resolveLandingDraft(request, parsed.data, bare).status, "unresolvable")
  })
})

describe("NarrativeSplit : contexte, catalogue, bibliothèque", () => {
  test("sans image disponible, la lame n'est pas proposée à Claude, avec sa raison", () => {
    const bare = buildLandingGenerationContext(request, { images: [], destinations: [] })
    assert.ok(!bare.sections.some((entry) => entry.type === "narrative-split"))
    assert.match(explainLandingSectionSelection({ images: [], destinations: [] })["narrative-split"]!, /aucune image/)
    assert.ok(context.sections.some((entry) => entry.type === "narrative-split"))
  })

  test("entrée du catalogue : catégorie content, placement any, guidance, sans mots interdits ni règle globale", () => {
    const entry = getSectionCatalogEntry("narrative-split")
    assert.equal(entry.name, "NarrativeSplit")
    assert.equal(entry.category, "content")
    assert.equal(entry.placement, "any")
    assert.equal(entry.description, "Une idée développée : image d'un côté, surtitre, titre et paragraphe de l'autre.")
    const text = JSON.stringify(entry)
    assert.match(text, /30 caractères/)
    assert.match(text, /60 à 70 caractères/)
    assert.match(text, /200 à 300 caractères/)
    assert.match(text, /1 à 3 narrative-split/)
    assert.match(text, /l'image change de côté/)
    assert.ok(!/alterne|alternance|rotation|aléatoire|hasard/i.test(text))
    assert.match(entry.avoidWhen.join(" "), /value-props/)
    assert.match(entry.avoidWhen.join(" "), /pillars/)
  })

  test("bibliothèque : 12 lames, 10 générables par IA, 2 en bibliothèque uniquement ; catégorie Contenu existante", () => {
    const statuses = librarySections.map((entry) => getSectionGeneration(entry.type).status)
    assert.equal(librarySections.length, 12)
    assert.equal(statuses.filter((status) => status === "generable").length, 10)
    assert.equal(statuses.filter((status) => status === "library-only").length, 2)
    const entry = librarySections.find((candidate) => candidate.slug === "narrative-split")!
    assert.equal(entry.category, "Contenu")
    assert.equal(entry.name, "NarrativeSplit")
    assert.equal(getSectionGeneration("narrative-split").status, "generable")
  })
})

describe("NarrativeSplit : composant, renderer, exemple", () => {
  const component = code("components/sections/narrative-split/narrative-split.tsx")

  test("section accessible, un seul PageContainer, h2, image du contrat, tokens attendus", () => {
    assert.match(component, /<section\s+aria-labelledby=\{titleId\}/)
    assert.equal((component.match(/<PageContainer>/g) ?? []).length, 1)
    assert.match(component, /<h2 id=\{titleId\} className="text-h1 text-balance">/)
    assert.match(component, /src=\{visual\.src\}\s+alt=\{visual\.alt\}/)
    assert.match(component, /aspect-4\/3 w-full overflow-hidden rounded-xl bg-muted sm:aspect-3\/2 lg:aspect-4\/3/)
    assert.match(component, /object-cover/)
    assert.match(component, /bg-background py-8 text-foreground md:py-12/)
    assert.match(component, /grid[^"]*items-center[^"]*gap-8[^"]*lg:grid-cols-2[^"]*lg:gap-12/)
    assert.match(component, /text-caption tracking-wider text-muted-foreground uppercase/)
    assert.match(component, /max-w-xl text-body text-pretty text-muted-foreground/)
    assert.ok(!/text-display|<Button|<Link|href|<Badge|style=|#[0-9a-fA-F]{3,8}\b/.test(component))
  })

  test("pile large : image et texte partagent un même conteneur plafonné et centré, plafond levé dès lg", () => {
    const grid = component.match(/<div className="([^"]*grid[^"]*)">/)?.[1] ?? ""
    assert.match(grid, /\bmx-auto\b/)
    assert.match(grid, /\bmax-w-3xl\b/)
    assert.match(grid, /\blg:max-w-none\b/)
    // Le plafond n'est pas sur l'image seule : image et texte resteraient désalignés en pile large.
    assert.ok(!/max-w-[a-z0-9]+[^"]*overflow-hidden|overflow-hidden[^"]*max-w-/.test(component))
  })

  test("ordre DOM = ordre visuel : deux branches JSX, aucun `order` CSS ni inversion flex", () => {
    assert.match(component, /visualSide === "right" \? \(\s*<>\s*\{text\}\s*\{image\}\s*<\/>\s*\) : \(\s*<>\s*\{image\}\s*\{text\}\s*<\/>\s*\)/)
    assert.match(component, /visualSide = "left"/)
    assert.ok(!/\border-(first|last|\d|none)|\bmax-lg:order|\blg:order|flex-row-reverse|flex-col-reverse|direction-rtl|grid-flow-dense/.test(component))
  })

  test("le renderer transmet les props sans helper d'action ni cast ; l'exemple montre les deux côtés", () => {
    const renderer = code("components/landing/section-renderer.tsx")
    assert.match(renderer, /case "narrative-split":\s*return <NarrativeSplit \{\.\.\.section\.props\} \/>/)
    assert.ok(!/\bas any\b|\bas unknown\b/.test(renderer))
    const example = code("app/examples/narrative-split/page.tsx")
    assert.match(example, /visualSide="left"/)
    assert.match(example, /visualSide="right"/)
    assert.match(example, /import \{ NarrativeSplit \} from "@\/components\/sections\/narrative-split"/)
  })
})
