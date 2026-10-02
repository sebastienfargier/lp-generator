/**
 * Adaptateur du JSON Schema au transport Anthropic : ce qu'il retire, ce qu'il
 * garde, et la preuve que le contrat final n'est jamais relâché.
 *
 * Il est testé sur deux schémas : celui du LandingGenerationDraft, envoyé à
 * Claude, et celui du LandingPageConfig complet, qui ne l'est plus mais reste
 * le cas le plus riche (bornes numériques, unions nullables, optionnelles) :
 * l'adaptateur doit rester sûr pour toute lame future.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { z } from "zod"

import {
  anthropicSchemaLimits,
  isSupportedAnthropicPattern,
  toAnthropicJsonSchema,
  type JsonSchema,
} from "../anthropic-schema"
import { landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { validateGeneratedLanding } from "../generation-validation"
import { LandingPageSchema, LandingPageSectionSchema } from "../schemas"
import { context, draftCta, draftOf, draftSection, page, picture, prompt, props, section, validDraft, validOutput } from "./fixtures"

type Node = { [key: string]: unknown }

/** Tous les noeuds d'un JSON Schema, tables de propriétés comprises. */
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (typeof value !== "object" || value === null) return []
  return [value as Node, ...Object.values(value).flatMap(nodes)]
}

/** Noeuds-schémas seulement : on ne lit pas les clés d'une table `properties` comme des mots-clés. */
function schemaNodes(schema: unknown): Node[] {
  if (Array.isArray(schema)) return schema.flatMap(schemaNodes)
  if (typeof schema !== "object" || schema === null) return []
  const node = schema as Node
  const children: unknown[] = []
  for (const [key, value] of Object.entries(node)) {
    if ((key === "properties" || key === "$defs") && typeof value === "object" && value !== null) children.push(...Object.values(value))
    else if (key === "items" || key === "anyOf" || key === "oneOf" || key === "allOf") children.push(value)
  }
  return [node, ...children.flatMap(schemaNodes)]
}

const keysOf = (schema: unknown) => new Set(schemaNodes(schema).flatMap((node) => Object.keys(node)))
const count = (schema: unknown, key: string) => schemaNodes(schema).filter((node) => key in node).length
const patterns = (schema: unknown) => [...new Set(schemaNodes(schema).flatMap((node) => (typeof node.pattern === "string" ? [node.pattern] : [])))].sort()
const minItems = (schema: unknown) => schemaNodes(schema).flatMap((node) => ("minItems" in node ? [node.minItems] : []))

function complexity(schema: JsonSchema) {
  let optional = 0
  let unions = 0
  for (const node of schemaNodes(schema)) {
    if (node.type === "object" && typeof node.properties === "object" && node.properties !== null) {
      const required = new Set((node.required as string[] | undefined) ?? [])
      optional += Object.keys(node.properties).filter((name) => !required.has(name)).length
    }
    if (node.anyOf || node.oneOf || Array.isArray(node.type)) unions += 1
  }
  return { optional, unions }
}

// Le schéma envoyé à Claude, et le contrat complet : les deux passent par l'adaptateur.
const schemas = {
  draft: prompt.outputSchema as unknown as JsonSchema,
  complet: z.toJSONSchema(LandingPageSchema, { reused: "ref" }) as JsonSchema,
}
const snapshots = { draft: JSON.stringify(schemas.draft), complet: JSON.stringify(schemas.complet) }
const transports = { draft: toAnthropicJsonSchema(schemas.draft), complet: toAnthropicJsonSchema(schemas.complet) }
const names = ["draft", "complet"] as const

describe("oneOf → anyOf", () => {
  test("un oneOf en entrée (l'union des sections), aucun en sortie, remplacé par un anyOf", () => {
    for (const name of names) {
      assert.equal(count(schemas[name], "oneOf"), 1, name)
      assert.equal(count(transports[name], "oneOf"), 0, name)
      assert.ok(!JSON.stringify(transports[name]).includes('"oneOf"'), name)
      assert.equal(count(transports[name], "anyOf"), count(schemas[name], "anyOf") + count(schemas[name], "oneOf"), name)
    }
  })

  test("la conversion est sûre : chaque branche est un objet fermé au discriminant constant et distinct", () => {
    const expected = { draft: ["section", [...landingDraftSectionTypes]], complet: ["type", LandingPageSectionSchema.options.map((option) => option.shape.type.value as string)] } as const
    for (const name of names) {
      const [discriminant, types] = expected[name]
      const defs = transports[name].$defs as Record<string, Node>
      const resolve = (branch: Node): Node => (typeof branch.$ref === "string" ? defs[branch.$ref.split("/").pop()!]! : branch)
      const constOf = (branch: Node) => ((resolve(branch).properties as Record<string, Node> | undefined)?.[discriminant] as Node | undefined)?.const
      const union = schemaNodes(transports[name]).find((node) => Array.isArray(node.anyOf) && (node.anyOf as Node[]).every((branch) => typeof constOf(branch) === "string"))
      assert.ok(union, `${name} : union des sections introuvable`)
      const branches = union.anyOf as Node[]
      for (const branch of branches) assert.equal(resolve(branch).additionalProperties, false)
      const consts = branches.map(constOf)
      assert.equal(new Set(consts).size, consts.length, name)
      assert.deepEqual([...consts].sort(), [...types].sort(), name)
    }
    assert.deepEqual(context.sections.map((entry) => entry.type), [...landingDraftSectionTypes])
  })

  test("oneOf et anyOf sur le même noeud : refusé plutôt que converti à tort", () => {
    assert.throws(() => toAnthropicJsonSchema({ oneOf: [{ type: "string" }], anyOf: [{ type: "number" }] }), /pas sûre/)
  })
})

describe("contraintes non supportées retirées", () => {
  test("numériques : présentes dans le contrat complet (logo), absentes de tout transport", () => {
    const forbidden = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]
    assert.ok(forbidden.some((key) => keysOf(schemas.complet).has(key)))
    for (const name of names) for (const key of forbidden) assert.ok(!keysOf(transports[name]).has(key), `${name} ${key}`)
    // Le type reste : seule la borne disparaît.
    assert.ok(schemaNodes(transports.complet).some((node) => node.type === "integer"))
  })

  test("string : minLength, maxLength, format inconnu retirés ; format supporté gardé", () => {
    const result = toAnthropicJsonSchema({
      type: "object",
      properties: {
        a: { type: "string", minLength: 1, maxLength: 5, format: "idn-hostname" },
        b: { type: "string", format: "date" },
      },
      required: ["a", "b"],
    })
    const { a, b } = result.properties as Record<string, Node>
    assert.deepEqual(a, { type: "string" })
    assert.deepEqual(b, { type: "string", format: "date" })
  })

  test("array : maxItems, uniqueItems, minItems > 1 retirés ; minItems 0 et 1 gardés", () => {
    const array = (extra: Node) => toAnthropicJsonSchema({ type: "array", items: { type: "string" }, ...extra })
    assert.deepEqual(array({ maxItems: 3, uniqueItems: true }), { type: "array", items: { type: "string" } })
    assert.equal(array({ minItems: 2 }).minItems, undefined)
    assert.equal(array({ minItems: 1 }).minItems, 1)
    assert.equal(array({ minItems: 0 }).minItems, 0)
    // Dans les schémas réels, tous les minItems valent 1 sauf un : les cartes de DestinationCards
    // (2 à 3) ; le transport garde les 1 et retire le 2, que Zod continue de faire respecter.
    for (const name of names) {
      const source = minItems(schemas[name]) as number[]
      assert.deepEqual(minItems(transports[name]), source.filter((value) => value <= 1), name)
      assert.ok(source.length > 0 && source.every((value) => value === 1 || value === 2), name)
    }
    assert.equal(minItems(schemas.draft).filter((value) => value === 2).length, 1)
  })

  test("le nom d'une propriété n'est jamais pris pour un mot-clé", () => {
    const result = toAnthropicJsonSchema({
      type: "object",
      properties: { minimum: { type: "string" }, pattern: { type: "string" }, oneOf: { type: "string" } },
      required: ["minimum"],
    })
    assert.deepEqual(Object.keys(result.properties as object), ["minimum", "pattern", "oneOf"])
  })

  test("mots-clés inconnus et méta-clés retirés : liste blanche", () => {
    const result = toAnthropicJsonSchema({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "string", contentEncoding: "base64", propertyNames: {}, deprecated: true })
    assert.deepEqual(result, { type: "string" })
    for (const name of names) assert.ok(!("$schema" in transports[name]), name)
  })
})

describe("ce qui est conservé", () => {
  test("additionalProperties: false sur tout objet, ajouté s'il manque", () => {
    for (const name of names) {
      const objects = schemaNodes(transports[name]).filter((node) => node.type === "object")
      assert.ok(objects.length >= 10, name)
      for (const node of objects) assert.equal(node.additionalProperties, false, name)
    }
    assert.equal(toAnthropicJsonSchema({ type: "object", properties: {}, additionalProperties: true }).additionalProperties, false)
    assert.equal(toAnthropicJsonSchema({ type: "object", properties: {} }).additionalProperties, false)
  })

  test("$ref et $defs conservés, sans référence orpheline", () => {
    for (const name of names) {
      const defs = transports[name].$defs as Record<string, unknown>
      assert.deepEqual(Object.keys(defs), Object.keys(schemas[name].$defs as object), name)
      const refs = nodes(transports[name]).flatMap((node) => (typeof node.$ref === "string" ? [node.$ref] : []))
      assert.equal(refs.length, nodes(schemas[name]).filter((node) => typeof node.$ref === "string").length, name)
      for (const ref of refs) assert.ok(ref.startsWith("#/$defs/") && ref.slice(8) in defs, ref)
    }
  })

  test("const, enum, required, description et title conservés", () => {
    for (const name of names) {
      for (const key of ["const", "enum", "required"]) {
        assert.ok(keysOf(transports[name]).has(key), `${name} ${key}`)
        assert.equal(count(transports[name], key), count(schemas[name], key), `${name} ${key}`)
      }
    }
    assert.deepEqual(toAnthropicJsonSchema({ type: "string", description: "d", title: "t", default: "x" }), { type: "string", description: "d", title: "t", default: "x" })
  })

  test("patterns : seul le pattern compatible est conservé, `\\S` est retiré", () => {
    assert.deepEqual(patterns(schemas.draft), ["\\S"])
    assert.deepEqual(patterns(transports.draft), [])
    assert.deepEqual(patterns(schemas.complet), ["\\S", "^[a-z][a-z0-9-]*$"].sort())
    assert.deepEqual(patterns(transports.complet), ["^[a-z][a-z0-9-]*$"])
  })

  test("sous-ensemble regex : ce qui est supporté, ce qui ne l'est pas", () => {
    for (const pattern of ["^[a-z][a-z0-9-]*$", "^\\d{4}-\\d{2}$", "(a|b)+", "^\\w+\\s?$", "(?:abc)?"]) {
      assert.equal(isSupportedAnthropicPattern(pattern), true, pattern)
    }
    for (const pattern of ["\\S", "\\D+", "\\W", "\\bmot\\b", "(?=x)", "(?!x)", "(?<=x)y", "(?<!x)y", "(a)\\1", "a{1,500}", "a{50}"]) {
      assert.equal(isSupportedAnthropicPattern(pattern), false, pattern)
    }
  })
})

describe("propriétés de la transformation", () => {
  test("déterministe et idempotente", () => {
    for (const name of names) {
      assert.equal(JSON.stringify(toAnthropicJsonSchema(schemas[name])), JSON.stringify(transports[name]), name)
      assert.equal(JSON.stringify(toAnthropicJsonSchema(transports[name])), JSON.stringify(transports[name]), name)
    }
  })

  test("l'outputSchema d'origine n'est pas muté, et ne partage rien avec le transport", () => {
    for (const name of names) {
      assert.equal(JSON.stringify(schemas[name]), snapshots[name], name)
      const copy = toAnthropicJsonSchema(schemas[name])
      const first = (copy.$defs as Record<string, Node>)[Object.keys(copy.$defs as object)[0]!]!
      first.type = "muté"
      for (const node of nodes(copy)) if (Array.isArray(node.enum)) node.enum.push("muté")
      assert.equal(JSON.stringify(schemas[name]), snapshots[name], name)
    }
  })

  test("le schéma envoyé (Draft) : sérialisable, compact, sous les limites documentées, sans optionnelle", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(transports.draft)), transports.draft)
    const { optional, unions } = complexity(transports.draft)
    assert.equal(optional, 0)
    assert.ok(unions <= anthropicSchemaLimits.unionParameters, `unions : ${unions}`)
    assert.ok(JSON.stringify(transports.draft).length < 5000, `taille : ${JSON.stringify(transports.draft).length}`)
  })

  test("le contrat complet dépasse la limite documentée d'optionnelles : pourquoi il n'est plus envoyé", () => {
    assert.ok(complexity(transports.complet).optional > anthropicSchemaLimits.optionalParameters)
    assert.ok(JSON.stringify(transports.complet).length > JSON.stringify(transports.draft).length * 2)
  })
})

describe("le contrat final n'est jamais relâché", () => {
  describe("brouillon", () => {
    // Le schéma de transport rejoué comme validateur : ce qu'Anthropic contraint à la génération.
    const relaxed = z.fromJSONSchema(transports.draft as Parameters<typeof z.fromJSONSchema>[0])
    const accepted = (output: unknown) => relaxed.safeParse(output).success

    test("un brouillon valide passe le schéma relâché et le contrat du brouillon", () => {
      assert.ok(accepted(validDraft()))
      assert.ok(safeParseLandingGenerationDraft(validDraft()).success)
      for (const type of Object.keys(draftSection) as (keyof typeof draftSection)[]) assert.ok(accepted(draftOf(draftSection[type]())), type)
    })

    test("le schéma de transport garde ses garde-fous structurels", () => {
      const hero = draftSection["editorial-hero"]()
      for (const bad of [
        { ...validDraft(), version: 1 },
        draftOf({ ...hero, className: "x" }),
        draftOf({ ...hero, section: "product-grid" }),
        draftOf({ ...hero, image: "/images/hero-bilan.jpg" }),
        draftOf({ ...hero, image: "hero-inconnue" }),
        draftOf({ ...hero, cta: { ...draftCta, destination: "https://www.studi.com/fr/formations" } }),
        draftOf({ ...hero, cta: { label: "Voir", href: "https://www.studi.com/fr/formations" } }),
        draftOf({ ...hero, supportingText: undefined }),
        draftOf({ ...draftSection["audience-switcher"](), defaultValue: "x" }),
        { sections: [] },
        {},
      ]) {
        assert.equal(accepted(bad), false, JSON.stringify(bad))
        assert.equal(safeParseLandingGenerationDraft(bad).success, false, JSON.stringify(bad))
      }
    })

    test("accepté par le schéma relâché mais refusé par Zod : texte vide ou blanc (`\\S` n'est pas transporté)", () => {
      const hero = draftSection["editorial-hero"]()
      for (const bad of [
        draftOf({ ...hero, title: "   " }),
        draftOf({ ...hero, title: "" }),
        draftOf({ ...hero, cta: { ...draftCta, label: "\n" } }),
        draftOf({ ...draftSection["immersive-hero"](), headline: ["ok", " "] }),
        draftOf({ ...draftSection.pillars(), items: [{ title: "a", description: "  " }] }),
      ]) {
        assert.ok(accepted(bad), `le schéma relâché devrait l'accepter : ${JSON.stringify(bad)}`)
        assert.equal(safeParseLandingGenerationDraft(bad).success, false, `Zod devrait le refuser : ${JSON.stringify(bad)}`)
      }
    })
  })

  describe("contrat complet (cas le plus riche)", () => {
    const relaxed = z.fromJSONSchema(transports.complet as Parameters<typeof z.fromJSONSchema>[0])
    const accepted = (output: unknown) => relaxed.safeParse(output).success
    const rejectedByFinal = (output: unknown) => validateGeneratedLanding(output, context).status === "invalid"

    test("une réponse valide passe le schéma relâché et la validation finale", () => {
      assert.ok(accepted(validOutput()))
      assert.equal(validateGeneratedLanding(validOutput(), context).status, "valid")
    })

    test("accepté par le schéma relâché mais invalide pour Zod : toujours rejeté par validateGeneratedLanding", () => {
      const hero = section("hero", "editorial-hero", props["editorial-hero"]())
      const cases: [string, unknown][] = [
        // Refinements de page : jamais exprimables en JSON Schema.
        ["ids de section en double", page([section("bloc", "pillars", props.pillars()), section("bloc", "value-props", props["value-props"]())])],
        ["hero qui n'est pas en tête", page([section("atouts", "value-props", props["value-props"]()), hero])],
        ["deux heroes", page([hero, section("autre", "editorial-hero", props["editorial-hero"]())])],
        ["ancre sans cible", page([section("hero", "editorial-hero", { ...props["editorial-hero"](), primaryAction: { label: "Aller", href: "#absente" } })])],
        ["audiences en double", page([section("profils", "audience-switcher", { items: [1, 2].map(() => ({ id: "actifs", eyebrow: "A", title: "B", description: "C", image: picture() })) })])],
        ["defaultValue sans audience", page([section("profils", "audience-switcher", { defaultValue: "absent", items: [{ id: "actifs", eyebrow: "A", title: "B", description: "C", image: picture() }] })])],
        // Contraintes retirées du transport : `\S` (texte vide) et bornes numériques.
        ["titre fait d'espaces", page([section("hero", "editorial-hero", { ...props["editorial-hero"](), title: "   " })])],
        ["largeur de logo négative", page([section("hero", "immersive-hero", { headline: ["x"], visual: picture(), logo: { ...picture(), width: -5, height: 0 } })])],
      ]
      for (const [name, output] of cases) {
        assert.ok(accepted(output), `${name} : le schéma relâché devrait l'accepter`)
        assert.ok(rejectedByFinal(output), `${name} : la validation finale devrait le rejeter`)
      }
    })
  })
})
