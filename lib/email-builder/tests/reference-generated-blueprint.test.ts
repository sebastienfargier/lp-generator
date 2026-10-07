/**
 * V2.9.4c.1 — le BLUEPRINT compact de transport : vocabulaire fermé, validation sémantique, compilation pure
 * Blueprint → GeneratedBlockSpec, slots déterministes, couverture des gaps (deux niveaux), sécurité. Hors réseau,
 * sans modèle ; le DSL (V2.9.1) n'est pas modifié.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { deriveGeneratedSlots } from "../generated/slots"
import { validateGeneratedBlockSpec } from "../generated/validate"
import { expressibleReferenceGaps, inexpressibleReferenceGaps, type ExpressibleReferenceGap } from "../reference-gap"
import {
  blueprintAligns,
  blueprintArchetypeCapabilities,
  blueprintArchetypes,
  blueprintColumns,
  blueprintCombinationIssues,
  blueprintCounts,
  blueprintFormatsByPosition,
  blueprintImageFormats,
  blueprintImagePositions,
  blueprintIntros,
  blueprintItemStyles,
  blueprintOverlaps,
  blueprintProportions,
  checkGeneratedReferenceBlueprint,
  compileGeneratedReferenceBlueprint,
  coveredBlueprintGaps,
  deriveGeneratedReferenceBlueprintSlots,
  generatedReferenceButtonSlot,
  generatedReferenceIconSlots,
  generatedReferenceImageSlot,
  generatedReferenceTextSlots,
  validateGeneratedReferenceBlueprint,
  type GeneratedReferenceBlueprint,
} from "../reference-generated-blueprint"
import { checkGeneratedReferenceStructure } from "../reference-generated-coverage"
import type { GeneratedReferenceCandidate } from "../reference-generated-request"
import { baseBlueprint, cardsBlueprint, iconGridBlueprint, mediaSideBlueprint, mediaTopBlueprint, overlapBlueprint, statBlueprint, textBlueprint } from "./reference-generated-fixtures"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
const clone = <T>(value: T): T => structuredClone(value)

/** Toutes les combinaisons VALIDES du vocabulaire (le schéma par construction, les règles par `blueprintCombinationIssues`). */
function* validBlueprints(): Generator<GeneratedReferenceBlueprint> {
  for (const archetype of blueprintArchetypes)
    for (const count of blueprintCounts)
      for (const columns of blueprintColumns)
        for (const itemStyle of blueprintItemStyles)
          for (const proportion of blueprintProportions)
            for (const imagePosition of blueprintImagePositions)
              for (const imageFormat of blueprintImageFormats)
                for (const overlap of blueprintOverlaps)
                  for (const align of blueprintAligns)
                    for (const intro of blueprintIntros)
                      for (const cta of [false, true]) {
                        const bp: GeneratedReferenceBlueprint = { archetype, count, columns, itemStyle, proportion, imagePosition, imageFormat, overlap, align, intro, cta }
                        if (blueprintCombinationIssues(bp).length === 0) yield bp
                      }
}
const all = [...validBlueprints()]

/** Une demande qui correspond EXACTEMENT à ce que le blueprint couvre (pour prouver que les capacités sont honnêtes). */
const anyCandidate = (bp: GeneratedReferenceBlueprint): GeneratedReferenceCandidate => {
  const gap = coveredBlueprintGaps(bp)[0]
  return gap ? candidateFor(bp, gap) : { ...candidateFor(bp, "columns"), structure: [] }
}
function candidateFor(bp: GeneratedReferenceBlueprint, gap: ExpressibleReferenceGap): GeneratedReferenceCandidate {
  const side = bp.imagePosition === "left" || bp.imagePosition === "right"
  const layout: GeneratedReferenceCandidate["layout"] =
    gap === "columns" ? (side ? "image-left" : (`columns-${bp.columns}` as GeneratedReferenceCandidate["layout"])) :
    gap === "column-proportions" ? (side ? (bp.imagePosition === "left" ? "image-left" : "image-right") : "columns-2") :
    gap === "image-placement" ? (bp.imagePosition === "left" ? "image-left" : bp.imagePosition === "right" ? "image-right" : "image-top") :
    gap === "card-over-image" ? "image-top" :
    bp.columns === 1 ? "list" : (`columns-${bp.columns}` as GeneratedReferenceCandidate["layout"])
  // `columns` d'un « media » de côté : la disposition est « columns-2 » pour le prédicat des colonnes (2 colonnes), « image-left » pour la position.
  const fixed = gap === "columns" && side ? ("columns-2" as const) : layout
  return { ref: "s1", role: "other", layout: fixed, tone: "light", hasImage: bp.imagePosition !== "none", imageCount: bp.imagePosition !== "none" ? 1 : 0, hasCta: bp.cta, repeatedItems: bp.archetype === "items" ? bp.count : 0, structure: [gap] }
}

describe("V2.9.4c.1 — vocabulaire Blueprint : fermé et petit", () => {
  test("trois archétypes ; des listes fermées ; un seul objet plat (aucun champ imbriqué)", () => {
    assert.deepEqual([...blueprintArchetypes], ["items", "media", "overlap"])
    assert.deepEqual([...blueprintItemStyles], ["plain", "card", "icon", "icon-card", "stat"])
    assert.deepEqual(Object.keys(baseBlueprint).sort(), ["align", "archetype", "columns", "count", "cta", "imageFormat", "imagePosition", "intro", "itemStyle", "overlap", "proportion"])
    for (const value of Object.values(baseBlueprint)) assert.ok(["string", "number", "boolean"].includes(typeof value))
  })
  test("chaque gap exprimable est couvert par au moins un archétype ; aucun gap inexprimable ne l'est", () => {
    const capable = new Set(Object.values(blueprintArchetypeCapabilities).flat())
    for (const gap of expressibleReferenceGaps) assert.ok(capable.has(gap), gap)
    for (const gap of inexpressibleReferenceGaps) assert.ok(!capable.has(gap as never), gap)
  })
  test("le nombre de combinaisons valides reste petit et fini", () => {
    assert.ok(all.length > 500 && all.length < 3000, String(all.length))
  })
})

describe("V2.9.4c.1 — validation : forme stricte, puis combinaisons ; jamais corrigé", () => {
  test("le blueprint de chaque archétype, minimal et valide", () => {
    for (const bp of [textBlueprint(), iconGridBlueprint(), cardsBlueprint(), statBlueprint(), mediaTopBlueprint(), mediaSideBlueprint("left"), mediaSideBlueprint("right"), overlapBlueprint()]) {
      const result = validateGeneratedReferenceBlueprint(bp)
      assert.equal(result.ok, true, JSON.stringify(result))
    }
  })
  test("archétype inconnu, clé inconnue, énumération hors vocabulaire, champ manquant, mauvais type, entrée non objet", () => {
    const refused = (value: unknown) => assert.equal(validateGeneratedReferenceBlueprint(value).ok, false, JSON.stringify(value))
    refused({ ...baseBlueprint, archetype: "split" })
    refused({ ...baseBlueprint, archetype: "ITEMS" })
    refused({ ...baseBlueprint, extra: 1 })
    refused({ ...baseBlueprint, itemStyle: "free" })
    refused({ ...baseBlueprint, align: "right" })
    refused({ ...baseBlueprint, intro: "all" })
    refused({ ...baseBlueprint, count: 0 })
    refused({ ...baseBlueprint, count: 5 })
    refused({ ...baseBlueprint, count: "2" })
    refused({ ...baseBlueprint, columns: 6 })
    refused({ ...baseBlueprint, overlap: 10 })
    refused({ ...baseBlueprint, cta: "true" })
    refused({ ...baseBlueprint, cta: undefined })
    refused({ ...baseBlueprint, imageFormat: "offer" })
    refused({ ...baseBlueprint, imageFormat: "card" })
    for (const value of [null, undefined, "items", 3, true, [], [baseBlueprint], {}]) refused(value)
    const partial = clone(baseBlueprint) as Record<string, unknown>
    delete partial.cta
    refused(partial)
  })
  test("injections : HTML, CSS, URL, destination, imageId, slot, rôle, AST brut, clés de prototype", () => {
    for (const key of ["html", "css", "style", "className", "url", "href", "destination", "imageId", "slot", "slots", "role", "children", "root", "t", "surface", "background", "text", "texts"]) {
      assert.equal(validateGeneratedReferenceBlueprint({ ...baseBlueprint, [key]: "x" }).ok, false, key)
    }
    assert.equal(validateGeneratedReferenceBlueprint({ ...baseBlueprint, align: "<script>alert(1)</script>" }).ok, false)
    assert.equal(validateGeneratedReferenceBlueprint({ ...baseBlueprint, intro: "https://evil.example" }).ok, false)
    assert.equal(validateGeneratedReferenceBlueprint({ specVersion: 1, role: "text", root: { t: "section", padX: 40, padY: 40, children: [] } }).ok, false)
    const hostile = JSON.parse(`{"__proto__":{"polluted":true},${JSON.stringify(baseBlueprint).slice(1)}`)
    assert.equal(validateGeneratedReferenceBlueprint(hostile).ok, false)
    assert.equal(validateGeneratedReferenceBlueprint(JSON.parse(`{"constructor":{"prototype":{"x":1}},${JSON.stringify(baseBlueprint).slice(1)}`)).ok, false)
    assert.equal(({} as Record<string, unknown>).polluted, undefined)
  })
  test("combinaisons impossibles refusées, avec le champ en cause", () => {
    const issue = (bp: Partial<GeneratedReferenceBlueprint>) => blueprintCombinationIssues({ ...baseBlueprint, ...bp }).map((entry) => entry.path)
    assert.ok(issue({ columns: 3, count: 2 }).includes("columns"))
    assert.ok(issue({ columns: 2, count: 3 }).includes("columns"))
    assert.ok(issue({ columns: 3, count: 4 }).includes("columns"))
    assert.ok(issue({ proportion: "first-wide" }).includes("proportion"), "une proportion suppose 2 colonnes")
    assert.ok(issue({ columns: 3, count: 3, proportion: "second-wide" }).includes("proportion"))
    assert.ok(issue({ imagePosition: "top" }).includes("imagePosition"), "items sans visuel")
    assert.ok(issue({ imageFormat: "band" }).includes("imageFormat"))
    assert.ok(issue({ overlap: 40 }).includes("overlap"))
    const media = { archetype: "media" as const, imagePosition: "top" as const, imageFormat: "medium" as const }
    assert.deepEqual(issue(media), [])
    assert.ok(issue({ ...media, imagePosition: "none" }).includes("imagePosition"))
    assert.ok(issue({ ...media, imageFormat: "split" }).includes("imageFormat"), "split n'est pas un cadre de tête")
    assert.ok(issue({ ...media, imageFormat: "none" }).includes("imageFormat"))
    assert.ok(issue({ ...media, imagePosition: "left", imageFormat: "band" }).includes("imageFormat"))
    assert.ok(issue({ ...media, count: 2 }).includes("count"))
    assert.ok(issue({ ...media, columns: 2 }).includes("columns"))
    assert.ok(issue({ ...media, itemStyle: "card" }).includes("itemStyle"))
    assert.ok(issue({ ...media, intro: "none" }).includes("intro"))
    assert.ok(issue({ ...media, overlap: 24 }).includes("overlap"))
    assert.ok(issue({ ...media, proportion: "first-wide" }).includes("proportion"))
    const overlap = { archetype: "overlap" as const, imagePosition: "top" as const, imageFormat: "band" as const, overlap: 40 as const }
    assert.deepEqual(issue(overlap), [])
    assert.ok(issue({ ...overlap, overlap: 0 }).includes("overlap"))
    assert.ok(issue({ ...overlap, imagePosition: "left", imageFormat: "split" }).includes("imagePosition"))
    assert.ok(issue({ ...overlap, proportion: "second-wide" }).includes("proportion"))
  })
  test("un blueprint invalide ne compile pas (la compilation rejoue la validation)", () => {
    for (const bad of [{ ...baseBlueprint, count: 9 }, { ...baseBlueprint, columns: 3 }, null, "items"]) {
      assert.equal(compileGeneratedReferenceBlueprint(bad, "text").ok, false)
      assert.equal(deriveGeneratedReferenceBlueprintSlots(bad), undefined)
    }
  })
})

describe("V2.9.4c.1 — compilation Blueprint → GeneratedBlockSpec : pure, déterministe, valide", () => {
  const examples: [string, GeneratedReferenceBlueprint][] = [
    ["texte", textBlueprint()],
    ["icônes 2×2", iconGridBlueprint()],
    ["cartes 3", cardsBlueprint()],
    ["chiffre", statBlueprint()],
    ["visuel en haut", mediaTopBlueprint()],
    ["visuel à gauche", mediaSideBlueprint("left")],
    ["visuel à droite", mediaSideBlueprint("right")],
    ["chevauchement", overlapBlueprint()],
  ]
  test("pour chaque archétype : une spec V2.9.1 VALIDE, le rôle du candidat, aucun HTML", () => {
    for (const [name, bp] of examples) {
      const compiled = compileGeneratedReferenceBlueprint(bp, "benefits")
      assert.equal(compiled.ok, true, name)
      if (!compiled.ok) continue
      const checked = validateGeneratedBlockSpec(compiled.spec)
      assert.equal(checked.ok, true, `${name} : ${JSON.stringify(checked)}`)
      assert.equal(compiled.spec.role, "benefits")
      assert.equal(compiled.spec.specVersion, 1)
      assert.ok(!/<|style=|class=|http/.test(JSON.stringify(compiled.spec)), name)
    }
  })
  test("déterministe : même blueprint, même spec, octet pour octet ; l'entrée n'est pas modifiée", () => {
    for (const [, bp] of examples) {
      const before = JSON.stringify(bp)
      const a = JSON.stringify(compileGeneratedReferenceBlueprint(bp, "text"))
      const b = JSON.stringify(compileGeneratedReferenceBlueprint(clone(bp), "text"))
      assert.equal(a, b)
      assert.equal(JSON.stringify(bp), before)
    }
  })
  test("les rôles changent le rôle de la spec, rien d'autre", () => {
    const strip = (role: "hero" | "proof") => {
      const compiled = compileGeneratedReferenceBlueprint(cardsBlueprint(), role)
      return compiled.ok ? { ...compiled.spec, role: "x" } : undefined
    }
    assert.deepEqual(strip("hero"), strip("proof"))
  })
  test("TOUTES les combinaisons valides compilent en une spec valide (nombre de nœuds, profondeur, octets, slots dans les limites du DSL)", () => {
    for (const bp of all) {
      const compiled = compileGeneratedReferenceBlueprint(bp, "other")
      assert.equal(compiled.ok, true, JSON.stringify(bp))
      if (!compiled.ok) continue
      const checked = validateGeneratedBlockSpec(compiled.spec)
      assert.equal(checked.ok, true, `${JSON.stringify(bp)} : ${JSON.stringify(checked)}`)
    }
  })
})

describe("V2.9.4c.1 — slots DÉTERMINISTES", () => {
  const names = (bp: GeneratedReferenceBlueprint) => (deriveGeneratedReferenceBlueprintSlots(bp) ?? []).map((slot) => slot.name)
  test("noms attendus par archétype", () => {
    assert.deepEqual(names(textBlueprint()), ["title", "body", "item-1-title", "item-1-body", "cta"])
    assert.deepEqual(names({ ...mediaTopBlueprint() }), ["image", "eyebrow", "title", "body", "cta"])
    assert.deepEqual(names(overlapBlueprint()), ["image", "eyebrow", "title", "body", "cta"])
    assert.deepEqual(names(mediaSideBlueprint("right")), ["title", "cta", "image"])
    assert.deepEqual(names({ ...baseBlueprint, count: 2, columns: 2, itemStyle: "icon", intro: "none" }), ["icon-1", "icon-1-title", "icon-1-body", "icon-2", "icon-2-title", "icon-2-body"])
    assert.deepEqual(names({ ...baseBlueprint, count: 2, columns: 2, itemStyle: "icon-card", intro: "none" }), ["card-1-icon", "card-1-title", "card-1-body", "card-2-icon", "card-2-title", "card-2-body"])
    assert.deepEqual(names({ ...baseBlueprint, count: 2, columns: 1, itemStyle: "card", intro: "none" }), ["card-1-title", "card-1-body", "card-2-title", "card-2-body"])
    assert.deepEqual(names({ ...baseBlueprint, count: 2, columns: 2, itemStyle: "plain", intro: "none" }), ["item-1-title", "item-1-body", "item-2-title", "item-2-body"])
    assert.deepEqual(names({ ...baseBlueprint, count: 3, columns: 3, itemStyle: "stat", intro: "none" }), ["stat-1", "stat-1-label", "stat-2", "stat-2-label", "stat-3", "stat-3-label"])
  })
  test("pour TOUTE combinaison valide : noms uniques, jamais réservés, et dans les énumérations fermées du transport", () => {
    const used = { text: new Set<string>(), icon: new Set<string>() }
    for (const bp of all) {
      const slots = deriveGeneratedReferenceBlueprintSlots(bp)
      assert.ok(slots, JSON.stringify(bp))
      assert.equal(new Set(slots!.map((slot) => slot.name)).size, slots!.length)
      for (const slot of slots!) {
        if (slot.kind === "texte") {
          if (/^stat-\d$/.test(slot.name)) continue
          assert.ok((generatedReferenceTextSlots as readonly string[]).includes(slot.name), slot.name)
          used.text.add(slot.name)
        } else if (slot.kind === "asset:icone") {
          assert.ok((generatedReferenceIconSlots as readonly string[]).includes(slot.name), slot.name)
          used.icon.add(slot.name)
        } else if (slot.kind === "asset:visuel") assert.equal(slot.name, generatedReferenceImageSlot)
        else assert.equal(slot.name, generatedReferenceButtonSlot)
      }
    }
    // pas d'énumération morte : chaque nom autorisé existe dans une composition valide
    assert.deepEqual([...used.text].sort(), [...generatedReferenceTextSlots].filter((name) => !/^stat-\d$/.test(name)).sort())
    assert.deepEqual([...used.icon].sort(), [...generatedReferenceIconSlots].sort())
  })
  test("dérivés de la spec compilée : une seule source (aucune seconde dérivation à maintenir)", () => {
    const compiled = compileGeneratedReferenceBlueprint(overlapBlueprint(), "hero")
    assert.ok(compiled.ok)
    if (compiled.ok) assert.deepEqual(deriveGeneratedReferenceBlueprintSlots(overlapBlueprint(), "hero"), deriveGeneratedSlots(compiled.spec))
  })
})

describe("V2.9.4c.1 — couverture des gaps : deux niveaux, fail closed", () => {
  test("NIVEAU 1 honnête : tout gap que le blueprint déclare couvrir est réellement couvert par la spec compilée (prédicats 4a), pour TOUTE combinaison valide", () => {
    for (const bp of all) {
      const compiled = compileGeneratedReferenceBlueprint(bp, "other")
      assert.ok(compiled.ok)
      if (!compiled.ok) continue
      for (const gap of coveredBlueprintGaps(bp)) {
        assert.ok(blueprintArchetypeCapabilities[bp.archetype].includes(gap), `${bp.archetype} ne déclare pas ${gap}`)
        const candidate = candidateFor(bp, gap)
        assert.deepEqual(checkGeneratedReferenceBlueprint(bp, candidate), { ok: true }, `${gap} ${JSON.stringify(bp)}`)
        const structure = checkGeneratedReferenceStructure(compiled.spec, candidate)
        assert.deepEqual(structure, { ok: true }, `${gap} ${JSON.stringify(bp)} : ${JSON.stringify(structure)}`)
      }
    }
  })
  test("un gap que les paramètres ne couvrent pas est refusé « blueprint-coverage » (le gap est désigné)", () => {
    for (const bp of all) {
      const covered = new Set(coveredBlueprintGaps(bp))
      for (const gap of expressibleReferenceGaps) {
        if (covered.has(gap)) continue
        const verdict = checkGeneratedReferenceBlueprint(bp, { ...candidateFor(bp, gap), hasImage: true, hasCta: true })
        assert.deepEqual(verdict, { ok: false, reason: "blueprint-coverage", gap }, `${gap} ${JSON.stringify(bp)}`)
      }
    }
  })
  test("tous les gaps d'une demande doivent être couverts : un seul manquant suffit à refuser", () => {
    const bp = { ...cardsBlueprint(), count: 4 as const, columns: 2 as const }
    const candidate = { ...candidateFor(bp, "columns"), structure: ["columns", "repeated-cards", "icon-items"] as ExpressibleReferenceGap[] }
    assert.deepEqual(checkGeneratedReferenceBlueprint(bp, candidate), { ok: false, reason: "blueprint-coverage", gap: "icon-items" })
    assert.deepEqual(checkGeneratedReferenceBlueprint(bp, { ...candidate, structure: ["columns", "repeated-cards"] }), { ok: true })
    // deux archétypes ne se combinent pas : overlap + cartes répétées n'existe pas
    assert.equal(checkGeneratedReferenceBlueprint(overlapBlueprint(), { ...candidateFor(overlapBlueprint(), "card-over-image"), structure: ["card-over-image", "repeated-cards"] }).ok, false)
  })
  test("hasImage = false : tout blueprint avec une position de visuel est refusé ; hasCta = false : tout blueprint avec bouton aussi (pour toute combinaison)", () => {
    for (const bp of all) {
      const candidate = anyCandidate(bp)
      const noImage = checkGeneratedReferenceBlueprint(bp, { ...candidate, hasImage: false })
      assert.equal(noImage.ok, bp.imagePosition === "none", JSON.stringify(bp))
      if (!noImage.ok) assert.equal(noImage.reason, "image-not-allowed")
      const noCta = checkGeneratedReferenceBlueprint(bp, { ...candidate, hasCta: false })
      assert.equal(noCta.ok, !bp.cta, JSON.stringify(bp))
      if (!noCta.ok) assert.equal(noCta.reason, "cta-not-allowed")
    }
  })
  test("conservateur dans l'autre sens : ni visuel ni bouton OBLIGATOIRE parce que la référence en a", () => {
    for (const bp of all.filter((entry) => entry.archetype === "items" && !entry.cta)) {
      const candidate = { ...anyCandidate(bp), hasImage: true, imageCount: 2, hasCta: true }
      assert.deepEqual(checkGeneratedReferenceBlueprint(bp, candidate), { ok: true })
    }
  })
  test("image-placement : le visuel d'un « media » suit le layout (image-top → top, image-left → left, image-right → right)", () => {
    const placement = (position: "top" | "left" | "right", layout: GeneratedReferenceCandidate["layout"]) => {
      const bp = position === "top" ? mediaTopBlueprint() : mediaSideBlueprint(position)
      return checkGeneratedReferenceBlueprint(bp, { ...candidateFor(bp, "image-placement"), layout }).ok
    }
    for (const position of ["top", "left", "right"] as const) for (const layout of ["image-top", "image-left", "image-right"] as const) assert.equal(placement(position, layout), layout === `image-${position}`, `${position}/${layout}`)
    assert.equal(placement("left", "single-column"), true, "un layout sans position de visuel n'impose rien")
  })
  test("NIVEAU 2 : la spec compilée est revérifiée par les prédicats 4a (compte exact d'éléments répétés, colonnes du layout)", () => {
    const bp = { ...cardsBlueprint(), count: 3 as const, columns: 3 as const }
    const compiled = compileGeneratedReferenceBlueprint(bp, "products")
    assert.ok(compiled.ok)
    if (!compiled.ok) return
    const request = (over: Partial<GeneratedReferenceCandidate>): GeneratedReferenceCandidate => ({ ...candidateFor(bp, "repeated-cards"), role: "products", layout: "columns-3", structure: ["columns", "repeated-cards"], ...over })
    assert.deepEqual(checkGeneratedReferenceStructure(compiled.spec, request({})), { ok: true })
    assert.equal(checkGeneratedReferenceStructure(compiled.spec, request({ repeatedItems: 4 })).ok, false, "4 cartes demandées, 3 produites")
    assert.equal(checkGeneratedReferenceStructure(compiled.spec, request({ layout: "columns-2" })).ok, false, "2 colonnes demandées, 3 produites")
    assert.deepEqual(checkGeneratedReferenceBlueprint(bp, request({ repeatedItems: 4 })), { ok: true }, "le niveau 1 ne compte pas : c'est le niveau 2")
  })
  test("les gaps inexprimables ne sont dans aucune capacité (le blueprint ne tente pas de les contourner)", () => {
    for (const bp of all) for (const gap of inexpressibleReferenceGaps) assert.ok(!(coveredBlueprintGaps(bp) as string[]).includes(gap))
  })
})

describe("V2.9.4c.1 — frontières : un sous-ensemble du DSL, rien modifié", () => {
  test("le module Blueprint est pur : ni réseau, ni Anthropic, ni UI, ni HTML, ni aléa, ni rendu", () => {
    const source = code("lib/email-builder/reference-generated-blueprint.ts")
    assert.ok(!/anthropic|fetch\(|process\.env|messages\.create/i.test(source))
    assert.ok(!/from "react"|from "next|components\//.test(source))
    assert.ok(!/<table|<td|<div|style="|className|innerHTML|generated-html|renderGeneratedBlock/.test(source))
    assert.ok(!/Math\.random|Date\.now|new Date\(|randomUUID/.test(source))
    assert.ok(!/destination|imageId|href|https?:\/\//i.test(source), "aucune destination, image ou URL dans le Blueprint")
  })
  test("le DSL, le compilateur HTML, le domaine et la composition ne connaissent pas le Blueprint", () => {
    for (const path of ["generated/schema", "generated/validate", "generated/slots", "generated/tokens", "generated-html/compile", "generated-html/content", "generated-html/hygiene", "generated-block", "block-entry", "operations", "composition", "integrity", "render"]) {
      assert.ok(!/reference-generated-blueprint/.test(code(`lib/email-builder/${path}.ts`)), path)
    }
  })
  test("les formats d'image du Blueprint existent dans la banque ; `card` et `offer` n'y sont pas", () => {
    for (const format of blueprintImageFormats.filter((entry) => entry !== "none")) assert.ok(["band", "medium", "large", "split"].includes(format))
    for (const formats of Object.values(blueprintFormatsByPosition)) for (const format of formats) assert.ok(!["card", "offer"].includes(format))
  })
})
