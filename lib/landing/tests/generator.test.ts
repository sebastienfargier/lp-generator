/**
 * /generator sans moteur de démonstration : aucun moteur déterministe, aucune
 * génération au chargement, aucune route qui produise une landing, aucun
 * aperçu reconstruit depuis l'URL.
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emptyGeneratorBrief, GeneratorBriefSchema } from "../brief"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const generatorFiles = ["app/generator/page.tsx", ...sources("components/generator"), "lib/landing/brief.ts"]

describe("moteur de démonstration Landing supprimé", () => {
  test("fichiers du moteur, de l'aperçu par URL et de la route absents", () => {
    for (const path of ["lib/landing/demo-generator.ts", "lib/generator", "app/generator/preview", "app/api/generate"]) {
      assert.ok(!existsSync(join(root, path)), path)
    }
  })

  test("aucune source n'importe le moteur supprimé", () => {
    const scanned = [...sources("app"), ...sources("components"), ...sources("lib")].filter((path) => !path.includes("/tests/"))
    for (const path of scanned) {
      const source = read(path)
      // Le domaine Email a son propre `./demo-generator`, sans rapport.
      assert.ok(!/landing\/demo-generator|lib\/generator\//.test(source), path)
    }
  })

  test("le générateur n'importe ni la page d'exemple ni ses données", () => {
    for (const path of generatorFiles) assert.ok(!/landing\/demo"|demoLandingPage/.test(read(path)), path)
  })
})

describe("/generator : aucune génération", () => {
  test("aucune requête, aucun moteur appelé, aucune mention de démo", () => {
    for (const path of generatorFiles) {
      const source = read(path)
      assert.ok(!/fetch\(|runGeneration|generateValidatedPage|buildPreviewUrl|\/api\/generate/.test(source), path)
      assert.ok(!/mode démo|sans ia|simulée/i.test(source), path)
    }
    assert.ok(!/<Badge/.test(read("app/generator/page.tsx")))
  })

  test("formulaire vide au chargement, refusé tel quel par le contrat", () => {
    assert.deepEqual(emptyGeneratorBrief, { projectName: "", brief: "", audience: "", objective: "" })
    assert.equal(GeneratorBriefSchema.safeParse(emptyGeneratorBrief).success, false)
    assert.match(read("app/generator/page.tsx"), /initialBrief=\{emptyGeneratorBrief\}/)
  })

  test("aperçu vide et bouton désactivé", () => {
    assert.match(read("components/generator/generator-workspace.tsx"), /<LandingPreview src=\{null\}/)
    assert.match(read("components/generator/landing-preview.tsx"), /Votre landing page apparaîtra ici après génération\./)
    assert.match(read("components/generator/generator-panel.tsx"), /<Button type="submit" disabled /)
  })
})
