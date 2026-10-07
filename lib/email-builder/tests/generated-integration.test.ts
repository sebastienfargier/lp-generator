/**
 * V2.9.3 : la lame générée est un bloc NORMAL d'un EmailDocument et du Builder : intégrité,
 * opérations, rendu (aperçu et export), édition directe, assistant, historique, versions.
 * Aucune IA ne la crée : les specs viennent des fixtures V2.9.1. Hors réseau.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import { buildExportableEmailHtml, validateExportHtml } from "../../email/export-html"
import { emailBlockManifest } from "../../email/manifest"
import { emailLibraryEntries } from "../../email/library"
import { emailBank, emailBankDerivative, type EmailBankImageId } from "../../email/image-bank"
import { assistantFields, documentFingerprint, isProposalStale, proposalToOperations, validateProposal } from "../assistant-proposal"
import { buildAssistantEmail, describeSelection } from "../assistant-context"
import { blockCompatibility, blockImageChoices, blockImageId, blockSlotEditor, generatedBlockLabel } from "../block-entry"
import { builderLames } from "../catalog"
import { renderCanvasHtml, stripCanvasMarkers } from "../canvas"
import { compositionCatalog, validateCompositionPlan, type DomainCompositionPlan } from "../composition"
import { buildDemoDocument } from "../demo-document"
import { createBlankDocument, isEmptyDocument, serializeEmailDocument, type EmailDocument } from "../document"
import { builderReducer, builderDocument, createBuilderState, shownDocument, type BuilderState } from "../builder-state"
import { countGeneratedBlocks, isGeneratedBlock, officialConfigOf, type GeneratedEmailBlock } from "../generated-block"
import { renderEmail } from "../../email/renderer"
import { renderDocumentEmail } from "../render"
import { handleBuilderRender } from "../render-handler"
import { parseEmailDocument, validateDocumentIntegrity } from "../integrity"
import { applyDocumentOperation, applyDocumentOperations, applyOperationToHistory, type DocumentOperation } from "../operations"
import { getDocumentRecommendations } from "../recommendations"
import { builderTemplates } from "../templates"
import { generatedFixtures } from "./generated-fixtures"
import { fixtureContents } from "./generated-html-content"
import { createHistory, redo, undo } from "../history"

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
const clone = <T>(value: T): T => structuredClone(value)
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const addGenerated = (name: keyof typeof generatedFixtures & string, extra: Json = {}): DocumentOperation => ({ type: "add-generated-block", spec: clone(generatedFixtures[name]), slots: clone(fixtureContents[name]), ...extra }) as DocumentOperation
const ok = (document: EmailDocument, operation: DocumentOperation | unknown) => {
  const result = applyDocumentOperation(document, operation)
  assert.equal(result.ok, true, JSON.stringify(result.ok ? "" : result.error))
  return (result as Extract<typeof result, { ok: true }>).value
}
const refused = (document: EmailDocument, operation: unknown, code?: string) => {
  const before = JSON.stringify(document)
  const result = applyDocumentOperation(document, operation)
  assert.equal(result.ok, false, JSON.stringify(operation).slice(0, 120))
  assert.equal(JSON.stringify(document), before, "le document d'entrée n'est jamais modifié")
  if (!result.ok && code) assert.equal(result.error.code, code, result.error.message)
  return result
}
const generatedOf = (document: EmailDocument) => document.config.blocks.filter(isGeneratedBlock)
const blockOf = (document: EmailDocument, id: string) => document.config.blocks.find((block) => block.id === id)!
const mixed = () => ok(ok(buildDemoDocument(), addGenerated("heroImageText", { id: "hero-g", index: 1 })), addGenerated("threeCards", { id: "cards-g", surface: "bloc" }))
const ids = (document: EmailDocument) => document.config.blocks.map((block) => block.id)

describe("V2.9.3 — document : un bloc `generated` dans le même tableau que les lames officielles", () => {
  test("un document mixte est valide, en schemaVersion 1 ; la spec reste inline ; le JSON est pur et autonome", () => {
    const document = mixed()
    assert.equal(document.schemaVersion, 1)
    assert.deepEqual(validateDocumentIntegrity(document), [])
    assert.equal(parseEmailDocument(JSON.parse(JSON.stringify(document))).success, true)
    const block = blockOf(document, "hero-g") as GeneratedEmailBlock
    assert.deepEqual(Object.keys(block).sort(), ["id", "slots", "spec", "type"])
    assert.deepEqual(block.spec, generatedFixtures.heroImageText)
    assert.deepEqual(Object.keys(blockOf(document, "cards-g")).sort(), ["id", "slots", "spec", "surface", "type"])
    // rien de dérivable n'est stocké : ni HTML, ni cache, ni compatibilité
    assert.ok(!/<table|<td|"compatibility"|"degraded"|"robust"|data-slot/i.test(JSON.stringify(document)))
    assert.equal(document.blockMeta["hero-g"]?.origin, "builder")
  })

  test("JSON → parse → intégrité → rendu IDENTIQUE ; aucune Map, Set, fonction ni cache", () => {
    const document = mixed()
    const reread = JSON.parse(serializeEmailDocument(document)) as EmailDocument
    assert.deepEqual(reread, document)
    assert.equal(renderDocumentEmail(reread), renderDocumentEmail(document))
    assert.equal(JSON.stringify(structuredClone(document)), JSON.stringify(document))
    assert.equal(canonicalSame(document), true)
  })

  test("les anciens documents (sans lame générée) restent valides tels quels ; l'officiel est inchangé", () => {
    const demo = buildDemoDocument()
    assert.deepEqual(validateDocumentIntegrity(demo), [])
    assert.equal(demo.schemaVersion, 1)
    assert.equal(countGeneratedBlocks(demo.config.blocks), 0)
    assert.equal(Object.keys(emailBlockManifest).length, 36)
    assert.ok(!("generated" in emailBlockManifest))
  })

  test("un bloc généré invalide invalide le document, sans réparation : spec, contenu, surface, clé en trop, id, plafond", () => {
    const base = mixed()
    const bad = (change: (block: Json) => void) => {
      const document = clone(base) as Json
      change(document.config.blocks.find((block: Json) => block.id === "hero-g"))
      return validateDocumentIntegrity(document)
    }
    assert.ok(bad((b) => (b.spec.root.padX = 41)).some((i) => i.code === "generated-block" && i.path.includes("spec")))
    assert.ok(bad((b) => (b.spec.extra = "<b>")).length > 0)
    assert.ok(bad((b) => delete b.slots.titre).some((i) => i.code === "generated-block" && i.path.includes("slots")))
    assert.ok(bad((b) => (b.slots.surprise = { text: "x" })).length > 0)
    assert.ok(bad((b) => (b.slots.titre = { text: "<script>".repeat(30) })).length > 0)
    assert.ok(bad((b) => (b.slots.image = { imageId: "inconnue" })).length > 0)
    assert.ok(bad((b) => (b.slots.cta.destination = "https://evil.example")).length > 0)
    assert.ok(bad((b) => (b.surface = "neon")).length > 0)
    assert.ok(bad((b) => (b.html = "<table></table>")).length > 0)
    assert.ok(bad((b) => (b.id = "Hero G")).length > 0)
    assert.ok(bad((b) => (b.id = "footer")).some((i) => /double/.test(i.message)), "id partagé avec une lame officielle")
    assert.ok(bad((b) => (b.slots.titre.text = "")).length > 0)
    assert.ok(bad((b) => (b.type = "generated-2")).length > 0)
    // le plafond : 4 lames générées dans un document → refusé
    const four = clone(mixed()) as Json
    for (const n of [1, 2]) {
      four.config.blocks.push({ ...clone(four.config.blocks.find((b: Json) => b.id === "hero-g")), id: `extra-${n}` })
      four.blockMeta[`extra-${n}`] = { origin: "builder" }
    }
    assert.ok(validateDocumentIntegrity(four).some((i) => i.code === "generated-limit"))
    // un document dont `blocks` n'est pas une liste n'est pas contourné par la branche générée
    const notList = clone(base) as Json
    notList.config.blocks = "oups"
    assert.ok(validateDocumentIntegrity(notList).length > 0)
  })

  test("les chemins d'erreur d'une lame OFFICIELLE restent ceux du document complet, même mélangée à des lames générées", () => {
    const document = clone(mixed()) as Json
    const position = document.config.blocks.findIndex((b: Json) => b.id === "footer")
    delete document.config.blocks[position].slots.liens
    document.config.blocks[position].slots = { inconnu: { text: "x" } }
    const issues = validateDocumentIntegrity(document)
    assert.ok(issues.length > 0 && issues.every((issue) => issue.code === "config-contract"))
    assert.ok(issues.some((issue) => issue.path.startsWith(`config.blocks.${position}`)), JSON.stringify(issues[0]))
  })
})

function canonicalSame(document: EmailDocument) {
  const text = JSON.stringify(document)
  return text === JSON.stringify(JSON.parse(text))
}

describe("V2.9.3 — ajout, plafond 3 par email, suppression, déplacement", () => {
  test("add-generated-block : id sûr unique, position par défaut avant les mentions légales et le footer, métadonnée, atomique", () => {
    const demo = buildDemoDocument()
    const next = ok(demo, addGenerated("textSection"))
    const [block] = generatedOf(next)
    assert.equal(block!.id, "generated")
    const position = ids(next).indexOf("generated")
    assert.ok(position < ids(next).indexOf("footer"), "avant le footer")
    assert.ok(ids(next).slice(position + 1).every((id) => ["footer", "legal"].includes(id) || /legal|footer|disclaimer/.test(id)))
    const again = ok(next, addGenerated("textSection"))
    assert.deepEqual(generatedOf(again).map((b) => b.id), ["generated", "generated-2"])
    assert.equal(ok(demo, addGenerated("textSection", { id: "mon-bloc", index: 0 })).config.blocks[0]!.id, "mon-bloc")
    refused(demo, addGenerated("textSection", { id: "footer" }), "integrity")
    refused(demo, addGenerated("textSection", { index: 99 }), "position")
    refused(demo, addGenerated("textSection", { id: "Mauvais Id" }))
  })

  test("spec ou contenu invalide : refusé en entier ; add-block ne crée JAMAIS une lame générée", () => {
    const spec = clone(generatedFixtures.textSection) as Json
    spec.root.padX = 41
    refused(buildDemoDocument(), { type: "add-generated-block", spec, slots: fixtureContents.textSection }, "invalid-operation")
    const slots = clone(fixtureContents.textSection) as Json
    delete slots.cta
    refused(buildDemoDocument(), { type: "add-generated-block", spec: generatedFixtures.textSection, slots }, "invalid-operation")
    refused(buildDemoDocument(), { type: "add-generated-block", spec: generatedFixtures.textSection, slots: fixtureContents.textSection, html: "<b>" }, "invalid-operation")
    refused(buildDemoDocument(), { type: "add-block", blockType: "generated", slots: fixtureContents.textSection }, "invalid-operation")
  })

  test("le 4e ajout est refusé (« limit ») ; Undo d'un ajout revient à 2/3 ; une suppression libère une place ; une version n'a pas de quota", () => {
    let state = createHistory(buildDemoDocument())
    for (const name of ["textSection", "heroImageText", "threeCards"] as const) {
      const result = applyOperationToHistory(state, addGenerated(name))
      assert.equal(result.ok, true)
      if (result.ok) state = result.value
    }
    assert.equal(countGeneratedBlocks(state.present.config.blocks), 3)
    const fourth = applyOperationToHistory(state, addGenerated("itemGrid"))
    assert.equal(fourth.ok, false)
    if (!fourth.ok) assert.equal(fourth.error.code, "limit")
    const undone = undo(state)
    assert.equal(countGeneratedBlocks(undone.present.config.blocks), 2)
    assert.equal(countGeneratedBlocks(redo(undone).present.config.blocks), 3)
    const freed = ok(state.present, { type: "remove-block", blockId: generatedOf(state.present)[0]!.id })
    assert.equal(countGeneratedBlocks(freed.config.blocks), 2)
    ok(freed, addGenerated("itemGrid"))
    // le quota ne concerne que le document courant : un instantané complet reste valide
    assert.deepEqual(validateDocumentIntegrity(state.present), [])
  })

  test("remove-block et move-block fonctionnent sans différence : avant/après une lame officielle ou générée", () => {
    const document = mixed()
    const start = ids(document)
    const moved = ok(document, { type: "move-block", blockId: "hero-g", toIndex: 0 })
    assert.equal(ids(moved)[0], "hero-g")
    const back = ok(moved, { type: "move-block", blockId: "hero-g", toIndex: start.indexOf("hero-g") })
    assert.deepEqual(ids(back), start)
    const afterGenerated = ok(document, { type: "move-block", blockId: ids(document)[0]!, toIndex: ids(document).indexOf("hero-g") })
    assert.equal(ids(afterGenerated)[ids(afterGenerated).indexOf("hero-g") + 1] !== undefined, true)
    const removed = ok(document, { type: "remove-block", blockId: "hero-g" })
    assert.ok(!ids(removed).includes("hero-g") && !("hero-g" in removed.blockMeta))
    refused(document, { type: "move-block", blockId: "hero-g", toIndex: 999 }, "position")
    refused(document, { type: "remove-block", blockId: "absent" }, "unknown-block")
  })
})

describe("V2.9.3 — set-slot, set-image, set-surface sur une lame générée", () => {
  test("texte et libellé de bouton se modifient ; la destination et la spec ne bougent jamais", () => {
    const document = mixed()
    const before = JSON.stringify((blockOf(document, "hero-g") as GeneratedEmailBlock).spec)
    const edited = ok(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "Un autre titre" } })
    assert.deepEqual((blockOf(edited, "hero-g") as GeneratedEmailBlock).slots.titre, { text: "Un autre titre" })
    const label = ok(edited, { type: "set-slot", blockId: "hero-g", slot: "cta", value: { label: "Nouveau libellé", destination: "catalogue-formations" } })
    assert.deepEqual((blockOf(label, "hero-g") as GeneratedEmailBlock).slots.cta, { label: "Nouveau libellé", destination: "catalogue-formations" })
    assert.equal(JSON.stringify((blockOf(label, "hero-g") as GeneratedEmailBlock).spec), before)
    // destination : refusée ; URL libre : refusée ; autre destination valide : refusée aussi (non éditable)
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "cta", value: { label: "x", destination: "parcours-decouverte" } }, "slot-not-editable")
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "cta", value: { label: "x", href: "https://evil.example" } }, "slot-not-editable")
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "cta", value: { label: "x" } }, "slot-not-editable")
    // pas de slot inconnu, pas de HTML, pas d'image par set-slot, pas de clé en trop, pas de vide
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "inconnu", value: { text: "x" } }, "unknown-slot")
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "image", value: { imageId: "canape-lumiere" } }, "slot-not-editable")
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "x", html: "<b>" } }, "integrity")
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "   " } }, "integrity")
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { label: "x", destination: "catalogue-formations" } }, "integrity")
  })

  test("le contenu est revalidé après chaque modification : trop long refusé, texte hostile resté du texte", () => {
    const document = mixed()
    refused(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "x".repeat(500) } }, "integrity")
    const hostile = ok(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "<script>alert(1)</script>" } })
    const html = renderDocumentEmail(hostile)
    assert.ok(!html.includes("<script>alert(1)") && html.includes("&lt;script&gt;alert(1)"))
  })

  test("set-image : une image de la banque compatible avec le FORMAT ; jamais une URL, une image inconnue ou sans dérivé", () => {
    const document = mixed()
    const other = (Object.keys(emailBank) as EmailBankImageId[]).find((id) => id !== "canape-lumiere" && (emailBank[id].formats as readonly string[]).includes("large"))!
    const next = ok(document, { type: "set-image", blockId: "hero-g", slot: "image", imageId: other })
    assert.deepEqual((blockOf(next, "hero-g") as GeneratedEmailBlock).slots.image, { imageId: other })
    assert.ok(renderDocumentEmail(next).includes(emailBankDerivative(other, "large").src))
    const noLarge = (Object.keys(emailBank) as EmailBankImageId[]).find((id) => !(emailBank[id].formats as readonly string[]).includes("large"))
    if (noLarge) refused(document, { type: "set-image", blockId: "hero-g", slot: "image", imageId: noLarge }, "image")
    for (const imageId of ["https://evil.example/x.png", "inconnue", "../../x", "<img src=x>"]) refused(document, { type: "set-image", blockId: "hero-g", slot: "image", imageId }, "image")
    refused(document, { type: "set-image", blockId: "hero-g", slot: "titre", imageId: other }, "unknown-slot")
    refused(document, { type: "set-image", blockId: "hero-g", slot: "inconnu", imageId: other }, "unknown-slot")
  })

  test("set-surface : toutes les surfaces Studi ; Page = absence de clé ; une surface inventée est refusée", () => {
    const document = mixed()
    for (const surface of ["bloc", "accent-1", "accent-2-soft", "accent-2", "marque", "encre"]) {
      const next = ok(document, { type: "set-surface", blockId: "hero-g", surface })
      assert.equal((blockOf(next, "hero-g") as GeneratedEmailBlock).surface, surface)
      assert.ok(renderDocumentEmail(next) !== renderDocumentEmail(document))
    }
    const page = ok(ok(document, { type: "set-surface", blockId: "hero-g", surface: "marque" }), { type: "set-surface", blockId: "hero-g", surface: "page" })
    assert.ok(!("surface" in blockOf(page, "hero-g")))
    refused(document, { type: "set-surface", blockId: "hero-g", surface: "neon" }, "invalid-operation")
  })

  test("applyDocumentOperations : atomique sur un mélange officiel + généré", () => {
    const document = mixed()
    const next = ok(document, { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "Nouveau" } })
    assert.equal(next.config.blocks.length, document.config.blocks.length)
    const result = applyDocumentOperations(document, [{ type: "set-surface", blockId: "hero-g", surface: "encre" }, { type: "set-slot", blockId: "hero-g", slot: "cta", value: { label: "x", destination: "parcours-decouverte" } }])
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.index, 1)
  })
})

describe("V2.9.3 — rendu principal : aperçu (canvas) et export, un seul chemin", () => {
  test("l'aperçu rend les lames dans l'ordre du document, avec repères de lame et de slots", () => {
    const document = mixed()
    const canvas = renderCanvasHtml(document)
    const order = [...canvas.matchAll(/<!--builder-block:([^>]+)-->/g)].map((match) => match[1])
    assert.deepEqual(order, ids(document))
    const hero = canvas.slice(canvas.indexOf("<!--builder-block:hero-g-->"), canvas.indexOf("<!--/builder-block-->", canvas.indexOf("<!--builder-block:hero-g-->")))
    for (const slot of ["image", "sur-titre", "titre", "texte", "cta"]) assert.ok(hero.includes(`data-slot="${slot}"`), slot)
    assert.ok(canvas.includes("Un nouveau départ"))
  })

  test("sans lame générée, le rendu est identique octet pour octet à celui du renderer historique", () => {
    const demo = buildDemoDocument()
    assert.equal(renderDocumentEmail(demo), renderEmail(officialConfigOf(demo.config)))
  })

  test("l'export passe par le même pipeline : HTML final sans data-slot, sans spec, sans badge ni compatibilité", () => {
    const document = ok(mixed(), addGenerated("bannerOverlapCard", { id: "overlap-g" }))
    const canonical = renderDocumentEmail(document)
    assert.ok(!canonical.includes("data-slot"))
    assert.equal(canonical, stripCanvasMarkers(canonical))
    const exported = buildExportableEmailHtml(canonical, "https://assets.example.test")
    assert.ok(!/data-slot|builder-block|specVersion|"role"|Générée|\bdegraded\b|\brobust\b|compatibility/i.test(exported.html))
    assert.deepEqual(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }), [])
    assert.ok(exported.html.includes("https://assets.example.test"), "les images de la lame générée sont résolues comme les autres")
    assert.ok(!exported.html.includes("demo-assets.invalid") && !exported.html.includes("[URL_CDN_ICONE"))
  })

  test("fail closed : un document dont une lame générée est invalide n'est jamais rendu (422) ; un document valide est rendu (200)", async () => {
    const post = (document: unknown) => handleBuilderRender(new Request("http://localhost/api/email-builder/render", { method: "POST", body: JSON.stringify({ document }) }))
    const good = await post(mixed())
    assert.equal(good.status, 200)
    const html = ((await good.json()) as Json).html as string
    assert.equal((html.match(/<!--builder-block:/g) ?? []).length, mixed().config.blocks.length)
    const broken = clone(mixed()) as Json
    broken.config.blocks.find((b: Json) => b.id === "hero-g").slots.cta.destination = "https://evil.example"
    const response = await post(broken)
    assert.equal(response.status, 422)
    assert.equal(((await response.json()) as Json).code, "invalid-document")
  })

  test("le canvas ne connaît pas le DSL : il reçoit le HTML et les capacités (blockEntry)", () => {
    const source = code("components/email-builder/builder-canvas.tsx")
    assert.ok(!/generated-html|renderGeneratedBlock|GeneratedBlockSpec|\.spec\b|deriveGenerated/.test(source))
  })
})

describe("V2.9.3 — capacités d'une lame (blockEntry)", () => {
  test("éditeurs : texte court/long, libellé de bouton, image ; icône non éditable ; officiel inchangé", () => {
    const document = ok(mixed(), addGenerated("itemGrid", { id: "grid-g" }))
    const hero = blockOf(document, "hero-g")
    assert.equal(blockSlotEditor(hero, "titre"), "short")
    assert.equal(blockSlotEditor(hero, "texte"), "long")
    assert.equal(blockSlotEditor(hero, "cta"), "label")
    assert.equal(blockSlotEditor(hero, "image"), "image")
    assert.equal(blockSlotEditor(hero, "inconnu"), null)
    assert.equal(blockSlotEditor(blockOf(document, "grid-g"), "icone-1"), null)
    assert.equal(blockSlotEditor(blockOf(document, "footer"), "x"), null)
  })

  test("images : proposées par FORMAT du slot (jamais un blockType inventé) ; image actuelle retrouvée", () => {
    const hero = blockOf(mixed(), "hero-g")
    const choices = blockImageChoices(hero, "image")
    assert.ok(choices.length > 0 && choices.every((choice) => (emailBank[choice.id].formats as readonly string[]).includes("large")))
    assert.ok(choices.every((choice) => choice.src === emailBankDerivative(choice.id, "large").src))
    assert.equal(blockImageId(hero, "image"), "canape-lumiere")
    assert.deepEqual(blockImageChoices(hero, "titre"), [])
  })

  test("compatibilité dérivée : « degraded » seulement avec overlap ; jamais stockée ; badge et libellé", () => {
    const document = ok(mixed(), addGenerated("bannerOverlapCard", { id: "overlap-g" }))
    assert.equal(blockCompatibility(blockOf(document, "overlap-g")), "degraded")
    assert.equal(blockCompatibility(blockOf(document, "hero-g")), "robust")
    assert.equal(blockCompatibility(blockOf(document, "footer")), "robust")
    assert.equal(generatedBlockLabel(blockOf(document, "hero-g") as GeneratedEmailBlock).name, "Lame générée — hero")
    const ui = code("components/email-builder/builder-canvas.tsx")
    assert.match(ui, /badge=\{generated \? "Générée"/)
    assert.match(ui, /Certains effets visuels peuvent être simplifiés selon le client email\./)
    assert.ok(!/Outlook/i.test(ui), "Outlook n'est pas mentionné systématiquement")
  })
})

describe("V2.9.3 — édition directe (reducer du Builder)", () => {
  const start = () => createBuilderState(mixed())
  const reduce = (state: BuilderState, ...actions: Parameters<typeof builderReducer>[1][]) => actions.reduce(builderReducer, state)

  test("texte et libellé de bouton : même interaction, UNE entrée d'historique ; la destination est conservée", () => {
    let state = reduce(start(), { type: "commit-edit", blockId: "hero-g", slot: "titre", draft: { text: "  Titre\nmodifié " } })
    assert.deepEqual((blockOf(builderDocument(state), "hero-g") as GeneratedEmailBlock).slots.titre, { text: "Titre modifié" })
    state = reduce(state, { type: "commit-edit", blockId: "hero-g", slot: "cta", draft: { text: "Allons-y" } })
    assert.deepEqual((blockOf(builderDocument(state), "hero-g") as GeneratedEmailBlock).slots.cta, { label: "Allons-y", destination: "catalogue-formations" })
    assert.equal(state.history.past.length, 2)
    // valeur inchangée : ni opération ni historique
    const same = reduce(state, { type: "commit-edit", blockId: "hero-g", slot: "cta", draft: { text: "Allons-y" } })
    assert.equal(same.history.past.length, 2)
  })

  test("un brouillon qui porte une destination libre n'a aucun effet sur la destination ; une image ne s'édite pas en ligne", () => {
    const state = reduce(start(), { type: "commit-edit", blockId: "hero-g", slot: "cta", draft: { label: "x", href: "https://evil.example" } as never })
    const cta = (blockOf(builderDocument(state), "hero-g") as GeneratedEmailBlock).slots.cta as { destination: string }
    assert.equal(cta.destination, "catalogue-formations")
    assert.equal(reduce(start(), { type: "start-edit", blockId: "hero-g", slot: "image" }).selection.kind, "none")
    assert.equal(reduce(start(), { type: "start-edit", blockId: "hero-g", slot: "titre" }).selection.kind, "editing")
  })

  test("image par la banque, surface, déplacement, suppression ; chaque geste est annulable et rétablissable ; la spec revient EXACTEMENT", () => {
    const base = start()
    const spec = JSON.stringify((blockOf(builderDocument(base), "hero-g") as GeneratedEmailBlock).spec)
    const gestures: Parameters<typeof builderReducer>[1][] = [
      { type: "commit-edit", blockId: "hero-g", slot: "titre", draft: { text: "Autre" } },
      { type: "operation", operation: { type: "set-image", blockId: "hero-g", slot: "image", imageId: "quai-gare" } },
      { type: "operation", operation: { type: "set-surface", blockId: "hero-g", surface: "marque" } },
      { type: "operation", operation: { type: "move-block", blockId: "hero-g", toIndex: 0 } },
      { type: "operation", operation: { type: "remove-block", blockId: "hero-g" } },
    ]
    let state = base
    const snapshots = [JSON.stringify(builderDocument(state))]
    for (const gesture of gestures) {
      state = builderReducer(state, gesture)
      assert.notEqual(JSON.stringify(builderDocument(state)), snapshots.at(-1), `le geste ${JSON.stringify(gesture).slice(0, 40)} change le document`)
      snapshots.push(JSON.stringify(builderDocument(state)))
    }
    for (let step = gestures.length - 1; step >= 0; step -= 1) {
      state = builderReducer(state, { type: "undo" })
      assert.equal(JSON.stringify(builderDocument(state)), snapshots[step])
    }
    assert.equal(JSON.stringify((blockOf(builderDocument(state), "hero-g") as GeneratedEmailBlock).spec), spec)
    for (let step = 1; step <= gestures.length; step += 1) {
      state = builderReducer(state, { type: "redo" })
      assert.equal(JSON.stringify(builderDocument(state)), snapshots[step])
    }
  })

  test("add generated → Undo → Redo ; l'ajout sélectionne la lame ; un refus (plafond) laisse l'état et dit pourquoi", () => {
    let state = createBuilderState(buildDemoDocument())
    state = reduce(state, { type: "operation", operation: addGenerated("textSection", { id: "g1" }) })
    assert.deepEqual(state.selection, { kind: "block", blockId: "g1" })
    state = reduce(state, { type: "operation", operation: addGenerated("heroImageText", { id: "g2" }) }, { type: "operation", operation: addGenerated("threeCards", { id: "g3" }) })
    const refusedState = reduce(state, { type: "operation", operation: addGenerated("itemGrid", { id: "g4" }) })
    assert.equal(countGeneratedBlocks(builderDocument(refusedState).config.blocks), 3)
    assert.equal(refusedState.notice?.tone, "error")
    assert.equal(refusedState.history, state.history)
    const undone = reduce(state, { type: "undo" })
    assert.equal(countGeneratedBlocks(builderDocument(undone).config.blocks), 2)
    assert.equal(countGeneratedBlocks(builderDocument(reduce(undone, { type: "redo" })).config.blocks), 3)
  })
})

describe("V2.9.3 — versions : le snapshot garde la spec et le contenu EXACTEMENT", () => {
  test("sauvegarde → modification → consultation (lecture seule, rendu correct) → repartir de cette version", () => {
    let state = createBuilderState(mixed())
    state = builderReducer(state, { type: "save-version", name: "Avec lames générées", at: "2026-10-07T10:00:00.000Z" })
    const saved = JSON.stringify(builderDocument(state))
    state = builderReducer(state, { type: "commit-edit", blockId: "hero-g", slot: "titre", draft: { text: "Modifié après" } })
    state = builderReducer(state, { type: "operation", operation: { type: "remove-block", blockId: "cards-g" } })
    assert.notEqual(JSON.stringify(builderDocument(state)), saved)
    const viewing = builderReducer(state, { type: "view-version", id: "v1" })
    assert.equal(JSON.stringify(shownDocument(viewing)), saved)
    assert.ok(renderCanvasHtml(shownDocument(viewing)).includes("Un nouveau départ"))
    // lecture seule : un geste d'édition est ignoré
    assert.equal(builderReducer(viewing, { type: "commit-edit", blockId: "hero-g", slot: "titre", draft: { text: "Interdit" } }), viewing)
    const restarted = builderReducer(viewing, { type: "restart-from", id: "v1" })
    assert.equal(JSON.stringify(builderDocument(restarted)), saved)
    assert.equal(restarted.status, "draft")
    // le plafond ne concerne que le document courant : la copie restaurée est valide et éditable
    assert.deepEqual(validateDocumentIntegrity(builderDocument(restarted)), [])
  })
})

describe("V2.9.3 — état vide : une lame générée peut être la première, jamais via la bibliothèque", () => {
  test("0 lame → add generated → statut libre ; supprimer la dernière → vide → Brouillon", () => {
    let state = createBuilderState(createBlankDocument())
    assert.equal(isEmptyDocument(builderDocument(state)), true)
    state = builderReducer(state, { type: "operation", operation: addGenerated("textSection", { id: "premiere" }) })
    assert.equal(isEmptyDocument(builderDocument(state)), false)
    assert.deepEqual(builderDocument(state).config.blocks.map((block) => block.id), ["premiere"])
    state = builderReducer(state, { type: "set-status", status: "review" })
    assert.equal(state.status, "review")
    state = builderReducer(state, { type: "save-version", name: "", at: "2026-10-07T10:00:00.000Z" })
    assert.equal(state.versions.length, 1)
    state = builderReducer(state, { type: "operation", operation: { type: "remove-block", blockId: "premiere" } })
    assert.equal(isEmptyDocument(builderDocument(state)), true)
    assert.equal(state.status, "draft")
    assert.equal(builderReducer(state, { type: "assistant-send", text: "Bonjour" }).assistant.pending, false, "l'assistant reste désactivé sur un email vide")
  })

  test("la bibliothèque ne propose pas de lame générée et reste celle du manifest", () => {
    const lames = builderLames()
    assert.equal(lames.length, emailLibraryEntries.length)
    assert.ok(lames.every((lame) => lame.type in emailBlockManifest))
    assert.ok(!lames.some((lame) => /generated|générée/i.test(`${lame.type} ${lame.name} ${lame.family}`)))
    assert.ok(!("generated" in compositionCatalog(lames)))
    assert.ok(!/generated/i.test(code("components/email-builder/lame-library-panel.tsx")))
    for (const template of builderTemplates()) assert.equal(countGeneratedBlocks(template.document.config.blocks), 0, template.id)
    assert.equal(countGeneratedBlocks(buildDemoDocument().config.blocks), 0)
  })
})

describe("V2.9.3 — assistant : voit et modifie le CONTENU, ne touche jamais à la structure ni ne crée", () => {
  test("champs visés : textes, libellés de bouton, image ; jamais la spec ; aucun slot protégé ou réservé", () => {
    const fields = assistantFields(mixed()).filter((field) => field.blockId === "hero-g")
    assert.deepEqual(fields.map((field) => [field.target, field.kind, field.blockType]), [
      ["hero-g:image", "image", "generated"],
      ["hero-g:sur-titre", "titre", "generated"],
      ["hero-g:titre", "titre", "generated"],
      ["hero-g:texte", "paragraphe", "generated"],
      ["hero-g:cta:label", "bouton", "generated"],
    ])
    assert.equal(fields.find((field) => field.kind === "bouton")!.current, "Voir le parcours")
    assert.equal(fields.find((field) => field.kind === "image")!.current, emailBank["canape-lumiere"].alt)
    assert.ok(!assistantFields(mixed()).some((field) => /valeur-cle|code-promo|disclaimer|logo|social/.test(field.slot) && field.blockId.endsWith("-g")))
  })

  test("contexte de l'assistant : lame marquée « generated » avec son rôle, champs, candidats d'image par format ; sélection lisible", () => {
    const email = buildAssistantEmail(mixed())
    const hero = email.blocks.find((block) => block.id === "hero-g") as Json
    assert.equal(hero.generated, true)
    assert.equal(hero.role, "hero")
    assert.equal(hero.name, "Lame générée — hero")
    const image = hero.fields.find((field: Json) => field.kind === "image")
    assert.equal(image.currentImage, "canape-lumiere")
    assert.ok(image.candidates.length > 0 && image.candidates.every((candidate: Json) => (emailBank[candidate.id as EmailBankImageId].formats as readonly string[]).includes("large")))
    assert.ok(!JSON.stringify(email).includes('"spec"') && !/"root"|"padX"|"columns"/.test(JSON.stringify(hero)), "la structure n'est pas exposée au modèle")
    assert.equal((email.blocks.find((block) => block.id === "footer") as Json).generated, undefined)
    assert.deepEqual(describeSelection(mixed(), { blockId: "hero-g", slot: "titre" }), { blockId: "hero-g", blockName: "Lame générée — hero", slot: "titre" })
  })

  test("proposition de contenu : texte, libellé de bouton (destination conservée), image ; appliquée comme une lame officielle", () => {
    const document = mixed()
    const changes = [
      { target: "hero-g:titre", value: "Un titre retravaillé" },
      { target: "hero-g:cta:label", value: "Découvrir" },
      { target: "hero-g:image", value: "quai-gare" },
    ]
    const translated = proposalToOperations(document, changes)
    assert.equal(translated.ok, true)
    const checked = validateProposal(document, changes)
    assert.equal(checked.ok, true, JSON.stringify(checked))
    if (!checked.ok) return
    const block = blockOf(checked.next, "hero-g") as GeneratedEmailBlock
    assert.deepEqual(block.slots.titre, { text: "Un titre retravaillé" })
    assert.deepEqual(block.slots.cta, { label: "Découvrir", destination: "catalogue-formations" })
    assert.deepEqual(block.slots.image, { imageId: "quai-gare" })
    assert.equal(JSON.stringify(block.spec), JSON.stringify(generatedFixtures.heroImageText))
    // une image sans dérivé à ce format ou inconnue : refusée
    const noLarge = (Object.keys(emailBank) as EmailBankImageId[]).find((id) => !(emailBank[id].formats as readonly string[]).includes("large"))
    if (noLarge) assert.equal(validateProposal(document, [{ target: "hero-g:image", value: noLarge }]).ok, false)
    assert.equal(validateProposal(document, [{ target: "hero-g:image", value: "https://evil.example/x.png" }]).ok, false)
    assert.equal(validateProposal(document, [{ target: "hero-g:spec", value: "x" }]).ok, false)
    assert.equal(validateProposal(document, [{ target: "hero-g:titre", value: "x".repeat(400) }]).ok, false, "le contenu reste borné par le slot")
  })

  test("proposition structurelle : déplacer et supprimer une lame générée ; la créer, la décrire ou la transformer est impossible", () => {
    const document = mixed()
    const catalog = compositionCatalog(builderLames())
    const plan = (change: Partial<DomainCompositionPlan>): DomainCompositionPlan => ({ content: [], add: [], move: [], remove: [], ...change })
    const moved = validateCompositionPlan(document, plan({ move: [{ blockId: "hero-g", placement: { where: "first", anchor: "" } }] }), catalog)
    assert.equal(moved.ok, true)
    if (moved.ok) assert.equal(moved.next.config.blocks[0]!.id, "hero-g")
    const removed = validateCompositionPlan(document, plan({ remove: [{ blockId: "cards-g" }] }), catalog)
    assert.equal(removed.ok, true)
    if (removed.ok) assert.ok(!ids(removed.next).includes("cards-g"))
    // le plan de l'assistant (contrat public) ne sait pas créer une lame générée : le type n'est pas au catalogue
    assert.equal(validateCompositionPlan(document, plan({ add: [{ ref: "new-1", blockType: "generated", placement: { where: "last", anchor: "" }, content: [] }] }), catalog).ok, false)
    // pas de transformation : un champ n'a pas d'équivalent « spec », et un type officiel ne devient pas généré
    assert.equal(validateCompositionPlan(document, plan({ content: [{ target: "hero-g:spec", value: "x" }] }), catalog).ok, false)
    // le schéma de sortie de l'assistant (V2.7) n'a pas changé : aucune trace du générateur
    for (const file of ["lib/email-builder/assistant-schema.ts", "lib/email-builder/assistant-engine.ts", "lib/email-builder/assistant-handler.ts", "lib/email-builder/assistant-mock.ts"]) assert.ok(!/addGenerated|generated-block|GeneratedBlockSpec/.test(code(file)), file)
  })

  test("péremption : modifier une lame générée change l'empreinte et périme la proposition, comme pour une lame officielle ; une seule empreinte", () => {
    const document = mixed()
    const proposal = { basedOn: documentFingerprint(document) }
    assert.equal(isProposalStale(proposal, document), false)
    for (const operation of [
      { type: "set-slot", blockId: "hero-g", slot: "titre", value: { text: "Autre" } },
      { type: "set-surface", blockId: "hero-g", surface: "encre" },
      { type: "set-image", blockId: "hero-g", slot: "image", imageId: "quai-gare" },
      { type: "move-block", blockId: "hero-g", toIndex: 0 },
    ]) assert.equal(isProposalStale(proposal, ok(document, operation)), true, operation.type)
    // la spec fait partie de l'empreinte : une spec modifiée donne une autre empreinte
    const altered = clone(document) as Json
    altered.config.blocks.find((b: Json) => b.id === "hero-g").spec.root.padX = 20
    assert.notEqual(documentFingerprint(altered as unknown as EmailDocument), documentFingerprint(document))
    assert.equal((code("lib/email-builder/assistant-proposal.ts").match(/function documentFingerprint/g) ?? []).length, 1)
  })
})

describe("V2.9.3 — composition : ajout d'une lame générée par le DOMAINE (chemin interne, hors contrat de l'assistant)", () => {
  const catalog = compositionCatalog(builderLames())
  const plan = (change: Partial<DomainCompositionPlan>): DomainCompositionPlan => ({ content: [], add: [], move: [], remove: [], ...change })
  const gen = (name: keyof typeof generatedFixtures & string, ref: string, placement: { where: "first" | "last" | "before" | "after"; anchor: string }) => ({ ref, spec: clone(generatedFixtures[name]), slots: clone(fixtureContents[name]), placement })

  test("un plan écrit à la main : ajouts officiels ET générés, placés par rapport l'un à l'autre, en UNE transformation", () => {
    const document = buildDemoDocument()
    const first = document.config.blocks[0]!.id
    const checked = validateCompositionPlan(document, plan({ addGenerated: [gen("heroImageText", "g-1", { where: "after", anchor: first }), gen("threeCards", "g-2", { where: "after", anchor: "g-1" })] }), catalog)
    assert.equal(checked.ok, true, JSON.stringify(checked))
    if (!checked.ok) return
    assert.deepEqual(ids(checked.next).slice(0, 3), [first, "generated", "generated-2"])
    assert.equal(countGeneratedBlocks(checked.next.config.blocks), 2)
    assert.deepEqual(validateDocumentIntegrity(checked.next), [])
    assert.equal(ids(document).length + 2, ids(checked.next).length, "le document d'entrée n'a pas été touché")
  })

  test("sur un email vide : la première lame peut être générée (API domaine)", () => {
    const checked = validateCompositionPlan(createBlankDocument(), plan({ addGenerated: [gen("textSection", "g-1", { where: "last", anchor: "" })] }), catalog)
    assert.equal(checked.ok, true, JSON.stringify(checked))
    if (checked.ok) assert.equal(checked.next.config.blocks.length, 1)
  })

  test("plafond (3), spec invalide, contenu invalide, ref réutilisée, ancre inconnue : le plan entier est refusé, rien n'est appliqué", () => {
    const document = mixed()
    const tooMany = validateCompositionPlan(document, plan({ addGenerated: [gen("textSection", "g-1", { where: "last", anchor: "" }), gen("itemGrid", "g-2", { where: "last", anchor: "" })] }), catalog)
    assert.equal(tooMany.ok, false)
    if (!tooMany.ok) assert.match(tooMany.message, /3 lames générées au plus/)
    const badSpec = gen("textSection", "g-1", { where: "last", anchor: "" })
    ;(badSpec.spec as Json).root.padX = 41
    assert.equal(validateCompositionPlan(buildDemoDocument(), plan({ addGenerated: [badSpec] }), catalog).ok, false)
    const badContent = gen("textSection", "g-1", { where: "last", anchor: "" })
    delete (badContent.slots as Json).titre
    assert.equal(validateCompositionPlan(buildDemoDocument(), plan({ addGenerated: [badContent] }), catalog).ok, false)
    assert.equal(validateCompositionPlan(buildDemoDocument(), plan({ addGenerated: [gen("textSection", "g-1", { where: "last", anchor: "" }), gen("textSection", "g-1", { where: "last", anchor: "" })] }), catalog).ok, false)
    assert.equal(validateCompositionPlan(buildDemoDocument(), plan({ addGenerated: [gen("textSection", "g-1", { where: "after", anchor: "inconnue" })] }), catalog).ok, false)
    assert.equal(validateCompositionPlan(buildDemoDocument(), plan({ addGenerated: [gen("textSection", "Mauvaise Ref", { where: "last", anchor: "" })] }), catalog).ok, false)
  })

  test("le contrat PUBLIC du plan (assistant) n'a pas changé : CompositionPlan reste content / add / move / remove ; le complément est séparé", () => {
    const source = code("lib/email-builder/composition.ts")
    assert.match(source, /export type CompositionPlan = CompositionStructure & \{ content: ProposalChange\[\] \}/)
    assert.match(source, /export type DomainCompositionPlan = CompositionPlan & \{ addGenerated\?/)
    assert.ok(!/addGenerated/.test(code("lib/email-builder/assistant-schema.ts")))
  })
})

describe("V2.9.3 — recommandations : la lame générée est un citoyen normal, sans casser les validateurs officiels", () => {
  test("zones colorées consécutives et terminologie s'appliquent aux lames générées ; l'officiel garde ses alertes", () => {
    let document = ok(ok(buildDemoDocument(), addGenerated("textSection", { id: "g-a", surface: "marque", index: 1 })), addGenerated("statBanner", { id: "g-b", surface: "encre", index: 2 }))
    assert.ok(getDocumentRecommendations(document).some((entry) => entry.code === "layout-consecutive-colored" && entry.target?.blockId === "g-b"))
    document = ok(document, { type: "set-slot", blockId: "g-a", slot: "texte", value: { text: "Vous devez vous inscrire" } })
    const brand = getDocumentRecommendations(document).filter((entry) => entry.code.startsWith("brand-") && entry.target?.blockId === "g-a")
    assert.ok(brand.length > 0, "la terminologie de marque est relevée aussi dans une lame générée")
    // ajouter puis retirer des lames générées ne laisse aucune recommandation : les alertes de l'email officiel sont celles d'avant
    const roundTrip = ok(ok(buildDemoDocument(), addGenerated("textSection", { id: "g-c" })), { type: "remove-block", blockId: "g-c" })
    assert.deepEqual(getDocumentRecommendations(roundTrip), getDocumentRecommendations(buildDemoDocument()))
  })
})

describe("V2.9.3 — non-régression : Reference, recettes et assistant restent officiels", () => {
  test("seule la création depuis une référence crée des lames générées, et seulement par le noyau V2.9.4 : jamais la bibliothèque, les modèles, les recettes ni l'assistant (V2.9.4b a câblé le pipeline)", () => {
    for (const file of ["reference-engine.ts", "reference-mapping.ts", "reference-handler.ts", "reference-schema.ts", "reference-catalog.ts", "reference-report.ts", "reference-mock.ts", "templates.ts", "demo-document.ts"]) {
      assert.ok(!/addGenerated|add-generated-block|generated-block|GeneratedBlockSpec|renderGeneratedBlock/.test(code(`lib/email-builder/${file}`)), file)
    }
    // le plan et le pipeline ne connaissent que ce qu'ils posent : jamais le DSL ni le rendu
    assert.ok(!/GeneratedBlockSpec|renderGeneratedBlock|generated-html/.test(code("lib/email-builder/reference-pipeline.ts") + code("lib/email-builder/reference-plan.ts")))
    for (const file of ["lib/email/recipes.ts", "lib/email/recipe-resolver.ts", "lib/email/promotion-resolver.ts"]) assert.ok(!/generated-block|GeneratedBlockSpec/.test(code(file)), file)
  })

  test("aucun nouveau format d'image : `card` reste refusé", () => {
    const spec = clone(generatedFixtures.heroImageText) as Json
    spec.root.children[0].format = "card"
    refused(buildDemoDocument(), { type: "add-generated-block", spec, slots: fixtureContents.heroImageText }, "invalid-operation")
  })

  test("l'ancien générateur et son export n'ont aucune dépendance au Builder ; le renderer historique n'a qu'un crochet additif", () => {
    const renderer = code("lib/email/renderer.ts")
    assert.match(renderer, /renderExtra/)
    assert.ok(!/email-builder/.test(renderer))
    assert.ok(!/email-builder/.test(code("lib/email/export-html.ts")))
  })
})
