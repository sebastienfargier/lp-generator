/**
 * Largeur canonique de l'email : 600 px, dans le socle, le manifeste, les 36
 * templates et l'aperçu. Aucune largeur 640 résiduelle.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailBlockManifest, emailManifestSource } from "../manifest"

const root = join(process.cwd(), "lib", "email")
const read = (...path: string[]) => readFileSync(join(root, ...path), "utf8")
const templates = Object.values(emailBlockManifest).map((entry) => [entry.file, read("templates", entry.file)] as const)

describe("largeur canonique 600 px", () => {
  test("socle : lame de 600 px, bascule mobile sous 600 px", () => {
    const socle = read("socle-email.html")
    assert.ok(socle.includes(".lame{width:600px;max-width:600px}"))
    assert.ok(socle.includes("@media only screen and (max-width:599px)"))
    assert.ok(!/\b640\b/.test(socle))
    assert.equal(emailManifestSource.width, 600)
  })

  test("36 templates : une table .lame de 600 px, aucun 640", () => {
    assert.equal(templates.length, 36)
    for (const [file, html] of templates) {
      const lame = html.match(/<table\b[^>]*class="lame"[^>]*>/g) ?? []
      assert.equal(lame.length, 1, file)
      assert.ok(lame[0]!.includes('width="600"') && lame[0]!.includes("width:600px;max-width:600px;"), file)
      assert.ok(!/\b640\b/.test(html), file)
    }
  })

  test("images : largeur ≤ 600, attribut et max-width identiques", () => {
    let images = 0
    for (const [file, html] of templates) {
      for (const [tag] of html.matchAll(/<img data-slot="image-\d+"[^>]*>/g)) {
        images++
        const width = Number(/ width="(\d+)"/.exec(tag)?.[1])
        assert.ok(width > 0 && width <= 600, `${file} : ${width}`)
        assert.ok(tag.includes(`max-width:${width}px;`), file)
      }
    }
    assert.equal(images, 20)
  })

  test("aperçu Desktop à la largeur canonique", () => {
    const preview = readFileSync(join(process.cwd(), "components", "email", "email-preview.tsx"), "utf8")
    assert.match(preview, /value: "desktop", label: "Desktop", width: 600\b/)
    assert.match(preview, /value: "mobile", label: "Mobile", width: 390\b/)
  })
})
