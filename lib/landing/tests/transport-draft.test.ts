/**
 * TransportDraft (familles) : la forme que Claude produit, convertie
 * déterministement en LandingGenerationDraft avant la validation métier.
 * Les champs TECHNIQUES sans objet pour la section (présents seulement pour
 * factoriser la famille) sont ignorés à la conversion, jamais refusés ; tout
 * champ qui a un objet reste strictement validé par le Draft métier.
 *
 * Les budgets de proxies ci-dessous sont des budgets de RÉGRESSION LOCAUX (état
 * mesuré lors de la correction « compiled grammar is too large ») : ils ne
 * garantissent pas l'acceptation par Anthropic, dont la métrique est inconnue.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { z } from "zod"

import { toAnthropicJsonSchema } from "../anthropic-schema"
import { generateLandingWithClaude, type LandingClaudeClient } from "../anthropic"
import { resolveLandingDraft } from "../draft-resolver"
import { landingDestinations } from "../destinations"
import { landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { landingImages } from "../image-catalog"
import { buildLandingAiPrompt } from "../ai-prompt"
import { validateGeneratedLanding } from "../generation-validation"
import { safeParseLandingPage } from "../schemas"
import { getSectionCatalogEntry } from "../section-catalog"
import {
  buildLandingTransportJsonSchema,
  buildLandingTransportSchema,
  convertLandingTransportDraft,
  encodeLandingDraftForTransport,
  landingTransportCoversDraft,
  landingTransportFamilies,
  parseLandingTransportDraft,
} from "../transport-draft"
import { context, draftOf, draftSection, prompt, request } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

type Node = { [key: string]: unknown }
const IMAGE_IDS = landingImages.map((image) => image.id)
const allSections = [...landingDraftSectionTypes]
const sample = (type: (typeof allSections)[number]) => draftSection[type]() as { section: string } & Record<string, unknown>
const encode = (...sections: object[]) => encodeLandingDraftForTransport(draftOf(...sections) as Parameters<typeof encodeLandingDraftForTransport>[0])
const parse = (...sections: object[]) => {
  const result = parseLandingTransportDraft(encode(...sections))
  assert.equal(result.status, "ok", JSON.stringify(result))
  return result.status === "ok" ? result : (undefined as never)
}

/* -------------------------------------------------------------------------- */
/* Proxies de grammaire (comparaison seulement)                               */
/* -------------------------------------------------------------------------- */

function proxies(schema: Node) {
  const defs = (schema.$defs ?? {}) as Record<string, Node>
  const resolve = (node: Node): Node => (typeof node.$ref === "string" ? defs[node.$ref.split("/").pop()!]! : node)
  const out = { alternatives: 0, objects: 0, properties: 0, optional: 0, enumValues: 0, imageUses: 0, destinationUses: 0, literals: 0, depth: 0, expandedChars: 0 }
  const inline = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(inline)
    if (typeof value !== "object" || value === null) return value
    const node = resolve(value as Node)
    return Object.fromEntries(Object.entries(node).filter(([key]) => key !== "$defs").map(([key, child]) => [key, key === "enum" || key === "required" ? child : inline(child)]))
  }
  const walk = (raw: Node, depth: number) => {
    const node = resolve(raw)
    out.depth = Math.max(out.depth, depth)
    if (Array.isArray(node.anyOf)) {
      out.alternatives += node.anyOf.length
      for (const branch of node.anyOf as Node[]) walk(branch, depth + 1)
      return
    }
    if (Array.isArray(node.enum)) {
      out.enumValues += node.enum.length
      out.literals += node.enum.length
      if ((node.enum as string[]).includes("hero-apprenante")) out.imageUses += 1
      if ((node.enum as string[]).includes("catalogue-formations")) out.destinationUses += 1
    }
    if (node.const !== undefined) out.literals += 1
    if (node.type === "array") walk(node.items as Node, depth + 1)
    if (node.type === "object" && node.properties) {
      const properties = node.properties as Record<string, Node>
      out.objects += 1
      out.properties += Object.keys(properties).length
      out.literals += Object.keys(properties).length
      const required = new Set((node.required as string[]) ?? [])
      out.optional += Object.keys(properties).filter((key) => !required.has(key)).length
      for (const child of Object.values(properties)) walk(child, depth + 1)
    }
  }
  walk(schema, 0)
  out.expandedChars = JSON.stringify(inline(schema)).length
  return out
}

const sent = toAnthropicJsonSchema(buildLandingTransportJsonSchema(allSections)) as Node
const sentProxies = proxies(sent)

/* -------------------------------------------------------------------------- */

describe("TransportDraft : six familles", () => {
  test("les familles couvrent exactement les 11 sections du Draft, chacune une seule fois", () => {
    assert.ok(landingTransportCoversDraft)
    const covered = Object.values(landingTransportFamilies).flat()
    assert.equal(covered.length, 11)
    assert.deepEqual([...covered].sort(), [...allSections].sort())
    assert.deepEqual(Object.keys(landingTransportFamilies), ["text-items", "media-items", "link-items", "image-text", "cta-block", "immersive"])
  })

  test("Pillars et StepSequence, CampaignSpotlight et EditorialHero restent des valeurs de section distinctes", () => {
    assert.deepEqual(landingTransportFamilies["text-items"], ["value-props", "pillars", "step-sequence"])
    assert.deepEqual(landingTransportFamilies["cta-block"], ["editorial-hero", "campaign-spotlight", "final-cta"])
    const pillars = parse(sample("pillars")).draft.sections[0]!
    const steps = parse(sample("step-sequence")).draft.sections[0]!
    assert.equal(pillars.section, "pillars")
    assert.equal(steps.section, "step-sequence")
    assert.ok("eyebrow" in pillars && !("eyebrow" in steps), "pillars garde son eyebrow, step-sequence n'en a pas")
  })

  test("avec les 11 candidates : 6 alternatives, 0 optionnel, objets stricts, sections = enum ou const des familles", () => {
    assert.equal(sentProxies.alternatives, 6)
    assert.equal(sentProxies.optional, 0)
    const union = (sent.$defs as Record<string, Node>)[(((sent.properties as Node).sections as Node).items as Node).$ref!.toString().split("/").pop()!]!
    const branches = union.anyOf as Node[]
    assert.equal(branches.length, 6)
    for (const branch of branches) {
      assert.equal(branch.additionalProperties, false)
      assert.deepEqual([...(branch.required as string[])].sort(), Object.keys(branch.properties as object).sort(), "tout est requis")
    }
    const names = branches.flatMap((branch) => {
      const section = (branch.properties as Record<string, Node>).section!
      return (section.enum as string[] | undefined) ?? [section.const as string]
    })
    assert.deepEqual(names.sort(), [...allSections].sort())
    const objects = JSON.stringify(sent).match(/"type":"object"/g) ?? []
    assert.equal((JSON.stringify(sent).match(/"additionalProperties":false/g) ?? []).length, objects.length, "chaque objet est strict")
  })

  test("candidates filtrées : familles vides retirées, section restreint aux candidates", () => {
    const partial = toAnthropicJsonSchema(buildLandingTransportJsonSchema(["final-cta", "pillars", "narrative-split"])) as Node
    assert.equal(proxies(partial).alternatives, 3)
    const text = JSON.stringify(partial)
    for (const kept of ["final-cta", "pillars", "narrative-split"]) assert.ok(text.includes(`"${kept}"`), kept)
    for (const dropped of ["editorial-hero", "campaign-spotlight", "step-sequence", "value-props", "immersive-hero", "destination-cards", "content-carousel", "audience-switcher"]) {
      assert.ok(!text.includes(`"${dropped}"`), dropped)
    }
    assert.throws(() => buildLandingTransportSchema([]), /Aucune section candidate/)
    // Une famille garde seulement ses candidates : le transport refuse une section absente de la liste.
    const schema = buildLandingTransportSchema(["final-cta"])
    assert.equal(schema.safeParse(encode(sample("final-cta"))).success, true)
    assert.equal(schema.safeParse(encode(sample("campaign-spotlight"))).success, false)
  })
})

describe("TransportDraft : images (enum contrôlé)", () => {
  const imageEnums = () => {
    const found: Node[] = []
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk)
      if (typeof value !== "object" || value === null) return
      const node = value as Node
      if (Array.isArray(node.enum) && (node.enum as string[]).includes(IMAGE_IDS[0]!)) found.push(node)
      Object.values(node).forEach(walk)
    }
    walk(sent)
    return found
  }

  test("le schéma envoyé garde l'enum des 10 images (jamais une chaîne libre) : 4 usages dans la grammaire", () => {
    assert.equal(sentProxies.imageUses, 4)
    const enums = imageEnums()
    assert.ok(enums.length >= 1)
    const strict = enums.find((node) => (node.enum as string[]).length === 10)!
    assert.deepEqual(strict.enum, IMAGE_IDS)
    const blockCta = enums.find((node) => (node.enum as string[]).length === 11)!
    assert.deepEqual(blockCta.enum, [...IMAGE_IDS, ""], "seule la famille bloc CTA accepte aussi la chaîne vide")
  })

  test("id inconnu, URL et chemin refusés AU TRANSPORT ; aucune libéralisation", () => {
    for (const image of ["hero-inventee", "/images/hero-bilan.jpg", "https://exemple.com/x.jpg", "Hero-Bilan", "hero-bilan.jpg"]) {
      for (const type of ["editorial-hero", "campaign-spotlight", "narrative-split", "immersive-hero"] as const) {
        const transport = JSON.parse(JSON.stringify(encode(sample(type))))
        transport.sections[0].image = image
        assert.equal(parseLandingTransportDraft(transport).status, "invalid", `${type} ${image}`)
      }
    }
    const carousel = JSON.parse(JSON.stringify(encode(sample("content-carousel"))))
    carousel.sections[0].items[0].image = "/images/x.jpg"
    assert.equal(parseLandingTransportDraft(carousel).status, "invalid")
  })

  test("la chaîne vide n'est acceptée qu'au bloc CTA : narrative-split, immersive-hero et les items médias la refusent", () => {
    for (const type of ["narrative-split", "immersive-hero"] as const) {
      const transport = JSON.parse(JSON.stringify(encode(sample(type))))
      transport.sections[0].image = ""
      assert.equal(parseLandingTransportDraft(transport).status, "invalid", type)
    }
    const audience = JSON.parse(JSON.stringify(encode(sample("audience-switcher"))))
    audience.sections[0].items[0].image = ""
    assert.equal(parseLandingTransportDraft(audience).status, "invalid")
  })

  test("une image vide sur une section qui en exige une est refusée par le Draft métier", () => {
    const transport = JSON.parse(JSON.stringify(encode(sample("campaign-spotlight"))))
    transport.sections[0].image = ""
    const parsed = parseLandingTransportDraft(transport)
    assert.equal(parsed.status, "ok")
    if (parsed.status !== "ok") return
    const draft = safeParseLandingGenerationDraft(parsed.draft)
    assert.equal(draft.success, false)
    if (!draft.success) assert.ok(draft.error.issues.some((issue) => issue.path.join(".") === "sections.0.image"))
  })
})

describe("TransportDraft : destinations (libres au transport, strictes au Draft)", () => {
  test("le schéma envoyé n'a aucun enum de destinations : 0 usage", () => {
    assert.equal(sentProxies.destinationUses, 0)
    assert.ok(!JSON.stringify(sent).includes('"metiers"') && !JSON.stringify(sent).includes('"catalogue-formations"'))
  })

  test("destination connue : transport PASS, Draft PASS", () => {
    for (const id of Object.keys(landingDestinations)) {
      const section = { ...sample("final-cta"), cta: { label: "Voir", destination: id } }
      const parsed = parse(section)
      assert.equal(safeParseLandingGenerationDraft(parsed.draft).success, true, id)
    }
  })

  test("destination inconnue (« inscription-live ») : transport PASS, Draft FAIL au chemin précis, sans repli", () => {
    const section = { ...sample("campaign-spotlight"), cta: { label: "Je m'inscris au live", destination: "inscription-live" } }
    const parsed = parse(section)
    assert.equal(parsed.draft.sections[0]!.cta && (parsed.draft.sections[0]!.cta as { destination: string }).destination, "inscription-live", "aucune correction automatique")
    const draft = safeParseLandingGenerationDraft(parsed.draft)
    assert.equal(draft.success, false)
    if (draft.success) return
    const issue = draft.error.issues.find((entry) => entry.path.join(".") === "sections.0.cta.destination")
    assert.ok(issue, JSON.stringify(draft.error.issues))
    assert.match(issue.message, /catalogue-formations/)
  })

  test("URL, chemin et ancre : acceptés comme chaînes par le transport, refusés par le Draft", () => {
    for (const destination of ["https://www.studi.com/fr/formations", "/fr/formations", "#pillars", ""]) {
      const parsed = parse({ ...sample("final-cta"), cta: { label: "Voir", destination } })
      assert.equal(safeParseLandingGenerationDraft(parsed.draft).success, false, destination || "(vide)")
    }
  })

  test("pipeline : une destination inconnue donne invalid-draft (pas draft-resolution), un seul appel, rien de résolu", async () => {
    const transport = encode(sample("editorial-hero"), { ...sample("final-cta"), cta: { label: "Je m'inscris au live", destination: "inscription-live" } })
    let calls = 0
    const client: LandingClaudeClient = {
      messages: {
        create: async () => {
          calls += 1
          return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(transport) }], usage: { input_tokens: 1, output_tokens: 1 } } as never
        },
      },
    }
    const result = await generateLandingWithClaude(request, { client, env: { ANTHROPIC_API_KEY: ["sk-ant", "api03", "z".repeat(24)].join("-") } })
    assert.equal(calls, 1)
    assert.equal(result.status, "error")
    if (result.status !== "error") return
    assert.equal(result.error.kind, "invalid-draft")
    assert.equal(result.error.resolved, undefined)
    assert.ok(result.error.issues!.some((issue) => issue.path === "sections.1.cta.destination"))
  })
})

describe("TransportDraft : aller-retour des 11 lames", () => {
  const acceptsSent = z.fromJSONSchema(sent as Parameters<typeof z.fromJSONSchema>[0])

  for (const type of allSections) {
    test(`${type} : Draft → transport → validation (Zod et schéma envoyé) → conversion → Draft strict, identique`, () => {
      const initial = sample(type)
      assert.equal(safeParseLandingGenerationDraft(draftOf(initial)).success, true)
      const transport = encode(initial)
      assert.equal(acceptsSent.safeParse(transport).success, true, "le schéma réellement envoyé accepte cette réponse")
      const parsed = parseLandingTransportDraft(transport)
      assert.equal(parsed.status, "ok")
      if (parsed.status !== "ok") return
      const draft = safeParseLandingGenerationDraft(parsed.draft)
      assert.equal(draft.success, true)
      if (!draft.success) return
      assert.deepEqual(draft.data, draftOf(initial))
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.draft)), draftOf(initial), "la conversion produit exactement le Draft initial")
    })
  }

  test("une page de 11 sections (une de chaque) passe le transport entier", () => {
    const sections = allSections.map(sample)
    const parsed = parse(...sections)
    assert.deepEqual(parsed.draft.sections.map((entry) => entry.section), allSections)
    assert.equal(acceptsSent.safeParse(encode(...sections)).success, true)
  })
})

describe("TransportDraft : champs techniques sans objet (ignorés à la conversion)", () => {
  test("mappings : value-props title → label ; editorial-hero description → supportingText ; champs vides retirés", () => {
    const valueProps = parse(sample("value-props")).draft.sections[0]!
    assert.deepEqual(Object.keys(valueProps).sort(), ["items", "label", "section"])
    const editorial = parse(sample("editorial-hero")).draft.sections[0]!
    assert.equal(editorial.supportingText, sample("editorial-hero").supportingText)
    assert.ok(!("description" in editorial) && !("accent" in editorial))
    const finalCta = parse(sample("final-cta")).draft.sections[0]!
    assert.deepEqual(Object.keys(finalCta).sort(), ["cta", "description", "section", "title"])
    const steps = parse(sample("step-sequence")).draft.sections[0]!
    assert.ok(!("eyebrow" in steps))
    const carousel = parse(sample("content-carousel")).draft.sections[0]!
    assert.ok((carousel.items as object[]).every((item) => !("description" in item) && "image" in item))
  })

  test("l'encodage de test écrit des chaînes vides pour chaque champ sans objet", () => {
    const encoded = encode(sample("final-cta"), sample("step-sequence"), sample("editorial-hero"), sample("content-carousel"), sample("value-props")).sections as unknown as Record<string, unknown>[]
    assert.deepEqual([encoded[0]!.accent, encoded[0]!.image], ["", ""])
    assert.equal(encoded[1]!.eyebrow, "")
    assert.equal(encoded[2]!.accent, "")
    assert.ok((encoded[3]!.items as { description: string }[]).every((item) => item.description === ""))
    assert.deepEqual([encoded[4]!.eyebrow, encoded[4]!.description], ["", ""])
  })

  type Mutable = { sections: ({ [key: string]: unknown } & { items?: { [key: string]: unknown }[] })[] }
  const technical: [string, string, (transport: Mutable) => void, string[]][] = [
    ["final-cta", "image", (t) => (t.sections[0]!.image = "content-1"), ["image"]],
    ["final-cta", "image (id valide quelconque)", (t) => (t.sections[0]!.image = "hero-bilan"), ["image"]],
    ["final-cta", "accent", (t) => (t.sections[0]!.accent = "x"), ["accent"]],
    ["step-sequence", "eyebrow", (t) => (t.sections[0]!.eyebrow = "Votre réflexion"), ["eyebrow"]],
    ["editorial-hero", "accent", (t) => (t.sections[0]!.accent = "mise en avant"), ["accent"]],
    ["value-props", "eyebrow", (t) => (t.sections[0]!.eyebrow = "x"), ["eyebrow"]],
    ["value-props", "description", (t) => (t.sections[0]!.description = "x"), ["description"]],
    ["content-carousel", "description d'item", (t) => (t.sections[0]!.items![0]!.description = "x"), ["items.0.description"]],
  ]
  for (const [type, field, mutate, absent] of technical) {
    test(`${type} : ${field} non vide → transport PASS, conversion PASS, champ absent du Draft (ignoré, jamais refusé)`, () => {
      const initial = sample(type as (typeof allSections)[number])
      const transport = JSON.parse(JSON.stringify(encode(initial)))
      mutate(transport)
      const result = parseLandingTransportDraft(transport)
      assert.equal(result.status, "ok", JSON.stringify(result))
      if (result.status !== "ok") return
      for (const path of absent) {
        const [head, index, leaf] = path.split(".")
        const target = leaf ? ((result.draft.sections[0]!.items as Record<string, unknown>[])[Number(index)] as Record<string, unknown>) : result.draft.sections[0]!
        assert.ok(!(leaf ?? head!) || !((leaf ?? head!) in target), `${path} doit être absent du Draft`)
      }
      // Le Draft obtenu est exactement celui de la section d'origine, et le Draft métier l'accepte.
      assert.deepEqual(JSON.parse(JSON.stringify(result.draft)), draftOf(initial))
      assert.equal(safeParseLandingGenerationDraft(result.draft).success, true)
    })
  }

  test("les champs utiles, eux, ne sont jamais refusés pour être non vides (pillars garde son eyebrow)", () => {
    assert.equal(parseLandingTransportDraft(encode(sample("pillars"))).status, "ok")
    assert.equal(parseLandingTransportDraft(encode(sample("campaign-spotlight"))).status, "ok")
  })

  test("un champ utile vide est refusé par le Draft métier, pas par la conversion", () => {
    const transport = JSON.parse(JSON.stringify(encode(sample("campaign-spotlight"))))
    transport.sections[0].accent = ""
    const parsed = parseLandingTransportDraft(transport)
    assert.equal(parsed.status, "ok")
    if (parsed.status !== "ok") return
    const draft = safeParseLandingGenerationDraft(parsed.draft)
    assert.equal(draft.success, false)
    if (!draft.success) assert.ok(draft.error.issues.some((issue) => issue.path.join(".") === "sections.0.accent" && /vide/.test(issue.message)))
  })
})

describe("TransportDraft : structure, items et cardinalités", () => {
  test("aucune propriété optionnelle : un champ manquant est refusé au transport (CampaignSpotlight : accent requis)", () => {
    const transport = JSON.parse(JSON.stringify(encode(sample("campaign-spotlight"))))
    delete transport.sections[0].accent
    assert.equal(parseLandingTransportDraft(transport).status, "invalid")
    const extra = JSON.parse(JSON.stringify(encode(sample("campaign-spotlight"))))
    extra.sections[0].className = "x"
    assert.equal(parseLandingTransportDraft(extra).status, "invalid", "objets stricts")
  })

  test("CampaignSpotlight complète : les cinq champs, Draft strictement identique", () => {
    const initial = sample("campaign-spotlight")
    assert.deepEqual(Object.keys(initial).sort(), ["accent", "cta", "description", "image", "section", "title"])
    assert.deepEqual(parse(initial).draft.sections[0], initial)
  })

  test("cardinalités métier inchangées : StepSequence 3 à 4, DestinationCards 2 à 3 (transport permissif, Draft strict)", () => {
    const steps = sample("step-sequence")
    const items = steps.items as { title: string; description: string }[]
    for (const [count, ok] of [[2, false], [3, true], [4, true], [5, false]] as const) {
      const list = Array.from({ length: count }, (_, index) => items[index % items.length]!)
      const parsed = parse({ ...steps, items: list })
      assert.equal(safeParseLandingGenerationDraft(parsed.draft).success, ok, `step-sequence ${count}`)
    }
    const cards = sample("destination-cards")
    const cardItems = cards.items as object[]
    for (const [count, ok] of [[1, false], [2, true], [3, true], [4, false]] as const) {
      const parsed = parse({ ...cards, items: Array.from({ length: count }, (_, index) => ({ ...(cardItems[index % cardItems.length] as object), destination: ["metiers", "diplomes", "certificats", "financement"][index] })) })
      assert.equal(safeParseLandingGenerationDraft(parsed.draft).success, ok, `destination-cards ${count}`)
    }
  })

  test("liste vide et section absente refusées au transport", () => {
    assert.equal(parseLandingTransportDraft({ sections: [] }).status, "invalid")
    const pillars = JSON.parse(JSON.stringify(encode(sample("pillars"))))
    pillars.sections[0].items = []
    assert.equal(parseLandingTransportDraft(pillars).status, "invalid")
    assert.equal(parseLandingTransportDraft({}).status, "invalid")
  })

  test("le Draft métier garde ses champs étrangers refusés (la conversion n'en ajoute jamais)", () => {
    const parsed = parse(sample("editorial-hero"))
    assert.equal(safeParseLandingGenerationDraft(parsed.draft).success, true)
    const draft = JSON.parse(JSON.stringify(parsed.draft))
    draft.sections[0].accent = "x"
    assert.equal(safeParseLandingGenerationDraft(draft).success, false)
  })

  test("convertLandingTransportDraft : pure et déterministe", () => {
    const transport = encode(sample("pillars"), sample("final-cta")) as Parameters<typeof convertLandingTransportDraft>[0]
    assert.deepEqual(convertLandingTransportDraft(transport), convertLandingTransportDraft(transport))
  })
})

describe("TransportDraft : proxies de grammaire (budgets de régression locaux)", () => {
  test("alternatives, objets, propriétés et optionnels du schéma réellement envoyé", () => {
    assert.deepEqual([sentProxies.alternatives, sentProxies.objects, sentProxies.properties, sentProxies.optional], [6, 12, 42, 0])
    assert.equal(sentProxies.imageUses, 4)
    assert.equal(sentProxies.destinationUses, 0)
  })

  test("budgets : <= 6 alternatives, <= 13 objets dépliés, <= 56 valeurs d'enum, <= 3 600 caractères dépliés", () => {
    assert.ok(sentProxies.alternatives <= 6, String(sentProxies.alternatives))
    assert.ok(sentProxies.objects <= 13, String(sentProxies.objects))
    assert.ok(sentProxies.enumValues <= 56, String(sentProxies.enumValues))
    assert.ok(sentProxies.expandedChars <= 3600, String(sentProxies.expandedChars))
    assert.ok(sentProxies.literals <= 102, `littéraux : ${sentProxies.literals}`)
  })

  test("le schéma transport est bien plus simple que le Draft métier mesuré à 11 branches", () => {
    const draftSchema = toAnthropicJsonSchema(prompt.outputSchema as unknown as Node) as Node
    const draft = proxies(draftSchema)
    assert.equal(draft.alternatives, 11)
    assert.ok(sentProxies.objects < draft.objects && sentProxies.enumValues < draft.enumValues && sentProxies.expandedChars < draft.expandedChars)
  })
})

describe("TransportDraft : intégration au pipeline", () => {
  test("le prompt expose le schéma de transport, et le Draft métier reste le schéma de référence", () => {
    assert.deepEqual(prompt.transportSchema, buildLandingTransportJsonSchema(context.sections.map((entry) => entry.type)))
    assert.ok(JSON.stringify(prompt.outputSchema).includes("campaign-spotlight"))
  })

  test("le système contient UNE instruction sur les champs sans objet : une préférence, pas une condition de conversion", () => {
    assert.equal(prompt.system.split("laisse-les vides").length - 1, 1)
    assert.match(prompt.system, /ceux qui n'ont pas de sens pour la section choisie ne sont pas utilisés, laisse-les vides/)
    assert.match(prompt.system, /value-props écrit son label dans title, editorial-hero son texte secondaire dans description/)
    assert.ok(!/DOIT|doit être vide|obligatoirement vide/i.test(prompt.system))
    assert.ok(!JSON.stringify(prompt.user).includes("laisse-les vides"))
  })

  test("le catalogue source n'est pas modifié : editorial-hero décrit toujours supportingText", () => {
    assert.match((getSectionCatalogEntry("editorial-hero").guidance ?? []).join(" "), /supportingText : une phrase qui rassure ou précise/)
  })

  test("l'encodage inverse est réservé aux tests : jamais importé par le code de génération", () => {
    for (const path of ["lib/landing/anthropic.ts", "lib/landing/ai-prompt.ts", "lib/landing/ai-view.ts", "lib/landing/generate-handler.ts", "lib/landing/draft-resolver.ts"]) {
      assert.ok(!/encodeLandingDraftForTransport/.test(read(path)), path)
    }
  })

  test("anthropic.ts : un seul appel, maxRetries 0, transport → conversion → Draft métier → résolveur, rien d'autre", () => {
    const source = code("lib/landing/anthropic.ts")
    assert.match(source, /maxRetries: 0/)
    assert.match(source, /schema: toAnthropicJsonSchema\(prompt\.transportSchema\)/)
    const transport = source.indexOf("parseLandingTransportDraft(output)")
    const draft = source.indexOf("safeParseLandingGenerationDraft(transport.draft)")
    const resolution = source.indexOf("resolveLandingDraft(")
    assert.ok(transport > 0 && transport < draft && draft < resolution)
    assert.equal((source.match(/messages\.create\(/g) ?? []).length, 1)
  })

  test("le résolveur et le Draft métier ne connaissent pas le transport", () => {
    for (const path of ["lib/landing/draft-resolver.ts", "lib/landing/generation-draft.ts", "lib/landing/schemas.ts"]) {
      assert.ok(!/transport-draft|TransportDraft/.test(read(path)), path)
    }
    assert.ok(resolveLandingDraft)
  })
})

/* -------------------------------------------------------------------------- */
/* Régression exacte du smoke réel #2                                         */
/* -------------------------------------------------------------------------- */

describe("régression du smoke réel #2 : step-sequence.eyebrow rempli par le modèle", () => {
  const stepSequence = {
    section: "step-sequence",
    eyebrow: "Votre réflexion",
    title: "Avancer pas à pas vers un projet qui a du sens",
    description: "Une progression simple pour passer de l'envie de changer à une piste de formation plus précise.",
    items: [
      { title: "Explorer les métiers", description: "Découvrez des métiers et repérez ceux qui font écho à vos envies et à votre situation." },
      { title: "Comparer les formations", description: "Mettez en regard les formations accessibles pour voir lesquelles correspondent à votre objectif." },
      { title: "Préciser votre projet", description: "Identifiez ce qui compte pour vous afin de choisir la suite avec davantage de clarté." },
    ],
  }

  test("transport PASS, conversion PASS, Draft métier PASS, et le Draft ne contient aucun eyebrow", () => {
    const result = parseLandingTransportDraft({ sections: [stepSequence] })
    assert.equal(result.status, "ok")
    if (result.status !== "ok") return
    const section = result.draft.sections[0]!
    assert.deepEqual(Object.keys(section), ["section", "title", "description", "items"])
    assert.ok(!("eyebrow" in section))
    const draft = safeParseLandingGenerationDraft(result.draft)
    assert.equal(draft.success, true)
    if (draft.success) assert.ok(!JSON.stringify(draft.data).includes("Votre réflexion"))
  })
})

/* -------------------------------------------------------------------------- */
/* Frontière : on assouplit l'enveloppe technique, pas le modèle métier       */
/* -------------------------------------------------------------------------- */

describe("frontière transport / métier", () => {
  const through = (...sections: object[]) => {
    const transport = parseLandingTransportDraft(encode(...sections))
    return transport.status === "ok" ? { transport: "PASS" as const, draft: safeParseLandingGenerationDraft(transport.draft) } : { transport: "FAIL" as const, draft: undefined }
  }
  const mutated = (type: (typeof allSections)[number], change: (section: Record<string, unknown>) => void) => {
    const transport = JSON.parse(JSON.stringify(encode(sample(type))))
    change(transport.sections[0])
    return parseLandingTransportDraft(transport)
  }

  test("A. step-sequence.eyebrow non vide → PASS, ignoré", () => {
    const result = mutated("step-sequence", (section) => (section.eyebrow = "Parcours"))
    assert.equal(result.status, "ok")
    assert.equal(result.status === "ok" && safeParseLandingGenerationDraft(result.draft).success, true)
  })

  test("B. campaign-spotlight, destination inconnue → transport PASS, Draft FAIL", () => {
    const result = through({ ...sample("campaign-spotlight"), cta: { label: "S'inscrire au live", destination: "inscription-live" } })
    assert.equal(result.transport, "PASS")
    assert.equal(result.draft?.success, false)
  })

  test("C. campaign-spotlight, image inconnue → transport FAIL", () => {
    assert.equal(mutated("campaign-spotlight", (section) => (section.image = "hero-inventee")).status, "invalid")
    assert.equal(mutated("campaign-spotlight", (section) => (section.image = "")).status, "ok", "vide : accepté par l'enum du bloc CTA, refusé ensuite par le Draft")
    const empty = mutated("campaign-spotlight", (section) => (section.image = ""))
    assert.equal(empty.status === "ok" && safeParseLandingGenerationDraft(empty.draft).success, false)
  })

  test("D. campaign-spotlight, accent vide → Draft FAIL (l'accent a un objet pour cette section)", () => {
    const result = through({ ...sample("campaign-spotlight"), accent: "" })
    assert.equal(result.transport, "PASS")
    assert.equal(result.draft?.success, false)
    if (result.draft && !result.draft.success) assert.ok(result.draft.error.issues.some((issue) => issue.path.join(".") === "sections.0.accent"))
  })

  test("E. step-sequence à 2 items → Draft FAIL", () => {
    const steps = sample("step-sequence")
    const result = through({ ...steps, items: (steps.items as object[]).slice(0, 2) })
    assert.equal(result.transport, "PASS")
    assert.equal(result.draft?.success, false)
  })

  test("F. destination-cards, destination inconnue → Draft FAIL", () => {
    const cards = sample("destination-cards")
    const items = (cards.items as { destination: string }[]).map((item, index) => (index === 0 ? { ...item, destination: "inscription-live" } : item))
    const result = through({ ...cards, items })
    assert.equal(result.transport, "PASS")
    assert.equal(result.draft?.success, false)
    if (result.draft && !result.draft.success) assert.ok(result.draft.error.issues.some((issue) => issue.path.join(".") === "sections.0.items.0.destination"))
  })

  test("un vrai champ métier n'est JAMAIS ignoré : le texte de pillars, l'accent de campaign-spotlight, les items restent dans le Draft", () => {
    for (const type of ["pillars", "campaign-spotlight", "destination-cards", "audience-switcher", "narrative-split", "immersive-hero"] as const) {
      const initial = sample(type)
      const result = parseLandingTransportDraft(encode(initial))
      assert.equal(result.status, "ok", type)
      if (result.status === "ok") assert.deepEqual(JSON.parse(JSON.stringify(result.draft.sections[0])), initial, type)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Replay hors ligne du smoke réel #2 (aucun appel Anthropic)                 */
/* -------------------------------------------------------------------------- */

describe("replay hors ligne de la réponse réelle du smoke #2", () => {
  const smokeRequest = {
  "projectName": "Studi Live Orientation",
  "audience": "adultes en réflexion sur leur orientation ou leur reconversion",
  "objective": "discover-trainings",
  "brief": "Studi organise un live consacré à l'orientation et à la reconversion.\nLa landing page doit annoncer clairement ce rendez-vous, puis aider\nles visiteurs à explorer les formations et à préciser leur projet.\nLe live doit constituer un temps fort visible de la page, sans\ntransformer toute la landing en page événementielle.",
  "facts": [
    { "value": "Date du live : 15 octobre 2026." },
    { "value": "Heure : 18h30." },
    { "value": "Le live est gratuit." },
    { "value": "L'inscription est nécessaire." }
  ]
}
  // TransportDraft renvoyé par Claude (HTTP 200), recopié à l'identique.
  const smokeTransport = {
  "sections": [
    {
      "section": "editorial-hero",
      "title": "Orientation, reconversion : explorez les formations et précisez votre projet",
      "accent": "",
      "description": "Studi vous aide à y voir plus clair : parcourez les formations, comparez les pistes et avancez à votre rythme vers un projet qui vous ressemble.",
      "image": "hero-bilan",
      "cta": {
        "label": "Explorer les formations",
        "destination": "catalogue-formations"
      }
    },
    {
      "section": "campaign-spotlight",
      "title": "Le live orientation et reconversion",
      "accent": "a lieu le 15 octobre 2026 à 18h30",
      "description": "Ce live est gratuit et l'inscription est nécessaire. Un temps fort pour faire le point sur votre orientation ou votre reconversion.",
      "image": "content-4",
      "cta": {
        "label": "Explorer les métiers",
        "destination": "metiers"
      }
    },
    {
      "section": "step-sequence",
      "eyebrow": "Votre réflexion",
      "title": "Avancer pas à pas vers un projet qui a du sens",
      "description": "Une progression simple pour passer de l'envie de changer à une piste de formation plus précise.",
      "items": [
        {
          "title": "Explorer les métiers",
          "description": "Découvrez des métiers et repérez ceux qui font écho à vos envies et à votre situation."
        },
        {
          "title": "Comparer les formations",
          "description": "Mettez en regard les formations accessibles pour voir lesquelles correspondent à votre objectif."
        },
        {
          "title": "Préciser votre projet",
          "description": "Identifiez ce qui compte pour vous afin de choisir la suite avec davantage de clarté."
        }
      ]
    },
    {
      "section": "destination-cards",
      "title": "Poursuivez votre exploration à votre rythme",
      "description": "Trois pistes complémentaires pour affiner votre réflexion après avoir découvert les formations.",
      "items": [
        {
          "title": "Choisir par niveau de diplôme",
          "description": "Parcourez les formations en fonction du niveau de diplôme qui correspond à votre projet.",
          "destination": "diplomes"
        },
        {
          "title": "Monter en compétences",
          "description": "Découvrez les certificats pour développer des compétences ciblées dans votre domaine.",
          "destination": "certificats"
        },
        {
          "title": "Les dispositifs de financement",
          "description": "Consultez l'ensemble des dispositifs de financement existants pour préparer votre projet.",
          "destination": "financement"
        }
      ]
    }
  ]
}

  test("TransportDraft → conversion → Draft → résolveur → LandingPageSchema : PASS à chaque étape", () => {
    const prompt = buildLandingAiPrompt(smokeRequest)
    assert.equal(prompt.status, "ready")
    if (prompt.status !== "ready") return
    const transport = parseLandingTransportDraft(smokeTransport)
    assert.equal(transport.status, "ok", JSON.stringify(transport))
    if (transport.status !== "ok") return
    const draft = safeParseLandingGenerationDraft(transport.draft)
    assert.equal(draft.success, true)
    if (!draft.success) return
    const resolution = resolveLandingDraft(prompt.request, draft.data, prompt.context)
    assert.equal(resolution.status, "resolved")
    if (resolution.status !== "resolved") return
    assert.deepEqual(resolution.config.sections.map((entry) => entry.type), ["editorial-hero", "campaign-spotlight", "step-sequence", "destination-cards"])
    assert.equal(validateGeneratedLanding(resolution.config, prompt.context).status, "valid")
    assert.equal(safeParseLandingPage(resolution.config).success, true)
    const [hero, spotlight] = resolution.config.sections
    assert.ok(hero!.type === "editorial-hero" && hero!.props.supportingText?.startsWith("Studi vous aide"))
    assert.ok(spotlight!.type === "campaign-spotlight" && spotlight!.props.primaryAction.href === "https://www.studi.com/fr/metiers" && spotlight!.props.visual.src === "/images/content-4.jpg")
  })

  test("le pipeline complet réussit avec cette réponse : un seul appel simulé, success", async () => {
    let calls = 0
    const client: LandingClaudeClient = {
      messages: {
        create: async () => {
          calls += 1
          return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(smokeTransport) }], usage: { input_tokens: 7478, output_tokens: 1854 } } as never
        },
      },
    }
    const result = await generateLandingWithClaude(smokeRequest, { client, env: { ANTHROPIC_API_KEY: ["sk-ant", "api03", "q".repeat(24)].join("-") } })
    assert.equal(calls, 1)
    assert.equal(result.status, "success", JSON.stringify(result))
    if (result.status === "success") assert.ok(!JSON.stringify(result.draft).includes("Votre réflexion"))
  })
})
