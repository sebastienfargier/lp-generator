/**
 * Résolveur Draft → LandingPageConfig : pur, déterministe, et jamais une
 * validation (le contrat final s'applique ensuite, sans changement).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { fallbackLandingImagePosition, landingImagePositions, resolveLandingDraft } from "../draft-resolver"
import { buildLandingGenerationContext } from "../generation-context"
import { safeParseLandingGenerationDraft, type LandingGenerationDraft } from "../generation-draft"
import type { LandingGenerationRequest } from "../generation-request"
import { validateGeneratedLanding } from "../generation-validation"
import { landingImages } from "../image-catalog"
import { LandingPageSchema, safeParseLandingPage } from "../schemas"
import type { LandingPageConfig } from "../types"
import { context, draftCta, draftOf, draftSection, request, validDraft } from "./fixtures"

const asDraft = (input: unknown) => {
  const parsed = safeParseLandingGenerationDraft(input)
  assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
  return parsed.data
}
const resolve = (input: unknown, who: LandingGenerationRequest = request, ctx = context) => resolveLandingDraft(who, asDraft(input), ctx)
const resolved = (input: unknown, who: LandingGenerationRequest = request, ctx = context): LandingPageConfig => {
  const result = resolve(input, who, ctx)
  assert.equal(result.status, "resolved", JSON.stringify(result))
  return result.status === "resolved" ? result.config : (undefined as never)
}
const unresolved = (input: unknown, ctx = context) => {
  const result = resolve(input, request, ctx)
  assert.equal(result.status, "unresolvable", JSON.stringify(result))
  return result.status === "unresolvable" ? result.issues : []
}
const named = (projectName: string) => ({ ...request, projectName })
const keysDeep = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(keysDeep) : typeof value === "object" && value !== null ? Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]) : []
const hrefsDeep = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(hrefsDeep) : typeof value === "object" && value !== null ? Object.entries(value).flatMap(([key, child]) => (key === "href" ? [String(child)] : hrefsDeep(child))) : []
const srcsDeep = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap(srcsDeep) : typeof value === "object" && value !== null ? Object.entries(value).flatMap(([key, child]) => (key === "src" ? [String(child)] : srcsDeep(child))) : []
const only = (config: LandingPageConfig, index = 0) => config.sections[index]!

/** Brouillon complet et valide pour le contrat final : un hero, puis une section de chaque autre lame. */
const fullDraft = (hero: "editorial-hero" | "immersive-hero" = "editorial-hero") =>
  draftOf(draftSection[hero](), draftSection["value-props"](), draftSection.pillars(), draftSection["content-carousel"](), draftSection["audience-switcher"]())

describe("pur et déterministe", () => {
  test("mêmes request, draft et context → exactement la même LandingPageConfig", () => {
    const first = resolved(fullDraft())
    for (let run = 0; run < 3; run += 1) {
      const again = resolved(fullDraft(), { ...request }, buildLandingGenerationContext({ ...request }))
      assert.equal(JSON.stringify(again), JSON.stringify(first))
    }
  })

  test("n'altère aucune de ses entrées", () => {
    const draft = asDraft(fullDraft())
    const before = [JSON.stringify(request), JSON.stringify(draft), JSON.stringify(context)]
    resolveLandingDraft(request, draft, context)
    assert.deepEqual([JSON.stringify(request), JSON.stringify(draft), JSON.stringify(context)], before)
  })

  test("ni hasard, ni horloge, ni système de fichiers dans le résolveur et le contrat Draft", () => {
    for (const file of ["draft-resolver", "generation-draft"]) {
      const source = readFileSync(join(process.cwd(), "lib/landing", `${file}.ts`), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
      assert.ok(!/Math\.random|Date\.now|new Date|crypto|randomUUID|node:fs|readdir|performance/.test(source), file)
    }
  })
})

describe("page : version, id, titre", () => {
  test("version 1", () => {
    assert.equal(resolved(validDraft()).version, 1)
  })

  test("id de page : slug du nom du projet", () => {
    assert.equal(resolved(validDraft()).id, "reconversion-rh")
    assert.equal(resolved(validDraft(), named("Orientation Studi — Été 2026 !")).id, "orientation-studi-ete-2026")
    assert.equal(resolved(validDraft(), named("  Éléments  &  Co ")).id, "elements-co")
  })

  test("id de page toujours valide : préfixe si le slug ne commence pas par une lettre, repli s'il est vide", () => {
    assert.equal(resolved(validDraft(), named("2026 rentrée")).id, "landing-2026-rentree")
    assert.equal(resolved(validDraft(), named("!!!")).id, "landing")
    assert.equal(resolved(validDraft(), named("日本語")).id, "landing")
    for (const projectName of ["Reconversion RH", "2026", "!!!", "a", "Été"]) assert.match(resolved(validDraft(), named(projectName)).id, /^[a-z][a-z0-9-]*$/, projectName)
  })

  test("titre : le nom du projet, espaces normalisés", () => {
    assert.equal(resolved(validDraft()).title, "Reconversion RH")
    assert.equal(resolved(validDraft(), named("  Reconversion \n  RH  ")).title, "Reconversion RH")
  })
})

describe("ids de section", () => {
  test("le type de la lame, unique", () => {
    assert.deepEqual(resolved(fullDraft()).sections.map((entry) => entry.id), ["editorial-hero", "value-props", "pillars", "content-carousel", "audience-switcher"])
  })

  test("sections répétées : suffixes déterministes -2, -3, dans l'ordre", () => {
    const config = resolved(draftOf(draftSection["editorial-hero"](), draftSection.pillars(), draftSection["value-props"](), draftSection.pillars(), draftSection.pillars(), draftSection["value-props"]()))
    assert.deepEqual(config.sections.map((entry) => entry.id), ["editorial-hero", "pillars", "value-props", "pillars-2", "pillars-3", "value-props-2"])
    assert.equal(new Set(config.sections.map((entry) => entry.id)).size, config.sections.length)
  })

  test("l'ordre du brouillon est l'ordre de la page", () => {
    const config = resolved(draftOf(draftSection["value-props"](), draftSection.pillars(), draftSection["editorial-hero"]()))
    assert.deepEqual(config.sections.map((entry) => entry.type), ["value-props", "pillars", "editorial-hero"])
  })
})

describe("images : identifiant → src et alt du catalogue", () => {
  test("chaque image du catalogue est résolue à l'identique, alt du catalogue compris", () => {
    for (const image of landingImages) {
      const config = resolved(draftOf({ ...draftSection["editorial-hero"](), image: image.id }))
      assert.deepEqual((only(config).props as { visual: unknown }).visual, { src: image.src, alt: image.alt }, image.id)
    }
  })

  test("images de carrousel et d'audiences résolues de la même façon", () => {
    const config = resolved(draftOf(
      { ...draftSection["content-carousel"](), items: [{ eyebrow: "a", title: "b", image: "content-2" }, { eyebrow: "c", title: "d", image: "content-4" }] },
      { ...draftSection["audience-switcher"](), items: [{ eyebrow: "a", title: "Un", description: "b", image: "audience-3" }] }
    ))
    const find = (id: string) => landingImages.find((image) => image.id === id)!
    const [carousel, audience] = config.sections as unknown as { props: { items: { image: unknown }[] } }[]
    assert.deepEqual(carousel!.props.items.map((item) => item.image), [{ src: find("content-2").src, alt: find("content-2").alt }, { src: find("content-4").src, alt: find("content-4").alt }])
    assert.deepEqual(audience!.props.items[0]!.image, { src: find("audience-3").src, alt: find("audience-3").alt })
  })

  test("aucun src inventé : tout src de la sortie est une image du catalogue", () => {
    const catalog = new Set<string>(landingImages.map((image) => image.src))
    for (const src of srcsDeep(resolved(fullDraft("immersive-hero")))) assert.ok(catalog.has(src), src)
  })
})

describe("CTA : identifiant → href exact", () => {
  test("chaque destination du catalogue est résolue en son URL exacte, sans icône", () => {
    for (const destination of context.destinations) {
      const config = resolved(draftOf({ ...draftSection["editorial-hero"](), cta: { label: "Voir", destination: destination.id } }))
      assert.deepEqual((only(config).props as { primaryAction: unknown }).primaryAction, { label: "Voir", href: destination.url }, destination.id)
    }
  })

  test("aucune URL inventée : tout href de la sortie est une destination du contexte, jamais une ancre", () => {
    const urls = new Set(context.destinations.map((destination) => destination.url))
    const hrefs = hrefsDeep(resolved(fullDraft("immersive-hero")))
    assert.ok(hrefs.length > 0)
    for (const href of hrefs) assert.ok(urls.has(href) && !href.startsWith("#"), href)
  })

  test("le libellé du CTA est celui de Claude, tel quel", () => {
    const config = resolved(draftOf({ ...draftSection["immersive-hero"](), cta: { label: "Explorer le catalogue", destination: "metiers" } }))
    assert.equal((only(config).props as { primaryAction: { label: string } }).primaryAction.label, "Explorer le catalogue")
  })
})

describe("position du visuel d'un immersive-hero", () => {
  test("mapping documenté : subject left → left, center → center, right → right", () => {
    assert.deepEqual(landingImagePositions, { left: "left", center: "center", right: "right" })
    assert.equal(fallbackLandingImagePosition, "center")
  })

  test("chaque image du catalogue : position déduite de son subject", () => {
    for (const image of landingImages) {
      const config = resolved(draftOf({ ...draftSection["immersive-hero"](), image: image.id }))
      const { visual } = only(config).props as { visual: { src: string; alt: string; position: string } }
      assert.equal(visual.position, landingImagePositions[image.subject], image.id)
      assert.deepEqual({ src: visual.src, alt: visual.alt }, { src: image.src, alt: image.alt })
    }
  })

  test("subject inattendu ou absent : repli centré, déterministe", () => {
    const strange = (subject: unknown) => ({
      ...context,
      images: context.images.map((image) => (image.id === "hero-bilan" ? { ...image, subject } : image)) as unknown as typeof context.images,
    })
    for (const subject of ["diagonal", "", undefined, null, 3, "constructor", "toString", "__proto__"]) {
      const config = resolved(draftOf(draftSection["immersive-hero"]()), request, strange(subject))
      assert.equal((only(config).props as { visual: { position: string } }).visual.position, "center", String(subject))
    }
  })

  test("l'éditorial n'a pas de position : seule la lame immersive en porte une", () => {
    const config = resolved(fullDraft())
    assert.ok(!keysDeep(config).includes("position"))
  })
})

describe("audiences", () => {
  const audiences = (items: { title: string }[]) =>
    resolved(draftOf({ ...draftSection["audience-switcher"](), items: items.map((item) => ({ eyebrow: "e", description: "d", image: "audience-1", ...item })) })).sections[0]!.props as unknown as {
      defaultValue: string
      items: { id: string; title: string }[]
    }

  test("ids : slug du titre ; defaultValue : la première audience", () => {
    const props = audiences([{ title: "Salariés en poste" }, { title: "Demandeurs d'emploi" }, { title: "Étudiants" }])
    assert.deepEqual(props.items.map((item) => item.id), ["salaries-en-poste", "demandeurs-d-emploi", "etudiants"])
    assert.equal(props.defaultValue, "salaries-en-poste")
  })

  test("doublons : suffixes déterministes ; ids toujours uniques et valides", () => {
    const props = audiences([{ title: "Salarié" }, { title: "Salarié" }, { title: "SALARIÉ !" }, { title: "Salarié 2" }])
    assert.deepEqual(props.items.map((item) => item.id), ["salarie", "salarie-2", "salarie-3", "salarie-2-2"])
    assert.equal(new Set(props.items.map((item) => item.id)).size, 4)
    assert.equal(props.defaultValue, "salarie")
  })

  test("titre sans lettre ni chiffre : audience-N ; titre commençant par un chiffre : préfixe", () => {
    const props = audiences([{ title: "!!!" }, { title: "2e carrière" }, { title: "???" }])
    assert.deepEqual(props.items.map((item) => item.id), ["audience-1", "audience-2e-carriere", "audience-3"])
    for (const item of props.items) assert.match(item.id, /^[a-z][a-z0-9-]*$/)
  })

  test("le contenu éditorial des audiences est conservé tel quel", () => {
    const props = audiences([{ title: "Salarié" }])
    assert.equal(props.items[0]!.title, "Salarié")
  })
})

describe("ce que le résolveur ne produit jamais", () => {
  test("aucun logo, badge, variant ni icône, quelle que soit la composition", () => {
    for (const draft of [fullDraft(), fullDraft("immersive-hero"), validDraft()]) {
      const keys = new Set(keysDeep(resolved(draft)))
      for (const forbidden of ["logo", "badge", "variant", "icon", "pricing", "partner", "products", "secondaryAction"]) assert.ok(!keys.has(forbidden), forbidden)
    }
  })

  test("forme exacte d'un editorial-hero et d'un immersive-hero résolus", () => {
    const hero = landingImages.find((image) => image.id === "hero-apprenante")!
    assert.deepEqual(only(resolved(draftOf(draftSection["editorial-hero"]()))), {
      id: "editorial-hero",
      type: "editorial-hero",
      props: {
        title: "Changer de métier, étape par étape",
        visual: { src: hero.src, alt: hero.alt },
        primaryAction: { label: draftCta.label, href: context.destinations.find((destination) => destination.id === "catalogue-formations")!.url },
        supportingText: "Une reconversion se prépare.",
      },
    })
    const bilan = landingImages.find((image) => image.id === "hero-bilan")!
    const immersive = only(resolved(draftOf(draftSection["immersive-hero"]()))).props as Record<string, unknown>
    assert.deepEqual(Object.keys(immersive).sort(), ["description", "headline", "primaryAction", "visual"])
    assert.deepEqual(immersive.visual, { src: bilan.src, alt: bilan.alt, position: landingImagePositions[bilan.subject] })
    assert.deepEqual(immersive.headline, ["Une nouvelle voie", "se construit"])
  })
})

describe("résolution impossible : une erreur précise, jamais une valeur inventée", () => {
  const without = (id: string) => ({ ...context, images: context.images.filter((image) => image.id !== id) })

  test("image absente du contexte", () => {
    const issues = unresolved(draftOf({ ...draftSection["editorial-hero"](), image: "hero-bilan" }), without("hero-bilan"))
    assert.deepEqual(issues.map((issue) => issue.path), ["sections.0.image"])
    assert.match(issues[0]!.message, /hero-bilan/)
  })

  test("destination absente du contexte", () => {
    const narrow = { ...context, destinations: context.destinations.filter((destination) => destination.id !== "catalogue-formations") }
    assert.deepEqual(unresolved(validDraft(), narrow).map((issue) => issue.path), ["sections.0.cta.destination"])
  })

  test("section non candidate pour cette génération", () => {
    const narrow = { ...context, sections: context.sections.filter((entry) => entry.type !== "pillars") }
    const issues = unresolved(validDraft(), narrow)
    assert.deepEqual(issues.map((issue) => issue.path), ["sections.1.section"])
    assert.match(issues[0]!.message, /pillars/)
  })

  test("images imbriquées et plusieurs problèmes cumulés", () => {
    const issues = unresolved(
      draftOf(draftSection["editorial-hero"](), { ...draftSection["content-carousel"](), items: [{ eyebrow: "a", title: "b", image: "content-1" }, { eyebrow: "c", title: "d", image: "content-3" }] }),
      { ...context, images: context.images.filter((image) => !["hero-apprenante", "content-3"].includes(image.id)) }
    )
    assert.deepEqual(issues.map((issue) => issue.path), ["sections.0.image", "sections.1.items.1.image"])
  })
})

describe("la sortie est acceptée par le contrat final", () => {
  test("LandingPageSchema et validateGeneratedLanding, pour chaque composition valide", () => {
    for (const draft of [validDraft(), fullDraft(), fullDraft("immersive-hero"), draftOf(draftSection["immersive-hero"](), draftSection.pillars(), draftSection.pillars())]) {
      const config = resolved(draft)
      const parsed = safeParseLandingPage(config)
      assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
      assert.deepEqual(LandingPageSchema.parse(config), config)
      const checked = validateGeneratedLanding(config, context)
      assert.equal(checked.status, "valid", JSON.stringify(checked))
    }
  })

  test("chaque lame candidate, seule, produit une configuration acceptée", () => {
    for (const type of Object.keys(draftSection) as (keyof typeof draftSection)[]) {
      const checked = validateGeneratedLanding(resolved(draftOf(draftSection[type]())), context)
      assert.equal(checked.status, "valid", `${type} : ${JSON.stringify(checked)}`)
    }
  })

  test("le résolveur ne valide pas : les règles de page restent au contrat final", () => {
    const secondHero = draftOf(draftSection["editorial-hero"](), draftSection["immersive-hero"]())
    const lateHero = draftOf(draftSection["value-props"](), draftSection["editorial-hero"]())
    for (const draft of [secondHero, lateHero]) {
      const config = resolved(draft)
      assert.equal(safeParseLandingPage(config).success, false)
      assert.equal(validateGeneratedLanding(config, context).status, "invalid")
    }
  })

  test("le type du brouillon reste distinct du contrat final", () => {
    const draft: LandingGenerationDraft = asDraft(validDraft())
    assert.ok(!("version" in draft) && !("id" in draft))
  })
})
