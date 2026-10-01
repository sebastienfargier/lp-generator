/**
 * Contrat IA intermédiaire : LandingGenerationDraft. Strict, une branche par
 * lame, aucune propriété optionnelle, ressources désignées par identifiant.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { z } from "zod"

import { landingDestinations } from "../destinations"
import {
  buildLandingDraftJsonSchema,
  buildLandingDraftSchema,
  landingDraftSectionTypes,
  LandingGenerationDraftSchema,
  safeParseLandingGenerationDraft,
} from "../generation-draft"
import { landingImages } from "../image-catalog"
import { LandingPageSectionSchema } from "../schemas"
import { context, draftCta, draftOf, draftSection, validDraft } from "./fixtures"

const accepts = (draft: unknown) => safeParseLandingGenerationDraft(draft).success
/** Copie d'un objet sans une clé. */
const without = (value: object, key: string) => {
  const copy: Record<string, unknown> = { ...value }
  delete copy[key]
  return copy
}
const types = Object.keys(draftSection) as (keyof typeof draftSection)[]
const withSection = (type: keyof typeof draftSection, patch: Record<string, unknown>) => draftOf({ ...draftSection[type](), ...patch })

describe("sections du brouillon", () => {
  test("chaque lame candidate a sa forme, et un brouillon valide est accepté", () => {
    for (const type of types) assert.ok(accepts(draftOf(draftSection[type]())), type)
    assert.ok(accepts(validDraft()))
  })

  test("exactement les 6 lames candidates, dans l'ordre du catalogue et du contexte", () => {
    assert.deepEqual([...landingDraftSectionTypes], context.sections.map((section) => section.type))
    assert.deepEqual([...landingDraftSectionTypes], ["editorial-hero", "immersive-hero", "value-props", "pillars", "content-carousel", "audience-switcher"])
    const contract = LandingPageSectionSchema.options.map((option) => option.shape.type.value as string)
    for (const type of landingDraftSectionTypes) assert.ok(contract.includes(type), type)
  })

  test("le brouillon n'impose pas les règles de page : elles restent au contrat final", () => {
    // Deux heroes, hero en second, répétitions : acceptés ici, refusés par LandingPageSchema après résolution.
    assert.ok(accepts(draftOf(draftSection["value-props"](), draftSection["editorial-hero"](), draftSection["immersive-hero"]())))
    assert.ok(accepts(draftOf(draftSection.pillars(), draftSection.pillars())))
  })

  test("section inconnue refusée : lames commerciales, inventées, ou absente", () => {
    for (const section of ["product-hero", "product-grid", "faq-accordion", "", "EDITORIAL-HERO"]) {
      assert.ok(!accepts(draftOf({ ...draftSection["editorial-hero"](), section })), section)
    }
    assert.ok(!accepts(draftOf(without(draftSection["editorial-hero"](), "section"))))
  })

  test("tableau de sections : au moins une, et seulement des sections", () => {
    assert.ok(!accepts({ sections: [] }))
    assert.ok(!accepts({}))
    assert.ok(!accepts({ sections: "editorial-hero" }))
    for (const input of [null, "brouillon", [], 42]) assert.ok(!accepts(input))
  })
})

describe("objets fermés : rien hors contrat", () => {
  test("propriété inconnue refusée à chaque niveau", () => {
    assert.ok(!accepts({ ...validDraft(), theme: "dark" }))
    for (const type of types) assert.ok(!accepts(withSection(type, { className: "x" })), type)
    assert.ok(!accepts(withSection("editorial-hero", { cta: { ...draftCta, tracking: "x" } })))
    assert.ok(!accepts(withSection("pillars", { items: [{ title: "a", description: "b", extra: 1 }] })))
    assert.ok(!accepts(withSection("content-carousel", { items: [{ eyebrow: "a", title: "b", image: "content-1", alt: "x" }] })))
  })

  test("champs structurels du contrat final refusés : version, ids, props, type", () => {
    const raw = validDraft() as Record<string, unknown>
    for (const key of ["version", "id", "title"]) assert.ok(!accepts({ ...raw, [key]: key === "version" ? 1 : "x" }), key)
    for (const patch of [{ id: "hero" }, { type: "editorial-hero" }, { props: {} }]) assert.ok(!accepts(withSection("editorial-hero", patch)), JSON.stringify(patch))
    assert.ok(!accepts(withSection("audience-switcher", { defaultValue: "salarie" })))
    assert.ok(!accepts(withSection("audience-switcher", { items: [{ id: "salarie", eyebrow: "a", title: "b", description: "c", image: "audience-1" }] })))
    assert.ok(!accepts(withSection("immersive-hero", { visual: { src: "/images/hero-bilan.jpg", alt: "", position: "left" } })))
    assert.ok(!accepts(withSection("immersive-hero", { position: "left" })))
  })

  test("logo, badge et icône refusés : jamais produits par le modèle", () => {
    assert.ok(!accepts(withSection("immersive-hero", { logo: { src: "/logos/x.png", alt: "", width: 1, height: 1 } })))
    assert.ok(!accepts(withSection("immersive-hero", { badge: { label: "-30 %" } })))
    assert.ok(!accepts(withSection("immersive-hero", { badge: "Nouveau" })))
    assert.ok(!accepts(withSection("editorial-hero", { cta: { ...draftCta, icon: "arrow-right" } })))
    assert.ok(!accepts(withSection("editorial-hero", { icon: "check" })))
  })
})

describe("images : un identifiant du catalogue, jamais un chemin", () => {
  test("les dix identifiants du catalogue sont acceptés", () => {
    for (const image of landingImages) assert.ok(accepts(withSection("editorial-hero", { image: image.id })), image.id)
  })

  test("identifiant inconnu, chemin, src brut ou objet refusés", () => {
    for (const image of ["hero-inconnue", "/images/hero-bilan.jpg", "hero-bilan.jpg", "email-demo-reconversion", "HERO-BILAN", "", null, 3]) {
      assert.ok(!accepts(withSection("editorial-hero", { image })), String(image))
    }
    assert.ok(!accepts(withSection("editorial-hero", { image: { src: "/images/hero-bilan.jpg", alt: "x" } })))
    assert.ok(!accepts(withSection("editorial-hero", { image: { id: "hero-bilan" } })))
    assert.ok(!accepts(withSection("content-carousel", { items: [{ eyebrow: "a", title: "b", image: "/images/content-1.jpg" }] })))
    assert.ok(!accepts(withSection("audience-switcher", { items: [{ eyebrow: "a", title: "b", description: "c", image: { src: "/images/audience-1.jpg", alt: "" } }] })))
    assert.ok(!accepts(withSection("editorial-hero", { src: "/images/hero-bilan.jpg" })))
  })
})

describe("CTA : un libellé et une destination contrôlée", () => {
  test("les huit destinations du catalogue sont acceptées", () => {
    for (const destination of Object.keys(landingDestinations)) assert.ok(accepts(withSection("editorial-hero", { cta: { label: "Voir", destination } })), destination)
  })

  test("destination inconnue, href brut, URL, ancre et position de section refusés", () => {
    for (const destination of ["contact", "https://www.studi.com/fr/formations", "/fr/formations", "#pillars", "section-1", "", "CATALOGUE-FORMATIONS"]) {
      assert.ok(!accepts(withSection("editorial-hero", { cta: { label: "Voir", destination } })), destination)
    }
    assert.ok(!accepts(withSection("editorial-hero", { cta: { label: "Voir", href: "https://www.studi.com/fr/formations" } })))
    assert.ok(!accepts(withSection("editorial-hero", { cta: { label: "Voir", destination: "catalogue-formations", href: "https://exemple.com" } })))
    assert.ok(!accepts(withSection("editorial-hero", { cta: "catalogue-formations" })))
    assert.ok(!accepts(withSection("editorial-hero", { href: "https://exemple.com" })))
  })

  test("CTA obligatoire dans les deux heroes", () => {
    for (const type of ["editorial-hero", "immersive-hero"] as const) {
      assert.ok(!accepts(draftOf(without(draftSection[type](), "cta"))), type)
    }
  })
})

describe("zéro propriété optionnelle", () => {
  const schema = buildLandingDraftJsonSchema(context.sections.map((section) => section.type)) as unknown as Record<string, unknown>
  const objects = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.flatMap(objects)
      : typeof value === "object" && value !== null
        ? [value as Record<string, unknown>, ...Object.values(value).flatMap(objects)]
        : []

  test("dans le JSON Schema, chaque propriété de chaque objet est requise", () => {
    const withProperties = objects(schema).filter((node) => node.type === "object" && node.properties)
    assert.ok(withProperties.length >= 10)
    for (const node of withProperties) {
      assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort())
    }
  })

  test("ni union nullable, ni valeur par défaut : une propriété est présente ou le brouillon est refusé", () => {
    const serialized = JSON.stringify(schema)
    assert.ok(!serialized.includes('"type":"null"') && !serialized.includes('"default"') && !serialized.includes('"nullable"'))
    assert.ok(!safeParseLandingGenerationDraft(withSection("editorial-hero", { supportingText: undefined })).success)
    for (const [type, key] of [["editorial-hero", "supportingText"], ["immersive-hero", "description"], ["value-props", "label"], ["pillars", "eyebrow"], ["pillars", "description"], ["content-carousel", "label"], ["audience-switcher", "label"]] as const) {
      assert.ok(!accepts(draftOf(without(draftSection[type](), key))), `${type}.${key} doit être obligatoire`)
    }
  })

  test("texte vide ou blanc refusé, liste vide refusée", () => {
    for (const text of ["", "   ", "\n\t"]) assert.ok(!accepts(withSection("editorial-hero", { title: text })), JSON.stringify(text))
    assert.ok(!accepts(withSection("value-props", { items: [] })))
    assert.ok(!accepts(withSection("immersive-hero", { headline: [] })))
    assert.ok(!accepts(withSection("immersive-hero", { headline: ["ok", " "] })))
  })
})

describe("schéma restreint aux lames candidates", () => {
  test("même construction que le contrat complet, restreinte, et refusant les autres lames", () => {
    const restricted = buildLandingDraftSchema(["value-props"])
    assert.ok(restricted.safeParse(draftOf(draftSection["value-props"]())).success)
    assert.ok(!restricted.safeParse(validDraft()).success)
    assert.throws(() => buildLandingDraftSchema([]), /Aucune section candidate/)
    assert.ok(LandingGenerationDraftSchema.safeParse(validDraft()).success)
    assert.equal(z.toJSONSchema(LandingGenerationDraftSchema).type, "object")
  })

  test("le contrat Draft n'importe rien du renderer ni des composants", () => {
    const source = readFileSync(join(process.cwd(), "lib/landing/generation-draft.ts"), "utf8")
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]!)
    assert.deepEqual(imports.sort(), ["./destinations", "./image-catalog", "zod"])
  })
})
