/**
 * Draft Email : strict, petit, sans shell ni ressource libre ; sa grammaire
 * potentielle (JSON Schema de sortie structurée) est mesurée par des proxies.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailBlockManifest } from "../manifest"
import {
  buildEmailDraftJsonSchema,
  emailDraftBodyTypes,
  emailDraftDestinations,
  emailDraftHeroBlocks,
  emailDraftIcons,
  emailDraftImageIds,
  safeParseEmailGenerationDraft,
} from "../generation-draft"
import { emailDestinations } from "../destinations"
import { emailIconNames } from "../manifest"
import { emailImageBlocks, emailImageIds } from "../image-catalog"
import { bodyFixtures, draftWith, referenceDraft } from "./draft-fixtures"

const accepts = (draft: unknown) => safeParseEmailGenerationDraft(draft).success
const block = (index: number) => referenceDraft.blocks[index]!
const withBlocks = (...blocks: unknown[]) => ({ ...referenceDraft, blocks })
const hero = block(0) as typeof referenceDraft.blocks[0] & { type: "hero" }
const messagesOf = (draft: unknown) => {
  const parsed = safeParseEmailGenerationDraft(draft)
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`)
}

describe("Draft Email : forme", () => {
  test("la fixture de référence est acceptée ; sept types de blocs : un hero, six de corps", () => {
    assert.ok(accepts(referenceDraft))
    assert.deepEqual(emailDraftBodyTypes, ["steps", "grid", "icons", "text", "feature", "cta"])
    for (const body of Object.values(bodyFixtures)) assert.ok(accepts(draftWith("canape-lumiere", body)), body.type)
  })

  test("racine : exactement subject, preheader et blocks", () => {
    assert.deepEqual(Object.keys(referenceDraft), ["subject", "preheader", "blocks"])
    for (const key of ["subject", "preheader", "blocks"] as const) {
      const rest = Object.fromEntries(Object.entries(referenceDraft).filter(([name]) => name !== key))
      assert.equal(accepts(rest), false, key)
    }
    assert.equal(accepts({ ...referenceDraft, id: "x" }), false)
    assert.equal(accepts({ ...referenceDraft, surface: "marque" }), false)
  })

  test("type de bloc inconnu et champ inconnu rejetés, à tous les niveaux", () => {
    assert.equal(accepts(withBlocks(hero, { type: "banner", title: "x", text: "y" })), false)
    assert.equal(accepts(withBlocks(hero, { ...block(1), extra: "x" })), false)
    assert.equal(accepts(withBlocks({ ...hero, extra: "x" }, block(1))), false)
    assert.equal(accepts(withBlocks(hero, { ...block(2), cta: { ...(block(2) as { cta: object }).cta, extra: "x" } })), false)
  })

  test("le shell ne se décide pas : header, footer, mentions légales, preheader sont des types inconnus", () => {
    for (const type of ["header", "footer", "legal", "legal-disclaimer", "preheader", "email-module-footer-compact-legal", "email-module-header-newsletter", "email-module-text-only"]) {
      assert.equal(accepts(withBlocks(hero, { type, title: "x", text: "y" })), false, type)
    }
  })

  test("aucune URL, src, alt, surface, HTML, classe ni jeton dans le vocabulaire du Draft", () => {
    const serialized = JSON.stringify(buildEmailDraftJsonSchema())
    for (const word of ["href", "src", "alt", "url", "surface", "html", "className", "style", "token", "disclaimer", "endDate"]) {
      assert.ok(!new RegExp(`"${word}"`, "i").test(serialized), word)
    }
    // Ajouter ces champs à un bloc est refusé.
    for (const [key, value] of [["src", "https://x.invalid/a.jpg"], ["alt", "x"], ["surface", "marque"], ["href", "https://studi.com"], ["html", "<p>x</p>"], ["className", "x"]]) {
      assert.equal(accepts(withBlocks({ ...hero, [key!]: value }, block(1))), false, key)
    }
  })

  test("textes : non vides ; items : cardinalités fixes (3, 4, 3)", () => {
    assert.equal(accepts({ ...referenceDraft, subject: "  " }), false)
    assert.equal(accepts({ ...referenceDraft, preheader: "" }), false)
    assert.equal(accepts(withBlocks({ ...hero, title: " " }, block(1))), false)
    assert.equal(accepts(withBlocks(hero, { ...bodyFixtures.grid, items: bodyFixtures.grid.items.slice(0, 3) })), false)
    assert.equal(accepts(withBlocks(hero, { ...(block(1) as { items: unknown[] }), items: [] })), false)
    assert.equal(accepts(withBlocks(hero, { ...bodyFixtures.icons, items: bodyFixtures.icons.items.slice(0, 2) })), false)
  })

  test("composition : hero en premier et seul ; un à quatre blocs de corps, chaque type une fois, un seul bouton de corps", () => {
    assert.equal(accepts({ ...referenceDraft, blocks: [hero] }), false, "hero seul")
    assert.equal(accepts(withBlocks(block(1), hero)), false, "hero pas premier")
    assert.equal(accepts(withBlocks(hero, hero)), false, "deux heroes")
    assert.equal(accepts(withBlocks(hero, block(1), block(1))), false, "type en double")
    assert.equal(accepts(withBlocks(hero, bodyFixtures.feature, block(2))), false, "deux boutons de corps")
    assert.equal(accepts(withBlocks(hero, block(1), bodyFixtures.icons, bodyFixtures.grid, bodyFixtures.text)), true, "quatre blocs de corps")
    assert.equal(accepts(withBlocks(hero, block(1), bodyFixtures.icons, bodyFixtures.grid, bodyFixtures.text, block(2))), false, "cinq blocs de corps")
    assert.ok(messagesOf(withBlocks(hero, hero)).some((message) => message.includes("hero")))
  })
})

describe("Draft Email : ressources par identifiant", () => {
  test("image : seulement les photos dont la lame est un hero V1 ; inconnue ou incompatible rejetée", () => {
    assert.deepEqual([...emailDraftImageIds], ["tablette-interieur", "ecouteur-exterieur", "canape-lumiere"])
    for (const id of emailDraftImageIds) assert.ok(emailImageBlocks(id).every((type) => (emailDraftHeroBlocks as readonly string[]).includes(type)), id)
    assert.ok(emailImageIds.includes("duo-ciel-bleu" as never) && !emailDraftImageIds.includes("duo-ciel-bleu" as never), "la photo « promotion » (offre avec code) est exclue")
    for (const image of ["duo-ciel-bleu", "inconnue", "reconversion", "black-friday", "", "/images/email-demo-evolution.jpg", "https://demo-assets.invalid/email-demo-evolution.jpg"]) {
      assert.equal(accepts(withBlocks({ ...hero, image }, block(1))), false, image)
    }
  })

  test("destination : seulement un identifiant du catalogue des destinations ; aucune URL, chemin, Liquid ni placeholder", () => {
    for (const id of emailDraftDestinations) assert.ok(id in emailDestinations, id)
    assert.ok(!(emailDraftDestinations as readonly string[]).includes("parcours-decouverte"), "lien texte secondaire uniquement")
    const cta = (destination: string) => withBlocks({ ...hero, cta: { label: "Voir", destination } }, block(1))
    for (const destination of [
      "inconnue",
      "https://www.studi.com/fr/formations",
      "/fr/formations",
      "{{ url }}",
      "[URL À CONFIRMER]",
      "javascript:alert(1)",
      "data:text/html,x",
      "http://www.studi.com",
      "studi-meet",
      "parcours-decouverte",
      "ingenieur-informatique",
    ]) {
      assert.equal(accepts(cta(destination)), false, destination)
    }
    for (const destination of emailDraftDestinations) assert.ok(accepts(cta(destination)), destination)
  })

  test("icône : huit sens sur les quarante du catalogue", () => {
    assert.equal(emailDraftIcons.length, 8)
    for (const icon of emailDraftIcons) assert.ok((emailIconNames as readonly string[]).includes(icon), icon)
    const icons = (icon: string) => withBlocks(hero, { ...bodyFixtures.icons, items: bodyFixtures.icons.items.map((entry, index) => (index === 0 ? { ...entry, icon } : entry)) })
    assert.equal(accepts(icons("rocket-launch")), false)
    assert.equal(accepts(icons("[URL_CDN_ICONE:users]")), false)
    assert.ok(accepts(icons("graduation-cap")))
  })

  test("vocabulaire V1 : chaque type de bloc correspond à une lame du manifeste ; hero offre et quiz exclus", () => {
    for (const type of emailDraftHeroBlocks) assert.ok(type in emailBlockManifest, type)
    assert.ok(!(emailDraftHeroBlocks as readonly string[]).includes("email-module-hero-offer-image-top"))
    assert.ok(!(emailDraftHeroBlocks as readonly string[]).includes("email-module-hero-diagnostic-quiz"))
  })
})

/* -------------------------------------------------------------------------- */
/* Grammaire : proxies de complexité (pas la limite d'Anthropic, inconnue)    */
/* -------------------------------------------------------------------------- */

type JsonSchema = Record<string, unknown>

/** Mesure d'un JSON Schema avec ses `$ref` dépliés (les `$defs` ne comptent qu'à l'usage). */
function measure(schema: JsonSchema) {
  const defs = (schema.$defs ?? {}) as Record<string, unknown>
  const counts = { objects: 0, properties: 0, optional: 0, enums: 0, enumValues: 0, constants: 0, patterns: 0, unions: 0, alternatives: 0, depth: 0 }
  const walk = (node: unknown, depth: number): void => {
    if (Array.isArray(node)) return void node.forEach((entry) => walk(entry, depth))
    if (!node || typeof node !== "object") return
    const object = node as Record<string, unknown>
    counts.depth = Math.max(counts.depth, depth)
    if (typeof object.$ref === "string" && object.$ref.startsWith("#/$defs/")) return walk(defs[object.$ref.slice(8)], depth)
    if (object.properties && typeof object.properties === "object") {
      const keys = Object.keys(object.properties)
      counts.objects += 1
      counts.properties += keys.length
      counts.optional += keys.length - ((object.required as string[] | undefined)?.length ?? 0)
    }
    if (Array.isArray(object.enum)) {
      counts.enums += 1
      counts.enumValues += object.enum.length
    }
    if (object.const !== undefined) counts.constants += 1
    if (object.pattern) counts.patterns += 1
    const union = (object.anyOf ?? object.oneOf) as unknown[] | undefined
    if (union) {
      counts.unions += 1
      counts.alternatives += union.length
    }
    for (const [key, value] of Object.entries(object)) if (key !== "$defs") walk(value, depth + 1)
  }
  walk(schema, 0)
  const inline = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(inline)
    if (!node || typeof node !== "object") return node
    const object = node as Record<string, unknown>
    if (typeof object.$ref === "string" && object.$ref.startsWith("#/$defs/")) return inline(defs[object.$ref.slice(8)])
    return Object.fromEntries(Object.entries(object).filter(([key]) => key !== "$defs").map(([key, value]) => [key, inline(value)]))
  }
  return { ...counts, bytes: JSON.stringify(schema).length, expandedBytes: JSON.stringify(inline(schema)).length }
}

describe("Draft Email : complexité de la grammaire potentielle", () => {
  const schema = buildEmailDraftJsonSchema() as JsonSchema
  const m = measure(schema)

  test("le JSON Schema est pur, sérialisable et déterministe", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(schema)), schema)
    assert.deepEqual(buildEmailDraftJsonSchema(), schema)
    assert.equal(schema.additionalProperties, false)
  })

  test("aucune propriété optionnelle, aucun pattern regex : tout est requis, comme Landing V2h", () => {
    assert.equal(m.optional, 0)
    assert.equal(m.patterns, 0)
  })

  test("budget des proxies (mesuré : 3 336 octets, 3 531 dépliés, 14 objets, 45 propriétés, 7 alternatives)", () => {
    assert.equal(m.alternatives, 7)
    assert.equal(m.unions, 1)
    assert.ok(m.objects <= 16, `objets : ${m.objects}`)
    assert.ok(m.properties <= 52, `propriétés : ${m.properties}`)
    assert.ok(m.bytes <= 4000, `octets : ${m.bytes}`)
    assert.ok(m.expandedBytes <= 4200, `octets dépliés : ${m.expandedBytes}`)
    assert.ok(m.enumValues <= 50, `valeurs d'enum : ${m.enumValues}`)
    assert.ok(m.depth <= 10, `profondeur : ${m.depth}`)
  })

  test("bien en dessous de l'EmailConfig direct (11 lames candidates minimum : 8 380 octets, 70 objets, 147 propriétés)", () => {
    assert.ok(m.bytes < 8380 / 2)
    assert.ok(m.objects < 70 / 4)
    assert.ok(m.properties < 147 / 3)
  })

  test("dans l'ordre de grandeur du Landing V2h accepté (6 alternatives, 12 objets, 42 propriétés, ~3 425 dépliés), sous le Landing direct rejeté (~5 378)", () => {
    assert.ok(m.expandedBytes < 5378)
    assert.ok(m.alternatives <= 6 + 2 && m.objects <= 12 + 6 && m.properties <= 42 + 12)
  })
})

test("module autonome : ni Landing, ni Anthropic, ni réseau", () => {
  const source = readFileSync(join(process.cwd(), "lib/email/generation-draft.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  assert.ok(!/landing|anthropic|fetch\(|node:fs/i.test(source))
})
