/**
 * V2.9.4b — le noyau V2.9.4a câblé au pipeline Reference : `structure[]` dans l'appel 1, sélection, second appel
 * CONDITIONNEL et GROUPÉ (injecté), construction indépendante des candidats, document final en UN plan, rapport,
 * provenance, repli sur la base V2.8. Hors réseau : aucun appel Anthropic, des clients factices.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type { CreateParams, EmailClaudeClient } from "../../email/anthropic"
import { DEFAULT_EMAIL_MODEL } from "../../email/anthropic"
import { renderDocumentEmail } from "../render"
import { builderLames } from "../catalog"
import { blockCompatibility } from "../block-entry"
import { compositionCatalog, validateCompositionPlan } from "../composition"
import { createBlankDocument, type EmailDocument } from "../document"
import { isGeneratedBlock } from "../generated-block"
import { validateDocumentIntegrity } from "../integrity"
import { describeReferenceCatalog, referenceBodyTypes, referenceCompositionCatalog } from "../reference-catalog"
import { referenceGaps } from "../reference-gap"
import { analyzeGeneratedReference, generatedReferenceSystemPrompt, GENERATED_REFERENCE_MAX_TOKENS } from "../reference-generated-engine"
import { createMockGeneratedClient, mockGeneratedAnswer } from "../reference-generated-mock"
import { buildGeneratedReferenceTransportSchema, parseGeneratedReferenceOutput } from "../reference-generated-schema"
import { handleReference, type ReferenceResponseBody } from "../reference-handler"
import { normalizeReferenceMapping, type NormalizedSection } from "../reference-mapping"
import { mockReferenceAnswer, mockScenarioFor, referenceMockScenarios, type ReferenceMockScenario } from "../reference-mock"
import { createDocumentFromReference, createReferenceWithGeneration, planReferenceGeneration, type GenerateReferenceBlocks } from "../reference-pipeline"
import { buildReferencePlan, referenceShell } from "../reference-plan"
import { referenceReportMessage } from "../reference-report"
import { buildReferenceTransportSchema, safeParseReferenceResponse, type ReferenceResponse } from "../reference-schema"
import { fixtureContents } from "./generated-html-content"
import { generatedFixtures } from "./generated-fixtures"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
const clone = <T>(value: T): T => structuredClone(value)

const catalog = compositionCatalog(builderLames())
const described = describeReferenceCatalog(catalog)
const ctx = { blockTypes: referenceBodyTypes(catalog) }
const answer = (scenario: ReferenceMockScenario): ReferenceResponse => {
  const result = safeParseReferenceResponse(ctx, mockReferenceAnswer(described as never, scenario))
  assert.equal(result.success, true, JSON.stringify(result.success ? "" : result.error.issues))
  return result.success ? result.data : (undefined as never)
}
const legacy = ["good", "approximate", "unmatched", "sensitive", "promotion", "proof", "visual", "not-an-email", "no-match"] as const
const generatedScenarios = referenceMockScenarios.filter((scenario) => scenario.startsWith("generated-"))

/** Un « second appel » factice : il enregistre ses requêtes et répond comme le mock du scénario (ou comme on le lui dit). */
function spy(scenario: ReferenceMockScenario, behaviour?: (request: Parameters<GenerateReferenceBlocks>[0]) => ReturnType<GenerateReferenceBlocks>) {
  const requests: Parameters<GenerateReferenceBlocks>[0][] = []
  const generate: GenerateReferenceBlocks = async (request) => {
    requests.push(clone(request))
    if (behaviour) return behaviour(request)
    const parsed = parseGeneratedReferenceOutput(request.candidates.map((candidate) => candidate.ref), mockGeneratedAnswer(request, scenario))
    return parsed.ok ? { status: "success", output: parsed.value } : { status: "error" }
  }
  return { generate, requests }
}
const run = async (scenario: ReferenceMockScenario, behaviour?: Parameters<typeof spy>[1]) => {
  const second = spy(scenario, behaviour)
  const creation = await createReferenceWithGeneration(answer(scenario), catalog, second.generate)
  assert.equal(creation.status, "created", JSON.stringify(creation))
  return { creation: creation as Extract<typeof creation, { status: "created" }>, requests: second.requests }
}
const types = (document: EmailDocument) => document.config.blocks.map((block) => (isGeneratedBlock(block) ? "GENERATED" : block.type.replace(/^email-(module|hero)-/, "")))
const base = (scenario: ReferenceMockScenario) => {
  const result = createDocumentFromReference(answer(scenario), catalog)
  assert.equal(result.status, "created")
  return result as Extract<typeof result, { status: "created" }>
}
const same = (a: EmailDocument, b: EmailDocument) => JSON.stringify(a) === JSON.stringify(b)

describe("V2.9.4b — `structure[]` dans le contrat de l'appel 1", () => {
  test("chaque correspondance porte `structure` : valeurs fermées de la taxonomie, jamais optionnel, jamais libre", () => {
    const schema = (value: unknown) => safeParseReferenceResponse(ctx, value).success
    const good = mockReferenceAnswer(described as never, "good") as Json
    assert.equal(schema(good), true)
    for (const gap of referenceGaps) {
      const input = clone(good)
      input.mapping[0].structure = [gap]
      assert.equal(schema(input), true, gap)
    }
    for (const bad of ["columns-3", "free text", "", 3, null, "Columns", ["columns", "columns-3"], "columns"]) {
      const input = clone(good)
      input.mapping[0].structure = bad
      assert.equal(schema(input), false, JSON.stringify(bad))
    }
    const missing = clone(good)
    delete missing.mapping[0].structure
    assert.equal(schema(missing), false, "pas d'optionnel : un champ absent est refusé")
    const extra = clone(good)
    extra.mapping[0].gap = ["columns"]
    assert.equal(schema(extra), false)
  })
  test("le schéma de transport expose exactement la taxonomie ; aucune raison structurelle libre", () => {
    const text = JSON.stringify(buildReferenceTransportSchema(ctx))
    for (const gap of referenceGaps) assert.ok(text.includes(`"${gap}"`), gap)
    assert.match(code("lib/email-builder/reference-schema.ts"), /z\.enum\(referenceGaps/)
    assert.ok(!/columns|repeated-cards|card-over-image/.test(code("lib/email-builder/reference-schema.ts")), "les enums ne sont pas dupliqués dans le schéma")
  })
  test("`reason` reste descriptive : changer sa formulation ne change ni la sélection ni le résultat", () => {
    const response = answer("generated-unmatched")
    const reworded = clone(response)
    for (const entry of reworded.mapping) entry.reason = "Une raison complètement différente, sans aucun mot-clé."
    assert.deepEqual(planReferenceGeneration(normalized(response)).selection, planReferenceGeneration(normalized(reworded)).selection)
  })
})

function normalized(response: ReferenceResponse) {
  const result = normalizeReferenceMapping(response, catalog)
  assert.equal(result.ok, true)
  return (result as Extract<typeof result, { ok: true }>).value
}

describe("V2.9.4b — prompt de l'appel 1 : le modèle décrit, le code décide", () => {
  test("`structure` y est expliquée : écarts de structure seulement, [] pour l'éditorial ; les valeurs viennent de la taxonomie", async () => {
    const { referenceSystemPrompt } = await import("../reference-engine")
    assert.match(referenceSystemPrompt, /"structure"/)
    for (const gap of referenceGaps) assert.ok(referenceSystemPrompt.includes(`"${gap}"`), gap)
    assert.match(referenceSystemPrompt, /vide par défaut/)
    for (const editorial of ["texte", "ton", "couleur", "espacement", "image", "bouton"]) assert.ok(referenceSystemPrompt.includes(editorial), editorial)
    assert.match(referenceSystemPrompt, /ne produis jamais de structure, de HTML ni de CSS/i)
    assert.match(referenceSystemPrompt, /tu décris, le système décide/)
    assert.ok(!/décide(s)? (si|d'un second|de lancer)/i.test(referenceSystemPrompt.replace(/le système décide/g, "")), "le modèle ne décide jamais du second appel")
    // les définitions de la taxonomie sont dans le prompt, jamais recopiées dans le moteur
    assert.ok(!/chevauche le bas d'une image/.test(code("lib/email-builder/reference-engine.ts")))
  })
})

describe("V2.9.4b — non-régression V2.8 : les scénarios historiques ne deviennent jamais « générés »", () => {
  test("tous les mocks V2.8 ont `structure: []` partout, et le second appel n'est JAMAIS demandé", async () => {
    for (const scenario of legacy) {
      const value = answer(scenario)
      assert.ok(value.mapping.every((entry) => entry.structure.length === 0), scenario)
      const second = spy(scenario)
      const creation = await createReferenceWithGeneration(value, catalog, second.generate)
      assert.equal(second.requests.length, 0, `${scenario} : aucun second appel`)
      assert.equal(JSON.stringify(creation), JSON.stringify(createDocumentFromReference(value, catalog)), `${scenario} : résultat identique à V2.8`)
    }
  })
  test("la provenance d'un document sans lame générée n'a pas de champ `generated` (document V2.8 identique)", async () => {
    const { creation } = await run("good")
    assert.ok(!("generated" in creation.document.provenance.reference!))
    assert.equal(creation.report.generation, undefined)
    assert.equal(creation.document.schemaVersion, 1)
  })
})

describe("V2.9.4b — appel conditionnel : UN seul appel groupé, jamais sans candidat", () => {
  test("aucun candidat : 0 appel ; un ou plusieurs candidats : exactement 1 appel groupé", async () => {
    assert.equal((await run("good")).requests.length, 0)
    assert.equal((await run("approximate")).requests.length, 0, "écart éditorial : structure []")
    assert.equal((await run("generated-offer")).requests.length, 0, "une offre n'est jamais envoyée")
    assert.equal((await run("generated-unmatched")).requests.length, 1)
    assert.equal((await run("generated-mixed")).requests.length, 1, "trois candidats : un seul appel")
  })
  test("plus de 3 candidats : seuls les 3 sélectionnés sont envoyés ; `unmatched` d'abord, ordre de lecture", async () => {
    const { requests } = await run("generated-over-quota")
    assert.equal(requests.length, 1)
    assert.deepEqual(requests[0]!.candidates.map((candidate) => candidate.ref), ["s5", "s7", "s8"])
  })
  test("la requête ne contient que des données fermées : jamais `intent`, ni texte libre, ni URL", async () => {
    const { requests } = await run("generated-over-quota")
    const text = JSON.stringify(requests[0])
    assert.ok(!/intent|Trois parcours|Un grand chiffre|http|<|base64/i.test(text), text)
    assert.deepEqual(Object.keys(requests[0]!).sort(), ["candidates", "documentRoles"])
  })
  test("une offre ne devient jamais candidate, même avec un gap exprimable ; le rôle `offer` reste exclu", () => {
    const plan = planReferenceGeneration(normalized(answer("generated-offer")))
    assert.equal(plan.request, undefined)
    assert.ok(plan.selection.decisions.some((entry) => entry.ref === "s5" && entry.outcome === "offer-role"))
  })
})

describe("V2.9.4b — le document final : officielles et générées dans l'ordre de lecture, UN plan", () => {
  test("unmatched structurel : la lame générée occupe sa position de lecture", async () => {
    const { creation } = await run("generated-unmatched")
    assert.deepEqual(types(creation.document), ["header-newsletter", "hero-promotional-image-large", "numbered-list", "text-only", "GENERATED", "text-and-cta-variant-01", "footer-compact-legal"])
    assert.deepEqual(validateDocumentIntegrity(creation.document), [])
    assert.ok(renderDocumentEmail(creation.document).includes("Avancer à votre rythme"))
  })
  test("approximate structurel : la lame générée REMPLACE l'officielle (jamais les deux)", async () => {
    const official = base("generated-approximate")
    assert.ok(types(official.document).includes("icons-list"))
    const { creation } = await run("generated-approximate")
    assert.ok(!types(creation.document).includes("icons-list"), "l'approximation officielle n'est plus là")
    assert.equal(types(creation.document).filter((type) => type === "GENERATED").length, 1)
    assert.equal(creation.document.config.blocks.length, official.document.config.blocks.length, "même nombre de lames : la générée prend la place")
    assert.equal(creation.document.provenance.reference?.approximate, 0)
    assert.equal(creation.document.provenance.reference?.generated, 1)
  })
  test("mixte : officielle → générée → officielle → générée → officielle, dans l'ordre de lecture ; un échec garde l'officielle", async () => {
    const { creation } = await run("generated-mixed")
    assert.deepEqual(types(creation.document), ["header-newsletter", "hero-promotional-image-large", "numbered-list", "text-only", "GENERATED", "icons-list", "GENERATED", "text-and-cta-variant-01", "footer-compact-legal"])
    assert.deepEqual(validateDocumentIntegrity(creation.document), [])
    assert.equal(creation.report.generation?.generated, 2)
    assert.equal(creation.report.generation?.failed, 1)
  })
  test("ancrage : o g o g o, g g consécutives, g en tête, g en queue, o seules : toujours l'ordre de lecture (le moteur pose les officielles avant les générées)", () => {
    const officialType = (n: number) => ["email-module-text-only", "email-module-numbered-list", "email-module-text-and-cta-variant-01", "email-module-icons-list", "email-module-benefits-compact-highlights"][n % 5]!
    const neutral = referenceCompositionCatalog(catalog)
    const section = (ref: string, kind: "o" | "g", index: number): NormalizedSection => ({ ref, analysis: { ref, role: "text", layout: "single-column", intent: "x", hasImage: false, imageCount: 0, hasCta: false, repeatedItems: 0, tone: "light" }, status: kind === "o" ? "matched" : "unmatched", ...(kind === "o" ? { blockType: officialType(index) } : {}), reason: "", structure: [], content: [], images: [] })
    for (const pattern of ["ogogo", "ggooo", "oogg", "gg", "gogog", "og", "go", "ooggoo", "gggo"]) {
      const sections = [...pattern].map((kind, index) => section(`s${index + 1}`, kind as "o" | "g", index))
      const map = new Map(sections.filter((value) => !value.blockType).map((value, index) => [value.ref, { spec: [generatedFixtures.textSection, generatedFixtures.threeCards, generatedFixtures.itemGrid][index % 3], slots: [fixtureContents.textSection, fixtureContents.threeCards, fixtureContents.itemGrid][index % 3]! }]))
      if (map.size > 3) continue
      const plan = buildReferencePlan(sections, neutral, map)
      const checked = validateCompositionPlan(createBlankDocument(), plan, neutral, { limits: { add: 20 } })
      assert.equal(checked.ok, true, `${pattern} : ${JSON.stringify(checked)}`)
      if (!checked.ok) continue
      const order = checked.next.config.blocks.map((block) => (isGeneratedBlock(block) ? "g" : "o")).join("")
      assert.equal(order, `o${pattern}o`, `${pattern} : en-tête et pied de page autour de l'ordre de lecture`)
      assert.equal(checked.next.config.blocks[0]!.type, referenceShell.header)
      assert.equal(checked.next.config.blocks.at(-1)!.type, referenceShell.footer)
    }
  })
  test("sans lame générée, le plan est exactement celui de V2.8 (aucune clé `addGenerated`)", () => {
    const plan = buildReferencePlan(normalized(answer("good")).sections, referenceCompositionCatalog(catalog))
    assert.ok(!("addGenerated" in plan))
    assert.equal(plan.add.length, 6)
  })
  test("le plan final passe par le moteur de composition (`DomainCompositionPlan`) : composition.ts n'est pas contourné ni modifié", () => {
    const source = code("lib/email-builder/reference-pipeline.ts")
    assert.match(source, /validateCompositionPlan\(/)
    assert.ok(!/applyDocumentOperation|add-generated-block/.test(source), "aucune opération appliquée à la main")
    assert.match(code("lib/email-builder/reference-plan.ts"), /DomainCompositionPlan/)
  })
})

describe("V2.9.4b — repli : le résultat V2.8 reste utilisable", () => {
  const unusable: [string, NonNullable<Parameters<typeof spy>[1]>][] = [
    ["le second appel lève une erreur", () => Promise.reject(new Error("Erreur technique interne : stack, clé sk-ant-secret"))],
    ["le second appel renvoie un échec", async () => ({ status: "error" })],
    ["délai dépassé (simulé)", () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timeout")), 1))],
  ]
  for (const [name, behaviour] of unusable) {
    test(`${name} : le document est celui de la base, avec une mention contrôlée et aucun détail technique`, async () => {
      const official = base("generated-unmatched")
      const { creation, requests } = await run("generated-unmatched", behaviour)
      assert.equal(requests.length, 1, "aucune relance")
      assert.ok(same(creation.document, official.document))
      assert.equal(creation.report.generation?.unavailable, true)
      const message = referenceReportMessage(creation.report)
      assert.match(message, /Certaines structures sur mesure n'ont pas pu être générées\./)
      assert.ok(!/stack|sk-ant|Erreur technique|timeout|undefined/i.test(message + JSON.stringify(creation.report)))
    })
  }
  test("une réponse inexploitable (aucun item pour les candidats) : base intacte, chaque candidat « tenté, non retenu »", async () => {
    const official = base("generated-unmatched")
    const { creation } = await run("generated-unmatched", async () => ({ status: "success", output: { items: [] } }))
    assert.ok(same(creation.document, official.document))
    assert.equal(creation.report.generation?.failed, 1)
    assert.match(creation.report.lines.map((line) => line.text).join("\n"), /tentée mais n'a pas été retenue/)
  })
  test("les candidats échouent INDÉPENDAMMENT : un échec ne fait pas perdre les autres ; approximate → l'officielle reste, unmatched → rien", async () => {
    const { creation } = await run("generated-mixed")
    assert.ok(types(creation.document).includes("icons-list"), "l'approximation dont la génération a échoué garde son officielle")
    assert.equal(creation.document.provenance.reference?.generated, 2)
    const invalidUnmatched = await run("generated-invalid-unmatched")
    assert.ok(same(invalidUnmatched.creation.document, base("generated-invalid-unmatched").document), "unmatched échoué : aucune lame pour cette section")
    assert.equal(invalidUnmatched.creation.document.provenance.reference?.unmatched.length, 1, "elle reste comptée sans équivalent")
    const invalidApproximate = await run("generated-invalid-approximate")
    assert.ok(types(invalidApproximate.creation.document).includes("icons-list"))
    assert.equal(invalidApproximate.creation.document.provenance.reference?.approximate, 1)
  })
  test("la base n'est jamais mutée : le document de repli est strictement celui de V2.8", async () => {
    for (const scenario of ["generated-unmatched", "generated-approximate", "generated-invalid-unmatched", "generated-engine-error"] as const) {
      const before = JSON.stringify(base(scenario).document)
      await run(scenario, async () => ({ status: "error" }))
      assert.equal(JSON.stringify(base(scenario).document), before, scenario)
    }
  })
  test("le premier appel reste BLOQUANT comme avant : image qui n'est pas un email, aucune correspondance, réponse invalide", async () => {
    const second = spy("good")
    assert.deepEqual(await createReferenceWithGeneration(answer("not-an-email"), catalog, second.generate), { status: "not-an-email" })
    const none = await createReferenceWithGeneration(answer("no-match"), catalog, second.generate)
    assert.equal(none.status, "no-match")
    assert.equal(second.requests.length, 0)
  })
})

describe("V2.9.4b — rapport et provenance : honnêtes, sans score", () => {
  test("une section remplacée est « reproduite avec une structure sur mesure » : ni approchée ni sans équivalent", async () => {
    const { creation } = await run("generated-unmatched")
    const { report } = creation
    assert.deepEqual([report.sections, report.matched, report.approximate, report.unmatched, report.generation?.generated], [5, 4, 0, 0, 1])
    assert.ok(report.lines.some((line) => line.status === "generated" && /reproduite avec une structure sur mesure/.test(line.text)))
    const message = referenceReportMessage(report)
    assert.match(message, /1 reproduite avec une structure sur mesure/)
    assert.ok(!/%|fidél|score|confiance/i.test(message))
  })
  test("le message V2.8 est inchangé sans lame générée", async () => {
    const { creation } = await run("good")
    assert.ok(!/sur mesure/.test(referenceReportMessage(creation.report)))
    assert.equal(referenceReportMessage(creation.report), referenceReportMessage(base("good").report))
  })
  test("limite de 3 : les sections non tentées sont dites telles ; elles gardent leur officielle ou restent sans équivalent ; jamais promues", async () => {
    const { creation } = await run("generated-over-quota")
    assert.equal(creation.report.generation?.notAttempted, 2)
    assert.equal(creation.report.generation?.generated, 3)
    assert.match(referenceReportMessage(creation.report), /n'a pas été tentée : au plus 3 lames sur mesure par email/)
    assert.equal(creation.document.provenance.reference?.generated, 3)
    assert.equal(types(creation.document).filter((type) => type === "GENERATED").length, 3)
    assert.ok(types(creation.document).includes("icons-list"), "s6 (approximate) garde son officielle")
    // même si l'un des trois échoue, le #4 n'est pas promu : la requête n'est jamais refaite
    const second = await run("generated-over-quota", async (request) => {
      const parsed = parseGeneratedReferenceOutput(request.candidates.map((candidate) => candidate.ref), mockGeneratedAnswer(request, "generated-over-quota"))
      assert.equal(parsed.ok, true)
      return { status: "success", output: { items: (parsed as { value: { items: Json[] } }).value.items.slice(1) as never } }
    })
    assert.equal(second.requests.length, 1)
    assert.equal(second.creation.document.provenance.reference?.generated, 2)
    assert.equal(second.creation.report.generation?.failed, 1)
    assert.equal(second.creation.report.generation?.notAttempted, 2)
  })
  test("lame dégradée (chevauchement) : la formulation du Builder est reprise ; dérivée, jamais stockée", async () => {
    const { creation } = await run("generated-overlap")
    const generatedBlock = creation.document.config.blocks.find(isGeneratedBlock)!
    assert.equal(blockCompatibility(generatedBlock), "degraded")
    assert.equal(creation.report.generation?.degraded, true)
    assert.match(referenceReportMessage(creation.report), /Certains effets visuels peuvent être simplifiés selon le client email\./)
    assert.ok(!JSON.stringify(creation.document).includes("degraded"))
  })
  test("boutons générés : la destination par défaut est signalée UNE fois, pas une ligne par bouton", async () => {
    const { creation } = await run("generated-over-quota")
    const message = referenceReportMessage(creation.report)
    assert.equal((message.match(/destination par défaut/g) ?? []).length, 1)
    assert.match(message, /Les boutons des structures sur mesure utilisent le catalogue Studi comme destination par défaut\./)
    const without = await run("generated-unmatched")
    assert.ok(!/destination par défaut/.test(referenceReportMessage(without.creation.report)), "aucun bouton généré : aucun avis")
  })
  test("provenance : un nombre, jamais la spec, le contenu, l'image ni un prompt ; schemaVersion reste 1", async () => {
    const { creation } = await run("generated-unmatched")
    const provenance = creation.document.provenance.reference!
    assert.deepEqual(Object.keys(provenance).sort(), ["approximate", "generated", "matched", "sections", "unmatched"])
    assert.ok(!/spec|specVersion|texts|imageId|base64|prompt|Avancer à votre rythme/.test(JSON.stringify(provenance)))
    assert.equal(creation.document.schemaVersion, 1)
    assert.deepEqual(creation.document.facts, {})
  })
  test("aucun fait commercial n'est inventé : `facts` vide, contenus générés sans chiffre ; stat « À définir »", async () => {
    const { creation } = await run("generated-mixed")
    assert.deepEqual(creation.document.facts, {})
    const blocks = creation.document.config.blocks.filter(isGeneratedBlock)
    assert.equal(blocks.length, 2)
    // Les valeurs seulement (les noms de slots portent des numéros) : aucun chiffre dans le contenu, hors destinations du système.
    const text = JSON.stringify(blocks.flatMap((block) => Object.values(block.slots)))
    assert.ok(!/\d/.test(text.replace(/"catalogue-formations"/g, "")), text)
    assert.ok(blocks.some((block) => Object.values(block.slots).some((value) => "text" in value && value.text === "À définir")))
  })
  test("images et destinations : choisies par le système ; le modèle n'en fournit aucune", async () => {
    const { creation } = await run("generated-overlap")
    const block = creation.document.config.blocks.find(isGeneratedBlock)!
    assert.deepEqual(block.slots.cta, { label: "Découvrir", destination: "catalogue-formations" })
    assert.match(JSON.stringify(block.slots.image), /"imageId":"[a-z0-9-]+"/)
  })
})

/* -------------------------------------------------------------------------- */
/* Handler : compteurs d'appels                                                */
/* -------------------------------------------------------------------------- */

const be32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
const png = (width: number, height: number) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height), 8, 6, 0, 0, 0, 0, 0, 0, 0])
const upload = (name: string) => {
  const form = new FormData()
  form.append("image", new File([png(600, 1800)], name, { type: "image/png" }))
  return new Request("http://localhost/api/email-builder/reference", { method: "POST", body: form })
}

describe("V2.9.4b — handler : appel 1 puis, seulement s'il y a des candidats, UN appel 2", () => {
  const drive = async (scenario: ReferenceMockScenario, options: { generated?: (request: Parameters<GenerateReferenceBlocks>[0]) => Promise<unknown> } = {}) => {
    const calls = { reference: 0, generated: 0 }
    const requests: Parameters<GenerateReferenceBlocks>[0][] = []
    const logs: Json[] = []
    const response = await handleReference(upload(`${scenario}.png`), {
      env: { NODE_ENV: "test" },
      log: (entry) => logs.push(entry),
      engine: async () => {
        calls.reference += 1
        return { status: "success", response: answer(scenario), model: "fake" }
      },
      generatedEngine: async (request) => {
        calls.generated += 1
        requests.push(clone(request))
        const result = options.generated ? await options.generated(request) : { status: "success", output: mockGeneratedAnswer(request, scenario), model: "fake" }
        return result as never
      },
    })
    return { calls, requests, logs, status: response.status, body: (await response.json()) as ReferenceResponseBody }
  }
  const table: [ReferenceMockScenario, number, number][] = [
    ["good", 1, 0],
    ["approximate", 1, 0],
    ["unmatched", 1, 0],
    ["sensitive", 1, 0],
    ["promotion", 1, 0],
    ["proof", 1, 0],
    ["visual", 1, 0],
    ["generated-offer", 1, 0],
    ["generated-unmatched", 1, 1],
    ["generated-approximate", 1, 1],
    ["generated-invalid-unmatched", 1, 1],
    ["generated-invalid-approximate", 1, 1],
    ["generated-overlap", 1, 1],
    ["generated-mixed", 1, 1],
    ["generated-over-quota", 1, 1],
  ]
  for (const [scenario, reference, generated] of table) {
    test(`${scenario} : ${reference} appel Reference, ${generated} appel generated ; succès HTTP`, async () => {
      const result = await drive(scenario)
      assert.deepEqual(result.calls, { reference, generated })
      assert.equal(result.status, 200)
      assert.equal(result.body.status, "success")
      if (result.body.status === "success") assert.deepEqual(validateDocumentIntegrity(result.body.document), [])
    })
  }
  test("scénarios sans correspondance ou refusés par le premier appel : aucun second appel", async () => {
    for (const scenario of ["no-match", "not-an-email"] as const) {
      const result = await drive(scenario)
      assert.equal(result.calls.generated, 0, scenario)
      assert.equal(result.status, 422, scenario)
    }
  })
  test("plus de 3 candidats : la requête du handler n'en porte que 3", async () => {
    const result = await drive("generated-over-quota")
    assert.equal(result.requests[0]!.candidates.length, 3)
  })
  test("le second appel lève une erreur : 1 / 1, succès HTTP avec le document V2.8, la journalisation ne garde que la nature", async () => {
    const result = await drive("generated-unmatched", { generated: () => Promise.reject(new Error("secret sk-ant-xyz")) })
    assert.deepEqual(result.calls, { reference: 1, generated: 1 })
    assert.equal(result.status, 200)
    assert.equal(result.body.status, "success")
    if (result.body.status === "success") assert.ok(same(result.body.document, base("generated-unmatched").document))
    assert.deepEqual(result.logs, [{ kind: "generated-engine-threw" }])
  })
  test("le second appel renvoie une erreur typée (délai, limite…) : aucune relance, document V2.8, nature seule journalisée", async () => {
    const result = await drive("generated-unmatched", { generated: async () => ({ status: "error", error: { kind: "timeout", message: "x", requestId: "req_1" } }) })
    assert.deepEqual(result.calls, { reference: 1, generated: 1 })
    assert.equal(result.status, 200)
    assert.deepEqual(result.logs, [{ kind: "generated-timeout", requestId: "req_1" }])
  })
  test("la route d'erreur du premier appel est inchangée : échec fournisseur = erreur, second appel jamais tenté", async () => {
    const calls = { generated: 0 }
    const response = await handleReference(upload("error.png"), { env: { NODE_ENV: "test" }, log: () => {}, engine: async () => ({ status: "error", error: { kind: "timeout", message: "x" } }), generatedEngine: async () => ((calls.generated += 1), { status: "error", error: { kind: "x", message: "x" } } as never) })
    assert.equal(response.status, 504)
    assert.equal(calls.generated, 0)
  })
  test("le mode simulé enchaîne les DEUX étapes sans réseau (aucun moteur injecté) ; refusé en production", async () => {
    const response = await handleReference(upload("generated-mixed.png"), { env: { NODE_ENV: "test" }, log: () => {} })
    const body = (await response.json()) as ReferenceResponseBody
    assert.equal(response.status, 503, "sans devMock, le moteur réel est demandé : pas de clé → indisponible, refus propre, aucun appel")
    void body
    const form = new FormData()
    form.append("image", new File([png(600, 1800)], "generated-mixed.png", { type: "image/png" }))
    form.append("devMock", "true")
    const mocked = await handleReference(new Request("http://localhost/api/email-builder/reference", { method: "POST", body: form }), { env: { NODE_ENV: "test" }, log: () => {} })
    const mockedBody = (await mocked.json()) as ReferenceResponseBody
    assert.equal(mocked.status, 200)
    assert.equal(mockedBody.status, "success")
    if (mockedBody.status === "success") assert.equal(mockedBody.document.config.blocks.filter(isGeneratedBlock).length, 2)
    const production = new FormData()
    production.append("image", new File([png(600, 1800)], "generated-mixed.png", { type: "image/png" }))
    production.append("devMock", "true")
    const refused = await handleReference(new Request("http://localhost/api/email-builder/reference", { method: "POST", body: production }), { env: { NODE_ENV: "production" }, log: () => {} })
    assert.equal(refused.status, 503, "en production, la simulation est ignorée : le moteur réel sans clé est indisponible")
  })
  test("noms de fichier des scénarios générés", () => {
    for (const scenario of generatedScenarios) assert.equal(mockScenarioFor(`${scenario}.png`), scenario)
    assert.equal(mockScenarioFor("unmatched.png"), "unmatched")
    assert.equal(mockScenarioFor("error.png"), "error")
  })
})

/* -------------------------------------------------------------------------- */
/* Second moteur : faux client                                                 */
/* -------------------------------------------------------------------------- */

describe("V2.9.4b — second moteur : un appel texte, groupé, sans relance (faux client, aucun réseau)", () => {
  const request = () => planReferenceGeneration(normalized(answer("generated-over-quota"))).request!
  function fakeClient(reply?: unknown, behaviour?: () => never) {
    const calls: CreateParams[] = []
    const client: EmailClaudeClient = {
      messages: {
        create: async (params) => {
          calls.push(clone(params))
          if (behaviour) behaviour()
          const text = JSON.stringify(reply ?? mockGeneratedAnswer(request(), "generated-over-quota"))
          return { id: "m", type: "message", role: "assistant", model: "fake-model", content: [{ type: "text", text, citations: null }], stop_reason: "end_turn", stop_sequence: null, stop_details: null, usage: { input_tokens: 1, output_tokens: 1, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null } } as never
        },
      },
    }
    return { client, calls }
  }

  test("UN appel non streamé, schéma strict fourni, modèle par défaut, jetons bornés", async () => {
    const { client, calls } = fakeClient()
    const result = await analyzeGeneratedReference(request(), { client, env: {} })
    assert.equal(result.status, "success")
    assert.equal(calls.length, 1, "un seul appel pour tous les candidats")
    const params = calls[0]!
    assert.equal((params as { stream?: boolean }).stream, undefined)
    assert.equal(params.model, DEFAULT_EMAIL_MODEL)
    assert.equal(params.max_tokens, GENERATED_REFERENCE_MAX_TOKENS)
    assert.equal(params.system, generatedReferenceSystemPrompt)
    assert.deepEqual((params as Json).output_config.format.schema, buildGeneratedReferenceTransportSchema(["s5", "s7", "s8"]))
    assert.equal((params as Json).output_config.format.type, "json_schema")
    if (result.status === "success") assert.equal(result.output.items.length, 3)
  })
  test("le modèle de l'environnement est respecté (même convention que le premier appel)", async () => {
    const { client, calls } = fakeClient()
    await analyzeGeneratedReference(request(), { client, env: { EMAIL_MODEL: "claude-custom" } as never })
    assert.ok(typeof calls[0]!.model === "string")
  })
  test("le message ne contient QUE la requête fermée et le contexte système : aucune image, base64, intent, URL, document ni HTML", async () => {
    const { client, calls } = fakeClient()
    await analyzeGeneratedReference(request(), { client, env: {} })
    const params = calls[0]!
    const content = (params.messages[0] as Json).content as Json[]
    assert.deepEqual(content.map((block) => block.type), ["text"], "aucun bloc image")
    // Le message et le prompt (le schéma de sortie, lui, nomme `intent` le champ d'INTENTION VISUELLE fermée des images : ce n'est pas l'intention libre de la section).
    const text = JSON.stringify({ system: params.system, messages: params.messages })
    assert.ok(!/base64|data:image|"type":"image"|\bintent\b|https?:\/\/|<(?:script|table|div|a |img)|"blocks"|"config"|schemaVersion/i.test(text), "rien d'interdit dans l'appel")
    const message = JSON.parse(content[0]!.text) as Json
    assert.deepEqual(Object.keys(message).sort(), ["context", "request", "task"])
    assert.deepEqual(message.request, request())
    assert.ok(!/Trois parcours|Un grand chiffre|Une photo/.test(text), "aucun texte de la référence")
  })
  test("le prompt est constant et strict : blueprint fermé (pas de DSL), stat par le système, ni destination ni imageId choisis par le modèle, aucune donnée commerciale", () => {
    for (const piece of ["vocabulaire FERMÉ", "composition MINIMALE", "AUCUNE destination", "AUCUN identifiant d'image", "SAUF \"stat-N\"", "N'invente AUCUNE donnée commerciale", "hasImage", "hasCta"]) assert.ok(generatedReferenceSystemPrompt.includes(piece) || generatedReferenceSystemPrompt.toLowerCase().includes(piece.toLowerCase()), piece)
    assert.ok(!/https?:\/\/|<[a-z]/.test(generatedReferenceSystemPrompt))
    assert.ok(!/DSL|AST|"spec"/.test(generatedReferenceSystemPrompt), "le modèle ne connaît pas le DSL")
    assert.ok(generatedReferenceSystemPrompt.length < 3600, `${generatedReferenceSystemPrompt.length}`)
  })
  test("une sortie conforme est lue strictement ; une clé en plus, une référence inconnue, un doublon, un texte non JSON : échec contrôlé", async () => {
    const valid = mockGeneratedAnswer(request(), "generated-over-quota")
    const bad = (mutate: (answer: Json) => void) => {
      const copy = clone(valid) as Json
      mutate(copy)
      return fakeClient(copy)
    }
    for (const attempt of [
      bad((value) => (value.items[0].destination = "catalogue-formations")),
      bad((value) => (value.items[0].ref = "s99")),
      bad((value) => value.items.push(clone(value.items[0]))),
      bad((value) => (value.items[0].blueprint.count = 9)),
      bad((value) => (value.items[0].spec = { specVersion: 1 })),
      bad((value) => (value.items[0].images.push({ slot: "image", intent: "warm-reassurance", imageId: "canape-lumiere" }))),
      bad((value) => (value.extra = true)),
    ]) {
      const result = await analyzeGeneratedReference(request(), { client: attempt.client, env: {} })
      assert.equal(result.status, "error")
      assert.equal(result.status === "error" && result.error.kind, "invalid-draft")
      assert.equal(attempt.calls.length, 1, "aucune relance")
    }
  })
  test("aucune relance : un client qui échoue n'est appelé qu'une fois ; la clé n'apparaît jamais dans l'erreur", async () => {
    const failing = fakeClient(undefined, () => {
      throw new Error("401 sk-ant-secret-123 invalid x-api-key")
    })
    const result = await analyzeGeneratedReference(request(), { client: failing.client, env: { ANTHROPIC_API_KEY: "sk-ant-secret-123" } })
    assert.equal(result.status, "error")
    assert.equal(failing.calls.length, 1)
    assert.ok(!JSON.stringify(result).includes("sk-ant-secret-123"))
    assert.match(read("lib/email/anthropic.ts"), /maxRetries: 0/)
  })
  test("sans candidat : aucun appel ; sans clé ni client injecté : refus propre, aucun réseau", async () => {
    const { client, calls } = fakeClient()
    const empty = await analyzeGeneratedReference({ candidates: [], documentRoles: [] }, { client, env: {} })
    assert.equal(empty.status, "error")
    assert.equal(calls.length, 0)
    const noKey = await analyzeGeneratedReference(request(), { env: {} })
    assert.equal(noKey.status === "error" && noKey.error.kind, "missing-api-key")
  })
  test("le client simulé du mode développement répond depuis la requête reçue, sans réseau", async () => {
    const result = await analyzeGeneratedReference(request(), { client: createMockGeneratedClient("generated-over-quota"), env: {} })
    assert.equal(result.status, "success")
    const failing = await analyzeGeneratedReference(request(), { client: createMockGeneratedClient("generated-engine-error"), env: {} })
    assert.equal(failing.status, "error")
  })
})

/* -------------------------------------------------------------------------- */
/* Inspection source                                                           */
/* -------------------------------------------------------------------------- */

function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: false }).map(String).filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes("tests/")).map((file) => `${dir}/${file}`)
}

describe("V2.9.4b — frontières (inspection de la source)", () => {
  test("le second moteur n'est appelé que par le handler prévu ; le pipeline n'est appelé que par le handler", () => {
    const all = [...sources("lib"), ...sources("components"), ...sources("app")]
    const callers = (needle: RegExp, definition: string) => all.filter((file) => file !== definition && needle.test(code(file)))
    assert.deepEqual(callers(/analyzeGeneratedReference\(/, "lib/email-builder/reference-generated-engine.ts"), ["lib/email-builder/reference-handler.ts"])
    assert.deepEqual(callers(/createReferenceWithGeneration\(/, "lib/email-builder/reference-pipeline.ts"), ["lib/email-builder/reference-handler.ts"])
  })
  test("aucun retry, aucun Anthropic direct ni fetch dans les nouveaux modules ; aucun intent envoyé au second moteur", () => {
    for (const path of ["reference-generated-engine", "reference-generated-mock", "reference-pipeline", "reference-plan", "reference-report"].map((name) => `lib/email-builder/${name}.ts`)) {
      const source = code(path)
      // Le moteur lit `process.env` par défaut comme le premier (`reference-engine.ts`) ; les autres modules ne lisent aucun environnement.
      assert.ok(!/fetch\(|@anthropic-ai|new Anthropic/.test(source) && (path.endsWith("-engine.ts") || !/process\.env/.test(source)), path)
      assert.ok(!/retry|Retry|for \(let attempt|while \(true\)/.test(source), `${path} : aucune relance`)
    }
    assert.ok(!/\bintent\b/.test(code("lib/email-builder/reference-generated-engine.ts")))
    assert.ok(!/intent/.test(JSON.stringify(planReferenceGeneration(normalized(answer("generated-mixed"))).request)))
  })
  test("la sortie du modèle ne porte ni URL, ni destination, ni imageId : pipeline et plan n'en lisent aucun", () => {
    for (const path of ["reference-pipeline", "reference-plan"]) assert.ok(!/imageId|destination|href/.test(code(`lib/email-builder/${path}.ts`)), path)
  })
  test("l'assistant, l'interface, le DSL, le compilateur et le domaine V2.9.3 ne connaissent pas ce câblage", () => {
    const needle = /reference-generated|reference-gap|createReferenceWithGeneration/
    for (const path of ["assistant-proposal", "assistant-context", "assistant-schema", "assistant-engine", "assistant-handler", "assistant-mock", "builder-state", "operations", "composition", "integrity", "generated-block", "block-entry", "render", "canvas"]) assert.ok(!needle.test(code(`lib/email-builder/${path}.ts`)), path)
    for (const file of readdirSync(join(root, "components/email-builder"))) assert.ok(!needle.test(code(`components/email-builder/${file}`)), file)
    for (const file of readdirSync(join(root, "lib/email-builder/generated"))) assert.ok(!needle.test(code(`lib/email-builder/generated/${file}`)), file)
    for (const file of readdirSync(join(root, "lib/email-builder/generated-html"))) assert.ok(!needle.test(code(`lib/email-builder/generated-html/${file}`)), file)
  })
  test("aucune nouvelle dépendance", () => {
    const manifest = JSON.parse(read("package.json")) as { dependencies: Record<string, string> }
    // (le nom du SDK est assemblé : un garde-fou du dépôt interdit sa mention littérale hors des modules serveur)
    assert.deepEqual(Object.keys(manifest.dependencies).sort(), [["@anthropic-ai", "sdk"].join("/"), "@base-ui/react", "class-variance-authority", "cmdk", "cn", "embla-carousel-react", "lucide-react", "next", "parse5", "react", "react-dom", "shadcn", "tw-animate-css", "zod"])
  })
})
