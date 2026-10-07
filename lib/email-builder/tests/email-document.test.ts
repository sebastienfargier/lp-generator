/**
 * EmailDocument : le cœur documentaire du Builder, hors ligne. Fixtures locales
 * et déterministes (les fixtures R1, R3 et R4 du POC) : aucun réseau, aucun
 * appel de modèle.
 *
 * Ce que ces tests figent :
 * - le document enveloppe l'EmailConfig sans le dupliquer, se sérialise en JSON
 *   pur et reste compatible avec le renderer et l'export existants ;
 * - les opérations sont pures et atomiques (l'entrée est GELÉE : toute mutation
 *   lève) ; seule l'impossibilité technique refuse ;
 * - l'éditorial ne refuse jamais : il devient une recommandation ;
 * - l'historique de travail est indépendant de toute notion de version ;
 * - les faits de référence ne bougent pas avec le contenu.
 */
import { officialConfigOf } from "../generated-block"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import { buildExportableEmailHtml, EmailExportError, validateExportHtml } from "../../email/export-html"
import { emailBank, emailBankImageIdFromSrc, emailBankImageIds, emailImagesForIntent, resolveEmailBankImage } from "../../email/image-bank"
import { buildEmailLibraryBlock } from "../../email/library-fixtures"
import { emailPromotionFixtures } from "../../email/promotion-fixtures"
import { resolvePromotionDraft } from "../../email/promotion-resolver"
import { resolveEmailRecipeDraftFixture } from "../../email/recipe-draft-fixtures"
import { describeEmailRecipeConfig } from "../../email/recipe-validation"
import { renderEmail } from "../../email/renderer"
import { emailConfigPolicyIssues, safeParseEmailConfig, safeParseEmailConfigStructure } from "../../email/schemas"
import type { EmailConfig } from "../../email/types"
import { cloneEmailDocument, createEmailDocument, serializeEmailDocument, type EmailDocument } from "../document"
import { applyToHistory, canRedo, canUndo, createHistory, redo, undo } from "../history"
import { parseEmailDocument, validateDocumentIntegrity } from "../integrity"
import { applyDocumentOperation, applyOperationToHistory, type DocumentOperation } from "../operations"
import { getDocumentRecommendations } from "../recommendations"

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
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

/** Gèle récursivement : une opération qui muterait son entrée lèverait une TypeError (modules ES = mode strict). */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

/* ---- Fixtures ----------------------------------------------------------------------------------------------------- */

const promoFixture = () => {
  const fixture = emailPromotionFixtures.find((entry) => entry.id === "R4-B")!
  const resolution = resolvePromotionDraft(fixture.request, fixture.draft)
  if (resolution.status !== "resolved") throw new Error(resolution.status)
  return { config: resolution.config, facts: fixture.request.promotion }
}
const recipeFixture = (id: "D-R3-B" | "D-R1-A") => {
  const { resolution } = resolveEmailRecipeDraftFixture(id)
  if (resolution.status !== "resolved") throw new Error(resolution.status)
  return resolution.config
}

/** Promotion R4 : header, offer (couleurs fixes), support, closing, mentions-legales, footer. */
const promoDocument = () => {
  const { config, facts } = promoFixture()
  return createEmailDocument(config, { facts: { promotion: facts }, provenance: { origin: "recipe", recipe: "promotion" } })
}
/** Preuves R3 : claims copiées telles quelles. */
const proofDocument = () => {
  const config = recipeFixture("D-R3-B")
  return createEmailDocument(config, { facts: { claimIds: describeEmailRecipeConfig(config).claimIds as string[] }, provenance: { origin: "recipe", recipe: "brand-proof" } })
}

const ids = (document: EmailDocument) => document.config.blocks.map((block) => block.id)
const block = (document: EmailDocument, id: string) => document.config.blocks.find((candidate) => candidate.id === id) as unknown as { id: string; type: string; surface?: string; slots: Json }

/** Applique une opération attendue réussie sur un document gelé. */
function ok(document: EmailDocument, operation: DocumentOperation | Json): EmailDocument {
  const result = applyDocumentOperation(deepFreeze(cloneEmailDocument(document)), operation)
  if (!result.ok) throw new Error(`${result.error.code} : ${result.error.message}`)
  const frozenInputWasKept = validateDocumentIntegrity(result.value)
  assert.deepEqual(frozenInputWasKept, [], "le résultat est un document exploitable")
  return result.value
}
/** Applique une opération attendue refusée ; l'entrée gelée prouve qu'elle n'a pas été touchée. */
function refused(document: EmailDocument, operation: DocumentOperation | Json, expected: string) {
  const before = JSON.stringify(document)
  const result = applyDocumentOperation(deepFreeze(cloneEmailDocument(document)), operation)
  assert.equal(result.ok, false, JSON.stringify(operation))
  if (result.ok) throw new Error("refus attendu")
  assert.equal(result.error.code, expected, result.error.message)
  assert.ok(result.error.message.length > 10)
  assert.equal(JSON.stringify(document), before, "l'entrée n'a pas bougé")
  return result.error
}

const textBlock = () => (buildEmailLibraryBlock("email-module-text-only") as unknown as { slots: Json }).slots

/* -------------------------------------------------------------------------- */
/* Document                                                                   */
/* -------------------------------------------------------------------------- */

describe("EmailDocument — modèle", () => {
  test("il enveloppe l'EmailConfig : schemaVersion, config, facts, provenance, une métadonnée par lame, registre", () => {
    const document = promoDocument()
    assert.deepEqual(Object.keys(document), ["schemaVersion", "config", "facts", "provenance", "blockMeta", "registry"])
    assert.equal(document.schemaVersion, 1)
    assert.equal(document.config.version, 1)
    assert.deepEqual(Object.keys(document.blockMeta), ids(document))
    assert.ok(Object.values(document.blockMeta).every((meta) => meta.origin === "recipe"))
    assert.equal(document.facts.promotion?.offer.type, "percent")
    assert.match(document.registry.manifestVersion, /^0\.1\/1\.5$/)
    assert.deepEqual(validateDocumentIntegrity(document), [])
  })

  test("un document manuel marque ses lames « builder » ; la provenance par défaut est « manual »", () => {
    const document = createEmailDocument(promoFixture().config)
    assert.deepEqual(document.provenance, { origin: "manual" })
    assert.ok(Object.values(document.blockMeta).every((meta) => meta.origin === "builder"))
  })

  test("sérialisation : du JSON pur, aucun HTML, aller-retour identique, parse valide", () => {
    const document = proofDocument()
    const json = serializeEmailDocument(document)
    assert.ok(!/<html|<table|<!DOCTYPE|className|style=/i.test(json), "aucun HTML rendu ni état d'interface")
    assert.deepEqual(JSON.parse(json), document)
    const parsed = parseEmailDocument(JSON.parse(json))
    assert.equal(parsed.success, true)
    assert.equal(serializeEmailDocument((parsed as { data: EmailDocument }).data), json)
  })

  test("un clone est un snapshot indépendant", () => {
    const document = promoDocument()
    const copy = cloneEmailDocument(document)
    ;(copy.config.blocks[0] as unknown as { slots: Json }).slots.label.text = "Autre"
    copy.facts.promotion!.scope = "autre périmètre"
    copy.blockMeta.header!.origin = "builder"
    assert.notEqual(copy.config, document.config)
    assert.equal((document.config.blocks[0] as unknown as { slots: Json }).slots.label.text, "Offre valable jusqu'au 15 novembre 2026")
    assert.equal(document.facts.promotion!.scope, "les formations en alternance")
    assert.equal(document.blockMeta.header!.origin, "recipe")
  })

  test("créer un document ne modifie ni ne partage l'EmailConfig d'origine", () => {
    const { config } = promoFixture()
    const before = JSON.stringify(config)
    const document = createEmailDocument(config)
    ;(document.config.blocks[1] as unknown as { slots: Json }).slots["valeur-cle"].text = "x"
    assert.equal(JSON.stringify(config), before)
  })
})

/* -------------------------------------------------------------------------- */
/* Intégrité                                                                  */
/* -------------------------------------------------------------------------- */

describe("EmailDocument — intégrité (technique, bloquante)", () => {
  const broken = (change: (document: Json) => void) => {
    const document = structuredClone(promoDocument()) as unknown as Json
    change(document)
    return validateDocumentIntegrity(document)
  }

  test("des documents R1, R3 et R4 de recette sont exploitables", () => {
    for (const document of [promoDocument(), proofDocument(), createEmailDocument(recipeFixture("D-R1-A"), { provenance: { origin: "recipe", recipe: "discovery-reassurance" } })]) {
      assert.deepEqual(validateDocumentIntegrity(document), [])
    }
  })

  test("structure : version, clé inconnue, entrée qui n'est pas un document", () => {
    assert.equal(broken((d) => (d.schemaVersion = 2))[0]!.code, "document-structure")
    assert.equal(broken((d) => (d.html = "<p>x</p>"))[0]!.code, "document-structure")
    assert.equal(broken((d) => delete d.facts)[0]!.code, "document-structure")
    for (const input of [null, "texte", 42, {}, []]) assert.equal(validateDocumentIntegrity(input)[0]!.code, "document-structure")
  })

  test("contrat structurel : lame inconnue, slot inconnu, HTML dans un slot, id en double (un email sans lame est valide pour le Builder)", () => {
    const cases: [string, (d: Json) => void][] = [
      ["lame inconnue", (d) => (d.config.blocks[2].type = "email-module-inconnue")],
      ["slot inconnu", (d) => (d.config.blocks[2].slots.inconnu = { text: "x" })],
      ["HTML dans un slot", (d) => (d.config.blocks[3].slots["titre-section"].text = "<b>x</b>")],
      ["id en double", (d) => (d.config.blocks[2].id = "closing")],
    ]
    for (const [label, change] of cases) {
      const issues = broken(change)
      assert.ok(issues.length > 0 && issues.every((issue) => issue.code === "config-contract" || issue.code === "block-meta"), `${label} : ${JSON.stringify(issues)}`)
    }
  })

  test("les règles de PRODUIT du contrat historique ne sont pas de l'intégrité : footer absent, en double ou pas en dernier, mentions légales loin du footer, zones colorées consécutives", () => {
    const cases: [string, (d: Json) => void][] = [
      ["footer absent", (d) => (d.config.blocks.pop(), delete d.blockMeta.footer)],
      ["footer pas en dernier", (d) => d.config.blocks.reverse()],
      ["footer en double", (d) => (d.config.blocks.push({ ...structuredClone(d.config.blocks.at(-1)), id: "footer-2" }), (d.blockMeta["footer-2"] = { origin: "builder" }))],
      ["mentions légales loin du footer", (d) => d.config.blocks.splice(1, 0, d.config.blocks.splice(4, 1)[0])],
      ["zones colorées consécutives", (d) => ((d.config.blocks[2].surface = "accent-1"), (d.config.blocks[3].surface = "marque"))],
    ]
    for (const [label, change] of cases) assert.deepEqual(broken(change), [], label)
  })

  test("cohérence : métadonnée de lame manquante ou orpheline, promotion sans ses faits", () => {
    assert.ok(broken((d) => delete d.blockMeta.closing).some((issue) => issue.code === "block-meta" && issue.path === "blockMeta.closing"))
    assert.ok(broken((d) => (d.blockMeta.fantome = { origin: "builder" })).some((issue) => issue.code === "block-meta" && issue.path === "blockMeta.fantome"))
    assert.ok(broken((d) => delete d.facts.promotion).some((issue) => issue.code === "missing-facts"))
  })

  test("images : hors de la banque contrôlée, le document est inexploitable (renderer et export ne les publient pas)", () => {
    const issues = broken((d) => (d.config.blocks[1].slots["image-1"].src = "https://cdn.example.com/photo.jpg"))
    assert.deepEqual(issues.map((issue) => issue.code), ["unknown-asset"])
    assert.equal(issues[0]!.path, "config.blocks.offer.slots.image-1")
  })

  test("l'éditorial n'est PAS de l'intégrité : terminologie déconseillée, valeur différente des faits, séquence inhabituelle laissent le document exploitable", () => {
    const issues = broken((d) => {
      d.config.blocks[3].slots["titre-section"].text = "Une formation gratuite et garantie"
      d.config.blocks[1].slots["valeur-cle"].text = "-99 %*"
      ;[d.config.blocks[2], d.config.blocks[3]] = [d.config.blocks[3], d.config.blocks[2]]
    })
    assert.deepEqual(issues, [])
  })

  test("parseEmailDocument : succès typé, ou la liste des problèmes", () => {
    assert.equal(parseEmailDocument(promoDocument()).success, true)
    const failed = parseEmailDocument({ ...promoDocument(), schemaVersion: 9 })
    assert.equal(failed.success, false)
    assert.ok(!failed.success && failed.issues.length > 0)
  })
})

/* -------------------------------------------------------------------------- */
/* Opérations                                                                 */
/* -------------------------------------------------------------------------- */

describe("opération set-slot", () => {
  test("modifie un seul slot ; le reste du document est identique ; l'original n'est pas touché", () => {
    const document = promoDocument()
    const next = ok(document, { type: "set-slot", blockId: "closing", slot: "titre-section", value: { text: "À vous de jouer" } })
    assert.equal(block(next, "closing").slots["titre-section"].text, "À vous de jouer")
    assert.deepEqual(block(next, "closing").slots["texte-descriptif"], block(document, "closing").slots["texte-descriptif"])
    for (const id of ids(document).filter((candidate) => candidate !== "closing")) assert.deepEqual(block(next, id), block(document, id))
    assert.deepEqual(next.facts, document.facts)
    assert.deepEqual(next.blockMeta, document.blockMeta)
    assert.notEqual(next, document)
  })

  test("boutons, liens, icônes : la valeur est celle du contrat", () => {
    const document = promoDocument()
    const cta = ok(document, { type: "set-slot", blockId: "closing", slot: "cta-1", value: { label: "Voir le catalogue", href: "https://www.studi.com/fr/formations" } })
    assert.equal(block(cta, "closing").slots["cta-1"].label, "Voir le catalogue")
    const icon = ok(document, { type: "set-slot", blockId: "support", slot: "icone-1", value: { icon: "briefcase" } })
    assert.equal(block(icon, "support").slots["icone-1"].icon, "briefcase")
  })

  test("refus techniques : lame inconnue, slot inconnu, image (set-image), valeur hors contrat", () => {
    const document = promoDocument()
    refused(document, { type: "set-slot", blockId: "fantome", slot: "titre-section", value: { text: "x" } }, "unknown-block")
    refused(document, { type: "set-slot", blockId: "closing", slot: "inconnu", value: { text: "x" } }, "unknown-slot")
    refused(document, { type: "set-slot", blockId: "offer", slot: "image-1", value: { src: "https://cdn.example.com/a.jpg", alt: "x" } }, "slot-not-editable")
    const html = refused(document, { type: "set-slot", blockId: "closing", slot: "titre-section", value: { text: "<b>x</b>" } }, "integrity")
    assert.ok(html.issues!.length > 0)
    refused(document, { type: "set-slot", blockId: "closing", slot: "titre-section", value: { texte: "x" } }, "integrity")
    refused(document, { type: "set-slot", blockId: "closing", slot: "titre-section", value: { text: "   " } }, "integrity")
    refused(document, { type: "set-slot", blockId: "support", slot: "icone-1", value: { icon: "icone-inventee" } }, "integrity")
  })

  test("changer une valeur d'offre n'est PAS refusé : le Builder conseille (alerte), il n'impose pas", () => {
    const next = ok(promoDocument(), { type: "set-slot", blockId: "offer", slot: "valeur-cle", value: { text: "-30 %*" } })
    assert.equal(block(next, "offer").slots["valeur-cle"].text, "-30 %*")
    assert.equal(next.facts.promotion!.offer.type, "percent")
    assert.ok(getDocumentRecommendations(next).some((entry) => entry.level === "alert" && entry.code === "promotion-offer-value" && entry.target?.blockId === "offer"))
  })
})

describe("opération add-block", () => {
  test("ajoute une lame officielle juste avant les mentions légales et le footer ; id dérivé du type ; métadonnée « builder »", () => {
    const document = promoDocument()
    const next = ok(document, { type: "add-block", blockType: "email-module-text-only", slots: textBlock() })
    assert.deepEqual(ids(next), ["header", "offer", "support", "closing", "email-module-text-only", "mentions-legales", "footer"])
    assert.deepEqual(next.blockMeta["email-module-text-only"], { origin: "builder" })
    assert.equal(next.blockMeta.closing!.origin, "recipe")
    const again = ok(next, { type: "add-block", blockType: "email-module-text-only", slots: textBlock() })
    assert.deepEqual(ids(again).filter((id) => id.startsWith("email-module-text-only")), ["email-module-text-only", "email-module-text-only-2"])
    assert.equal(document.config.blocks.length, 6)
  })

  test("position explicite, id choisi, surface pour une lame configurable", () => {
    const next = ok(promoDocument(), { type: "add-block", blockType: "email-module-text-only", slots: textBlock(), index: 2, id: "intro", surface: "accent-1" })
    assert.deepEqual(ids(next).slice(0, 4), ["header", "offer", "intro", "support"].slice(0, 4))
    assert.equal(block(next, "intro").surface, "accent-1")
  })

  test("sur un email de preuves : ajout avant le footer", () => {
    const next = ok(proofDocument(), { type: "add-block", blockType: "email-module-text-only", slots: textBlock() })
    assert.equal(ids(next).at(-1), "footer")
    assert.equal(ids(next).at(-2), "email-module-text-only")
  })

  test("une image de la banque se passe résolue ; une URL libre est refusée par l'intégrité", () => {
    const image = resolveEmailBankImage(emailBankImageIds.find((id) => (emailBank[id].formats as readonly string[]).includes("band"))!, "email-module-text-and-cta-variant-02")
    const slots = { "titre-section": { text: "Un titre" }, "image-1": image, "texte-descriptif": { text: "Un texte." }, "cta-1": { label: "Voir", href: "https://www.studi.com/fr/formations" } }
    assert.equal(emailBankImageIdFromSrc(block(ok(promoDocument(), { type: "add-block", blockType: "email-module-text-and-cta-variant-02", slots }), "email-module-text-and-cta-variant-02").slots["image-1"].src) !== undefined, true)
    const free = refused(promoDocument(), { type: "add-block", blockType: "email-module-text-and-cta-variant-02", slots: { ...slots, "image-1": { src: "https://cdn.example.com/a.jpg", alt: "x" } } }, "integrity")
    assert.ok(free.issues!.some((issue) => issue.code === "unknown-asset"))
  })

  test("refus techniques : lame inconnue, slot manquant ou inconnu, position, id déjà pris, surface sur une lame à couleurs fixes", () => {
    const document = promoDocument()
    refused(document, { type: "add-block", blockType: "email-module-inconnue", slots: {} }, "invalid-operation")
    refused(document, { type: "add-block", blockType: "email-module-text-only", slots: {} }, "integrity")
    refused(document, { type: "add-block", blockType: "email-module-text-only", slots: { ...textBlock(), inconnu: { text: "x" } } }, "integrity")
    refused(document, { type: "add-block", blockType: "email-module-text-only", slots: textBlock(), index: 99 }, "position")
    refused(document, { type: "add-block", blockType: "email-module-text-only", slots: textBlock(), id: "closing" }, "integrity")
    refused(document, { type: "add-block", blockType: "email-module-banner-full", slots: (buildEmailLibraryBlock("email-module-banner-full") as unknown as { slots: Json }).slots, surface: "accent-1" }, "surface-unsupported")
  })

  test("un second footer, ou des mentions légales hors de leur place, ne sont pas des impossibilités : accepté, avec un conseil", () => {
    const footer = (buildEmailLibraryBlock("email-module-footer-compact-legal") as unknown as { slots: Json }).slots
    const twice = ok(promoDocument(), { type: "add-block", blockType: "email-module-footer-compact-legal", slots: footer, index: 1 })
    assert.equal(ids(twice).filter((id) => id.startsWith("email-module-footer")).length, 1)
    const found = getDocumentRecommendations(twice)
    assert.ok(found.some((entry) => entry.code === "layout-footer-duplicate" && entry.level === "warning"))
    renderEmail(officialConfigOf(twice.config))
  })
})

describe("opération remove-block", () => {
  test("retire la lame et sa métadonnée ; les autres lames sont intactes", () => {
    const document = promoDocument()
    const next = ok(document, { type: "remove-block", blockId: "support" })
    assert.deepEqual(ids(next), ["header", "offer", "closing", "mentions-legales", "footer"])
    assert.equal("support" in next.blockMeta, false)
    assert.deepEqual(block(next, "closing"), block(document, "closing"))
    assert.deepEqual(next.facts, document.facts)
  })

  test("retirer les mentions légales est possible (techniquement) : le système alerte, il ne refuse pas", () => {
    const next = ok(promoDocument(), { type: "remove-block", blockId: "mentions-legales" })
    assert.equal(ids(next).includes("mentions-legales"), false)
    assert.ok(getDocumentRecommendations(next).some((entry) => entry.level === "alert" && entry.code === "promotion-legal"))
  })

  test("le footer n'est pas une impossibilité technique : le renderer et l'export produisent un email valide sans lui ; le retrait est accepté avec une ALERTE forte", () => {
    const document = promoDocument()
    const next = ok(document, { type: "remove-block", blockId: "footer" })
    assert.equal(ids(next).includes("footer"), false)
    assert.equal("footer" in next.blockMeta, false)
    const alert = getDocumentRecommendations(next).find((entry) => entry.code === "layout-footer-missing")
    assert.equal(alert?.level, "alert")
    assert.match(alert!.message, /désabonnement/)
    assert.equal(getDocumentRecommendations(next)[0]!.level, "alert", "l'alerte passe en premier")
    // Renderer et export : un HTML valide, sans le lien de désabonnement que le footer portait.
    const html = renderEmail(officialConfigOf(next.config))
    assert.match(html, /^<!DOCTYPE html>/i)
    assert.ok(!html.includes("[URL_DESABONNEMENT]") && renderEmail(officialConfigOf(document.config)).includes("[URL_DESABONNEMENT]"))
    const exported = buildExportableEmailHtml(html, "https://assets.example.test")
    assert.deepEqual(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }), [])
    assert.equal(exported.placeholders.length, 0)
  })

  test("refus technique : lame inconnue ; la dernière lame peut être retirée (un email en cours de création peut être vide : il n'est ni rendu ni exportable)", () => {
    refused(promoDocument(), { type: "remove-block", blockId: "fantome" }, "unknown-block")
    const alone = createEmailDocument({ ...promoFixture().config, blocks: [buildEmailLibraryBlock("email-module-footer-compact-legal")].map((footer) => ({ ...footer, id: "footer" })) } as EmailConfig)
    assert.deepEqual(validateDocumentIntegrity(alone), [])
    const emptied = ok(alone, { type: "remove-block", blockId: "footer" })
    assert.deepEqual(emptied.config.blocks, [])
    assert.deepEqual(emptied.blockMeta, {})
    assert.deepEqual(validateDocumentIntegrity(emptied), [])
  })
})

describe("opération move-block", () => {
  test("déplace une lame à sa position finale ; les autres gardent leur ordre relatif", () => {
    const document = promoDocument()
    assert.deepEqual(ids(ok(document, { type: "move-block", blockId: "closing", toIndex: 2 })), ["header", "offer", "closing", "support", "mentions-legales", "footer"])
    assert.deepEqual(ids(ok(document, { type: "move-block", blockId: "header", toIndex: 3 })), ["offer", "support", "closing", "header", "mentions-legales", "footer"])
    assert.deepEqual(ids(ok(document, { type: "move-block", blockId: "support", toIndex: 2 })), ids(document), "même position : même ordre")
    const moved = ok(document, { type: "move-block", blockId: "closing", toIndex: 2 })
    assert.deepEqual(block(moved, "closing"), block(document, "closing"))
    assert.deepEqual(moved.blockMeta, document.blockMeta)
  })

  test("l'ordre « non conseillé » n'est pas refusé : un hero déplacé après le support est accepté", () => {
    ok(promoDocument(), { type: "move-block", blockId: "offer", toIndex: 2 })
  })

  test("refus techniques : lame inconnue, position hors liste", () => {
    const document = promoDocument()
    refused(document, { type: "move-block", blockId: "fantome", toIndex: 1 }, "unknown-block")
    refused(document, { type: "move-block", blockId: "closing", toIndex: 6 }, "position")
  })

  test("le footer hors de la dernière position, ou les mentions légales loin de lui, ne sont pas des impossibilités : acceptés, avec un conseil ; le rendu suit l'ordre choisi", () => {
    const document = promoDocument()
    const footerFirst = ok(document, { type: "move-block", blockId: "footer", toIndex: 0 })
    assert.equal(ids(footerFirst)[0], "footer")
    const advice = getDocumentRecommendations(footerFirst).find((entry) => entry.code === "layout-footer-not-last")
    assert.equal(advice?.level, "warning")
    assert.equal(advice?.target?.blockId, "footer")
    const html = renderEmail(officialConfigOf(footerFirst.config))
    assert.ok(html.indexOf("[URL_DESABONNEMENT]") < html.indexOf("À toi de jouer"), "le footer est rendu à la place choisie")
    const legalAway = ok(document, { type: "move-block", blockId: "mentions-legales", toIndex: 1 })
    assert.ok(getDocumentRecommendations(legalAway).some((entry) => entry.code === "layout-disclaimer-not-before-footer" && entry.level === "warning" && entry.target?.blockId === "mentions-legales"))
    for (const moved of [footerFirst, legalAway]) {
      const exported = buildExportableEmailHtml(renderEmail(officialConfigOf(moved.config)), "https://assets.example.test")
      assert.deepEqual(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }), [])
    }
  })
})

describe("opération set-surface", () => {
  test("pose une surface sur une lame configurable ; « page » retire la clé ; une seule écriture canonique", () => {
    const document = promoDocument()
    const yellow = ok(document, { type: "set-surface", blockId: "closing", surface: "accent-1" })
    assert.equal(block(yellow, "closing").surface, "accent-1")
    const back = ok(yellow, { type: "set-surface", blockId: "closing", surface: "page" })
    assert.equal("surface" in block(back, "closing"), false)
    assert.deepEqual(back.config, document.config)
    for (const surface of ["bloc", "accent-2-soft", "accent-2", "marque", "encre"]) assert.equal(block(ok(document, { type: "set-surface", blockId: "support", surface }), "support").surface, surface)
  })

  test("refus techniques : lame inconnue, lame à couleurs fixes (header, offre, footer), surface inconnue", () => {
    const document = promoDocument()
    refused(document, { type: "set-surface", blockId: "fantome", surface: "marque" }, "unknown-block")
    for (const id of ["header", "offer", "mentions-legales", "footer"]) refused(document, { type: "set-surface", blockId: id, surface: "marque" }, "surface-unsupported")
    refused(document, { type: "set-surface", blockId: "closing", surface: "rouge" }, "invalid-operation")
  })

  test("deux zones colorées consécutives sont un choix visuel, pas une impossibilité : accepté, rendu, exportable, avec un simple conseil", () => {
    const colored = ok(promoDocument(), { type: "set-surface", blockId: "support", surface: "accent-1" })
    assert.equal(getDocumentRecommendations(colored).some((entry) => entry.code === "layout-consecutive-colored"), false)
    const both = ok(colored, { type: "set-surface", blockId: "closing", surface: "marque" })
    assert.equal(block(both, "support").surface, "accent-1")
    assert.equal(block(both, "closing").surface, "marque")
    const advice = getDocumentRecommendations(both).filter((entry) => entry.code === "layout-consecutive-colored")
    assert.equal(advice.length, 1)
    assert.equal(advice[0]!.level, "info")
    assert.equal(advice[0]!.target?.blockId, "closing")
    assert.match(advice[0]!.message, /consécutives/)
    assert.equal(getDocumentRecommendations(both).filter((entry) => entry.level === "alert").length, 0)
    const html = renderEmail(officialConfigOf(both.config))
    assert.ok(/#EDF878/i.test(html), "la surface jaune est rendue")
    const exported = buildExportableEmailHtml(html, "https://assets.example.test")
    assert.deepEqual(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }), [])
    // add-block avec surface, à côté d'une zone colorée : même chose.
    ok(colored, { type: "add-block", blockType: "email-module-text-only", slots: textBlock(), index: 3, surface: "marque" })
  })
})

describe("opération set-image", () => {
  test("pose une autre image de la banque (URL canonique et alt contrôlé) ; le reste du bloc est identique", () => {
    const document = promoDocument()
    const current = emailBankImageIdFromSrc(block(document, "offer").slots["image-1"].src)!
    const other = emailImagesForIntent("campaign-portrait", "email-module-hero-offer-image-top").concat(emailImagesForIntent("career-movement", "email-module-hero-offer-image-top")).find((id) => id !== current)!
    const next = ok(document, { type: "set-image", blockId: "offer", slot: "image-1", imageId: other })
    assert.equal(emailBankImageIdFromSrc(block(next, "offer").slots["image-1"].src), other)
    assert.equal(block(next, "offer").slots["image-1"].alt, emailBank[other].alt)
    assert.deepEqual({ ...block(next, "offer").slots, "image-1": null }, { ...block(document, "offer").slots, "image-1": null })
  })

  test("refus techniques : lame ou slot inconnu, slot qui n'est pas une image, image inconnue, image sans dérivé pour cette lame, une URL à la place d'un identifiant", () => {
    const document = promoDocument()
    refused(document, { type: "set-image", blockId: "fantome", slot: "image-1", imageId: "quai-gare" }, "unknown-block")
    refused(document, { type: "set-image", blockId: "offer", slot: "inconnu", imageId: "quai-gare" }, "unknown-slot")
    refused(document, { type: "set-image", blockId: "offer", slot: "sous-titre", imageId: "quai-gare" }, "unknown-slot")
    refused(document, { type: "set-image", blockId: "offer", slot: "image-1", imageId: "image-inventee" }, "image")
    refused(document, { type: "set-image", blockId: "offer", slot: "image-1", imageId: "https://cdn.example.com/a.jpg" }, "image")
    const incompatible = emailBankImageIds.find((id) => !(emailBank[id].formats as readonly string[]).includes("offer"))
    if (incompatible) assert.match(refused(document, { type: "set-image", blockId: "offer", slot: "image-1", imageId: incompatible }, "image").message, /compatible/)
  })
})

describe("opérations — pureté et atomicité", () => {
  test("des entrées qui ne sont pas des opérations : refus explicite, document intact", () => {
    const document = promoDocument()
    for (const input of [null, "set-slot", 12, {}, { type: "inconnue" }, { type: "remove-block" }, { type: "remove-block", blockId: "closing", extra: true }, { type: "move-block", blockId: "closing", toIndex: -1 }, { type: "move-block", blockId: "closing", toIndex: 1.5 }, { type: "set-surface", blockId: "closing", surface: "#FF0000" }]) {
      refused(document, input as Json, "invalid-operation")
    }
  })

  test("une chaîne d'opérations ne laisse jamais d'état intermédiaire invalide : chaque résultat est exploitable, chaque échec est sans trace", () => {
    let document = promoDocument()
    const steps: [Json, boolean][] = [
      [{ type: "add-block", blockType: "email-module-text-only", slots: textBlock() }, true],
      [{ type: "remove-block", blockId: "fantome" }, false],
      [{ type: "set-surface", blockId: "email-module-text-only", surface: "accent-1" }, true],
      [{ type: "set-surface", blockId: "support", surface: "marque" }, true],
      [{ type: "set-surface", blockId: "header", surface: "accent-2" }, false],
      [{ type: "move-block", blockId: "email-module-text-only", toIndex: 0 }, true],
      [{ type: "set-slot", blockId: "closing", slot: "inexistant", value: { text: "x" } }, false],
    ]
    for (const [operation, succeeds] of steps) {
      const before = JSON.stringify(document)
      const result = applyDocumentOperation(deepFreeze(cloneEmailDocument(document)), operation)
      assert.equal(result.ok, succeeds, JSON.stringify(operation))
      if (result.ok) document = result.value
      else assert.equal(JSON.stringify(document), before)
      assert.deepEqual(validateDocumentIntegrity(document), [])
    }
  })

  test("déterministe : la même opération donne le même document", () => {
    const operation = { type: "add-block", blockType: "email-module-text-only", slots: textBlock(), index: 3 }
    assert.equal(serializeEmailDocument(ok(promoDocument(), operation)), serializeEmailDocument(ok(promoDocument(), operation)))
  })
})

/* -------------------------------------------------------------------------- */
/* Recommandations                                                            */
/* -------------------------------------------------------------------------- */

describe("recommandations — conseils non bloquants", () => {
  test("un email de recette conforme n'a aucune alerte", () => {
    for (const document of [promoDocument(), proofDocument()]) {
      assert.equal(getDocumentRecommendations(document).filter((entry) => entry.level === "alert").length, 0, JSON.stringify(getDocumentRecommendations(document)))
    }
  })

  test("terminologie, copie et densité : l'opération réussit, la recommandation apparaît, structurée (code, niveau, message, cible)", () => {
    const next = ok(promoDocument(), { type: "set-slot", blockId: "closing", slot: "texte-descriptif", value: { text: "Une formation gratuite, avec un emploi garanti, jusqu'au 31 décembre." } })
    const found = getDocumentRecommendations(next)
    assert.ok(found.length > 0)
    for (const entry of found) {
      assert.match(entry.code, /^[a-z0-9-]+$/)
      assert.ok(["info", "warning", "alert"].includes(entry.level))
      assert.ok(entry.message.length > 5)
    }
    const free = found.find((entry) => entry.code === "promotion-copy-gratuit")
    assert.equal(free?.level, "warning")
    assert.equal(free?.target?.blockId, "closing")
    assert.ok(found.some((entry) => entry.code.startsWith("brand-")), "la terminologie de marque est aussi relevée")
  })

  test("le contenu d'origine (le slot du hero) reste modifiable librement : un titre qui n'est pas dans la recette ne refuse rien", () => {
    ok(promoDocument(), { type: "set-slot", blockId: "closing", slot: "titre-section", value: { text: "Offre exclusive : dernière chance !" } })
  })

  test("écart aux faits : valeur, code, date, légal, périmètre et destination montent en alerte ; le reste de la recette en conseil", () => {
    const document = promoDocument()
    const slot = (blockId: string, name: string, value: Json) => ok(document, { type: "set-slot", blockId, slot: name, value })
    const codes = (d: EmailDocument) => getDocumentRecommendations(d).filter((entry) => entry.level === "alert").map((entry) => entry.code)
    assert.ok(codes(slot("offer", "code-promo-1", { text: "AUTRE" })).includes("promotion-promo-code"))
    assert.ok(codes(slot("header", "label", { text: "Offre valable jusqu'au 1er janvier 2027" })).includes("promotion-deadline"))
    assert.ok(codes(slot("closing", "cta-1", { label: "Voir", href: "https://www.studi.com/fr/diplomes" })).includes("promotion-destination"))
    const moved = ok(document, { type: "move-block", blockId: "closing", toIndex: 2 })
    assert.ok(getDocumentRecommendations(moved).some((entry) => entry.code === "promotion-sequence" && entry.level === "info"))
    assert.equal(codes(moved).includes("promotion-sequence"), false)
  })

  test("liens que l'export refuserait : hôte hors liste, lien à confirmer", () => {
    const external = ok(promoDocument(), { type: "set-slot", blockId: "closing", slot: "cta-1", value: { label: "Voir", href: "https://example.com/offre" } })
    const link = getDocumentRecommendations(external).find((entry) => entry.code === "link-host")
    assert.equal(link?.level, "warning")
    assert.equal(link?.target?.path, "blocks.closing.slots.cta-1")
    const toConfirm = ok(promoDocument(), { type: "set-slot", blockId: "closing", slot: "cta-1", value: { label: "Voir", href: "[URL À CONFIRMER]" } })
    assert.ok(getDocumentRecommendations(toConfirm).some((entry) => entry.code === "link-to-confirm"))
  })

  test("les avertissements de lien sont exacts : l'export refuse bien ces liens (contrôle du fichier, ou refus à la construction), le Builder non", () => {
    const external = ok(promoDocument(), { type: "set-slot", blockId: "closing", slot: "cta-1", value: { label: "Voir", href: "https://example.com/offre" } })
    const exported = buildExportableEmailHtml(renderEmail(officialConfigOf(external.config)), "https://assets.example.test")
    assert.ok(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }).some((issue) => issue.code === "link"))
    const toConfirm = ok(promoDocument(), { type: "set-slot", blockId: "closing", slot: "cta-1", value: { label: "Voir", href: "[URL À CONFIRMER]" } })
    assert.throws(() => buildExportableEmailHtml(renderEmail(officialConfigOf(toConfirm.config)), "https://assets.example.test"), (error) => error instanceof EmailExportError && error.code === "url-to-confirm")
  })

  test("claims : une claim présente mais absente des faits, ou l'inverse, est signalée ; sans faits de claims, rien", () => {
    const document = proofDocument()
    assert.ok(document.facts.claimIds!.length > 0)
    const missing = getDocumentRecommendations({ ...document, facts: { claimIds: [] } })
    assert.ok(missing.some((entry) => entry.code === "claim-not-in-facts" && entry.level === "warning"))
    const extra = getDocumentRecommendations({ ...document, facts: { claimIds: [...document.facts.claimIds!, "claim-fantome"] } })
    assert.ok(extra.some((entry) => entry.code === "claim-absent" && entry.level === "info"))
    assert.equal(getDocumentRecommendations({ ...document, facts: {} }).some((entry) => entry.code.startsWith("claim-")), false)
  })

  test("registre plus ancien : conseil d'information, le document reste exploitable", () => {
    const old = { ...promoDocument(), registry: { manifestVersion: "0.0/1.0" } }
    assert.deepEqual(validateDocumentIntegrity(old), [])
    assert.ok(getDocumentRecommendations(old).some((entry) => entry.code === "registry-outdated" && entry.level === "info"))
  })

  test("triées par niveau (alertes d'abord) ; la fonction ne modifie jamais le document", () => {
    const messy = ok(ok(promoDocument(), { type: "set-slot", blockId: "offer", slot: "valeur-cle", value: { text: "-30 %*" } }), { type: "set-slot", blockId: "closing", slot: "texte-descriptif", value: { text: "Une formation gratuite." } })
    deepFreeze(messy)
    const found = getDocumentRecommendations(messy)
    const order = { alert: 0, warning: 1, info: 2 }
    assert.deepEqual(found.map((entry) => order[entry.level]), [...found.map((entry) => order[entry.level])].sort((a, b) => a - b))
    assert.equal(found[0]!.level, "alert")
    assert.deepEqual(getDocumentRecommendations(messy), found, "déterministe")
  })
})

describe("contrat EmailConfig partagé — le POC est inchangé, le Builder ne prend que le structurel", () => {
  const config = () => structuredClone(promoFixture().config) as unknown as Json
  const withoutFooter = () => ((c) => (c.blocks.pop(), c))(config())
  const consecutive = () => ((c) => ((c.blocks[2].surface = "accent-1"), (c.blocks[3].surface = "marque"), c))(config())
  const footerFirst = () => ((c) => (c.blocks.unshift(c.blocks.pop()), c))(config())

  test("le contrat historique (POC) refuse toujours ces trois cas, avec les mêmes messages", () => {
    const messages = (c: Json) => (safeParseEmailConfig(c) as { error: { issues: { message: string }[] } }).error.issues.map((issue) => issue.message)
    assert.match(messages(withoutFooter())[0]!, /^Footer manquant/)
    assert.match(messages(consecutive())[0]!, /Deux surfaces colorées consécutives \("support" puis "closing"\)/)
    assert.match(messages(footerFirst())[0]!, /^Le footer doit être la dernière lame/)
  })

  test("le contrat structurel les accepte ; il refuse toujours le technique (id en double, HTML, lame inconnue, aucune lame)", () => {
    for (const c of [withoutFooter(), consecutive(), footerFirst(), config()]) assert.equal(safeParseEmailConfigStructure(c).success, true)
    const duplicate = config()
    duplicate.blocks[2].id = "closing"
    const html = config()
    html.blocks[3].slots["titre-section"].text = "<b>x</b>"
    const unknown = config()
    unknown.blocks[2].type = "email-module-inconnue"
    for (const c of [duplicate, html, unknown, { ...config(), blocks: [] }]) assert.equal(safeParseEmailConfigStructure(c).success, false)
  })

  test("emailConfigPolicyIssues rapporte les règles de produit ; vide pour un email conforme ; ne modifie rien", () => {
    assert.deepEqual(emailConfigPolicyIssues(promoFixture().config), [])
    const frozen = deepFreeze(consecutive()) as unknown as EmailConfig
    assert.deepEqual(emailConfigPolicyIssues(frozen).map((issue) => issue.rule), ["consecutive-colored"])
    assert.deepEqual(emailConfigPolicyIssues(withoutFooter() as unknown as EmailConfig).map((issue) => issue.rule), ["footer-missing", "disclaimer-not-before-footer"])
    assert.deepEqual(emailConfigPolicyIssues(footerFirst() as unknown as EmailConfig).map((issue) => issue.rule), ["footer-not-last", "disclaimer-not-before-footer"])
  })
})

/* -------------------------------------------------------------------------- */
/* Facts et provenance                                                        */
/* -------------------------------------------------------------------------- */

describe("facts et provenance — le contenu change, la référence reste", () => {
  test("une suite d'opérations de contenu, de structure, de surface et d'image conserve facts, provenance et registre à l'identique", () => {
    const document = promoDocument()
    let next = ok(document, { type: "add-block", blockType: "email-module-text-only", slots: textBlock() })
    next = ok(next, { type: "set-surface", blockId: "closing", surface: "accent-1" })
    next = ok(next, { type: "set-slot", blockId: "offer", slot: "valeur-cle", value: { text: "-99 %*" } })
    next = ok(next, { type: "remove-block", blockId: "support" })
    next = ok(next, { type: "move-block", blockId: "closing", toIndex: 1 })
    assert.deepEqual(next.facts, document.facts)
    assert.deepEqual(next.provenance, document.provenance)
    assert.deepEqual(next.registry, document.registry)
    assert.equal(next.facts.promotion!.offer.type === "percent" && next.facts.promotion!.offer.percent, 20)
    assert.equal(next.facts.promotion!.code, "DEMO20")
    assert.equal(next.facts.promotion!.endDate, "2026-11-15")
    assert.notEqual(block(next, "offer").slots["valeur-cle"].text, block(document, "offer").slots["valeur-cle"].text, "le contenu a changé")
  })

  test("les faits ne sont jamais modifiés par une opération, même refusée", () => {
    const document = deepFreeze(promoDocument())
    for (const operation of [{ type: "remove-block", blockId: "fantome" }, { type: "remove-block", blockId: "support" }]) {
      const result = applyDocumentOperation(document, operation)
      assert.equal(document.facts.promotion!.code, "DEMO20")
      if (result.ok) assert.equal(result.value.facts, document.facts, "facts n'est pas recopié inutilement")
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Historique de travail                                                      */
/* -------------------------------------------------------------------------- */

describe("historique de travail — annuler / rétablir", () => {
  const closingTitle = (document: EmailDocument) => block(document, "closing").slots["titre-section"].text as string
  const edit = (title: string): DocumentOperation => ({ type: "set-slot", blockId: "closing", slot: "titre-section", value: { text: title } })

  test("état initial : rien à annuler ni à rétablir ; sans effet (même objet)", () => {
    const history = createHistory(promoDocument())
    assert.equal(canUndo(history), false)
    assert.equal(canRedo(history), false)
    assert.equal(undo(history), history)
    assert.equal(redo(history), history)
  })

  test("apply → undo → redo restaure exactement chaque snapshot", () => {
    const base = promoDocument()
    let history = createHistory(base)
    for (const title of ["Un", "Deux", "Trois"]) {
      const result = applyOperationToHistory(history, edit(title))
      assert.equal(result.ok, true)
      if (result.ok) history = result.value
    }
    assert.equal(closingTitle(history.present), "Trois")
    assert.equal(history.past.length, 3)
    assert.equal(canUndo(history), true)
    history = undo(history)
    assert.equal(closingTitle(history.present), "Deux")
    history = undo(undo(history))
    assert.deepEqual(history.present, base)
    assert.equal(canUndo(history), false)
    assert.equal(canRedo(history), true)
    history = redo(redo(history))
    assert.equal(closingTitle(history.present), "Deux")
    assert.equal(closingTitle(redo(history).present), "Trois")
    assert.equal(canRedo(redo(history)), false)
  })

  test("une nouvelle opération après un annuler abandonne la branche future", () => {
    let history = createHistory(promoDocument())
    for (const title of ["Un", "Deux"]) history = (applyOperationToHistory(history, edit(title)) as { value: typeof history }).value
    history = undo(history)
    assert.equal(canRedo(history), true)
    history = (applyOperationToHistory(history, edit("Autre")) as { value: typeof history }).value
    assert.equal(canRedo(history), false)
    assert.deepEqual(history.future, [])
    assert.equal(closingTitle(history.present), "Autre")
    assert.equal(closingTitle(undo(history).present), "Un", "la branche « Deux » est perdue, « Un » reste")
  })

  test("une opération refusée laisse l'historique strictement intact (même objet) et n'ajoute rien à past", () => {
    const history = deepFreeze(createHistory(promoDocument()))
    const result = applyOperationToHistory(history, { type: "remove-block", blockId: "fantome" })
    assert.equal(result.ok, false)
    assert.equal(history.past.length, 0)
  })

  test("les snapshots sont des documents (JSON pur, sans HTML), jamais des versions : aucune étiquette, aucun numéro", () => {
    const history = (applyOperationToHistory(createHistory(promoDocument()), edit("Un")) as { value: { past: readonly EmailDocument[]; present: EmailDocument } }).value
    for (const snapshot of [...history.past, history.present]) {
      assert.deepEqual(Object.keys(snapshot), ["schemaVersion", "config", "facts", "provenance", "blockMeta", "registry"])
      assert.ok(!/<html|<table/i.test(JSON.stringify(snapshot)))
    }
    assert.ok(!/version|label|name|number/i.test(Object.keys(history).join(",")))
  })

  test("l'historique est générique : il fonctionne pour tout type", () => {
    let history = createHistory(1)
    history = applyToHistory(history, 2)
    assert.equal(undo(history).present, 1)
    assert.equal(applyToHistory(history, 2), history, "même valeur : rien à historiser")
  })
})

/* -------------------------------------------------------------------------- */
/* Compatibilité renderer et export                                           */
/* -------------------------------------------------------------------------- */

describe("compatibilité avec le renderer et l'export existants", () => {
  const assetsBase = "https://assets.example.test"

  test("document.config → renderer existant → le même HTML que l'EmailConfig d'origine, octet pour octet", () => {
    const { config } = promoFixture()
    assert.equal(renderEmail(officialConfigOf(promoDocument().config)), renderEmail(config))
    const proof = recipeFixture("D-R3-B")
    assert.equal(renderEmail(officialConfigOf(createEmailDocument(proof).config)), renderEmail(proof))
  })

  test("après des opérations, le config se rend : nouvelle lame, surface, texte, image et ordre apparaissent", () => {
    let document = promoDocument()
    document = ok(document, { type: "add-block", blockType: "email-module-text-only", slots: { "titre-section": { text: "Une lame ajoutée" }, "texte-descriptif": { text: "Un texte ajouté dans le Builder." } }, index: 3 })
    document = ok(document, { type: "set-surface", blockId: "closing", surface: "accent-1" })
    document = ok(document, { type: "set-slot", blockId: "support", slot: "titre-section", value: { text: "Un autre titre d'appuis" } })
    const html = renderEmail(officialConfigOf(document.config))
    assert.ok(html.includes("Une lame ajoutée") && html.includes("Un texte ajouté dans le Builder.") && html.includes("Un autre titre d'appuis"))
    assert.ok(html.indexOf("Un autre titre d'appuis") < html.indexOf("Une lame ajoutée"), "l'ordre du document est celui du rendu")
    assert.ok(/#EDF878/i.test(html) && !/#EDF878/i.test(renderEmail(officialConfigOf(promoDocument().config))), "la surface jaune est rendue")
    assert.match(html, /^<!DOCTYPE html>/i)
  })

  test("l'export existant accepte le config d'un document valide, avant et après opérations ; le fichier passe ses contrôles", () => {
    const check = (document: EmailDocument) => {
      const exported = buildExportableEmailHtml(renderEmail(officialConfigOf(document.config)), assetsBase)
      assert.deepEqual(validateExportHtml(exported.html, { assetsBase, local: false }), [])
      assert.ok(!/demo-assets\.invalid|localhost/.test(exported.html))
      return exported.html
    }
    const base = check(promoDocument())
    let document = ok(promoDocument(), { type: "add-block", blockType: "email-module-text-only", slots: textBlock(), index: 3 })
    document = ok(document, { type: "set-image", blockId: "offer", slot: "image-1", imageId: emailImagesForIntent("campaign-portrait", "email-module-hero-offer-image-top")[0]! })
    const edited = check(document)
    assert.notEqual(edited, base)
    assert.ok(edited.includes(`${assetsBase}/images/email/v2/`))
    check(proofDocument())
  })

  test("le document sérialisé, relu puis rendu donne le même HTML : le JSON suffit à reconstruire l'email", () => {
    const document = ok(promoDocument(), { type: "set-surface", blockId: "closing", surface: "accent-1" })
    const reread = (parseEmailDocument(JSON.parse(serializeEmailDocument(document))) as { data: EmailDocument }).data
    assert.equal(renderEmail(officialConfigOf(reread.config)), renderEmail(officialConfigOf(document.config)))
  })

  test("EmailConfig reste le contrat du renderer : le document n'ajoute aucune clé à `config`", () => {
    const { config } = promoFixture()
    const document = promoDocument()
    assert.deepEqual(Object.keys(document.config), Object.keys(config))
    assert.deepEqual(document.config, config as EmailConfig)
  })
})

/* -------------------------------------------------------------------------- */
/* Frontières                                                                 */
/* -------------------------------------------------------------------------- */

describe("frontières du module", () => {
  const files = ["document", "history", "integrity", "operations", "recommendations"]

  test("domaine pur : ni React, ni Next, ni réseau, ni Anthropic, ni système de fichiers, ni Landing, ni couche Brand directe", () => {
    for (const name of files) {
      const source = code(`lib/email-builder/${name}.ts`)
      assert.ok(!/from "react|from "next|node:fs|node:path|fetch\(|@anthropic-ai|process\.env|useState|useEffect/.test(source), `${name}.ts`)
      assert.ok(!/landing|\.\.\/brand|lib\/brand/.test(source), `${name}.ts`)
    }
  })

  test("aucune opération ne produit de HTML ou de CSS : le module n'écrit ni balise, ni style, ni couleur", () => {
    for (const name of ["document", "operations", "history"]) {
      assert.ok(!/<(?:table|tr|td|div|span|p|a|img|style|html|body|br)\b|#[0-9a-f]{6}|style=|className/i.test(code(`lib/email-builder/${name}.ts`)), `${name}.ts`)
    }
  })

  test("le domaine Email n'importe pas le Builder (dépendance à sens unique)", () => {
    const emailFiles = readFileSync(join(root, "lib/email/index.ts"), "utf8")
    assert.ok(!/email-builder/.test(emailFiles))
  })
})
