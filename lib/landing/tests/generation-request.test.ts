/**
 * Contrat d'entrée de la génération Landing : partir du brief du générateur,
 * sans vocabulaire parallèle.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { emptyGeneratorBrief, generatorObjectives, GeneratorBriefSchema } from "../brief"
import { landingSupportedObjectives, LandingGenerationRequestSchema, safeParseLandingGenerationRequest } from "../generation-request"
import { request } from "./fixtures"

describe("LandingGenerationRequest", () => {
  test("requête valide, avec ou sans faits", () => {
    assert.ok(safeParseLandingGenerationRequest(request).success)
    const withFacts = { ...request, facts: [{ label: "Format", value: "100 % en ligne" }, { value: "Formations diplômantes" }] }
    assert.ok(safeParseLandingGenerationRequest(withFacts).success)
  })

  test("part du brief du générateur : mêmes champs, plus les faits", () => {
    assert.deepEqual(Object.keys(LandingGenerationRequestSchema.shape).sort(), [...Object.keys(GeneratorBriefSchema.shape), "facts"].sort())
  })

  test("objectifs POC : seul discover-trainings est accepté", () => {
    assert.deepEqual([...landingSupportedObjectives], ["discover-trainings"])
    assert.ok(safeParseLandingGenerationRequest({ ...request, objective: "discover-trainings" }).success)
    for (const objective of ["lead-generation", "documentation-download", "contact", "vente"]) {
      assert.equal(safeParseLandingGenerationRequest({ ...request, objective }).success, false, objective)
    }
  })

  test("le formulaire historique connaît toujours les quatre objectifs, et son contrat les accepte", () => {
    const values = generatorObjectives.map((objective) => objective.value)
    assert.deepEqual(values, ["discover-trainings", "lead-generation", "documentation-download", "contact"])
    for (const objective of values) {
      assert.ok(GeneratorBriefSchema.safeParse({ ...request, objective }).success, objective)
      // Tout objectif accepté par la génération existe dans le formulaire.
      assert.ok(landingSupportedObjectives.every((supported) => values.includes(supported)))
    }
  })

  test("un objectif non pris en charge est refusé avec un message explicite", () => {
    const result = safeParseLandingGenerationRequest({ ...request, objective: "contact" })
    assert.ok(!result.success && result.error.issues.some((issue) => issue.path[0] === "objective" && /non pris en charge/.test(issue.message)))
  })

  test("formulaire vide et champs vides invalides", () => {
    assert.equal(safeParseLandingGenerationRequest(emptyGeneratorBrief).success, false)
    for (const key of ["projectName", "brief", "audience", "objective"] as const) {
      assert.equal(safeParseLandingGenerationRequest({ ...request, [key]: "   " }).success, false, key)
      const { [key]: _removed, ...partial } = request
      assert.equal(safeParseLandingGenerationRequest(partial).success, false, `${key} absent`)
    }
  })

  test("invalide : clé inconnue, faits mal formés, trop longs ou trop nombreux, entrée non objet", () => {
    assert.equal(safeParseLandingGenerationRequest({ ...request, className: "x" }).success, false)
    assert.equal(safeParseLandingGenerationRequest({ ...request, facts: [{ value: "" }] }).success, false)
    assert.equal(safeParseLandingGenerationRequest({ ...request, facts: [{ value: "x", html: "<b>" }] }).success, false)
    assert.equal(safeParseLandingGenerationRequest({ ...request, facts: Array.from({ length: 13 }, () => ({ value: "x" })) }).success, false)
    assert.equal(safeParseLandingGenerationRequest({ ...request, brief: "x".repeat(4001) }).success, false)
    for (const input of [null, "brief", [], 42]) assert.equal(safeParseLandingGenerationRequest(input).success, false)
  })

  test("messages d'erreur en français", () => {
    const result = safeParseLandingGenerationRequest({ ...request, projectName: "   " })
    assert.ok(!result.success && result.error.issues.some((issue) => issue.message === "Le nom du projet est requis."))
  })
})
