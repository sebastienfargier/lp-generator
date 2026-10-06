/** POST /api/email-builder/render : rendu du canvas, sans état, sans modèle. */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { buildDemoDocument } from "../demo-document"
import { applyDocumentOperation } from "../operations"
import { handleBuilderRender } from "../render-handler"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const post = (body: unknown) => handleBuilderRender(new Request("http://localhost/api/email-builder/render", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }))
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

describe("handleBuilderRender", () => {
  test("un document valide : 200, le HTML du canvas avec un repère par lame, jamais mis en cache", async () => {
    const document = buildDemoDocument()
    const response = await post({ document })
    const json = (await response.json()) as Json
    assert.equal(response.status, 200)
    assert.equal(json.status, "success")
    assert.equal((json.html.match(/<!--builder-block:/g) ?? []).length, document.config.blocks.length)
    assert.equal(response.headers.get("Cache-Control"), "no-store")
  })

  test("le rendu suit le document : un email modifié par les opérations est rendu tel quel, footer retiré compris", async () => {
    const removed = applyDocumentOperation(buildDemoDocument(), { type: "remove-block", blockId: "footer" })
    assert.equal(removed.ok, true)
    if (!removed.ok) return
    const response = await post({ document: removed.value })
    assert.equal(response.status, 200)
    const html = ((await response.json()) as Json).html as string
    assert.ok(!html.includes("builder-block:footer"))
  })

  test("un corps qui n'est pas du JSON, sans document, ou trop volumineux : 400", async () => {
    for (const body of ["pas du json", {}, { document: undefined }, "x".repeat(600 * 1024)]) {
      const response = await post(body)
      assert.equal(response.status, 400)
      assert.equal(((await response.json()) as Json).code, "invalid-request")
    }
  })

  test("un document inexploitable n'est jamais rendu à moitié : 422 avec ses problèmes", async () => {
    const document = structuredClone(buildDemoDocument()) as unknown as Json
    document.config.blocks[2].slots.inconnu = { text: "x" }
    const response = await post({ document })
    const json = (await response.json()) as Json
    assert.equal(response.status, 422)
    assert.equal(json.code, "invalid-document")
    assert.ok(json.issues.length > 0 && !("html" in json))
    assert.equal((await post({ document: { schemaVersion: 1 } })).status, 422)
  })

  test("le serveur ne garde rien : deux appels identiques donnent le même HTML", async () => {
    const document = buildDemoDocument()
    const first = ((await (await post({ document })).json()) as Json).html
    const second = ((await (await post({ document })).json()) as Json).html
    assert.equal(first, second)
  })
})
