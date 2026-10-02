/**
 * Prompt de génération Landing et schéma de sortie, sans réseau : union
 * discriminée, déterminisme, schéma dérivé du LandingGenerationDraft, et vue
 * du contexte qui ne montre pas au modèle ce que le résolveur ajoute.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  assessLandingComposability,
  buildLandingAiPrompt,
  buildLandingPromptContext,
  landingSystemPrompt,
} from "../ai-prompt"
import { emptyGeneratorBrief } from "../brief"
import { buildLandingDraftJsonSchema, buildLandingDraftSchema, LandingGenerationDraftSchema } from "../generation-draft"
import { context, draftOf, draftSection, prompt, request, validDraft } from "./fixtures"

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
const candidates = context.sections.map((section) => section.type)
const view = buildLandingPromptContext(context)

describe("buildLandingAiPrompt", () => {
  test("ready sur un brief valide, avec system, user, contexte et schéma", () => {
    assert.equal(prompt.status, "ready")
    assert.deepEqual(Object.keys(prompt), ["status", "request", "context", "system", "user", "outputSchema", "transportSchema"])
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

  test("message utilisateur : { request, vue du contexte } en JSON, sans répéter le système", () => {
    assert.deepEqual(JSON.parse(prompt.user), { request: prompt.request, context: view })
    assert.ok(!prompt.user.includes("Tu es un moteur"))
    assert.deepEqual(JSON.parse(JSON.stringify(prompt.outputSchema)), prompt.outputSchema)
  })

  test("tailles mesurées et bornées : système compact, schéma non recopié dans le prompt", () => {
    assert.ok(prompt.system.length < 2500, `système : ${prompt.system.length}`)
    // Budget de régression du CONTEXTE STATIQUE (la vue IA : lames, règles, ressources), pas du message
    // entier : `request` varie avec le brief (jusqu'à environ 8 000 caractères) et ne doit pas faire échouer
    // un test. Baseline V2 avant CampaignSpotlight : 9 013. CampaignSpotlight est une vraie candidate
    // structurée (entrée d'environ 730 caractères) : budget relevé ponctuellement à 9 800 (mesuré : 9 744).
    // Il reste un garde-fou de régression : toute nouvelle lame doit le relever en connaissance de cause.
    // Voir ai-view.test.ts pour l'indépendance vis-à-vis de `request`.
    assert.ok(JSON.stringify(view).length < 9800, `contexte statique : ${JSON.stringify(view).length}`)
    assert.equal(prompt.user.length, JSON.stringify({ request: prompt.request, context: view }).length)
    // Budget du schéma : politique structurelle (branche, plafond proportionnel, sanité) dans
    // anthropic-schema.test.ts ; ici seulement la sanité : le Draft reste très en dessous du contrat complet.
    assert.ok(serialized.length < 8000, `schéma : ${serialized.length}`)
    assert.ok(!/\$defs|additionalProperties|oneOf|"type":"object"/.test(prompt.system))
  })
})

describe("ce que le modèle voit", () => {
  test("le système présente un LandingGenerationDraft et la désignation par id", () => {
    assert.match(prompt.system, /LandingGenerationDraft/)
    assert.match(prompt.system, /id, pris dans context\.images/)
    assert.match(prompt.system, /id, pris dans context\.destinations/)
    assert.match(prompt.system, /tu n'écris aucun lien/)
  })

  test("le système interdit HTML, JSX, CSS, className, style et les inventions", () => {
    for (const word of ["HTML", "JSX", "React", "CSS", "Tailwind", "className", "style", "request.facts"]) {
      assert.ok(prompt.system.includes(word), word)
    }
  })

  test("vue du contexte : id et hint des images, id et usage des destinations, une entrée par candidate", () => {
    assert.deepEqual(view.images, context.images.map(({ id, hint }) => ({ id, hint })))
    assert.deepEqual(view.destinations, context.destinations.map(({ id, usage }) => ({ id, usage })))
    assert.deepEqual(view.sections.map((section) => section.type), context.sections.map((section) => section.type))
    assert.equal(view.images.length, 10)
    assert.equal(view.destinations.length, 8)
  })

  test("ni chemin d'image, ni URL, ni cadrage, ni règles d'ids et d'ancres : les détails du résolveur restent cachés", () => {
    // Ressources et règles : tout ce que l'application contrôle. (Les descriptions de sections viennent
    // du catalogue ; hero-selection.test.ts vérifie qu'aucune ne cite un badge ou un logo impossible à produire.)
    const seen = JSON.stringify({ images: view.images, destinations: view.destinations, rules: view.rules })
    assert.ok(!/\/images\/|https?:\/\/|"src"|"url"|"href"|"alt"|"subject"|"position"|"version"|defaultValue|"logo"|"badge"|"icon"/i.test(seen), seen.slice(0, 200))
    assert.ok(!/\bhref\b|\bsrc\b|\balt\b|\bversion\b|ancre|\bposition\b|defaultValue|\blogo\b|\bbadge\b|icône/i.test(prompt.system))
    // Les règles d'ids et d'ancres ne sont pas dans la liste blanche de la vue ; le contexte complet les garde.
    const ruleTexts = [...view.rules.composition, ...view.rules.resources].join("\n")
    assert.ok(!/#|ids de section|ancre/i.test(ruleTexts), ruleTexts)
    assert.ok(context.rules.composition.some((entry) => entry.id === "internal-anchors"), "le contexte complet garde la règle")
  })

  test("le contexte complet reste celui de l'application : il garde src, url et subject pour la résolution", () => {
    assert.ok(context.images.every((image) => image.src && image.alt && image.subject))
    assert.ok(context.destinations.every((destination) => destination.url.startsWith("https://")))
    assert.equal(prompt.context, prompt.context)
    assert.deepEqual(prompt.context, context)
  })

  test("aucun HTML, JSX ni CSS dans les ressources fournies", () => {
    const resources = JSON.stringify({ images: view.images, destinations: view.destinations, rules: view.rules })
    assert.ok(!/<\/?[a-z]|className|tailwind|style=|\{\{|=>/i.test(resources))
  })
})

describe("schéma de sortie : le LandingGenerationDraft", () => {
  test("dérivé du Draft Zod, restreint aux lames candidates, sans schéma parallèle", () => {
    assert.deepEqual(buildLandingDraftJsonSchema(candidates), prompt.outputSchema)
    const restricted = buildLandingDraftSchema(candidates)
    assert.ok(restricted.safeParse(validDraft()).success)
    assert.ok(LandingGenerationDraftSchema.safeParse(validDraft()).success)
    assert.deepEqual(Object.keys(schema.properties as object), ["sections"])
  })

  test("les sections du schéma sont exactement les candidates, discriminées par `section`", () => {
    const consts = nodes(schema).flatMap((node) => (typeof node.const === "string" ? [node.const] : []))
    assert.deepEqual([...consts].sort(), [...candidates].sort())
    assert.ok(!consts.includes("product-hero") && !consts.includes("product-grid"))
    const stricter = buildLandingDraftSchema(["value-props"])
    assert.equal(stricter.safeParse(validDraft()).success, false)
    assert.ok(stricter.safeParse(draftOf(draftSection["value-props"]())).success)
    assert.throws(() => buildLandingDraftSchema([]), /Aucune section candidate/)
  })

  test("le schéma complet de LandingPageConfig n'est plus le schéma de sortie", () => {
    const keys = new Set(nodes(schema).flatMap((node) => Object.keys((node.properties as object) ?? {})))
    for (const technical of ["version", "id", "props", "type", "visual", "primaryAction", "href", "src", "alt", "logo", "badge", "icon", "position", "defaultValue"]) {
      assert.ok(!keys.has(technical), technical)
    }
    for (const editorial of ["section", "sections", "image", "cta", "destination", "label", "title", "items"]) assert.ok(keys.has(editorial), editorial)
  })

  test("inspection : un oneOf (sections), pas d'anyOf ni de allOf, un seul pattern (`\\S`)", () => {
    assert.equal(count(/"oneOf"/g), 1)
    assert.equal(count(/"anyOf"/g), 0)
    assert.equal(count(/"allOf"/g), 0)
    const patterns = [...new Set(nodes(schema).flatMap((node) => (typeof node.pattern === "string" ? [node.pattern] : [])))]
    assert.deepEqual(patterns, ["\\S"])
  })

  test("inspection : tout objet est fermé, aucune propriété optionnelle", () => {
    const objects = nodes(schema).filter((node) => node.type === "object")
    assert.ok(objects.length >= 10)
    for (const node of objects) assert.equal(node.additionalProperties, false)
    for (const node of objects.filter((object) => object.properties)) {
      assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort())
    }
  })

  test("les ressources sont des énumérations : images et destinations ne peuvent pas être inventées", () => {
    const enums = nodes(schema).flatMap((node) => (Array.isArray(node.enum) ? [node.enum as string[]] : []))
    assert.ok(enums.some((values) => values.length === 10 && values.includes("hero-bilan")))
    assert.ok(enums.some((values) => values.length === 8 && values.includes("catalogue-formations")))
  })
})
