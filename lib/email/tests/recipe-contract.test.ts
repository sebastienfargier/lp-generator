/**
 * Contrat IA du moteur Email V2, hors ligne : sélection déterministe de la
 * recette, trois Drafts distincts, schémas de transport compacts, contexte
 * Brand par recette, prompts séparés, aller-retour Draft → EmailConfig →
 * validation → terminologie → rendu → aperçu, Drafts invalides, et absence de
 * fuite (URL, chemin, crop, alt, lame, classe, CSS, surface, mention légale,
 * claim non approuvée, corpus) dans ce que le modèle recevra. Aucun appel
 * Anthropic ; le runtime V1 n'est pas touché.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { approvedClaims } from "../../brand/claims"
import { brandTerminologyRules } from "../../brand/terminology"
import { emailDisclaimers } from "../disclaimers"
import { emailDraftHeroBlocks } from "../generation-draft"
import { emailBankImageIds } from "../image-bank"
import {
  buildRecipeBrandContext,
  emailPromptRiskRuleIds,
  emailWritingRules,
  matchBrandAudience,
} from "../recipe-brand-context"
import { emailRecipeDraftFixtures, resolveEmailRecipeDraftFixture } from "../recipe-draft-fixtures"
import {
  BrandProofDraftSchema,
  buildRecipeDraftJsonSchema,
  buildRecipeTransportSchema,
  DiscoveryDraftSchema,
  emailRecipeDraftSchemas,
  heroLayoutFor,
  NewsletterDraftSchema,
  resolveEmailRecipeDraft,
  surfaceIntentFor,
} from "../recipe-drafts"
import {
  brandProofSystemPrompt,
  buildEmailRecipePrompt,
  buildR1EmailPrompt,
  buildR2EmailPrompt,
  buildR3EmailPrompt,
  discoverySystemPrompt,
  newsletterSystemPrompt,
} from "../recipe-prompts"
import {
  emailRecipeIntentRecipes,
  emailRecipeIntents,
  safeParseEmailRecipeRequest,
  selectEmailRecipe,
  type EmailRecipeRequest,
} from "../recipe-selection"
import { classifyEmailRecipeDiagnostics, describeEmailRecipeConfig, type EmailRecipeDiagnostic } from "../recipe-validation"
import { emailRecipeIds, emailRecipes, type EmailRecipeId } from "../recipes"
import { renderEmail } from "../renderer"
import { toPreviewHtml } from "../preview"
import { safeParseEmailConfig } from "../schemas"
import { measure, type JsonSchema } from "./schema-metrics"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

type FixtureId = (typeof emailRecipeDraftFixtures)[number]["id"]
const fixture = (id: string) => emailRecipeDraftFixtures.find((candidate) => candidate.id === id)!
const resolve = (id: string) => resolveEmailRecipeDraftFixture(id as FixtureId)
const requestOf = (id: string) => fixture(id).request as EmailRecipeRequest
const clone = <T>(value: T): T => structuredClone(value)

/** Une requête minimale valide, étendue par `fields`. */
const base = (fields: object = {}) => ({ campaignName: "Campagne de test", brief: "Un brief de test.", audience: "Adultes en réflexion", ...fields })
const parse = (fields: object = {}) => {
  const result = safeParseEmailRecipeRequest(base(fields))
  assert.ok(result.success, JSON.stringify(fields))
  return result.data
}

describe("recettes V2 : sélection déterministe de la recette", () => {
  test("trois intentions V2 → trois recettes", () => {
    assert.deepEqual([...emailRecipeIntents], ["discovery", "editorial", "brand-proof"])
    assert.deepEqual(emailRecipeIntentRecipes, { discovery: "discovery-reassurance", editorial: "editorial-newsletter", "brand-proof": "brand-proof" })
    for (const intent of emailRecipeIntents) {
      const selection = selectEmailRecipe(parse({ intent }))
      assert.deepEqual(selection, { status: "selected", recipe: emailRecipeIntentRecipes[intent], intent, source: "intent" })
    }
  })

  test("l'ancien vocabulaire se rattache par ses champs structurés : objectif → R1, newsletter → R2 ; une preuve exige son intention", () => {
    for (const objective of ["decouverte-formations", "accompagnement", "evolution-carriere"]) {
      assert.deepEqual(selectEmailRecipe(parse({ objective })), { status: "selected", recipe: "discovery-reassurance", intent: "discovery", source: "objective" })
    }
    assert.deepEqual(selectEmailRecipe(parse({ objective: "accompagnement", emailType: "newsletter" })), { status: "selected", recipe: "editorial-newsletter", intent: "editorial", source: "email-type" })
    assert.deepEqual(selectEmailRecipe(parse({ objective: "decouverte-formations", emailType: "lifecycle-debut" })), { status: "selected", recipe: "discovery-reassurance", intent: "discovery", source: "objective" })
    assert.equal(selectEmailRecipe(parse({ intent: "brand-proof", objective: "decouverte-formations" })).status === "selected" && (selectEmailRecipe(parse({ intent: "brand-proof", objective: "decouverte-formations" })) as { recipe: string }).recipe, "brand-proof")
    // Aucun objectif ne mène à R3 : il faut l'intention.
    for (const objective of ["decouverte-formations", "accompagnement", "evolution-carriere"]) assert.notEqual((selectEmailRecipe(parse({ objective })) as { recipe: string }).recipe, "brand-proof")
  })

  test("l'intention explicite l'emporte ; le texte libre du brief et de l'audience n'influence jamais la recette", () => {
    assert.equal((selectEmailRecipe(parse({ intent: "discovery", emailType: "newsletter" })) as { recipe: string }).recipe, "discovery-reassurance")
    const noisy = { objective: "decouverte-formations", brief: "Une newsletter avec les chiffres clés et des preuves Studi.", audience: "Lecteurs de la newsletter" }
    assert.equal((selectEmailRecipe(parse(noisy)) as { recipe: string }).recipe, "discovery-reassurance")
    assert.deepEqual(selectEmailRecipe(parse(noisy)), selectEmailRecipe(parse(noisy)), "déterministe")
  })

  test("une intention non supportée donne une erreur explicite : promotion, transactionnel, fin de séquence, offre, témoignage, partenaire, visuels, mention légale d'un fait, intention absente", () => {
    const codesOf = (fields: object) => {
      const selection = selectEmailRecipe(parse(fields))
      assert.equal(selection.status, "unsupported", JSON.stringify(fields))
      return selection.status === "unsupported" ? selection.issues.map((issue) => issue.code) : []
    }
    assert.deepEqual(codesOf({ intent: "discovery", emailType: "promo" }), ["promotion"])
    assert.deepEqual(codesOf({ intent: "editorial", emailType: "transactionnel" }), ["transactional"])
    assert.deepEqual(codesOf({ objective: "accompagnement", emailType: "lifecycle-fin" }), ["sequence-end"])
    assert.deepEqual(codesOf({ intent: "discovery", offer: { summary: "Une offre", disclaimer: "offre-promotionnelle", endDate: "2026-12-01" } }), ["offer"])
    assert.deepEqual(codesOf({ intent: "brand-proof", testimonial: { quote: "Très bien", author: "Une personne" } }), ["testimonial"])
    assert.deepEqual(codesOf({ intent: "brand-proof", partner: { name: "École" } }), ["partner"])
    assert.deepEqual(codesOf({ intent: "editorial", visuals: [{ src: "https://exemple.com/a.jpg", alt: "Un visuel" }] }), ["visuals"])
    assert.deepEqual(codesOf({ intent: "brand-proof", facts: [{ statement: "Un fait.", disclaimer: "chiffres-performance" }] }), ["fact-disclaimer"])
    assert.deepEqual(codesOf({}), ["missing-intent"])
    for (const message of ["promo", "transactionnel"]) {
      const selection = selectEmailRecipe(parse({ intent: "discovery", emailType: message }))
      assert.ok(selection.status === "unsupported" && selection.issues[0]!.message.length > 20)
    }
  })

  test("la requête V2 étend celle du moteur actuel sans la modifier : mêmes champs stricts, intention et objectif facultatifs", () => {
    assert.ok(!safeParseEmailRecipeRequest(base({ intent: "promotion" })).success, "intention inconnue")
    assert.ok(!safeParseEmailRecipeRequest(base({ objective: "inconnu" })).success)
    assert.ok(!safeParseEmailRecipeRequest(base({ champInconnu: 1 })).success, "objet strict")
    assert.ok(safeParseEmailRecipeRequest(base({ intent: "editorial", subject: "Un objet", facts: [{ statement: "Un fait." }] })).success)
    assert.ok(!safeParseEmailRecipeRequest({ brief: "x", audience: "y" }).success)
  })
})

describe("recettes V2 : trois Drafts distincts", () => {
  const shapeKeys = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape)

  test("chaque recette a son contrat : les trois Drafts ne partagent pas une même forme", () => {
    const r1 = shapeKeys(DiscoveryDraftSchema)
    const r2 = shapeKeys(NewsletterDraftSchema)
    const r3 = shapeKeys(BrandProofDraftSchema)
    assert.deepEqual(r1, ["subject", "preheader", "visualIntent", "hero", "steps", "benefits", "closing"])
    assert.deepEqual(r2, ["edition", "subject", "preheader", "hero", "intro", "rubriques", "closing"])
    assert.deepEqual(r3, ["subject", "preheader", "visualIntent", "hero", "claims", "support", "closing"])
    assert.ok(r2.includes("edition") && !r1.includes("edition") && !r3.includes("edition"))
    assert.ok(r2.includes("rubriques") && !r1.includes("rubriques"))
    assert.ok(r3.includes("claims") && !r1.includes("claims") && !r2.includes("claims"))
    assert.ok(!r2.includes("visualIntent"), "R2 : l'édition décide du visuel")
    assert.deepEqual(Object.keys(emailRecipeDraftSchemas), [...emailRecipeIds])
  })

  test("aucune union des trois au niveau du transport : un schéma par recette, sans alternative", () => {
    for (const recipe of emailRecipeIds) {
      const schema = buildRecipeTransportSchema(recipe) as JsonSchema
      const text = JSON.stringify(schema)
      assert.ok(!/"anyOf"|"oneOf"/.test(text), recipe)
      assert.equal(measure(schema).alternatives, 0, recipe)
      assert.equal((schema.properties as Record<string, unknown>).recipe, undefined, `${recipe} : la recette n'est pas un champ que Claude écrit`)
    }
  })

  test("objets stricts, champs requis, aucun optionnel, vocabulaire fermé", () => {
    const visit = (node: unknown, recipe: string) => {
      if (Array.isArray(node)) return node.forEach((entry) => visit(entry, recipe))
      if (!node || typeof node !== "object") return
      const object = node as Record<string, unknown>
      if (object.properties) {
        assert.equal(object.additionalProperties, false, `${recipe} : objet strict`)
        assert.deepEqual([...(object.required as string[])].sort(), Object.keys(object.properties as object).sort(), `${recipe} : tous les champs requis`)
      }
      Object.values(object).forEach((value) => visit(value, recipe))
    }
    for (const recipe of emailRecipeIds) {
      visit(buildRecipeTransportSchema(recipe), recipe)
      visit(buildRecipeDraftJsonSchema(recipe), recipe)
      assert.equal(measure(buildRecipeTransportSchema(recipe) as JsonSchema).optional, 0, recipe)
    }
  })

  test("aucun champ de présentation : ni lame, classe, couleur, surface, image, chemin, crop, alt, footer, mention légale, URL", () => {
    const forbidden = /^(html|class|className|style|css|color|colour|surface|image|images|src|alt|url|href|path|crop|width|height|footer|header|disclaimer|disclaimers|template|file|block|blocks|lame|type|layout|heroLayout|stripId|strip|recipe|tone|seed|id|slots)$/i
    const names = (node: unknown, found: string[] = []): string[] => {
      if (Array.isArray(node)) node.forEach((entry) => names(entry, found))
      else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (key === "properties") found.push(...Object.keys(value as object))
          names(value, found)
        }
      }
      return found
    }
    for (const recipe of emailRecipeIds) {
      for (const name of names(buildRecipeTransportSchema(recipe))) assert.ok(!forbidden.test(name), `${recipe} : champ « ${name} »`)
    }
  })

  test("vocabulaires fermés : destinations et icônes par identifiant, intentions de la recette, claims approuvées et acceptées", () => {
    const enums = (schema: unknown): string[][] => {
      const found: string[][] = []
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (!node || typeof node !== "object") return
        const object = node as Record<string, unknown>
        if (Array.isArray(object.enum)) found.push(object.enum as string[])
        Object.values(object).forEach(walk)
      }
      walk(schema)
      return found
    }
    for (const recipe of emailRecipeIds) {
      const lists = enums(buildRecipeTransportSchema(recipe))
      const destinations = lists.find((list) => list.includes(emailRecipes[recipe].destinations[0]!))!
      assert.deepEqual([...destinations].sort(), [...emailRecipes[recipe].destinations].sort(), `${recipe} : destinations`)
      for (const list of lists) for (const value of list) assert.ok(!/https?:|\/|\./.test(value), `${recipe} : « ${value} » n'est pas un identifiant`)
    }
    const r1 = enums(buildRecipeTransportSchema("discovery-reassurance"))
    assert.ok(r1.some((list) => list.join() === emailRecipes["discovery-reassurance"].images.intents.join()))
    const r3 = enums(buildRecipeTransportSchema("brand-proof"))
    const claimList = r3.find((list) => list.includes("catalogue-formations") && list.includes("apprenants-en-formation"))!
    assert.deepEqual([...claimList].sort(), [...emailRecipes["brand-proof"].claims.allowed].sort())
    assert.ok(!claimList.includes("financement-dispositifs"), "la claim de financement n'est pas acceptée par R3")
    for (const id of claimList) assert.ok(approvedClaims.some((claim) => claim.id === id))
    assert.deepEqual(enums(buildRecipeTransportSchema("editorial-newsletter")).find((list) => list.includes("banner")), ["banner", "portrait-strip"])
  })

  test("schémas de transport compatibles Structured Outputs : ni oneOf, ni longueurs, ni pattern, ni $schema, minItems ≤ 1", () => {
    for (const recipe of emailRecipeIds) {
      const text = JSON.stringify(buildRecipeTransportSchema(recipe))
      assert.ok(!/"oneOf"|"minLength"|"maxLength"|"maxItems"|"pattern"|"\$schema"|"format"/.test(text), recipe)
      for (const match of text.matchAll(/"minItems":(\d+)/g)) assert.ok(Number(match[1]) <= 1, recipe)
      assert.deepEqual(JSON.parse(JSON.stringify(buildRecipeTransportSchema(recipe))), buildRecipeTransportSchema(recipe), "sérialisable et déterministe")
    }
  })

  test("complexité : LOW pour les trois recettes, bien en dessous du Draft V1 et de Landing V2h", () => {
    const v1 = { objects: 14, properties: 45, alternatives: 7, expanded: 3425 }
    for (const recipe of emailRecipeIds) {
      const metrics = measure(buildRecipeTransportSchema(recipe) as JsonSchema)
      assert.equal(metrics.alternatives, 0, `${recipe} alternatives`)
      assert.equal(metrics.optional, 0, `${recipe} optionnels`)
      assert.equal(metrics.patterns, 0, `${recipe} patterns`)
      assert.ok(metrics.objects <= 8 && metrics.objects < v1.objects, `${recipe} objets : ${metrics.objects}`)
      assert.ok(metrics.properties <= 32 && metrics.properties < v1.properties, `${recipe} propriétés : ${metrics.properties}`)
      assert.ok(metrics.expandedBytes < v1.expanded, `${recipe} caractères développés : ${metrics.expandedBytes}`)
      assert.ok(metrics.depth <= 9, `${recipe} profondeur : ${metrics.depth}`)
    }
  })

  test("la vue de transport est celle du Draft, adaptée sans l'altérer", () => {
    for (const recipe of emailRecipeIds) {
      const original = JSON.stringify(buildRecipeDraftJsonSchema(recipe))
      buildRecipeTransportSchema(recipe)
      assert.equal(JSON.stringify(buildRecipeDraftJsonSchema(recipe)), original)
    }
  })
})

describe("recettes V2 : contexte Brand compact", () => {
  const audiences = ["Adultes en réflexion sur leur orientation", "Personnes en recherche d'emploi", "Alternants en entreprise", "Responsables RH et entreprises", "Actifs en poste", "En reconversion professionnelle"]

  test("la cible du corpus se déduit de l'audience par indices lexicaux, sinon la voix par défaut", () => {
    assert.equal(matchBrandAudience("Personnes en recherche d'emploi"), "demandeurs_emploi")
    assert.equal(matchBrandAudience("Demandeurs d'emploi"), "demandeurs_emploi")
    assert.equal(matchBrandAudience("Alternants en entreprise"), "alternants")
    assert.equal(matchBrandAudience("Responsables RH"), "b2b_rh")
    assert.equal(matchBrandAudience("Adultes en reconversion"), "reconversion")
    assert.equal(matchBrandAudience("Actifs en poste"), "actifs_en_poste")
    assert.equal(matchBrandAudience("Adultes en réflexion sur leur orientation"), undefined)
    assert.equal(matchBrandAudience("Lecteurs de la communauté"), undefined, "« communauté » ne contient pas de cible")
    assert.equal(buildRecipeBrandContext("discovery-reassurance", "Adultes en réflexion").context.voice.address, "vouvoiement")
    assert.equal(buildRecipeBrandContext("discovery-reassurance", "Alternants en entreprise").context.voice.address, "tutoiement")
    assert.match(buildRecipeBrandContext("discovery-reassurance", "Personnes en recherche d'emploi").context.voice.tone, /Empathique/)
    assert.deepEqual(buildRecipeBrandContext("discovery-reassurance", "Personnes en recherche d'emploi").context.voice.audience?.label, "Demandeurs d'emploi")
  })

  test("règles de rédaction : courtes, sourcées, et formulations à risque venues des règles de terminologie existantes", () => {
    assert.equal(emailWritingRules.length, 7)
    for (const rule of emailWritingRules) assert.ok(rule.text.length < 160, rule.text)
    const ids = brandTerminologyRules.map((rule) => rule.id as string)
    for (const id of emailPromptRiskRuleIds) assert.ok(ids.includes(id), id)
    for (const recipe of emailRecipeIds) {
      const { context } = buildRecipeBrandContext(recipe, "Adultes")
      assert.equal(context.avoid.length, emailPromptRiskRuleIds.length)
      for (const entry of context.avoid) assert.ok(entry.term.length > 3)
      assert.ok(context.avoid.some((entry) => /garanti/.test(entry.term)) && context.avoid.some((entry) => /gratuit/.test(entry.term)))
    }
  })

  test("R1 et R2 ne reçoivent aucune claim ; R3 reçoit les claims approuvées acceptées, identifiant et formulation exacte", () => {
    for (const recipe of ["discovery-reassurance", "editorial-newsletter"] as const) {
      const { context, provenance } = buildRecipeBrandContext(recipe, "Adultes")
      assert.equal(context.claims, undefined, recipe)
      assert.deepEqual(provenance.claims, [], recipe)
      // « Compétences 360 » est un nom de destination : on ne regarde que la voix, les règles, les formulations et les intentions.
      // « 100% financé » figure dans les formulations à éviter : c'est un exemple interdit, pas un chiffre à reprendre.
      const guidance = JSON.stringify([context.voice, context.rules, context.avoid, context.visualIntents]).replace(/100 ?%/g, "")
      assert.ok(!/\d{3,}|\d \d{3}/.test(guidance), `${recipe} : aucun chiffre de claim dans le contexte`)
    }
    const { context, provenance } = buildRecipeBrandContext("brand-proof", "Adultes")
    assert.deepEqual(context.claims!.map((claim) => claim.id), [...emailRecipes["brand-proof"].claims.allowed])
    for (const claim of context.claims!) assert.equal(claim.statement, approvedClaims.find((candidate) => candidate.id === claim.id)!.statement)
    assert.ok(!context.claims!.some((claim) => claim.id === "financement-dispositifs"))
    assert.ok(provenance.claims.every((claim) => claim.status === "approved" && claim.documentId === "chiffres-cles"))
  })

  test("la provenance et les statuts sont conservés en interne, jamais dans ce que reçoit le modèle", () => {
    const { provenance } = buildRecipeBrandContext("discovery-reassurance", "Personnes en recherche d'emploi")
    const statuses = Object.fromEntries(provenance.documents.map((entry) => [entry.documentId, entry.status]))
    assert.deepEqual(statuses, { "identite-marque": "draft", "promesse-editoriale": "in-review", "regles-editoriales": "draft", "lexique-marque": "in-review", "adaptation-par-cible": "draft" })
    for (const recipe of emailRecipeIds) {
      const prompt = buildEmailRecipePrompt({ ...base(), intent: emailRecipes[recipe] && (Object.entries(emailRecipeIntentRecipes).find(([, id]) => id === recipe)![0]) })
      assert.equal(prompt.status, "ready")
      if (prompt.status !== "ready") continue
      assert.ok(!/provenance|"status"|in-review|draft|approved|documentId|chiffres-cles/.test(prompt.user + prompt.system), recipe)
      assert.ok(prompt.provenance.documents.length >= 4)
    }
  })

  test("taille du contexte : compact pour chaque recette (le corpus complet n'est jamais envoyé)", () => {
    for (const audience of audiences) {
      for (const recipe of emailRecipeIds) {
        const size = JSON.stringify(buildRecipeBrandContext(recipe, audience).context).length
        assert.ok(size < 3500, `${recipe} / ${audience} : ${size} caractères`)
      }
    }
    const corpus = ["guidelines", "generation"].flatMap((dir) => readdirSync(join(root, "ressources/brand", dir)).map((file) => statSync(join(root, "ressources/brand", dir, file)).size))
    assert.equal(corpus.length, 24, "les 24 documents du corpus")
    const total = corpus.reduce((sum, size) => sum + size, 0)
    assert.ok(total > 70_000)
    assert.ok(JSON.stringify(buildRecipeBrandContext("brand-proof", "Adultes").context).length < total / 20, "moins d'un vingtième du corpus")
  })

  test("les destinations du contexte sont celles de la recette, par identifiant, libellé et usage", () => {
    for (const recipe of emailRecipeIds) {
      const { context } = buildRecipeBrandContext(recipe, "Adultes")
      assert.deepEqual(context.destinations.map((entry) => entry.id), [...emailRecipes[recipe].destinations])
      for (const entry of context.destinations) assert.deepEqual(Object.keys(entry), ["id", "label", "usage"])
    }
  })
})

describe("recettes V2 : prompts par recette", () => {
  const prompts = () => [
    buildR1EmailPrompt(parse({ intent: "discovery" })),
    buildR2EmailPrompt(parse({ intent: "editorial" })),
    buildR3EmailPrompt(parse({ intent: "brand-proof" })),
  ]

  test("trois prompts séparés, chacun centré sur sa recette", () => {
    assert.equal(new Set([discoverySystemPrompt, newsletterSystemPrompt, brandProofSystemPrompt]).size, 3)
    assert.match(discoverySystemPrompt, /DÉCOUVERTE ET DE RÉASSURANCE/)
    assert.match(newsletterSystemPrompt, /NEWSLETTER/)
    assert.match(brandProofSystemPrompt, /PREUVES DE MARQUE/)
    assert.ok(/steps/.test(discoverySystemPrompt) && /benefits/.test(discoverySystemPrompt) && !/edition|claims|support/.test(discoverySystemPrompt))
    assert.ok(/edition/.test(newsletterSystemPrompt) && /rubriques/.test(newsletterSystemPrompt) && !/benefits|claims|support/.test(newsletterSystemPrompt))
    assert.ok(/claims/.test(brandProofSystemPrompt) && /support/.test(brandProofSystemPrompt) && !/benefits|rubriques|edition/.test(brandProofSystemPrompt))
    for (const prompt of prompts()) assert.ok(prompt.system.length < 2600 && prompt.system.length > 1200, `${prompt.recipe} : ${prompt.system.length}`)
  })

  test("le prompt de chaque recette porte le schéma de sa recette et son contexte", () => {
    const [r1, r2, r3] = prompts()
    assert.deepEqual([r1!.recipe, r2!.recipe, r3!.recipe], [...emailRecipeIds])
    assert.deepEqual(r1!.transportSchema, buildRecipeTransportSchema("discovery-reassurance"))
    assert.deepEqual(r2!.transportSchema, buildRecipeTransportSchema("editorial-newsletter"))
    assert.deepEqual(r3!.transportSchema, buildRecipeTransportSchema("brand-proof"))
    for (const prompt of [r1!, r2!, r3!]) {
      const user = JSON.parse(prompt.user) as { request: Record<string, unknown>; context: Record<string, unknown> }
      assert.deepEqual(Object.keys(user), ["request", "context"])
      assert.deepEqual(user.context, JSON.parse(JSON.stringify(prompt.context)))
    }
  })

  test("le dispatcher choisit la recette, déterministe, et refuse avant tout une demande invalide ou non prise en charge", () => {
    const ready = buildEmailRecipePrompt(base({ intent: "editorial" }))
    assert.equal(ready.status === "ready" && ready.recipe, "editorial-newsletter")
    assert.deepEqual(buildEmailRecipePrompt(base({ intent: "editorial" })), ready, "même requête, même prompt")
    assert.equal(buildEmailRecipePrompt({ brief: "x" }).status, "invalid-request")
    const refused = buildEmailRecipePrompt(base({ intent: "discovery", emailType: "promo" }))
    assert.ok(refused.status === "unsupported" && refused.issues[0]!.code === "promotion")
    assert.equal(buildEmailRecipePrompt(base()).status, "unsupported")
  })

  test("les faits de la demande passent tels quels et séparés ; une claim n'y est jamais mélangée", () => {
    const facts = [{ statement: "Les conseillers répondent sous 48 heures." }, { statement: "Un webinaire de présentation est proposé." }]
    for (const intent of emailRecipeIntents) {
      const prompt = buildEmailRecipePrompt(base({ intent, facts }))
      assert.ok(prompt.status === "ready")
      const user = JSON.parse(prompt.user) as { request: { facts: string[] }; context: { claims?: { statement: string }[] } }
      assert.deepEqual(user.request.facts, facts.map((fact) => fact.statement))
      for (const statement of user.request.facts) assert.ok(!(user.context.claims ?? []).some((claim) => claim.statement === statement))
      if (intent !== "brand-proof") assert.equal(user.context.claims, undefined, "R1 et R2 : aucune claim injectée")
    }
    const none = buildEmailRecipePrompt(base({ intent: "discovery" }))
    assert.ok(none.status === "ready" && !("facts" in (JSON.parse(none.user) as { request: object }).request))
  })

  test("les prompts disent comment traiter les faits et les claims, sans HTML, CSS ni vocabulaire de lames", () => {
    for (const system of [discoverySystemPrompt, newsletterSystemPrompt, brandProofSystemPrompt]) {
      assert.match(system, /request\.facts/)
      assert.match(system, /context\.avoid/)
      assert.match(system, /jamais/)
      assert.ok(!/email-module|email-hero|numbered-list|text-only|surface:|<[a-z]+>|class=|className/.test(system))
    }
    assert.match(brandProofSystemPrompt, /à l'identique/)
    assert.match(brandProofSystemPrompt, /context\.claims/)
  })
})

describe("recettes V2 : aucune fuite dans ce que le modèle recevra", () => {
  const corpusLines = (() => {
    const lines: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(root, dir))) {
        const path = join(dir, name)
        if (statSync(join(root, path)).isDirectory()) walk(path)
        else if (name.endsWith(".md")) for (const line of read(path).split("\n")) if (line.trim().length >= 70 && !/^(---|#|\|)/.test(line.trim())) lines.push(line.trim())
      }
    }
    walk("ressources/brand")
    return lines
  })()

  const audiences = ["Adultes en réflexion sur leur orientation", "Personnes en recherche d'emploi", "Alternants en entreprise"]
  const everyPrompt = () =>
    emailRecipeIntents.flatMap((intent) =>
      audiences.map((audience) => {
        const prompt = buildEmailRecipePrompt(base({ intent, audience, facts: [{ statement: "Un webinaire de présentation est proposé." }] }))
        assert.ok(prompt.status === "ready")
        return prompt
      })
    )

  test("ni URL, ni chemin, ni crop, ni alt, ni dimension, ni nom de lame, ni classe, ni CSS, ni surface brute, ni HTML de footer", () => {
    for (const prompt of everyPrompt()) {
      const sent = prompt.system + prompt.user + JSON.stringify(prompt.transportSchema)
      assert.ok(!/https?:\/\/|\.jpe?g|\.png|\/images|\/public|ressources|demo-assets|\.invalid|hf_/.test(sent), `${prompt.recipe} : URL ou chemin`)
      assert.ok(!/\bcrop|\bsrc\b|\balt\b|\bwidth|\bheight|\bpx\b|--(?:medium|large|split|band|strip)/i.test(sent), `${prompt.recipe} : crop, alt ou dimension`)
      assert.ok(!/email-module|email-hero|\.html|numbered-list|icons-list|text-only|hero-split|promotional-image|header-newsletter|footer-compact/i.test(sent), `${prompt.recipe} : nom de lame`)
      assert.ok(!/className|class=|style=|\bcss\b|#[0-9a-f]{6}\b|font-family|<table|<td|<img|<a /i.test(sent.replace(/Ce que tu ne produis jamais[^"]*/g, "")), `${prompt.recipe} : classe, CSS ou HTML`)
      assert.ok(!/"surface"|accent-1|accent-2|"encre"|"marque"|"bloc"|surfaceIntent/.test(sent), `${prompt.recipe} : surface`)
      assert.ok(!/unsubscribe|désabonn|lien-desabonnement|\[URL_CDN|\[PREHEADER\]/i.test(sent), `${prompt.recipe} : footer ou jeton système`)
    }
  })

  test("aucune image, frise ni identifiant d'image de la banque, aucune lame, aucune URL de destination", () => {
    for (const prompt of everyPrompt()) {
      const sent = prompt.system + prompt.user
      for (const id of emailBankImageIds) assert.ok(!sent.includes(id), `${prompt.recipe} : ${id}`)
      assert.ok(!/portrait-strip-mixed|strip-\d/.test(sent), prompt.recipe)
      assert.ok(!/studi\.com|meet\.studi|UTM/.test(sent), `${prompt.recipe} : URL de destination`)
      for (const id of emailRecipes[prompt.recipe].destinations) assert.ok(sent.includes(id), `${prompt.recipe} : destination ${id} par identifiant`)
    }
  })

  test("aucun texte de mention légale, et aucune claim brouillon, en revue ou de test", () => {
    for (const prompt of everyPrompt()) {
      const sent = prompt.system + prompt.user
      for (const entry of Object.values(emailDisclaimers)) assert.ok(!sent.includes(entry.text.slice(0, 40)), `${prompt.recipe} : texte de disclaimer`)
      assert.ok(!/Audirep|2309|Talent\.com|Plus de 300|diplome-ou-rembourse|Diplômé ou Remboursé/.test(sent), `${prompt.recipe} : donnée en revue ou de test`)
      assert.ok(!/36 mois|CPF|France Travail/.test(sent.replace(/france travail/gi, "")) || prompt.recipe !== "brand-proof", "pas de financement dans les preuves")
    }
  })

  test("aucun extrait du corpus Markdown n'est recopié ; l'ensemble reste compact", () => {
    assert.ok(corpusLines.length > 50)
    for (const prompt of everyPrompt()) {
      const sent = prompt.system + prompt.user
      for (const line of corpusLines) assert.ok(!sent.includes(line.slice(0, 60)), `${prompt.recipe} : « ${line.slice(0, 60)} »`)
      assert.ok(prompt.user.length < 4500, `${prompt.recipe} : message de ${prompt.user.length} caractères`)
      assert.ok(prompt.system.length + prompt.user.length < 7000, `${prompt.recipe} : ${prompt.system.length + prompt.user.length} caractères au total`)
    }
  })

  test("R3 : seules des claims approuvées sont exposées, avec leur identifiant et leur formulation exacte ; R1 et R2 n'en exposent aucune", () => {
    const exact = new Map(approvedClaims.map((claim) => [claim.id as string, claim.statement]))
    for (const prompt of everyPrompt()) {
      const claims = (JSON.parse(prompt.user) as { context: { claims?: { id: string; statement: string }[] } }).context.claims
      if (prompt.recipe !== "brand-proof") {
        assert.equal(claims, undefined)
        for (const statement of exact.values()) assert.ok(!(prompt.system + prompt.user).includes(statement), `${prompt.recipe} : claim dans le prompt`)
        continue
      }
      assert.ok(claims && claims.length === 5)
      for (const claim of claims) assert.equal(claim.statement, exact.get(claim.id))
      assert.ok(!claims.some((claim) => claim.id === "financement-dispositifs"))
    }
  })

  test("les trois contextes ne contiennent que des clés connues", () => {
    for (const prompt of everyPrompt()) {
      for (const key of Object.keys(prompt.context)) assert.ok(["voice", "rules", "avoid", "destinations", "visualIntents", "claims"].includes(key), key)
    }
  })
})

describe("recettes V2 : aller-retour hors ligne (six Drafts)", () => {
  test("Draft → resolver → EmailConfig → recette → terminologie → rendu → aperçu, sans Anthropic", () => {
    assert.deepEqual(emailRecipeDraftFixtures.map((entry) => entry.id), ["D-R1-A", "D-R1-B", "D-R2-A", "D-R2-B", "D-R3-A", "D-R3-B"])
    for (const entry of emailRecipeDraftFixtures) {
      const { selection, resolution } = resolve(entry.id)
      assert.equal(selection.status === "selected" && selection.recipe, entry.recipe, entry.id)
      assert.equal(resolution.status, "resolved", `${entry.id} : ${resolution.status === "resolved" ? "" : JSON.stringify(resolution.issues)}`)
      if (resolution.status !== "resolved") continue
      assert.ok(safeParseEmailConfig(resolution.config).success, entry.id)
      assert.deepEqual(resolution.diagnostics.filter((diagnostic) => diagnostic.level === "error"), [], entry.id)
      assert.deepEqual(resolution.policy.blocking, [], entry.id)
      const html = renderEmail(resolution.config)
      const preview = toPreviewHtml(html)
      assert.ok(html.includes("demo-assets.invalid/email-v2/") && !preview.includes("demo-assets.invalid"), entry.id)
      assert.deepEqual(resolve(entry.id).resolution, resolution, `${entry.id} : déterministe`)
    }
  })

  test("les six Drafts donnent six compositions distinctes, aux budgets de boutons et zones de la recette", () => {
    const sequences = emailRecipeDraftFixtures.map((entry) => {
      const { resolution } = resolve(entry.id)
      assert.ok(resolution.status === "resolved")
      const description = describeEmailRecipeConfig(resolution.config)
      assert.ok(description.buttons <= emailRecipes[entry.recipe].cta.buttons, entry.id)
      assert.equal(description.buttonDestinations.length, 1, entry.id)
      assert.equal(description.strongZones.length, 1, entry.id)
      return description.sequence.join(">")
    })
    assert.equal(new Set(sequences).size, 6)
  })

  test("R2 : les deux éditions donnent des heros et des clôtures différents ; la frise est choisie par le code", () => {
    const sequence = (id: string) => {
      const { resolution } = resolve(id)
      assert.ok(resolution.status === "resolved")
      return describeEmailRecipeConfig(resolution.config).sequence
    }
    const banner = sequence("D-R2-A")
    const strip = sequence("D-R2-B")
    assert.ok(banner.includes("email-hero-newsletter-variant-02") && banner.includes("email-module-text-and-cta-variant-02"))
    assert.ok(strip.includes("email-hero-newsletter-variant-01") && strip.includes("email-module-text-and-cta-variant-01"))
    const stripResolution = resolve("D-R2-B").resolution
    assert.ok(stripResolution.status === "resolved" && describeEmailRecipeConfig(stripResolution.config).imageIds.length === 5)
    const draft = fixture("D-R2-B").draft as { edition: string }
    assert.equal(draft.edition, "portrait-strip")
    assert.ok(!("stripId" in draft), "le Draft ne désigne aucune image ni frise")
  })

  test("R3 : la formulation exacte de chaque claim vient de Brand, jamais du Draft", () => {
    for (const id of ["D-R3-A", "D-R3-B"]) {
      const draft = fixture(id).draft as unknown as { claims: string[]; support: string[] }
      const { resolution } = resolve(id)
      assert.ok(resolution.status === "resolved")
      const text = JSON.stringify(resolution.config)
      for (const claimId of draft.claims) {
        const statement = approvedClaims.find((claim) => claim.id === claimId)!.statement
        assert.ok(text.includes(JSON.stringify(statement).slice(1, -1)), `${id} : ${claimId}`)
        assert.ok(!draft.support.join(" ").includes(statement), "le Draft ne recopie aucune formulation")
      }
      assert.deepEqual(resolution.claims.map((claim) => claim.id), draft.claims)
      assert.ok(resolution.claims.every((claim) => claim.status === "approved" && claim.documentId === "chiffres-cles"))
      assert.ok(!/\d/.test(draft.support.join(" ")))
    }
    const a = resolve("D-R3-A").resolution
    const b = resolve("D-R3-B").resolution
    assert.ok(a.status === "resolved" && b.status === "resolved")
    assert.ok(describeEmailRecipeConfig(a.config).sequence.includes("email-module-numbered-list"), "trois claims : liste")
    assert.equal(describeEmailRecipeConfig(b.config).sequence.filter((type) => type === "email-module-text-only").length, 3, "deux claims : deux titres de claim et un texte de liaison")
  })

  test("décisions du code, déterministes : disposition du hero, surface d'empathie, objet imposé", () => {
    assert.equal(surfaceIntentFor("Personnes en recherche d'emploi"), "empathy")
    assert.equal(surfaceIntentFor("Adultes en réflexion"), "default")
    const r1b = resolve("D-R1-B").resolution
    assert.ok(r1b.status === "resolved" && (r1b.config.blocks[1] as { surface?: string }).surface === "accent-2-soft", "audience en recherche d'emploi : surface douce, décidée par le code")
    const r1a = resolve("D-R1-A").resolution
    assert.ok(r1a.status === "resolved" && (r1a.config.blocks[1] as { surface?: string }).surface === "marque")
    for (const recipe of emailRecipeIds) {
      for (const intent of emailRecipes[recipe].images.intents) {
        const layout = heroLayoutFor(recipe, intent, "graine")
        assert.equal(layout, heroLayoutFor(recipe, intent, "graine"))
        assert.ok((emailRecipes[recipe].heroLayouts as readonly string[]).includes(layout))
      }
    }
    assert.notEqual(heroLayoutFor("brand-proof", "editorial-work", "x"), "split", "pas d'image éditoriale verticale : jamais split")
    const imposed = resolveEmailRecipeDraft({ ...requestOf("D-R1-A"), subject: "Un objet imposé par la demande" }, "discovery-reassurance", fixture("D-R1-A").draft)
    assert.ok(imposed.status === "resolved" && imposed.config.subject === "Un objet imposé par la demande")
  })

  test("les faits de la demande admettent leurs nombres, recopiés tels quels, et rien d'autre", () => {
    const draft = clone(fixture("D-R1-A").draft) as { closing: { text: string } }
    draft.closing.text = "Les conseillers répondent sous 48 heures : posez-leur vos questions."
    const without = resolveEmailRecipeDraft(requestOf("D-R1-A"), "discovery-reassurance", draft)
    assert.equal(without.status, "invalid-recipe", "un nombre sans fait de la demande est refusé")
    assert.ok(without.status === "invalid-recipe" && without.issues.some((issue) => issue.code === "figure"))
    const withFact = resolveEmailRecipeDraft({ ...requestOf("D-R1-A"), facts: [{ statement: "Les conseillers répondent sous 48 heures" }] }, "discovery-reassurance", draft)
    assert.equal(withFact.status, "resolved")
    draft.closing.text = "Les conseillers répondent sous 72 heures : posez-leur vos questions."
    assert.equal(resolveEmailRecipeDraft({ ...requestOf("D-R1-A"), facts: [{ statement: "Les conseillers répondent sous 48 heures" }] }, "discovery-reassurance", draft).status, "invalid-recipe", "un autre nombre reste refusé")
  })
})

describe("recettes V2 : Drafts invalides", () => {
  type Mutation = [label: string, id: string, mutate: (draft: Record<string, any>) => void, status?: string] // eslint-disable-line @typescript-eslint/no-explicit-any

  const mutations: Mutation[] = [
    ["destination inconnue", "D-R1-A", (d) => (d.hero.cta.destination = "inconnue")],
    ["destination hors de la recette (blog en R1)", "D-R1-A", (d) => (d.hero.cta.destination = "blog")],
    ["URL à la place d'une destination", "D-R1-A", (d) => (d.hero.cta.destination = "https://www.studi.com/fr/formations")],
    ["intention visuelle incompatible (R1)", "D-R1-A", (d) => (d.visualIntent = "campaign-portrait")],
    ["intention visuelle incompatible (R3)", "D-R3-A", (d) => (d.visualIntent = "warm-reassurance")],
    ["édition de newsletter inconnue", "D-R2-A", (d) => (d.edition = "carousel")],
    ["une seule claim", "D-R3-A", (d) => ((d.claims = ["catalogue-formations"]), (d.support = ["Un texte."]))],
    ["quatre claims", "D-R3-A", (d) => ((d.claims = ["catalogue-formations", "formations-alternance", "formateurs-conseillers", "apprenants-en-formation"]), (d.support = ["a", "b", "c", "d"]))],
    ["claim dupliquée", "D-R3-A", (d) => (d.claims = ["catalogue-formations", "catalogue-formations", "formateurs-conseillers"])],
    ["claim inconnue", "D-R3-A", (d) => (d.claims = ["catalogue-formations", "formations-alternance", "plus-de-300-formations"])],
    ["claim non approuvée de test", "D-R3-B", (d) => (d.claims = ["apprenants-en-formation", "chiffres-performance"])],
    ["claim approuvée mais hors de la recette (financement)", "D-R3-B", (d) => (d.claims = ["apprenants-en-formation", "financement-dispositifs"])],
    ["appuis et claims en nombre différent", "D-R3-A", (d) => d.support.pop()],
    ["champ libre pour réécrire une claim", "D-R3-A", (d) => (d.claimStatements = ["Plus de 500 formations"])],
    ["propriété supplémentaire à la racine", "D-R1-A", (d) => (d.note = "autre")],
    ["propriété supplémentaire dans le hero", "D-R2-A", (d) => (d.hero.badge = "nouveau")],
    ["champ de présentation : surface brute", "D-R1-A", (d) => (d.surface = "accent-1")],
    ["champ de présentation : classe", "D-R2-B", (d) => (d.hero.className = "big")],
    ["champ de présentation : template", "D-R1-A", (d) => (d.template = "email-module-hero-split-image")],
    ["chemin d'image injecté", "D-R1-A", (d) => (d.hero.image = "/images/email/v2/quai-gare--large.jpg")],
    ["URL d'image injectée", "D-R3-A", (d) => (d.hero.cta.image = "https://exemple.com/a.jpg")],
    ["URL libre dans un lien", "D-R2-A", (d) => (d.hero.cta.url = "https://exemple.com")],
    ["URL libre dans un texte", "D-R1-A", (d) => (d.closing.text = "Rendez-vous sur https://exemple.com pour en savoir plus.")],
    ["chemin d'image dans un texte", "D-R2-A", (d) => (d.intro.text = "Voir /images/email/v2/quai-gare--large.jpg ici.")],
    ["HTML dans un texte", "D-R1-A", (d) => (d.hero.title = "Clarifiez <strong>votre</strong> projet")],
    ["texte vide", "D-R2-B", (d) => (d.intro.title = "   ")],
    ["mauvais nombre d'étapes", "D-R1-A", (d) => d.steps.items.pop()],
    ["mauvais nombre de rubriques", "D-R2-A", (d) => d.rubriques.items.pop()],
    ["icône hors de la liste", "D-R1-A", (d) => (d.benefits.items[0].icon = "rocket-launch")],
    ["champ manquant", "D-R3-B", (d) => delete d.closing],
    ["Draft d'une autre recette", "D-R1-A", (d) => Object.assign(d, { edition: "banner", rubriques: {}, intro: {} })],
    ["chiffre inventé (R1)", "D-R1-A", (d) => (d.hero.text = "Plus de 95 % des apprenants se disent satisfaits."), "invalid-recipe"],
    ["chiffre inventé dans un appui (R3)", "D-R3-A", (d) => (d.support[0] = "Plus de 500 formations disponibles."), "invalid-recipe"],
  ]

  for (const [label, id, mutate, expected] of mutations) {
    test(`refusé : ${label}`, () => {
      const draft = clone(fixture(id).draft) as Record<string, unknown>
      mutate(draft)
      const resolution = resolveEmailRecipeDraft(requestOf(id), fixture(id).recipe, draft)
      assert.equal(resolution.status, expected ?? "invalid-draft", JSON.stringify(resolution).slice(0, 200))
      assert.ok("issues" in resolution && resolution.issues.length > 0)
    })
  }

  test("un Draft invalide ne produit jamais d'EmailConfig ni de contenu de remplacement", () => {
    for (const [, id, mutate] of mutations) {
      const draft = clone(fixture(id).draft) as Record<string, unknown>
      mutate(draft)
      const resolution = resolveEmailRecipeDraft(requestOf(id), fixture(id).recipe, draft)
      assert.notEqual(resolution.status, "resolved")
      assert.ok(!("config" in resolution))
    }
  })

  test("le Draft d'une recette est refusé par le schéma d'une autre", () => {
    for (const a of emailRecipeIds) {
      for (const b of emailRecipeIds) {
        if (a === b) continue
        const draft = fixture(emailRecipeDraftFixtures.find((entry) => entry.recipe === a)!.id).draft
        assert.ok(!emailRecipeDraftSchemas[b as EmailRecipeId].safeParse(draft).success, `${a} → ${b}`)
      }
    }
  })
})

describe("recettes V2 : politique de terminologie", () => {
  const diagnostic = (overrides: Partial<EmailRecipeDiagnostic>): EmailRecipeDiagnostic => ({
    level: "error",
    ruleId: "gratuit",
    path: "subject",
    match: "gratuit",
    label: "x",
    sourceStatus: "in-review",
    sourceDocumentId: "lexique-marque",
    ...overrides,
  })

  test("conflit connu → relecture humaine ; règle de brouillon → information ; erreur approuvée → bloquante ; erreur en revue → relecture ; avertissement → information", () => {
    const policy = classifyEmailRecipeDiagnostics([
      diagnostic({ level: "known-conflict", ruleId: "facile-rapide", conflictId: "facilement", sourceStatus: "in-review" }),
      diagnostic({ ruleId: "injonction", sourceStatus: "draft" }),
      diagnostic({ ruleId: "gratuit", sourceStatus: "approved" }),
      diagnostic({ ruleId: "garanti", sourceStatus: "in-review" }),
      diagnostic({ level: "warning", ruleId: "sur-mesure", sourceStatus: "in-review" }),
      diagnostic({ level: "error", ruleId: "x", sourceStatus: "draft" }),
    ])
    assert.deepEqual(policy.humanReview.map((entry) => entry.ruleId), ["facile-rapide", "garanti"])
    assert.deepEqual(policy.blocking.map((entry) => entry.ruleId), ["gratuit"])
    assert.deepEqual(policy.advisory.map((entry) => entry.ruleId), ["injonction", "sur-mesure", "x"])
    assert.deepEqual(classifyEmailRecipeDiagnostics([]), { blocking: [], humanReview: [], advisory: [] })
  })

  test("aucune règle actuelle n'est approuvée : rien ne bloque aujourd'hui, et aucune correction ni relance n'existe", () => {
    assert.ok(brandTerminologyRules.length > 20)
    const draft = clone(fixture("D-R1-A").draft) as { hero: { text: string } }
    draft.hero.text = "Une formation gratuite pour un emploi garanti, sans effort."
    const resolution = resolveEmailRecipeDraft(requestOf("D-R1-A"), "discovery-reassurance", draft)
    assert.equal(resolution.status, "resolved", "le lint ne bloque pas : il range")
    assert.ok(resolution.status === "resolved")
    assert.ok(resolution.diagnostics.some((entry) => entry.ruleId === "gratuit" && entry.level === "error"))
    assert.deepEqual(resolution.policy.blocking, [])
    assert.ok(resolution.policy.humanReview.length >= 3, "les erreurs de règles en revue vont en relecture humaine")
    assert.ok(resolution.config.blocks.some((block) => JSON.stringify(block).includes("formation gratuite")), "le texte n'est jamais réécrit")
    for (const path of ["lib/email/recipe-drafts.ts", "lib/email/recipe-prompts.ts", "lib/email/recipe-selection.ts", "lib/email/recipe-brand-context.ts"]) {
      assert.ok(!/retry|retries|maxRetries|\.replace\(\s*\/gratuit/i.test(code(path)), path)
    }
  })

  test("les fixtures n'ont aucun diagnostic d'erreur", () => {
    for (const entry of emailRecipeDraftFixtures) {
      const { resolution } = resolve(entry.id)
      assert.ok(resolution.status === "resolved")
      assert.deepEqual(resolution.diagnostics, [], entry.id)
    }
  })
})

describe("recettes V2 : frontières et runtime V1 inchangé", () => {
  const files = ["lib/email/recipe-selection.ts", "lib/email/recipe-drafts.ts", "lib/email/recipe-brand-context.ts", "lib/email/recipe-prompts.ts", "lib/email/recipe-draft-fixtures.ts"]

  test("aucun appel Anthropic, aucun réseau, aucun fichier lu, aucun import du moteur V1 ni de Landing", () => {
    for (const path of files) {
      const source = code(path)
      assert.ok(!/@anthropic-ai|fetch\(|node:fs|process\.env|ANTHROPIC|messages\.create/.test(source), path)
      for (const specifier of [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]!)) {
        assert.ok(!/\/anthropic$|draft-prompt|draft-resolver|generation-draft|generate-handler|generation-context|ai-prompt|landing|section-catalog/.test(specifier), `${path} : ${specifier}`)
      }
    }
  })

  test("Brand n'est importé que par le resolver, la validation et le contexte Brand des recettes", () => {
    const users = readdirSync(join(root, "lib/email")).filter((file) => file.endsWith(".ts")).filter((file) => /\.\.\/brand/.test(read(`lib/email/${file}`)))
    assert.deepEqual(users.sort(), ["recipe-brand-context.ts", "recipe-resolver.ts", "recipe-validation.ts"])
  })

  test("le moteur V1, la route, le gestionnaire et l'interface ne connaissent aucun module V2", () => {
    const v2 = /recipe-selection|recipe-drafts|recipe-brand-context|recipe-prompts|recipe-draft-fixtures|recipe-resolver|recipe-validation|image-bank/
    for (const path of ["lib/email/anthropic.ts", "lib/email/anthropic-schema.ts", "lib/email/draft-prompt.ts", "lib/email/generation-draft.ts", "lib/email/draft-resolver.ts", "lib/email/generate-handler.ts", "lib/email/generation-context.ts", "lib/email/generation-request.ts", "lib/email/ai-prompt.ts", "lib/email/image-catalog.ts", "app/api/generate-email/route.ts"]) {
      assert.ok(!v2.test(code(path)), path)
    }
    for (const dir of ["components/email", "app/email-generator"]) {
      for (const name of readdirSync(join(root, dir))) if (/\.tsx?$/.test(name)) assert.ok(!v2.test(read(join(dir, name))), `${dir}/${name}`)
    }
    assert.ok(emailDraftHeroBlocks.length === 3, "le vocabulaire V1 est intact")
  })

  test("le gestionnaire HTTP appelle toujours le moteur V1 (un seul appel de moteur, Draft V1)", () => {
    const handler = read("lib/email/generate-handler.ts")
    assert.equal((handler.match(/engine\(/g) ?? []).length, 1)
    assert.match(handler, /generateEmailWithClaude/)
    assert.match(read("lib/email/anthropic.ts"), /buildEmailDraftPrompt/)
    assert.ok(!/recipe/i.test(read("lib/email/anthropic.ts")))
  })
})
