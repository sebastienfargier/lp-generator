/**
 * Lame DestinationCards : contrat final (2 à 3 suites, destinations uniques),
 * Draft, résolveur, liens contrôlés (sectionActions), catalogue, bibliothèque,
 * composant (structure) et pipeline sans appel IA.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { librarySections } from "../../../components/library/registry"
import { resolveLandingDraft } from "../draft-resolver"
import { landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { validateGeneratedLanding } from "../generation-validation"
import { safeParseLandingPage } from "../schemas"
import { compositionRules, getSectionCatalogEntry } from "../section-catalog"
import { getSectionGeneration } from "../section-generation"
import { catalogueUrl, context, draftOf, draftSection, page, props, request, section } from "./fixtures"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Copie d'un objet sans une clé. */
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

const metiersUrl = context.destinations.find((destination) => destination.id === "metiers")!.url
const diplomesUrl = context.destinations.find((destination) => destination.id === "diplomes")!.url

const hero = () => section("hero", "editorial-hero", props["editorial-hero"]())
const closing = () => section("cloture", "final-cta", props["final-cta"]())
type Items = ReturnType<typeof props["destination-cards"]>["items"]
const cards = (items: Items | object[] = props["destination-cards"]().items, extra: object = {}) =>
  section("suites", "destination-cards", { ...props["destination-cards"](), items, ...extra })
const items = (count: number) => props["destination-cards"]().items.slice(0, count)
const messages = (sections: unknown[]) => {
  const result = safeParseLandingPage(page(sections))
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("DestinationCards : contrat final", () => {
  test("deux ou trois cartes sont valides ; la description de section est facultative", () => {
    assert.ok(safeParseLandingPage(page([hero(), cards(items(3))])).success)
    assert.ok(safeParseLandingPage(page([hero(), cards(items(2))])).success)
    assert.ok(safeParseLandingPage(page([hero(), section("suites", "destination-cards", without(props["destination-cards"](), "description"))])).success)
  })

  test("une ou quatre cartes sont refusées (borne structurelle)", () => {
    assert.equal(safeParseLandingPage(page([hero(), cards(items(1))])).success, false)
    assert.equal(safeParseLandingPage(page([hero(), cards(items(0))])).success, false)
    const four = [...items(3), { title: "Se financer", description: "Comprendre les aides possibles.", href: "https://www.studi.com/fr/financement" }]
    assert.equal(safeParseLandingPage(page([hero(), cards(four)])).success, false)
  })

  test("titre de carte, description de carte et href sont requis", () => {
    for (const key of ["title", "description", "href"]) {
      const broken = items(3).map((item, index) => (index === 0 ? without(item, key) : item))
      assert.equal(safeParseLandingPage(page([hero(), cards(broken)])).success, false, key)
    }
  })

  test("deux cartes vers la même destination sont refusées", () => {
    const duplicated = [items(3)[0]!, { ...items(3)[1]!, href: items(3)[0]!.href }]
    assert.ok(messages([hero(), cards(duplicated)]).some((message) => message.includes("même destination")))
  })

  test("aucun champ inconnu : eyebrow, image, action, className, ni sur la section ni sur une carte", () => {
    for (const extra of [{ eyebrow: "Suites" }, { image: { src: "/images/hero-bilan.jpg", alt: "" } }, { primaryAction: { label: "Voir", href: catalogueUrl } }, { className: "x" }]) {
      assert.equal(safeParseLandingPage(page([hero(), cards(items(3), extra)])).success, false, JSON.stringify(extra))
    }
    for (const extra of [{ image: "content-1" }, { action: { label: "Voir" } }, { icon: "arrow-right" }]) {
      const withExtra = items(3).map((item, index) => (index === 0 ? { ...item, ...extra } : item))
      assert.equal(safeParseLandingPage(page([hero(), cards(withExtra)])).success, false, JSON.stringify(extra))
    }
  })

  test("aucune règle de page nouvelle : placement libre, répétition et ordre non contraints par le contrat", () => {
    assert.ok(safeParseLandingPage(page([hero(), cards(items(3)), section("suites-2", "destination-cards", props["destination-cards"]())])).success)
    assert.ok(safeParseLandingPage(page([hero(), cards(items(2)), closing()])).success)
    assert.ok(safeParseLandingPage(page([hero(), closing()])).success)
  })
})

describe("DestinationCards : liens contrôlés (sectionActions)", () => {
  test("chaque carte est un lien : une ancre vers une section absente est refusée, avec le chemin de la carte", () => {
    const broken = items(3).map((item, index) => (index === 1 ? { ...item, href: "#absente" } : item))
    const result = safeParseLandingPage(page([hero(), cards(broken)]))
    assert.equal(result.success, false)
    if (result.success) return
    const issue = result.error.issues.find((entry) => entry.message.includes("#absente"))
    assert.ok(issue)
    assert.deepEqual(issue.path.slice(-3), ["items", "1", "href"])
  })

  test("une ancre vers une section existante est acceptée", () => {
    const anchored = items(3).map((item, index) => (index === 0 ? { ...item, href: "#hero" } : item))
    assert.ok(safeParseLandingPage(page([hero(), cards(anchored)])).success)
  })

  test("la validation finale refuse une carte hors destinations contrôlées", () => {
    const bad = items(3).map((item, index) => (index === 2 ? { ...item, href: "https://exemple.com/x" } : item))
    assert.equal(validateGeneratedLanding(page([hero(), cards(bad)]), context).status, "invalid")
    assert.equal(validateGeneratedLanding(page([hero(), cards(items(3))]), context).status, "valid")
  })
})

describe("DestinationCards : Draft et résolveur", () => {
  const draft = (extra: object = {}) => draftOf(draftSection["editorial-hero"](), { ...draftSection["destination-cards"](), ...extra })
  const draftItems = () => draftSection["destination-cards"]().items

  test("un Draft valide : 2 ou 3 cartes {title, description, destination}", () => {
    assert.ok(safeParseLandingGenerationDraft(draft()).success)
    assert.ok(safeParseLandingGenerationDraft(draft({ items: draftItems().slice(0, 2) })).success)
    assert.ok((landingDraftSectionTypes as readonly string[]).includes("destination-cards"))
  })

  test("le Draft refuse une ou quatre cartes", () => {
    assert.equal(safeParseLandingGenerationDraft(draft({ items: draftItems().slice(0, 1) })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ items: [] })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ items: [...draftItems(), { title: "Se financer", description: "Les aides.", destination: "financement" }] })).success, false)
  })

  test("titre, description de section, titre et description de carte, destination : tous requis", () => {
    assert.equal(safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), without(draftSection["destination-cards"](), "title"))).success, false)
    assert.equal(safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), without(draftSection["destination-cards"](), "description"))).success, false)
    for (const key of ["title", "description", "destination"]) {
      const broken = draftItems().map((item, index) => (index === 0 ? without(item, key) : item))
      assert.equal(safeParseLandingGenerationDraft(draft({ items: broken })).success, false, key)
    }
  })

  test("destinations contrôlées seulement : id inconnu, URL, href, url refusés", () => {
    const withFirst = (patch: object) => draftItems().map((item, index) => (index === 0 ? { ...item, ...patch } : item))
    assert.equal(safeParseLandingGenerationDraft(draft({ items: withFirst({ destination: "inconnue" }) })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ items: withFirst({ destination: "https://www.studi.com/fr/metiers" }) })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ items: withFirst({ href: "https://www.studi.com/fr/metiers" }) })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ items: withFirst({ url: "https://www.studi.com/fr/metiers" }) })).success, false)
  })

  test("deux cartes vers la même destination sont refusées dès le Draft", () => {
    const duplicated = [draftItems()[0]!, { ...draftItems()[1]!, destination: draftItems()[0]!.destination }]
    const result = safeParseLandingGenerationDraft(draft({ items: duplicated }))
    assert.equal(result.success, false)
    if (result.success) return
    assert.ok(result.error.issues.some((issue) => issue.message.includes("Destination en double")))
  })

  test("le Draft refuse libellé d'action, action, image, icône, eyebrow et styles", () => {
    for (const extra of [{ eyebrow: "x" }, { image: "content-1" }, { cta: { label: "Voir", destination: "metiers" } }, { className: "x" }]) {
      assert.equal(safeParseLandingGenerationDraft(draft(extra)).success, false, JSON.stringify(extra))
    }
    for (const extra of [{ label: "Voir" }, { cta: { label: "Voir" } }, { image: "content-1" }, { icon: "arrow-right" }]) {
      const withExtra = draftItems().map((item, index) => (index === 0 ? { ...item, ...extra } : item))
      assert.equal(safeParseLandingGenerationDraft(draft({ items: withExtra })).success, false, JSON.stringify(extra))
    }
  })

  test("le résolveur transforme chaque destination en URL contrôlée, pour 3 puis 2 cartes", () => {
    for (const count of [3, 2]) {
      const parsed = safeParseLandingGenerationDraft(draft({ items: draftItems().slice(0, count) }))
      assert.ok(parsed.success)
      const result = resolveLandingDraft(request, parsed.data, context)
      assert.equal(result.status, "resolved")
      if (result.status !== "resolved") return
      const resolved = result.config.sections.at(-1)!
      assert.equal(resolved.type, "destination-cards")
      assert.equal(resolved.id, "destination-cards")
      assert.deepEqual(resolved.props, {
        title: draftSection["destination-cards"]().title,
        description: draftSection["destination-cards"]().description,
        items: items(count),
      })
    }
  })

  test("aucune clé `destination` ne subsiste dans le contrat final", () => {
    const parsed = safeParseLandingGenerationDraft(draft())
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    assert.ok(!JSON.stringify(result.config).includes('"destination"'))
  })

  test("une destination absente du contexte est signalée avec le chemin de la carte, jamais inventée", () => {
    const parsed = safeParseLandingGenerationDraft(draft())
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, { ...context, destinations: [] })
    assert.equal(result.status, "unresolvable")
    if (result.status !== "unresolvable") return
    assert.ok(JSON.stringify(result).includes("items.0.destination"))
  })
})

describe("DestinationCards : pipeline sans IA (Draft → résolveur → validation finale)", () => {
  const draft = draftOf(draftSection["editorial-hero"](), draftSection["narrative-split"](), draftSection["destination-cards"](), draftSection["final-cta"]())

  test("hero → narrative-split → destination-cards → clôture : destinations résolues, contrat final valide", () => {
    const parsed = safeParseLandingGenerationDraft(draft)
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    assert.deepEqual(result.config.sections.map((entry) => entry.type), ["editorial-hero", "narrative-split", "destination-cards", "final-cta"])
    const validation = validateGeneratedLanding(result.config, context)
    assert.equal(validation.status, "valid", JSON.stringify(validation))
    const destinationCards = result.config.sections[2]!
    assert.ok(destinationCards.type === "destination-cards")
    assert.deepEqual(destinationCards.props.items.map((item) => item.href), [metiersUrl, diplomesUrl, catalogueUrl])
  })

  test("reprendre la destination du hero ou de la clôture est permis : pas d'unicité globale", () => {
    const parsed = safeParseLandingGenerationDraft(draft)
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    const hrefs = result.config.sections.flatMap((entry) => (entry.type === "final-cta" ? [entry.props.primaryAction.href] : entry.type === "destination-cards" ? entry.props.items.map((item) => item.href) : []))
    assert.ok(hrefs.filter((href) => href === catalogueUrl).length >= 2)
  })
})

describe("DestinationCards : catalogue, bibliothèque", () => {
  test("entrée du catalogue : catégorie « conversion », placement libre, guidance éditoriale", () => {
    const entry = getSectionCatalogEntry("destination-cards")
    assert.equal(entry.name, "DestinationCards")
    assert.equal(entry.category, "conversion")
    assert.equal(entry.placement, "any")
    assert.equal(entry.description, "Deux ou trois suites cliquables vers des destinations Studi : titre et courte description, sans image.")
    const guidance = (entry.guidance ?? []).join(" | ")
    assert.match(guidance, /2 à 3 cartes/)
    assert.match(guidance, /destination différente/)
    assert.match(guidance, /texte de lien/)
    assert.match(guidance, /une seule destination-cards par page/)
    assert.match(guidance, /reprendre une destination du hero ou de la clôture est permis/)
    assert.match(entry.avoidWhen.join(" "), /final-cta/)
  })

  test("aucune règle de composition nouvelle, et aucune consigne d'aléa dans l'entrée", () => {
    assert.ok(!compositionRules.some((rule) => /destination-cards|DestinationCards/i.test(rule.rule)))
    const text = JSON.stringify(getSectionCatalogEntry("destination-cards"))
    assert.ok(!/(?<![\p{L}])(alterne|alternance|rotation|aléatoire|hasard)(?![\p{L}])/iu.test(text))
    assert.ok(!/toujours|obligatoire/i.test(text))
  })

  test("bibliothèque : 11 lames, 9 générables par IA, 2 en bibliothèque uniquement", () => {
    const statuses = librarySections.map((entry) => getSectionGeneration(entry.type).status)
    assert.equal(librarySections.length, 11)
    assert.equal(statuses.filter((status) => status === "generable").length, 9)
    assert.equal(statuses.filter((status) => status === "library-only").length, 2)
    const entry = librarySections.find((candidate) => candidate.slug === "destination-cards")!
    assert.equal(entry.category, "Conversion")
    assert.equal(entry.name, "DestinationCards")
    assert.equal(entry.example, "/examples/destination-cards")
    assert.equal(getSectionGeneration("destination-cards").status, "generable")
  })
})

describe("DestinationCards : composant, renderer, exemple", () => {
  const component = code("components/sections/destination-cards/destination-cards.tsx")

  test("structure : une section nommée, un seul conteneur, un h2, une liste de cartes", () => {
    assert.match(component, /aria-labelledby=\{titleId\}/)
    assert.match(component, /bg-neutral-100 py-8 text-foreground md:py-12/)
    assert.equal((component.match(/<PageContainer>/g) ?? []).length, 1)
    assert.equal((component.match(/<h2\b/g) ?? []).length, 1)
    assert.match(component, /<h2 id=\{titleId\} className="max-w-2xl text-h1 text-balance">/)
    assert.match(component, /<ul role="list"/)
    assert.ok(!/eyebrow/.test(component))
  })

  test("grille : une colonne en mobile, deux dès sm, trois dès lg (deux si deux cartes), sans hauteur fixe", () => {
    assert.match(component, /grid gap-6 sm:grid-cols-2/)
    assert.match(component, /items\.length === 2 \? "lg:grid-cols-2" : "lg:grid-cols-3"/)
    assert.ok(!/\bh-\d|min-h-|max-h-|\bh-\[/.test(component.replace(/h-full/g, "")))
  })

  test("carte : titre de niveau 3 qui porte l'unique lien, étiré sur toute la carte", () => {
    assert.match(component, /<CardTitle role="heading" aria-level=\{3\}>/)
    assert.equal((component.match(/<Link\b/g) ?? []).length, 1)
    assert.match(component, /after:absolute after:inset-0/)
    assert.match(component, /<Card className="relative h-full/)
    assert.match(component, /has-\[a:focus-visible\]:ring-3/)
    assert.match(component, /motion-reduce:transition-none/)
  })

  test("flèche décorative fixe, sans image, bouton, badge ni second lien", () => {
    assert.match(component, /<ArrowRightIcon\s+aria-hidden/)
    assert.ok(!/<Image|next\/image|<Button|<Badge|<a\b|style=|#[0-9a-fA-F]{3,8}\b/.test(component))
  })

  test("le renderer branche la lame sans cast ; l'exemple rend le vrai composant", () => {
    const renderer = code("components/landing/section-renderer.tsx")
    assert.match(renderer, /case "destination-cards":\s*return <DestinationCards \{\.\.\.section\.props\} \/>/)
    assert.ok(!/\bas any\b|\bas unknown\b/.test(renderer))
    assert.match(renderer, /assertNever\(section\)/)
    const example = code("app/examples/destination-cards/page.tsx")
    assert.match(example, /import \{ DestinationCards \} from "@\/components\/sections\/destination-cards"/)
    assert.match(example, /<DestinationCards/)
  })

  test("destinations.ts n'est pas modifié : parcours-decouverte reste un lien secondaire", () => {
    assert.match(code("lib/landing/destinations.ts"), /"parcours-decouverte": \{[^}]*lien secondaire, jamais second bouton/)
  })
})
