/**
 * Lame FinalCta (clôture) : contrat final, Draft, résolveur, placement strict
 * (au plus une, dernière section), liens contrôlés, catalogue, bibliothèque et
 * pipeline sans appel IA.
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
import { compositionRules, getSectionCatalogEntry, sectionCategories } from "../section-catalog"
import { getSectionGeneration } from "../section-generation"
import { catalogueUrl, context, draftOf, draftSection, page, props, request, section } from "./fixtures"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Copie d'un objet sans une clé. */
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

const hero = () => section("hero", "editorial-hero", props["editorial-hero"]())
const pillars = () => section("parcours", "pillars", props.pillars())
const finalCta = (id = "cloture") => section(id, "final-cta", props["final-cta"]())
const messages = (sections: unknown[]) => {
  const result = safeParseLandingPage(page(sections))
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("FinalCta : contrat final", () => {
  test("une configuration valide : titre, description facultative, action", () => {
    assert.ok(safeParseLandingPage(page([hero(), finalCta()])).success)
    assert.ok(safeParseLandingPage(page([hero(), section("cloture", "final-cta", without(props["final-cta"](), "description"))])).success)
  })

  test("l'action est requise, le titre aussi, et la clôture refuse tout champ inconnu (dont eyebrow)", () => {
    assert.equal(safeParseLandingPage(page([hero(), section("cloture", "final-cta", without(props["final-cta"](), "primaryAction"))])).success, false)
    assert.equal(safeParseLandingPage(page([hero(), section("cloture", "final-cta", without(props["final-cta"](), "title"))])).success, false)
    for (const extra of [{ eyebrow: "Et maintenant" }, { className: "x" }, { visual: { src: "/images/hero-bilan.jpg", alt: "" } }]) {
      assert.equal(safeParseLandingPage(page([hero(), section("cloture", "final-cta", { ...props["final-cta"](), ...extra })])).success, false, JSON.stringify(extra))
    }
  })

  test("l'action réutilise LandingActionSchema : libellé et lien requis, icône facultative", () => {
    const action = props["final-cta"]().primaryAction
    assert.ok(safeParseLandingPage(page([hero(), section("cloture", "final-cta", { ...props["final-cta"](), primaryAction: { ...action, icon: null } })])).success)
    assert.equal(safeParseLandingPage(page([hero(), section("cloture", "final-cta", { ...props["final-cta"](), primaryAction: { label: "Voir" } })])).success, false)
  })

  test("les liens de la clôture sont validés comme ceux des heroes (ancres vers une section existante)", () => {
    const withHref = (href: string) => section("cloture", "final-cta", { ...props["final-cta"](), primaryAction: { label: "Voir", href } })
    assert.ok(safeParseLandingPage(page([hero(), pillars(), withHref("#parcours")])).success)
    assert.ok(messages([hero(), withHref("#absente")]).some((message) => message.includes("#absente")))
  })
})

describe("FinalCta : placement strict (au plus une, dernière)", () => {
  test("valides : hero → pillars → clôture ; hero → clôture ; page sans clôture", () => {
    assert.deepEqual(messages([hero(), pillars(), finalCta()]), [])
    assert.deepEqual(messages([hero(), finalCta()]), [])
    assert.deepEqual(messages([hero(), pillars()]), [])
  })

  test("invalide : clôture suivie d'une autre section", () => {
    const issues = messages([hero(), finalCta(), pillars()])
    assert.ok(issues.some((message) => /dernière section/.test(message)), issues.join(" | "))
  })

  test("invalide : clôture avant le hero (aussi refusée comme hero hors tête)", () => {
    const issues = messages([finalCta(), hero()])
    assert.ok(issues.some((message) => /final-cta.*dernière section/.test(message)))
    assert.ok(issues.some((message) => /hero/.test(message)))
  })

  test("invalide : deux clôtures", () => {
    const issues = messages([hero(), finalCta("cloture"), finalCta("cloture-2")])
    assert.ok(issues.some((message) => /une seule clôture/.test(message)), issues.join(" | "))
    assert.ok(issues.some((message) => /dernière section/.test(message)))
  })

  test("les règles du hero restent intactes", () => {
    assert.ok(messages([pillars(), hero()]).some((message) => /première section/.test(message)))
    assert.ok(messages([hero(), section("hero-2", "immersive-hero", props["immersive-hero"]())]).some((message) => /qu'un seul hero/.test(message)))
  })

  test("aucun `placement: \"last\"` n'est introduit : la garantie est dans le schéma", () => {
    assert.ok(!/placement:\s*"last"|"first" \| "any" \| "last"/.test(code("lib/landing/section-catalog.ts")))
    assert.equal(getSectionCatalogEntry("final-cta").placement, "any")
  })
})

describe("FinalCta : Draft et résolveur", () => {
  const draft = (extra: object = {}) => draftOf(draftSection["editorial-hero"](), { ...draftSection["final-cta"](), ...extra })

  test("un Draft valide : section, title, description, cta {label, destination}", () => {
    assert.ok(safeParseLandingGenerationDraft(draft()).success)
    assert.ok((landingDraftSectionTypes as readonly string[]).includes("final-cta"))
  })

  test("le Draft refuse une URL directe (destination hors identifiants, href, url)", () => {
    const cta = draftSection["final-cta"]().cta
    assert.equal(safeParseLandingGenerationDraft(draft({ cta: { ...cta, destination: "https://www.studi.com/fr/formations" } })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ cta: { ...cta, href: "https://www.studi.com/fr/formations" } })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({ cta: { label: cta.label } })).success, false)
  })

  test("le Draft refuse les propriétés inconnues (eyebrow, style, icône, image) et exige la description", () => {
    for (const extra of [{ eyebrow: "x" }, { className: "x" }, { icon: "arrow-right" }, { image: "hero-bilan" }, { variant: "accent" }]) {
      assert.equal(safeParseLandingGenerationDraft(draft(extra)).success, false, JSON.stringify(extra))
    }
    assert.equal(safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), without(draftSection["final-cta"](), "description"))).success, false)
  })

  test("le résolveur transforme la destination en URL contrôlée et crée l'id technique", () => {
    const parsed = safeParseLandingGenerationDraft(draft())
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    const closing = result.config.sections.at(-1)!
    assert.equal(closing.type, "final-cta")
    assert.equal(closing.id, "final-cta")
    assert.deepEqual(closing.props, { title: draftSection["final-cta"]().title, description: draftSection["final-cta"]().description, primaryAction: { label: draftSection["final-cta"]().cta.label, href: catalogueUrl } })
  })

  test("une destination absente du contexte est signalée, jamais inventée", () => {
    const parsed = safeParseLandingGenerationDraft(draft())
    assert.ok(parsed.success)
    const bare = { ...context, destinations: [] }
    const result = resolveLandingDraft(request, parsed.data, bare)
    assert.equal(result.status, "unresolvable")
  })
})

describe("FinalCta : pipeline sans IA (Draft → résolveur → validation finale)", () => {
  const draft = draftOf(draftSection["editorial-hero"](), draftSection.pillars(), { ...draftSection["final-cta"](), cta: { label: "Explorer les métiers", destination: "metiers" } })

  test("hero → pillars → clôture : dernière section, destination résolue, contrat final valide", () => {
    const parsed = safeParseLandingGenerationDraft(draft)
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    assert.deepEqual(result.config.sections.map((entry) => entry.type), ["editorial-hero", "pillars", "final-cta"])
    const validation = validateGeneratedLanding(result.config, context)
    assert.equal(validation.status, "valid", JSON.stringify(validation))
    const closing = result.config.sections.at(-1)!
    assert.ok(closing.type === "final-cta" && closing.props.primaryAction.href === context.destinations.find((destination) => destination.id === "metiers")!.url)
  })

  test("la validation finale refuse un lien hors destinations contrôlées dans la clôture", () => {
    const bad = { ...page([hero(), section("cloture", "final-cta", { ...props["final-cta"](), primaryAction: { label: "Voir", href: "https://exemple.com/x" } })]) }
    const validation = validateGeneratedLanding(bad, context)
    assert.equal(validation.status, "invalid")
  })

  test("une clôture mal placée est refusée par la validation finale, comme par le contrat", () => {
    const validation = validateGeneratedLanding(page([hero(), finalCta(), pillars()]), context)
    assert.equal(validation.status, "invalid")
  })
})

describe("FinalCta : catalogue, règle de composition, bibliothèque", () => {
  test("entrée du catalogue : catégorie « conversion », guidance éditoriale, aucune limite stricte", () => {
    const entry = getSectionCatalogEntry("final-cta")
    assert.equal(entry.name, "FinalCta")
    assert.equal(entry.category, "conversion")
    assert.ok((sectionCategories as readonly string[]).includes("conversion"))
    assert.match(entry.description, /clôture/)
    assert.match(entry.bestFor.join(" "), /poursuite/)
    assert.match(entry.avoidWhen.join(" "), /aucune poursuite|conclut déjà/)
    const guidance = (entry.guidance ?? []).join(" | ")
    assert.match(guidance, /70 caractères/)
    assert.match(guidance, /160 caractères/)
    assert.match(guidance, /2 à 4 mots/)
    assert.match(guidance, /destination du hero peut être reprise/)
  })

  test("règle de composition : une seule clôture, dernière ; jamais « toujours » ; pas de CTA imposé différent du hero", () => {
    const rule = compositionRules.find((entry) => entry.id === "closing-last")
    assert.ok(rule)
    assert.match(rule.rule, /dernière section/)
    assert.match(rule.rule, /qu'une fois/)
    assert.ok(!/toujours|obligatoire|différent|diversité/i.test(rule.rule))
    const entry = getSectionCatalogEntry("final-cta")
    assert.ok(!/toujours|obligatoire|différent du hero/i.test(JSON.stringify(entry)))
  })

  test("bibliothèque : 13 lames, 11 générables par IA, 2 en bibliothèque uniquement", () => {
    const statuses = librarySections.map((entry) => getSectionGeneration(entry.type).status)
    assert.equal(librarySections.length, 13)
    assert.equal(statuses.filter((status) => status === "generable").length, 11)
    assert.equal(statuses.filter((status) => status === "library-only").length, 2)
    const entry = librarySections.find((candidate) => candidate.slug === "final-cta")!
    assert.equal(entry.category, "Conversion")
    assert.equal(entry.name, "FinalCta")
    assert.equal(entry.description, "Bandeau de clôture : titre, phrase courte et un seul bouton, sur fond de marque.")
    assert.equal(getSectionGeneration("final-cta").status, "generable")
  })
})

describe("FinalCta : composant, renderer, exemple", () => {
  const component = code("components/sections/final-cta/final-cta.tsx")

  test("design figé : tokens et primitives existants, compact, centré, sans image ni eyebrow", () => {
    assert.match(component, /bg-brand-green/)
    assert.match(component, /text-neutral-0/)
    assert.match(component, /py-12/)
    assert.equal((component.match(/<PageContainer>/g) ?? []).length, 1)
    assert.match(component, /<h2 id=\{titleId\} className="max-w-3xl text-h1 text-balance">/)
    assert.match(component, /max-w-xl text-body text-pretty text-neutral-300/)
    assert.match(component, /variant="inverse"\s+size="xl"/)
    assert.match(component, /w-full sm:w-auto/)
    assert.match(component, /items-center[^"]*text-center/)
    assert.match(component, /aria-labelledby=\{titleId\}/)
    assert.ok(!/text-display|<Image|next\/image|gradient|<Badge|eyebrow|style=|#[0-9a-fA-F]{3,8}\b/.test(component))
    assert.equal((component.match(/<Button\b/g) ?? []).length, 1)
  })

  test("le renderer traite la clôture avec le helper d'action existant, sans cast", () => {
    const renderer = code("components/landing/section-renderer.tsx")
    assert.match(renderer, /case "final-cta": \{\s*const \{ primaryAction, \.\.\.props \} = section\.props\s*return <FinalCta \{\.\.\.props\} primaryAction=\{toHeroAction\(primaryAction\)\} \/>/)
    assert.ok(!/\bas any\b|\bas unknown\b/.test(renderer))
    assert.match(renderer, /assertNever\(section\)/)
  })

  test("la page d'exemple rend le vrai composant", () => {
    const example = code("app/examples/final-cta/page.tsx")
    assert.match(example, /import \{ FinalCta \} from "@\/components\/sections\/final-cta"/)
    assert.match(example, /<FinalCta/)
  })

  test("le design system ne change pas : ni Button, ni Badge, ni token, ni parcours-decouverte", () => {
    const destinations = code("lib/landing/destinations.ts")
    assert.match(destinations, /"parcours-decouverte": \{[^}]*lien secondaire, jamais second bouton/)
    assert.ok(!/accent/.test(component))
  })
})
