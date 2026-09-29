/**
 * Manifeste ↔ templates : le manifeste est la source de vérité, chaque
 * template doit en porter exactement les slots et éléments système.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailBlockManifest } from "../manifest"
import { emailSystemElements, type EmailSystemElement } from "../system"

type Entry = {
  family: string
  file: string
  surfaceMode: string
  slots: Record<string, string>
  optional?: readonly string[]
  system?: readonly EmailSystemElement[]
}

const templatesDir = join(process.cwd(), "lib", "email", "templates")
const entries = Object.entries(emailBlockManifest) as [string, Entry][]
const attributeValues = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]+)"`, "g"))].map((match) => match[1])

describe("manifeste", () => {
  test("36 lames, 10 familles", () => {
    assert.equal(entries.length, 36)
    assert.equal(new Set(entries.map(([, entry]) => entry.family)).size, 10)
  })

  test("Header et Footer sont fixed", () => {
    for (const [type, entry] of entries) {
      if (entry.family === "Header" || entry.family === "Footer") {
        assert.equal(entry.surfaceMode, "fixed", type)
      }
    }
  })

  for (const [type, entry] of entries) {
    test(`${type} ↔ ${entry.file}`, () => {
      const path = join(templatesDir, entry.file)
      assert.ok(existsSync(path), "template absent")
      const html = readFileSync(path, "utf8")

      assert.deepEqual(attributeValues(html, "data-slot"), Object.keys(entry.slots), "data-slot")

      const system = attributeValues(html, "data-system")
      assert.deepEqual(system, [...(entry.system ?? [])], "data-system")
      for (const name of system) {
        assert.ok(html.includes(emailSystemElements[name as EmailSystemElement].token), `jeton ${name}`)
      }

      const optional = new Set(attributeValues(html, "data-optional"))
      assert.deepEqual([...optional], [...(entry.optional ?? [])], "data-optional")
      for (const slot of optional) assert.ok(slot in entry.slots, `optional ${slot}`)

      assert.ok(!/<svg/i.test(html), "aucun SVG")
    })
  }
})
