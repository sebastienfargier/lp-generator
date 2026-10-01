/**
 * Prompt de génération Landing et schéma de sortie, sans réseau : union
 * discriminée, déterminisme, schéma dérivé de LandingPageSchema.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { z } from "zod"

import {
  assessLandingComposability,
  buildLandingAiPrompt,
  buildLandingOutputJsonSchema,
  buildLandingOutputSchema,
  landingSystemPrompt,
} from "../ai-prompt"
import { emptyGeneratorBrief } from "../brief"
import { LandingPageSchema } from "../schemas"
import { context, prompt, request, validOutput } from "./fixtures"

type Node = { [key: string]: unknown }

/** Tous les noeuds d'un JSON Schema (objets), pour l'inspection. */
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (typeof value !== "object" || value === null) return []
  return [value as Node, ...Object.values(value).flatMap(nodes)]
}

const schema = prompt.outputSchema as unknown as Node
const serialized = JSON.stringify(schema)
const count = (pattern: RegExp) => (serialized.match(pattern) ?? []).length

describe("buildLandingAiPrompt", () => {
  test("ready sur un brief valide, avec system, user, contexte et schéma", () => {
    assert.equal(prompt.status, "ready")
    assert.deepEqual(Object.keys(prompt), ["status", "request", "context", "system", "user", "outputSchema"])
    assert.equal(prompt.system, landingSystemPrompt)
  })

  test("invalid-request sur entrée invalide, avec chemins lisibles", () => {
    for (const input of [emptyGeneratorBrief, null, "brief", { ...request, objective: "vente" }, { ...request, className: "x" }]) {
      const result = buildLandingAiPrompt(input)
      assert.equal(result.status, "invalid-request")
      if (result.status === "invalid-request") assert.ok(result.issues.length > 0 && result.issues.every((issue) => issue.path && issue.message))
    }
  })

  test("invalid-request : les objectifs sans ressource contrôlée ne sont pas acceptés", () => {
    for (const objective of ["lead-generation", "documentation-download", "contact"]) {
      const result = buildLandingAiPrompt({ ...request, objective })
      assert.equal(result.status, "invalid-request", objective)
      if (result.status === "invalid-request") assert.ok(result.issues.some((issue) => issue.path === "objective"))
    }
  })

  test("impossible : seulement sans aucune section candidate, jamais pour un brief court", () => {
    assert.deepEqual(assessLandingComposability(context), [])
    assert.equal(buildLandingAiPrompt({ ...request, brief: "RH" }).status, "ready")
    assert.equal(buildLandingAiPrompt({ ...request, brief: "RH", audience: "x" }).status, "ready")
    assert.equal(assessLandingComposability({ ...context, sections: [] }).length, 1)
  })

  test("déterministe : même requête, même contexte, même prompt, même schéma", () => {
    const again = buildLandingAiPrompt({ ...request })
    assert.equal(again.status, "ready")
    if (again.status !== "ready") return
    assert.equal(again.system, prompt.system)
    assert.equal(again.user, prompt.user)
    assert.equal(JSON.stringify(again.context), JSON.stringify(prompt.context))
    assert.equal(JSON.stringify(again.outputSchema), JSON.stringify(prompt.outputSchema))
  })

  test("message utilisateur : { request, context } en JSON, sans répéter le système", () => {
    assert.deepEqual(JSON.parse(prompt.user), { request: prompt.request, context: prompt.context })
    assert.ok(!prompt.user.includes("Tu es un moteur"))
    assert.deepEqual(JSON.parse(JSON.stringify(prompt.outputSchema)), prompt.outputSchema)
  })

  test("tailles mesurées et bornées : système compact, schéma non recopié dans le prompt", () => {
    assert.ok(prompt.system.length < 2500, `système : ${prompt.system.length}`)
    assert.ok(prompt.user.length < 10000, `user : ${prompt.user.length}`)
    assert.ok(serialized.length < 8000, `schéma : ${serialized.length}`)
    assert.ok(!/\$defs|additionalProperties|oneOf|"type":"object"/.test(prompt.system))
  })

  test("le système présente l'alt du catalogue comme une suggestion", () => {
    assert.match(prompt.system, /alt est une suggestion/)
    assert.ok(context.rules.resources.some((entry) => /alt est une suggestion/.test(entry.rule)))
  })

  test("le système interdit HTML, JSX, CSS, className, style et les inventions", () => {
    for (const word of ["HTML", "JSX", "React", "CSS", "Tailwind", "className", "style", "URL", "request.facts"]) {
      assert.ok(prompt.system.includes(word), word)
    }
  })

  test("aucun HTML, JSX ni CSS dans les ressources fournies", () => {
    const resources = JSON.stringify({ images: context.images, destinations: context.destinations, rules: context.rules })
    assert.ok(!/<\/?[a-z]|className|tailwind|style=|\{\{|=>/i.test(resources))
  })
})

describe("schéma de sortie", () => {
  test("dérivé de LandingPageSchema : mêmes champs de page, sections restreintes", () => {
    const restricted = buildLandingOutputSchema(context.sections.map((section) => section.type))
    assert.deepEqual(Object.keys(restricted.shape), Object.keys(LandingPageSchema.shape))
    assert.ok(restricted.safeParse(validOutput()).success)
    assert.ok(LandingPageSchema.safeParse(validOutput()).success)
    assert.deepEqual(buildLandingOutputJsonSchema(context.sections.map((section) => section.type)), prompt.outputSchema)
  })

  test("sections du schéma = sections candidates, pas les sections commerciales", () => {
    const consts = nodes(schema).flatMap((node) => (typeof node.const === "string" ? [node.const] : []))
    for (const type of context.sections.map((section) => section.type)) assert.ok(consts.includes(type), type)
    assert.ok(!consts.includes("product-hero") && !consts.includes("product-grid"))
    const stricter = buildLandingOutputSchema(["value-props"])
    assert.equal(stricter.safeParse(validOutput()).success, false)
    assert.throws(() => buildLandingOutputSchema([]), /Aucune section candidate/)
  })

  test("inspection : un oneOf (sections), un anyOf (icône nullable), pas de allOf, patterns connus", () => {
    assert.equal(count(/"oneOf"/g), 1)
    assert.equal(count(/"anyOf"/g), 1)
    assert.equal(count(/"allOf"/g), 0)
    const patterns = [...new Set(nodes(schema).flatMap((node) => (typeof node.pattern === "string" ? [node.pattern] : [])))]
    assert.deepEqual(patterns.sort(), ["\\S", "^[a-z][a-z0-9-]*$"].sort())
  })

  test("inspection : tout objet est fermé (additionalProperties: false)", () => {
    const objects = nodes(schema).filter((node) => node.type === "object")
    assert.ok(objects.length > 15)
    for (const node of objects) assert.equal(node.additionalProperties, false)
  })

  test("limites : ce que JSON Schema n'exprime pas reste à Zod", () => {
    const restricted = buildLandingOutputSchema(context.sections.map((section) => section.type))
    const hero = validOutput().sections[0] as { props: object }
    // Ids en double, deux heroes, ancre sans cible : acceptés par le schéma, refusés par Zod.
    const duplicate = { ...validOutput(), sections: [hero, hero] }
    const anchor = { ...validOutput(), sections: [{ ...hero, props: { ...hero.props, primaryAction: { label: "Aller", href: "#absente" } } }] }
    for (const output of [duplicate, anchor]) {
      assert.ok(restricted.safeParse(output).success)
      assert.equal(LandingPageSchema.safeParse(output).success, false)
    }
    assert.equal(z.toJSONSchema(LandingPageSchema, { reused: "ref" }).type, "object")
  })
})
