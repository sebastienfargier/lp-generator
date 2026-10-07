/**
 * Canvas du Builder : le HTML du renderer, relié aux blockId par des repères.
 * Le renderer reste LA source du rendu : le canvas n'est que son HTML, aux
 * repères près, et l'export n'est jamais touché.
 */
import { officialConfigOf } from "../generated-block"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { buildExportableEmailHtml, validateExportHtml } from "../../email/export-html"
import { toPreviewHtml } from "../../email/preview"
import { renderEmail, renderEmailParts } from "../../email/renderer"
import { builderLames } from "../catalog"
import { canvasBlockEnd, canvasBlockStart, renderCanvasHtml, renderMarkedHtml, stripCanvasMarkers } from "../canvas"
import { buildDemoDocument } from "../demo-document"
import { applyDocumentOperation } from "../operations"

const strip = stripCanvasMarkers
const markerIds = (html: string) => [...html.matchAll(/<!--builder-block:([^>]+)-->/g)].map((match) => match[1])

describe("renderEmailParts — le renderer en morceaux, sans changer son rendu", () => {
  test("renderEmail est exactement la jointure par « \\n » de ses morceaux", () => {
    const { config } = buildDemoDocument()
    const { head, blocks, tail } = renderEmailParts(config)
    assert.equal(blocks.length, config.blocks.length)
    assert.equal([head, ...blocks, tail].join("\n"), renderEmail(officialConfigOf(config)))
  })

  test("le rendu des lames ne dépend pas de leurs voisines", () => {
    const { config } = buildDemoDocument()
    const alone = renderEmailParts({ ...config, blocks: [config.blocks[1]!] }).blocks[0]
    assert.equal(alone, renderEmailParts(config).blocks[1])
  })
})

describe("canvas — repères lame ↔ blockId", () => {
  test("une paire de commentaires par lame, dans l'ordre du document, avec le blockId", () => {
    const document = buildDemoDocument()
    const html = renderMarkedHtml(document)
    assert.deepEqual(markerIds(html), document.config.blocks.map((block) => block.id))
    assert.equal(html.split(canvasBlockEnd).length - 1, document.config.blocks.length)
    // Chaque lame est un <table> de premier niveau entre ses deux repères.
    for (const block of document.config.blocks) {
      const from = html.indexOf(canvasBlockStart(block.id)) + canvasBlockStart(block.id).length
      const to = html.indexOf(canvasBlockEnd, from)
      assert.match(html.slice(from, to), /^<table\b/)
      assert.match(html.slice(from, to), /<\/table>\s*$/)
    }
  })

  test("les repères sont des COMMENTAIRES : les retirer redonne exactement le rendu du renderer", () => {
    const document = buildDemoDocument()
    assert.equal(strip(renderMarkedHtml(document)), renderEmail(officialConfigOf(document.config)))
  })

  test("l'adaptation d'aperçu conserve les repères et n'ajoute que ce que l'aperçu ajoute déjà", () => {
    const document = buildDemoDocument()
    const canvas = renderCanvasHtml(document)
    assert.deepEqual(markerIds(canvas), document.config.blocks.map((block) => block.id))
    assert.equal(strip(canvas), toPreviewHtml(renderEmail(officialConfigOf(document.config))))
    assert.ok(!/<script|data-builder|data-block|contenteditable/i.test(canvas), "aucun script ni attribut d'interface injecté")
  })

  test("l'HTML exporté n'est pas concerné : aucun repère, export valide", () => {
    const document = buildDemoDocument()
    const exported = buildExportableEmailHtml(renderEmail(officialConfigOf(document.config)), "https://assets.example.test")
    assert.ok(!exported.html.includes("builder-block"))
    assert.deepEqual(validateExportHtml(exported.html, { assetsBase: "https://assets.example.test", local: false }), [])
    assert.ok(!renderEmail(officialConfigOf(document.config)).includes("builder-block"))
  })

  test("chaque lame ajoutable est repérée par le canvas : les 31 types ajoutables, ajoutés un à un", () => {
    const document = buildDemoDocument()
    let checked = 0
    for (const lame of builderLames().filter((entry) => entry.starter)) {
      const added = applyDocumentOperation(document, { type: "add-block", blockType: lame.type, slots: lame.starter, index: 2 })
      assert.equal(added.ok, true, lame.type)
      if (!added.ok) continue
      const html = renderMarkedHtml(added.value)
      assert.deepEqual(markerIds(html), added.value.config.blocks.map((block) => block.id), lame.type)
      assert.equal(strip(html), renderEmail(officialConfigOf(added.value.config)), lame.type)
      checked += 1
    }
    assert.ok(checked >= 30)
  })

  test("le canvas suit le document après chaque opération (ordre, ajout, suppression)", () => {
    let document = buildDemoDocument()
    const apply = (operation: Parameters<typeof applyDocumentOperation>[1]) => {
      const result = applyDocumentOperation(document, operation)
      assert.equal(result.ok, true)
      if (result.ok) document = result.value
    }
    apply({ type: "move-block", blockId: "closing", toIndex: 1 })
    apply({ type: "remove-block", blockId: "support" })
    apply({ type: "remove-block", blockId: "footer" })
    assert.deepEqual(markerIds(renderCanvasHtml(document)), ["header", "closing", "offer", "mentions-legales"])
  })
})

describe("canvas — frontières", () => {
  test("module serveur : il passe par le renderer existant et n'écrit aucun HTML de lame", () => {
    const source = readFileSync(join(process.cwd(), "lib/email-builder/canvas.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
    // Le chemin de rendu du document (`render.ts`) appelle le renderer existant et y branche les lames générées.
    const render = readFileSync(join(process.cwd(), "lib/email-builder/render.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
    assert.match(render, /renderEmailParts/)
    assert.ok(!/<table|<td|<tr|node:fs/.test(render))
    assert.match(source, /renderDocumentParts/)
    assert.match(source, /toPreviewHtml/)
    assert.ok(!/<table|<td|<tr|node:fs/.test(source))
    assert.match(source, /slotMarkers: true/)
  })
})
