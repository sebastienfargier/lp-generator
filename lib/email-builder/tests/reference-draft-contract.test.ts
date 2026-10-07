/**
 * V2.9.4 (correctif Vercel) — la frontière « Structured Output accepté → draft métier acceptable » : un texte
 * DESCRIPTIF (`intent`, `reason`) ou une valeur de contenu hors bornes ne fait plus échouer toute la création
 * (`invalid-draft` / `mapping.3.reason`), sans jamais assouplir un champ structurel. Hors réseau, sans modèle.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type { EmailClaudeClient } from "../../email/anthropic"
import { builderLames } from "../catalog"
import { compositionCatalog } from "../composition"
import { validateDocumentIntegrity } from "../integrity"
import { describeReferenceCatalog, referenceBodyTypes } from "../reference-catalog"
import { analyzeReference, referenceSystemPrompt } from "../reference-engine"
import { normalizeReferenceMapping } from "../reference-mapping"
import { mockReferenceAnswer } from "../reference-mock"
import { createDocumentFromReference } from "../reference-pipeline"
import { referenceReportMessage } from "../reference-report"
import { referenceContentValueMaxLength, referenceDescriptionMaxLength, safeParseReferenceResponse, sanitizeDescription, sanitizeReferenceDescriptions } from "../reference-schema"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const catalog = compositionCatalog(builderLames())
const described = describeReferenceCatalog(catalog)
const ctx = { blockTypes: referenceBodyTypes(catalog) }
const good = () => structuredClone(mockReferenceAnswer(described as never, "approximate")) as unknown as Json
const image = { mediaType: "image/png" as const, base64: "AAAA" }

/** Un client de la forme de `EmailClaudeClient` qui répond `output` tel quel (un seul appel, jamais de réseau). */
const fakeClient = (output: unknown) => {
  const calls: unknown[] = []
  const client = {
    messages: {
      create: async (params: unknown) => {
        calls.push(params)
        return { id: "msg_x", type: "message", role: "assistant", model: "fake", content: [{ type: "text", text: JSON.stringify(output), citations: null }], stop_reason: "end_turn", stop_sequence: null, stop_details: null, usage: { input_tokens: 1, output_tokens: 1, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null } }
      },
    },
  } as unknown as EmailClaudeClient
  return { client, calls }
}
const analyze = (output: unknown) => analyzeReference({ image }, { client: fakeClient(output).client, env: {} })
const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

/** Une réponse dont la correspondance d'index 3 porte `reason` (la forme du défaut constaté : `mapping.3.reason`). */
const withReason = (reason: string) => {
  const value = good()
  assert.ok(value.mapping.length >= 4)
  value.mapping[3].reason = reason
  return value
}
const longReason = "La lame propose le bon titre et le bon bouton, mais elle n'a ni le second bloc sous le visuel avec la prochaine rentrée et les lieux, ni le second bouton, ni la ligne d'information"

describe("V2.9.4 correctif — REPRODUCTION : le contrat strict refuse un `reason` hors bornes, le Structured Output ne le sait pas", () => {
  test("le schéma de TRANSPORT (envoyé à Anthropic) ne porte aucune borne sur `reason` : n'importe quelle chaîne y est conforme", async () => {
    const { buildReferenceTransportSchema } = await import("../reference-schema")
    const schema = buildReferenceTransportSchema(ctx) as Json
    const defs = Object.values(schema.$defs) as Json[]
    assert.deepEqual(defs.find((def) => def.properties?.reason)!.properties.reason, { type: "string" })
    assert.deepEqual(defs.find((def) => def.properties?.intent)!.properties.intent, { type: "string" })
  })
  test("les classes de `reason` conformes au transport mais refusées par le contrat strict, toutes avec la règle `mapping.3.reason`", () => {
    assert.ok(longReason.length > referenceDescriptionMaxLength)
    for (const [name, reason] of [
      ["plus de 160 caractères", longReason],
      ["une balise", "Voir <b>le bloc</b> sous le visuel"],
      ["une URL", "Comme sur https://exemple.fr/promo"],
      ["un nom de fichier image", "Le visuel logo.png n'est pas repris"],
      ["un chemin de fichier", "Voir /images/hero pour le visuel"],
    ] as const) {
      const strict = safeParseReferenceResponse(ctx, withReason(reason))
      assert.equal(strict.success, false, name)
      assert.ok(!strict.success && strict.error.issues.some((issue) => issue.path.join(".") === "mapping.3.reason"), name)
    }
  })
  test("AVANT correctif : le moteur renvoyait invalid-draft sur ce `reason` ; la même réponse passe maintenant la frontière (le schéma strict n'a pas changé)", async () => {
    const result = await analyze(withReason(longReason))
    assert.equal(result.status, "success", JSON.stringify(result.status === "error" ? result.error : ""))
    assert.equal(safeParseReferenceResponse(ctx, withReason(longReason)).success, false, "le schéma strict reste la dernière barrière")
  })
})

describe("V2.9.4 correctif — `reason` et `intent` : bornés, jamais bloquants", () => {
  test("un `reason` trop long est coupé proprement (≤ 160, « … », sans mot coupé), le draft et la création réussissent", async () => {
    const result = await analyze(withReason(longReason))
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    const reason = result.response.mapping[3]!.reason
    assert.ok(reason.length <= referenceDescriptionMaxLength && reason.endsWith("…"), reason)
    assert.ok(longReason.startsWith(reason.slice(0, -1)), "préfixe fidèle")
    assert.ok(!reason.slice(0, -1).endsWith(" "), "coupe sur un mot entier, sans espace final")
    const creation = createDocumentFromReference(result.response, catalog)
    assert.equal(creation.status, "created", JSON.stringify(creation))
    if (creation.status === "created") assert.deepEqual(validateDocumentIntegrity(creation.document), [])
  })
  test("160 caractères exactement : inchangé ; 161 : coupé ; jamais plus de 160 ; un emoji n'est pas coupé en deux", () => {
    const exact = "a".repeat(80) + " " + "b".repeat(79)
    assert.equal(exact.length, 160)
    assert.equal(sanitizeDescription(exact), exact)
    for (const length of [161, 200, 500, 5000]) {
      const out = sanitizeDescription(("mot ").repeat(length))
      assert.ok(out.length <= 160 && out.endsWith("…"), String(length))
    }
    const emoji = sanitizeDescription("😀".repeat(200))
    assert.ok(emoji.length <= 160)
    assert.ok(!/[\uD800-\uDBFF]…?$/.test(emoji.replace(/…$/, "")), "pas de demi-paire")
    assert.equal(sanitizeDescription("x".repeat(300)).length, 160, "sans espace : coupe franche")
  })
  test("retours à la ligne et caractères de contrôle → espaces ; espaces multiples réduits", () => {
    assert.equal(sanitizeDescription("Une\nphrase\r\n  sur\u0000trois\tlignes."), "Une phrase sur trois lignes.")
  })
  test("HOSTILE : balises, scripts, URL, chemins et noms d'image sont RETIRÉS du texte descriptif, jamais conservés", async () => {
    const hostile = "Voir <script>alert(1)</script> <img src=x onerror=alert(1)> https://evil.example/x.png www.evil.example mailto:a@b.c javascript:alert(1) /images/hero /ressources/a logo.PNG fin"
    const clean = sanitizeDescription(hostile)
    assert.ok(!/<|>|https?:|www\.|mailto:|javascript:|\/images\/|\/ressources\/|\.png/i.test(clean), clean)
    assert.match(clean, /Voir/)
    assert.match(clean, /fin/)
    const result = await analyze(withReason(hostile))
    assert.equal(result.status, "success")
    if (result.status === "success") assert.ok(!/<|https?:|www\./i.test(result.response.mapping[3]!.reason))
  })
  test("un `reason` qui n'est qu'un lien devient vide : la règle métier existante s'applique (« doit dire pourquoi »), rien n'est inventé", async () => {
    const value = good()
    const target = value.mapping.findIndex((entry: Json) => entry.status !== "matched")
    assert.ok(target >= 0)
    value.mapping[target].reason = "https://evil.example/promo"
    const result = await analyze(value)
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.equal(result.response.mapping[target]!.reason, "")
    const creation = createDocumentFromReference(result.response, catalog)
    assert.equal(creation.status, "invalid")
    assert.match(creation.status === "invalid" ? creation.message : "", /doit dire pourquoi/)
  })
  test("`intent` : même traitement ; le rapport et la provenance restent bornés", async () => {
    const value = good()
    value.analysis.sections[0].intent = "Une phrase beaucoup trop longue sur l'ouverture de la newsletter ".repeat(10)
    const result = await analyze(value)
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.ok(result.response.analysis.sections[0]!.intent.length <= 160)
    const creation = createDocumentFromReference(result.response, catalog)
    assert.equal(creation.status, "created")
    if (creation.status === "created") assert.ok(referenceReportMessage(creation.report).length > 0)
    const script = good()
    script.analysis.sections[0].intent = "<script>x</script>"
    const sanitized = await analyze(script)
    assert.equal(sanitized.status, "success")
    if (sanitized.status === "success") assert.equal(sanitized.response.analysis.sections[0]!.intent, "x")
  })
})

describe("V2.9.4 correctif — valeurs de contenu : jamais tronquées ni réécrites, abandonnées si inutilisables", () => {
  test("une valeur trop longue, balisée ou avec un lien est vidée puis abandonnée par le mapping (compteur `dropped`), le reste est conservé", async () => {
    for (const bad of ["x ".repeat(300), "<b>gras</b>", "Voir https://exemple.fr/promo", "Voir logo.png"]) {
      const value = good()
      const entry = value.mapping.find((item: Json) => item.status !== "unmatched" && item.content.length >= 2)
      assert.ok(entry)
      const kept = entry.content[1].value
      entry.content[0].value = bad
      const result = await analyze(value)
      assert.equal(result.status, "success", bad.slice(0, 20))
      if (result.status !== "success") continue
      const normalized = normalizeReferenceMapping(result.response, catalog)
      assert.equal(normalized.ok, true)
      if (!normalized.ok) continue
      assert.ok(normalized.value.dropped >= 1, "la valeur inutilisable est comptée")
      const section = normalized.value.sections.find((candidate) => candidate.ref === entry.ref)!
      assert.ok(!JSON.stringify(section.content).includes(bad.slice(0, 12)), "jamais conservée, jamais tronquée")
      assert.ok(section.content.some((item) => item.value === kept), "les autres valeurs sont intactes")
    }
  })
  test("une valeur de 400 caractères exactement est conservée telle quelle", () => {
    const value = "a".repeat(referenceContentValueMaxLength)
    const input = good()
    input.mapping[0].content[0].value = value
    const out = sanitizeReferenceDescriptions(input) as Json
    assert.equal(out.mapping[0].content[0].value, value)
  })
})

describe("V2.9.4 correctif — AUCUNE donnée structurelle invalide ne devient acceptable", () => {
  const refused = async (change: (value: Json) => void, label: string) => {
    const value = good()
    change(value)
    const result = await analyze(value)
    assert.equal(result.status, "error", label)
    assert.equal(result.status === "error" && result.error.kind, "invalid-draft", label)
  }
  test("références, enums, blockType, imageId, structure, clés en plus, types, tailles : toujours `invalid-draft`", async () => {
    await refused((v) => (v.analysis.sections[0].role = "mystery"), "role")
    await refused((v) => (v.analysis.sections[0].layout = "pixel-perfect"), "layout")
    await refused((v) => (v.analysis.sections[0].tone = "neon"), "tone")
    await refused((v) => (v.analysis.sections[0].ref = "section-1"), "ref")
    await refused((v) => (v.mapping[0].ref = "../s1"), "ref de mapping")
    await refused((v) => (v.mapping[0].status = "great"), "statut")
    await refused((v) => (v.mapping[0].blockType = "email-module-inventee"), "blockType")
    await refused((v) => (v.mapping[0].images = [{ slot: "image-1", imageId: "photo-inventee" }]), "imageId")
    await refused((v) => (v.mapping[0].structure = ["magic"]), "structure")
    await refused((v) => (v.sensitive = ["secret"]), "sensible")
    await refused((v) => (v.plan = { add: [] }), "clé de plan")
    await refused((v) => (v.mapping[0].placement = "first"), "clé en plus (mapping)")
    await refused((v) => (v.analysis.sections[0].hasImage = "oui"), "type booléen")
    await refused((v) => (v.analysis.sections[0].imageCount = 99), "borne numérique")
    await refused((v) => (v.mapping[3].reason = 12), "reason non chaîne")
    await refused((v) => (v.analysis.sections[0].intent = null), "intent non chaîne")
    await refused((v) => (v.mapping[0].content[0].slot = "<b>x</b>"), "slot balisé")
    await refused((v) => (v.mapping[0].content[0].slot = "s".repeat(61)), "slot trop long")
    await refused((v) => (v.mapping[0].content[0].value = 5), "valeur non chaîne")
    await refused((v) => (v.analysis.sections = Array.from({ length: 15 }, (_, index) => ({ ...v.analysis.sections[0], ref: `s${index + 1}` }))), "15 sections")
    await refused((v) => delete v.status, "champ manquant")
  })
  test("la règle d'`offer`, les faits sensibles et le contenu sensible ne passent pas par cette étape (mapping inchangé)", async () => {
    const value = good()
    value.mapping[0].content[0].value = "Jusqu'à -30 % avec le code BIENVENUE20"
    const result = await analyze(value)
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    const normalized = normalizeReferenceMapping(result.response, catalog)
    assert.ok(normalized.ok && normalized.value.dropped >= 1, "un fait commercial reste abandonné par le mapping")
  })
  test("la sanitisation ne modifie pas son entrée, ne touche que intent / reason / content[].value, et laisse passer ce qui n'est pas un objet", () => {
    const input = withReason(longReason)
    const before = JSON.stringify(input)
    const out = sanitizeReferenceDescriptions(input) as Json
    assert.equal(JSON.stringify(input), before)
    const clone = structuredClone(input)
    for (const entry of out.mapping) delete entry.reason
    for (const entry of clone.mapping) delete entry.reason
    for (const section of out.analysis.sections) delete section.intent
    for (const section of clone.analysis.sections) delete section.intent
    assert.deepEqual(out, clone)
    for (const value of [null, undefined, "x", 3, [], true]) assert.equal(sanitizeReferenceDescriptions(value), value)
    assert.deepEqual(sanitizeReferenceDescriptions({ analysis: 1, mapping: "x" }), { analysis: 1, mapping: "x" })
  })
})

describe("V2.9.4 correctif — frontières", () => {
  test("la consigne dit les bornes ; le moteur sanitise AVANT le schéma strict ; le schéma strict n'a pas été assoupli", () => {
    assert.match(referenceSystemPrompt, /160 caractères au plus/)
    assert.match(referenceSystemPrompt, /400 caractères au plus/)
    const engine = code("lib/email-builder/reference-engine.ts")
    assert.match(engine, /safeParseReferenceResponse\(schemaContext, sanitizeReferenceDescriptions\(read\.output\)\)/)
    const schema = code("lib/email-builder/reference-schema.ts")
    assert.match(schema, /reason: shortText\("Raison", 160\)/)
    assert.match(schema, /intent: shortText\("Intention", 160\)/)
    assert.match(schema, /value: shortText\("Valeur", 400\)/)
    assert.ok(!/Math\.random|fetch\(|process\.env/.test(schema))
  })
  test("la frontière du second moteur n'est pas concernée : ses textes sont validés PAR candidat (jamais le draft entier)", () => {
    const build = code("lib/email-builder/reference-generated-build.ts")
    assert.match(build, /cleanText\(/)
    assert.ok(!/reference-schema/.test(build))
  })
})
