/**
 * Identification blockId + slotName dans le HTML du canvas. Le renderer garde
 * l'attribut `data-slot` des templates (option `slotMarkers`, Builder
 * seulement) : un élément visible porte son nom de slot, sa lame est celle dont
 * les repères l'encadrent. Rien n'est deviné d'après un texte. L'export, lui,
 * n'en contient jamais.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { parseFragment, type DefaultTreeAdapterTypes } from "parse5"

import { buildExportableEmailHtml, validateExportHtml } from "../../email/export-html"
import { emailBlockManifest } from "../../email/manifest"
import { resolveEmailRecipeDraftFixture } from "../../email/recipe-draft-fixtures"
import { renderEmail, renderEmailParts } from "../../email/renderer"
import type { EmailBlock } from "../../email/types"
import { builderLames } from "../catalog"
import { canvasBlockEnd, canvasBlockStart, renderCanvasHtml, stripCanvasMarkers } from "../canvas"
import { createEmailDocument, type EmailDocument } from "../document"
import { buildDemoDocument } from "../demo-document"
import { applyDocumentOperation } from "../operations"

type Node = DefaultTreeAdapterTypes.ChildNode
type Element = DefaultTreeAdapterTypes.Element

const attr = (element: Element, name: string) => element.attrs.find((entry) => entry.name === name)?.value
function* walk(nodes: Node[]): Generator<Element> {
  for (const node of nodes) {
    if ("tagName" in node) {
      yield node
      yield* walk(node.childNodes)
    }
  }
}
const textOf = (node: Node): string => ("value" in node && node.nodeName === "#text" ? (node as DefaultTreeAdapterTypes.TextNode).value : "childNodes" in node ? node.childNodes.map(textOf).join("") : "")

/** Les éléments à `data-slot` d'une lame, d'après les SEULS repères du canvas. */
function slotsOfBlock(canvas: string, blockId: string): Map<string, Element> {
  const from = canvas.indexOf(canvasBlockStart(blockId)) + canvasBlockStart(blockId).length
  const region = canvas.slice(from, canvas.indexOf(canvasBlockEnd, from))
  const found = new Map<string, Element>()
  for (const element of walk(parseFragment(region).childNodes)) {
    const name = attr(element, "data-slot")
    if (name !== undefined) {
      assert.equal(found.has(name), false, `${blockId} : slot « ${name} » en double`)
      found.set(name, element)
    }
  }
  return found
}

const nbsp = /[  ]/g
const plain = (value: string) => value.replace(nbsp, " ").replace(/\s+/g, " ").trim()

/** Chaque slot du document est retrouvé par son nom, sur la bonne balise, avec le contenu du document. */
function assertSlotsIdentified(document: EmailDocument, label: string) {
  const canvas = renderCanvasHtml(document)
  for (const block of document.config.blocks) {
    const found = slotsOfBlock(canvas, block.id)
    const kinds = emailBlockManifest[block.type].slots as Record<string, string>
    const given = (block as unknown as { slots: Record<string, Record<string, string>> }).slots
    for (const [slot, value] of Object.entries(given)) {
      const element = found.get(slot)
      assert.ok(element, `${label} ${block.id}.${slot} : élément introuvable`)
      switch (kinds[slot]) {
        case "texte":
          assert.equal(plain(textOf(element)), plain(value.text), `${label} ${block.id}.${slot}`)
          break
        case "cta":
        case "cta:fleche":
        case "lien":
          assert.equal(element.tagName, "a")
          assert.equal(attr(element, "data-preview-href"), value.href, `${label} ${block.id}.${slot} : destination`)
          assert.ok(plain(textOf(element)).startsWith(plain(value.label)), `${label} ${block.id}.${slot} : libellé`)
          break
        case "asset:visuel":
          assert.equal(element.tagName, "img")
          assert.equal(attr(element, "alt"), value.alt, `${label} ${block.id}.${slot} : alt`)
          break
        case "asset:icone":
          assert.equal(element.tagName, "img")
          break
        case "disclaimer":
          assert.ok(plain(textOf(element)).length > 10)
          break
      }
    }
    // Aucun slot fantôme : tout `data-slot` du rendu est un slot déclaré de la lame.
    for (const name of found.keys()) assert.ok(name in kinds, `${label} ${block.id} : slot inconnu « ${name} »`)
  }
}

describe("canvas — slots identifiés par attribut, jamais par heuristique de texte", () => {
  test("l'email de démonstration : chaque slot de chaque lame est retrouvé (texte, bouton, lien, image, icône, mention)", () => {
    assertSlotsIdentified(buildDemoDocument(), "demo")
  })

  test("chaque lame ajoutable, ajoutée au document : tous ses slots sont retrouvés avec leur contenu", () => {
    let checked = 0
    for (const lame of builderLames().filter((entry) => entry.starter)) {
      const added = applyDocumentOperation(buildDemoDocument(), { type: "add-block", blockType: lame.type, slots: lame.starter, index: 2 })
      assert.equal(added.ok, true, lame.type)
      if (!added.ok) continue
      assertSlotsIdentified(added.value, lame.type)
      checked += 1
    }
    assert.ok(checked >= 30)
  })

  test("deux textes identiques dans deux lames : chacun est rattaché à SA lame (aucune confusion par le contenu)", () => {
    const base = buildDemoDocument()
    const same = { "titre-section": { text: "Même titre" }, "texte-descriptif": { text: "Même texte." } }
    let document = base
    for (const index of [2, 4]) {
      const result = applyDocumentOperation(document, { type: "add-block", blockType: "email-module-text-only", slots: same, index })
      assert.equal(result.ok, true)
      if (result.ok) document = result.value
    }
    const canvas = renderCanvasHtml(document)
    const ids = document.config.blocks.filter((block) => block.type === "email-module-text-only").map((block) => block.id)
    assert.equal(ids.length, 2)
    for (const id of ids) assert.equal(plain(textOf(slotsOfBlock(canvas, id).get("titre-section")!)), "Même titre")
    assert.notEqual(ids[0], ids[1])
  })

  test("lame à plusieurs visuels : les cinq images de la frise sont des éléments distincts, image-1 à image-5", () => {
    const { resolution } = resolveEmailRecipeDraftFixture("D-R2-B")
    assert.equal(resolution.status, "resolved")
    if (resolution.status !== "resolved") return
    const document = createEmailDocument(resolution.config)
    const strip = document.config.blocks.find((block) => block.type === "email-hero-newsletter-variant-01") as EmailBlock
    const found = slotsOfBlock(renderCanvasHtml(document), strip.id)
    const images = ["image-1", "image-2", "image-3", "image-4", "image-5"].map((name) => found.get(name))
    assert.ok(images.every((element) => element?.tagName === "img"))
    assert.equal(new Set(images.map((element) => attr(element!, "src"))).size, 5)
    assertSlotsIdentified(document, "frise")
  })

  test("slot optionnel absent : aucun élément fantôme pour lui", () => {
    const { resolution } = resolveEmailRecipeDraftFixture("D-R1-A")
    if (resolution.status !== "resolved") throw new Error(resolution.status)
    assertSlotsIdentified(createEmailDocument(resolution.config), "R1")
  })
})

describe("canvas — l'instrumentation reste dans l'aperçu du Builder", () => {
  test("le renderer, par défaut, ne laisse aucun data-slot ; avec l'option, il les garde sans rien changer d'autre", () => {
    const { config } = buildDemoDocument()
    assert.ok(!renderEmail(config).includes("data-slot"))
    const plainParts = renderEmailParts(config)
    assert.ok(![plainParts.head, ...plainParts.blocks, plainParts.tail].join("").includes("data-slot"))
    const marked = renderEmailParts(config, { slotMarkers: true })
    const html = [marked.head, ...marked.blocks, marked.tail].join("\n")
    assert.ok(html.includes('data-slot="titre-section"') || html.includes('data-slot="sous-titre"'))
    assert.equal(html.replace(/\sdata-slot="[^"]*"/g, ""), renderEmail(config), "l'attribut est le SEUL écart")
  })

  test("le canvas, privé de ses repères, est exactement l'aperçu du HTML du renderer", () => {
    const document = buildDemoDocument()
    assert.equal(stripCanvasMarkers(renderCanvasHtml(document)).includes("data-slot"), false)
    assert.ok(renderCanvasHtml(document).includes("data-slot="))
  })

  test("l'export n'en contient aucun et reste valide, avant et après une opération", () => {
    let document = buildDemoDocument()
    const edited = applyDocumentOperation(document, { type: "set-slot", blockId: "offer", slot: "sous-titre", value: { text: "Autre" } })
    assert.equal(edited.ok, true)
    if (edited.ok) document = edited.value
    for (const doc of [buildDemoDocument(), document]) {
      const exported = buildExportableEmailHtml(renderEmail(doc.config), "https://assets.example.test")
      assert.ok(!/data-slot|data-system|builder-block/.test(exported.html))
      assert.deepEqual(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }), [])
    }
  })

  test("le HTML du canvas ne contient ni script, ni contenteditable, ni attribut d'édition", () => {
    const canvas = renderCanvasHtml(buildDemoDocument())
    assert.ok(!/<script|contenteditable|data-edit|data-builder|onclick|oninput/i.test(canvas))
  })
})
