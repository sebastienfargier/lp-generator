/**
 * Lame StepSequence : progression éditoriale ordonnée de 3 ou 4 étapes.
 * Contrat final, Draft, résolveur, transport, catalogue (dont le garde-fou
 * factuel et la frontière avec Pillars), bibliothèque, composant (structure)
 * et pipeline sans appel IA.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { librarySections } from "../../../components/library/registry"
import { toAnthropicJsonSchema } from "../anthropic-schema"
import { resolveLandingDraft } from "../draft-resolver"
import { buildLandingDraftJsonSchema, landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { validateGeneratedLanding } from "../generation-validation"
import { safeParseLandingPage } from "../schemas"
import { getSectionCatalogEntry } from "../section-catalog"
import { getSectionGeneration } from "../section-generation"
import { context, draftOf, draftSection, page, props, request, section } from "./fixtures"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Copie d'un objet sans une clé. */
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

const hero = () => section("hero", "editorial-hero", props["editorial-hero"]())
const baseItems = () => props["step-sequence"]().items
const extraItem = { title: "Décider", description: "Retenir la piste qui vous convient le mieux." }
const items = (count: number) => [...baseItems(), extraItem, { ...extraItem, title: "Avancer" }].slice(0, count)
const final = (extra: object = {}, itemList: object[] = items(3)) => section("sequence", "step-sequence", { ...props["step-sequence"](), items: itemList, ...extra })
const valid = (sectionValue: unknown) => safeParseLandingPage(page([hero(), sectionValue])).success

describe("StepSequence : contrat final", () => {
  test("trois ou quatre étapes valides ; description de section facultative", () => {
    assert.ok(valid(final({}, items(3))))
    assert.ok(valid(final({}, items(4))))
    assert.ok(valid(section("sequence", "step-sequence", without(props["step-sequence"](), "description"))))
  })

  test("deux ou cinq étapes refusées (borne structurelle)", () => {
    assert.equal(valid(final({}, items(2))), false)
    assert.equal(valid(final({}, items(1))), false)
    assert.equal(valid(final({}, [...items(4), extraItem])), false)
  })

  test("titre de section requis ; titre et description de chaque étape requis", () => {
    assert.equal(valid(section("sequence", "step-sequence", without(props["step-sequence"](), "title"))), false)
    for (const key of ["title", "description"]) {
      const broken = items(3).map((item, index) => (index === 0 ? without(item, key) : item))
      assert.equal(valid(final({}, broken)), false, key)
    }
  })

  test("aucun champ inconnu : eyebrow, number, icon, image, action, destination, orientation, style", () => {
    for (const extra of [{ eyebrow: "Parcours" }, { image: { src: "/images/hero-bilan.jpg", alt: "" } }, { primaryAction: { label: "Voir", href: "https://www.studi.com/fr/formations" } }, { orientation: "horizontal" }, { className: "x" }, { destination: "metiers" }]) {
      assert.equal(valid(final(extra)), false, JSON.stringify(extra))
    }
    for (const extra of [{ number: "01" }, { index: 1 }, { icon: "arrow-right" }, { image: "content-1" }, { action: { label: "Voir" } }, { cta: { label: "Voir" } }, { href: "https://www.studi.com/fr/metiers" }, { destination: "metiers" }, { badge: "Nouveau" }, { duration: "2 jours" }, { status: "done" }]) {
      const withExtra = items(3).map((item, index) => (index === 0 ? { ...item, ...extra } : item))
      assert.equal(valid(final({}, withExtra)), false, JSON.stringify(extra))
    }
  })

  test("aucune règle de page nouvelle : placement et répétition libres dans le contrat", () => {
    assert.ok(safeParseLandingPage(page([final()])).success)
    assert.ok(safeParseLandingPage(page([hero(), final(), section("sequence-2", "step-sequence", props["step-sequence"]())])).success)
  })

  test("aucune action : la lame n'expose aucun lien au contrôle des liens", () => {
    const withLink = items(3).map((item, index) => (index === 0 ? { ...item, href: "#absente" } : item))
    assert.equal(valid(final({}, withLink)), false)
    assert.ok(safeParseLandingPage(page([hero(), final(), section("fin", "final-cta", props["final-cta"]())])).success)
  })
})

describe("StepSequence : Draft", () => {
  const draft = (extra: object = {}, itemList: object[] = items(3)) => draftOf(draftSection["editorial-hero"](), { ...draftSection["step-sequence"](), items: itemList, ...extra })

  test("3 ou 4 étapes valides, 2 ou 5 refusées", () => {
    assert.ok(safeParseLandingGenerationDraft(draft({}, items(3))).success)
    assert.ok(safeParseLandingGenerationDraft(draft({}, items(4))).success)
    assert.equal(safeParseLandingGenerationDraft(draft({}, items(2))).success, false)
    assert.equal(safeParseLandingGenerationDraft(draft({}, [...items(4), extraItem])).success, false)
    assert.ok((landingDraftSectionTypes as readonly string[]).includes("step-sequence"))
  })

  test("titre, description de section, titre et description d'étape : tous requis", () => {
    for (const key of ["title", "description"]) {
      assert.equal(safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), without(draftSection["step-sequence"](), key))).success, false, key)
      const broken = items(3).map((item, index) => (index === 0 ? without(item, key) : item))
      assert.equal(safeParseLandingGenerationDraft(draft({}, broken)).success, false, `étape ${key}`)
    }
  })

  test("refusés : eyebrow, number, icône, image, CTA, action, destination, durée, style, orientation, champ inconnu", () => {
    for (const extra of [{ eyebrow: "x" }, { image: "content-1" }, { cta: { label: "Voir", destination: "metiers" } }, { destination: "metiers" }, { orientation: "horizontal" }, { className: "x" }, { inconnu: 1 }]) {
      assert.equal(safeParseLandingGenerationDraft(draft(extra)).success, false, JSON.stringify(extra))
    }
    for (const extra of [{ number: "01" }, { icon: "arrow-right" }, { image: "content-1" }, { action: { label: "Voir" } }, { cta: { label: "Voir" } }, { destination: "metiers" }, { href: "https://www.studi.com/fr/metiers" }, { duration: "2 jours" }, { style: "x" }, { inconnu: 1 }]) {
      const withExtra = items(3).map((item, index) => (index === 0 ? { ...item, ...extra } : item))
      assert.equal(safeParseLandingGenerationDraft(draft({}, withExtra)).success, false, JSON.stringify(extra))
    }
  })
})

describe("StepSequence : résolveur", () => {
  const resolved = (itemList: object[]) => {
    const parsed = safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), { ...draftSection["step-sequence"](), items: itemList }))
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    return result.status === "resolved" ? result.config : undefined
  }

  test("recopie titre, description et étapes dans l'ordre ; id technique ; aucun champ parasite", () => {
    for (const count of [3, 4]) {
      const config = resolved(items(count))!
      const step = config.sections[1]!
      assert.equal(step.type, "step-sequence")
      assert.equal(step.id, "step-sequence")
      assert.deepEqual(step.props, { title: draftSection["step-sequence"]().title, description: draftSection["step-sequence"]().description, items: items(count) })
      assert.ok(safeParseLandingPage(config).success)
    }
  })

  test("aucun numéro ni ressource résolue : le contrat final ne porte ni href, ni image, ni numéro", () => {
    const step = resolved(items(3))!.sections[1]!
    const json = JSON.stringify(step)
    assert.ok(!/href|src|"number"|"index"|destination|visual/.test(json))
  })
})

describe("StepSequence : transport Anthropic", () => {
  test("step-sequence est dans l'union du Draft, le littéral `section` reste inline, aucun $defs parasite", () => {
    const schema = buildLandingDraftJsonSchema(landingDraftSectionTypes)
    const text = JSON.stringify(schema)
    assert.match(text, /"section":\{"type":"string","const":"step-sequence"\}/)
    const transport = JSON.stringify(toAnthropicJsonSchema(schema))
    assert.match(transport, /"section":\{"type":"string","const":"step-sequence"\}/)
  })

  test("le transport retire minItems > 1 et maxItems de la lame ; Zod les garde", () => {
    const transport = toAnthropicJsonSchema(buildLandingDraftJsonSchema(["step-sequence"])) as unknown as { properties: { sections: { items: unknown } } }
    const branch = JSON.stringify(transport)
    assert.ok(!/"minItems":3|"maxItems":4/.test(branch))
    assert.equal(safeParseLandingGenerationDraft(draftOf({ ...draftSection["step-sequence"](), items: items(2) })).success, false)
  })

  test("pas de raffinement sur la branche : le littéral et l'union du transport restent intacts", () => {
    assert.ok(!/superRefine/.test(code("lib/landing/generation-draft.ts").split('section: z.literal("step-sequence")')[1]!.split("section: z.literal")[0]!))
  })
})

describe("StepSequence : catalogue, garde-fou factuel, frontière avec Pillars", () => {
  const entry = getSectionCatalogEntry("step-sequence")
  const guidance = (entry.guidance ?? []).join(" | ")

  test("entrée : générable, catégorie content, placement any, sans ressource", () => {
    assert.equal(entry.name, "StepSequence")
    assert.equal(entry.category, "content")
    assert.equal(entry.placement, "any")
    assert.equal(entry.description, "Une progression ordonnée de trois ou quatre étapes, chacune avec un titre et une phrase.")
    assert.equal(getSectionGeneration("step-sequence").status, "generable")
    assert.ok(context.sections.some((candidate) => candidate.type === "step-sequence"))
    const bare = JSON.stringify(entry)
    assert.ok(!/image|CTA|destination|icône/i.test(bare.replace(/pas de vraie progression/g, "")))
  })

  test("garde-fou factuel dans la guidance : progression éditoriale, aucun processus Studi sans request.facts", () => {
    assert.match(guidance, /progression éditoriale/)
    assert.match(guidance, /explorer, comparer, identifier ou préciser/)
    assert.match(guidance, /ne présente jamais comme processus Studi des étapes d'inscription, d'admission, de financement, de contact ou de suivi, ni délai, condition ou résultat, sauf s'ils figurent dans request\.facts/)
    assert.match(entry.avoidWhen.join(" "), /procédure opérationnelle Studi/)
  })

  test("guidance : 3 de préférence, nombre absent du titre, longueurs, une seule, milieu de page", () => {
    assert.match(guidance, /3 étapes de préférence/)
    assert.match(guidance, /ne pas écrire leur nombre dans le titre/)
    assert.match(guidance, /titre ~50-60 caractères/)
    assert.match(guidance, /titre 2 à 4 mots/)
    assert.match(guidance, /une seule par page, au milieu, pas juste après pillars ou value-props/)
    assert.match(entry.avoidWhen.join(" "), /préférer pillars ou value-props/)
  })

  test("Pillars ne revendique plus les étapes d'un parcours ; la progression ordonnée est StepSequence", () => {
    const pillars = getSectionCatalogEntry("pillars")
    assert.ok(!/étapes d'un parcours|étapes/i.test([...pillars.bestFor, ...(pillars.guidance ?? [])].join(" ")))
    assert.match((pillars.guidance ?? []).join(" "), /principes parallèles/)
    assert.match(entry.bestFor.join(" "), /séquentiel/)
  })

  test("aucun détecteur lexical ni validation de facts ajoutés pour StepSequence", () => {
    for (const path of ["lib/landing/schemas.ts", "lib/landing/generation-validation.ts", "lib/landing/draft-resolver.ts"]) {
      assert.ok(!/conseiller|admission|sous \d+ ?h|inscription/i.test(code(path)), path)
    }
  })
})

describe("StepSequence : bibliothèque", () => {
  test("12 lames, 10 générables par IA, 2 en bibliothèque uniquement ; catégorie Contenu", () => {
    const statuses = librarySections.map((candidate) => getSectionGeneration(candidate.type).status)
    assert.equal(librarySections.length, 12)
    assert.equal(statuses.filter((status) => status === "generable").length, 10)
    assert.equal(statuses.filter((status) => status === "library-only").length, 2)
    const library = librarySections.find((candidate) => candidate.slug === "step-sequence")!
    assert.equal(library.category, "Contenu")
    assert.equal(library.name, "StepSequence")
    assert.equal(library.example, "/examples/step-sequence")
    assert.equal(library.importPath, "@/components/sections/step-sequence")
  })
})

describe("StepSequence : composant, renderer, exemple", () => {
  const component = code("components/sections/step-sequence/step-sequence.tsx")

  test("structure : une section nommée, un conteneur, un h2, une liste ordonnée d'étapes", () => {
    assert.match(component, /aria-labelledby=\{titleId\}/)
    assert.match(component, /bg-background py-8 text-foreground md:py-12/)
    assert.equal((component.match(/<PageContainer>/g) ?? []).length, 1)
    assert.equal((component.match(/<h2\b/g) ?? []).length, 1)
    assert.match(component, /<ol\b[\s\S]*?role="list"/)
    assert.match(component, /items\.map\(\(item, index\)/)
    assert.ok(!/eyebrow/.test(component))
  })

  test("numéros calculés par l'application, décoratifs, jamais lus dans les props", () => {
    assert.match(component, /String\(index \+ 1\)\.padStart\(2, "0"\)/)
    assert.match(component, /<span\s+aria-hidden/)
    assert.ok(!/item\.(number|index)|number:|index:/.test(component))
  })

  test("trois ou quatre colonnes selon le nombre d'étapes, sans colonne vide", () => {
    assert.match(component, /items\.length === 4 \? "lg:grid-cols-4" : "lg:grid-cols-3"/)
  })

  test("aucune carte, aucun lien, aucun bouton, aucune image, aucun script", () => {
    assert.ok(!/Card|<Link|<a\b|<Button|<Badge|<Image|next\/image|<svg|<img|useState|useEffect|"use client"/.test(component))
    assert.ok(!/hover:|focus|transition|animate|motion/.test(component))
  })

  test("tokens existants seulement : pas de hex, de style inline, ni de text-display", () => {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(component), "hex")
    assert.ok(!/style=/.test(component), "style inline")
    assert.ok(!/text-display/.test(component))
    for (const token of ["text-h1", "text-h2", "text-body", "font-semibold", "bg-foreground", "text-background", "bg-neutral-300", "text-muted-foreground"]) {
      assert.ok(component.includes(token), token)
    }
  })

  test("connecteur : trait de 1 px décoratif, absent après la dernière étape, vertical puis horizontal", () => {
    assert.match(component, /before:w-px/)
    assert.match(component, /last:before:hidden/)
    assert.match(component, /lg:before:h-px/)
  })

  test("le renderer branche la lame sans cast ; l'exemple rend le vrai composant", () => {
    const renderer = code("components/landing/section-renderer.tsx")
    assert.match(renderer, /case "step-sequence":\s*return <StepSequence \{\.\.\.section\.props\} \/>/)
    assert.ok(!/\bas any\b|\bas unknown\b/.test(renderer))
    assert.match(renderer, /assertNever\(section\)/)
    const example = code("app/examples/step-sequence/page.tsx")
    assert.match(example, /import \{ StepSequence \} from "@\/components\/sections\/step-sequence"/)
    assert.match(example, /<StepSequence/)
    assert.ok(!/délai|conseiller|admission|financement|inscri|\d+ ?h\b/i.test(example))
  })
})

describe("StepSequence : pipeline sans IA (Draft → résolveur → validation finale)", () => {
  for (const count of [3, 4]) {
    test(`EditorialHero → NarrativeSplit → StepSequence (${count}) → DestinationCards → FinalCta`, () => {
      const parsed = safeParseLandingGenerationDraft(
        draftOf(draftSection["editorial-hero"](), draftSection["narrative-split"](), { ...draftSection["step-sequence"](), items: items(count) }, draftSection["destination-cards"](), draftSection["final-cta"]())
      )
      assert.ok(parsed.success)
      const result = resolveLandingDraft(request, parsed.data, context)
      assert.equal(result.status, "resolved")
      if (result.status !== "resolved") return
      assert.deepEqual(result.config.sections.map((entry) => entry.type), ["editorial-hero", "narrative-split", "step-sequence", "destination-cards", "final-cta"])
      assert.equal(validateGeneratedLanding(result.config, context).status, "valid")
    })
  }
})
