/**
 * Frontière de la couche Brand : elle ne lit pas le Markdown à l'exécution,
 * n'appelle rien, et rien dans les moteurs ne l'utilise encore.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { root } from "./corpus"

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

function files(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (name === "node_modules" || name === ".next" || name === "tests") return []
    if (statSync(join(root, path)).isDirectory()) return files(path, keep)
    return keep(path) ? [path] : []
  })
}

const brandSources = files("lib/brand", (path) => /\.(ts|tsx)$/.test(path))

describe("lib/brand : frontière", () => {
  test("sept fichiers de code, uniquement dans lib/brand", () => {
    assert.deepEqual(brandSources.map((path) => path.replace("lib/brand/", "")).sort(), ["audiences.ts", "claims.ts", "index.ts", "provenance.ts", "terminology.ts", "types.ts"])
  })

  test("aucune dépendance runtime aux fichiers Markdown : ni lecture de fichier, ni import de .md, ni lecture de ressources/", () => {
    for (const path of brandSources) {
      const source = strip(readFileSync(join(root, path), "utf8"))
      assert.ok(!/node:fs|from "fs"|readFile|createReadStream|require\(|import\(|from "[^"]+\.md"|process\.cwd|import\.meta/.test(source), path)
    }
    // Seule mention de ressources/ : le chemin (une chaîne) de provenance.
    const mentions = brandSources.filter((path) => /ressources\//.test(strip(readFileSync(join(root, path), "utf8"))))
    assert.deepEqual(mentions, ["lib/brand/provenance.ts"])
  })

  test("aucun import hors de lib/brand, ni réseau, ni Anthropic, ni dépendance ajoutée", () => {
    for (const path of brandSources) {
      const source = strip(readFileSync(join(root, path), "utf8"))
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]!)
      for (const specifier of imports) assert.ok(specifier.startsWith("./"), `${path} : ${specifier}`)
      assert.ok(!/anthropic|fetch\(|XMLHttpRequest/i.test(source), path)
    }
  })

  test("seules les recettes Email V2 (hors ligne) l'utilisent : ni Landing, ni composants, ni routes, ni moteur Email V1", () => {
    const users = [...files("lib/email", (p) => /\.(ts|tsx)$/.test(p)), ...files("lib/landing", (p) => /\.(ts|tsx)$/.test(p)), ...files("components", (p) => /\.(ts|tsx)$/.test(p)), ...files("app", (p) => /\.(ts|tsx)$/.test(p))]
    assert.ok(users.length > 100)
    const using = users.filter((path) => /lib\/brand|["']\.\.?\/(?:\.\.\/)*brand(?:\/[a-z-]+)?["']/.test(readFileSync(join(root, path), "utf8")))
    // Les recettes Email V2 (claims approuvées, lexique) : le seul usage autorisé.
    assert.deepEqual(using.sort(), ["lib/email/recipe-resolver.ts", "lib/email/recipe-validation.ts"])
  })

  test("les moteurs, prompts et resolvers ne mentionnent ni la marque ni ses claims", () => {
    for (const path of ["lib/email/draft-prompt.ts", "lib/email/ai-prompt.ts", "lib/email/draft-resolver.ts", "lib/email/anthropic.ts", "lib/landing/ai-prompt.ts", ["lib/landing", "anthropic.ts"].join("/"), "lib/landing/draft-resolver.ts"]) {
      assert.ok(!/approvedClaims|lintBrandText|brandAudiences|lib\/brand/.test(readFileSync(join(root, path), "utf8")), path)
    }
  })
})
