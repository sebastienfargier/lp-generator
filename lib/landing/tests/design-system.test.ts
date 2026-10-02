/**
 * /design-system (V1 Landing) : une vue de lecture des vraies sources, pas un
 * nouveau design system. Aucune valeur de design n'y est recopiée, les vrais
 * Button et Badge sont rendus, la page reste hors du pipeline IA et du domaine
 * Email, et la navigation y mène.
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { radiusSteps, typographyStyles } from "../../../components/design-system/styles"
import { groupColorTokens, parseLandingCss, radiusTokenNames, readLandingCss, typographyTokenNames } from "../../design-system/landing-css"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
/** Source sans commentaires : on teste le code, pas ce qu'il raconte. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`
    return statSync(join(root, path)).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

const pagePath = "app/(dashboard)/design-system/page.tsx"
const designSystemFiles = [...sources("lib/design-system"), ...sources("components/design-system"), pagePath]

describe("aucune palette ni valeur dupliquée", () => {
  test("aucune couleur, aucune taille, aucun rayon écrits dans le code de la page", () => {
    for (const path of designSystemFiles) {
      const source = code(path)
      assert.ok(!/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/.test(source), `${path} : couleur en dur`)
      assert.ok(!/\b\d+(\.\d+)?(px|rem|em)\b/.test(source), `${path} : taille en dur`)
      assert.ok(!/--[a-z0-9-]+\s*:\s*[#\d]/.test(source), `${path} : déclaration de token`)
    }
  })

  test("aucun fichier de tokens, JSON ni palette TypeScript parallèle", () => {
    const files = [...sources("lib/design-system"), ...sources("components/design-system")]
    for (const path of files) assert.ok(!/palette|tokens\.(ts|json)/i.test(path), path)
    assert.ok(!readdirSync(join(root, "lib/design-system")).some((name) => name.endsWith(".json")))
    assert.ok(!existsSync(join(root, "lib/design-tokens.ts")))
  })

  test("la page lit app/globals.css et peint chaque pastille avec var(--token)", () => {
    assert.match(code("lib/design-system/landing-css.ts"), /readFileSync\(join\(process\.cwd\(\), landingCssPath\)/)
    assert.equal(read("lib/design-system/landing-css.ts").includes('landingCssPath = "app/globals.css"'), true)
    assert.match(code(pagePath), /readLandingCss\(\)/)
    assert.match(code(pagePath), /groupColorTokens\(css\.root\)/)
    assert.match(code("components/design-system/colors.tsx"), /backgroundColor: `var\(--\$\{token\.name\}\)`/)
  })
})

describe("couleurs : lues dans app/globals.css", () => {
  const css = readLandingCss()
  const groups = groupColorTokens(css.root)
  const colorVariables = css.root.filter((variable) => variable.value.startsWith("#") || variable.value.startsWith("var("))

  test("chaque variable de couleur est affichée une fois, aucune n'est ajoutée", () => {
    const shown = groups.flatMap((group) => group.tokens.map((token) => token.name))
    assert.deepEqual([...shown].sort(), colorVariables.map((variable) => variable.name).sort())
    assert.equal(new Set(shown).size, shown.length)
    assert.ok(colorVariables.length > 0)
  })

  test("la valeur affichée est celle du fichier ; un alias est résolu vers sa couleur déclarée", () => {
    for (const token of groups.flatMap((group) => group.tokens)) {
      assert.equal(token.value, css.root.find((variable) => variable.name === token.name)!.value)
      assert.ok(token.alias || token.resolved === token.value)
      if (token.alias) assert.match(token.resolved, /^#[0-9a-f]{3,8}$/i, `${token.name} non résolu`)
    }
  })

  test("pilotée par la source : un autre CSS donne d'autres tokens, sans rien dans le code", () => {
    const parsed = parseLandingCss(`:root { --brand-green: #123456; --primary: var(--brand-green); --radius: 1rem; --ignored: 3px; }
      @theme inline { --text-h1: 2rem; --text-h1--line-height: 1; --radius-sm: 2px; }`)
    const brand = groupColorTokens(parsed.root)
    assert.deepEqual(brand.map((group) => group.id), ["brand", "roles"])
    assert.equal(brand[1]!.tokens[0]!.resolved, "#123456")
    assert.deepEqual(typographyTokenNames(parsed.themeInline), ["h1"])
    assert.deepEqual(radiusTokenNames(parsed.themeInline), ["sm"])
  })

  test("la palette attendue existe réellement dans la source (marque, accents, neutres, états)", () => {
    const ids = groups.map((group) => group.id)
    for (const id of ["brand", "accents", "neutrals", "states", "roles"]) assert.ok(ids.includes(id), id)
  })
})

describe("typographie et rayons : vraies classes, valeurs mesurées", () => {
  const css = readLandingCss()

  test("les cinq styles présentés sont exactement les styles déclarés dans app/globals.css", () => {
    assert.deepEqual(typographyStyles.map((style) => style.token).sort(), typographyTokenNames(css.themeInline).sort())
    for (const style of typographyStyles) assert.equal(style.className, `text-${style.token}`)
  })

  test("les rayons présentés sont exactement les rayons déclarés", () => {
    assert.deepEqual(radiusSteps.map((step) => step.token).sort(), radiusTokenNames(css.themeInline).sort())
    for (const step of radiusSteps) assert.equal(step.className, `rounded-${step.token}`)
  })

  test("les métriques sont celles du navigateur (getComputedStyle), jamais recopiées", () => {
    const typography = code("components/design-system/typography.tsx")
    assert.match(typography, /getComputedStyle\(element\)/)
    assert.match(typography, /fontSize/)
    assert.match(typography, /lineHeight/)
    assert.match(typography, /fontWeight/)
    assert.match(code("components/design-system/radius.tsx"), /getComputedStyle\(element\)\.borderTopLeftRadius/)
  })

  test("styles.ts ne contient que des noms de classes, les composants les appliquent tels quels", () => {
    const styles = code("components/design-system/styles.ts")
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|rem|em)\b|font-size|line-height|border-radius/.test(styles))
    assert.equal((styles.match(/className: "(text|rounded)-[a-z0-9]+"/g) ?? []).length, typographyStyles.length + radiusSteps.length)
    assert.match(code("components/design-system/typography.tsx"), /className=\{className\}/)
  })
})

describe("Button et Badge : les vrais composants", () => {
  const button = read("components/ui/button.tsx")
  const badge = read("components/ui/badge.tsx")

  test("les variants viennent de la configuration réelle exportée, sans changer le composant", () => {
    assert.match(button, /variants: buttonVariantConfig,/)
    assert.match(button, /export const buttonVariantOptions = \{/)
    assert.match(button, /Object\.keys\(buttonVariantConfig\.variant\)/)
    assert.match(button, /Object\.keys\(buttonVariantConfig\.size\)/)
    assert.match(button, /defaultVariants: \{\s*variant: "default",\s*size: "default",\s*\}/)
    assert.match(badge, /variants: badgeVariantConfig,/)
    assert.match(badge, /Object\.keys\(badgeVariantConfig\.variant\)/)
    assert.match(badge, /defaultVariants: \{\s*variant: "default",\s*size: "default",\s*\}/)
  })

  test("la configuration contient toujours les variants et tailles existants (aucun retrait)", () => {
    const keys = (source: string, config: string, group: string) => {
      const block = source.slice(source.indexOf(`const ${config} = {`))
      const start = block.indexOf(`  ${group}: {`)
      const body = block.slice(start, block.indexOf("\n  },", start))
      return [...body.matchAll(/^ {4}(?:"([a-z0-9-]+)"|([a-z0-9-]+)):/gm)].map((match) => match[1] ?? match[2])
    }
    for (const variant of ["default", "outline", "secondary", "ghost", "destructive", "accent", "inverse", "link"]) {
      assert.ok(keys(button, "buttonVariantConfig", "variant").includes(variant), `button : ${variant}`)
    }
    for (const size of ["default", "xs", "sm", "lg", "xl", "icon", "icon-xs", "icon-sm", "icon-lg"]) {
      assert.ok(keys(button, "buttonVariantConfig", "size").includes(size), `button : ${size}`)
    }
    for (const variant of ["default", "secondary", "destructive", "outline", "ghost", "link", "accent-1", "accent-2-soft", "brand-soft"]) {
      assert.ok(keys(badge, "badgeVariantConfig", "variant").includes(variant), `badge : ${variant}`)
    }
    for (const size of ["default", "lg"]) assert.ok(keys(badge, "badgeVariantConfig", "size").includes(size), `badge : ${size}`)
  })

  test("la page rend le vrai Button et le vrai Badge, itère sur la configuration, et ne recrée rien", () => {
    const buttons = code("components/design-system/buttons.tsx")
    const badges = code("components/design-system/badges.tsx")
    assert.match(buttons, /import \{ Button, buttonVariantOptions \} from "@\/components\/ui\/button"/)
    assert.match(buttons, /buttonVariantOptions\.variant\.map/)
    assert.match(badges, /import \{ Badge, badgeVariantOptions \} from "@\/components\/ui\/badge"/)
    assert.match(badges, /badgeVariantOptions\.variant\.map/)
    for (const path of designSystemFiles) {
      const source = code(path)
      assert.ok(!/\bcva\(|class-variance-authority/.test(source), `${path} : cva`)
      assert.ok(!/<button\b|<span[^>]*rounded-full/.test(source), `${path} : faux bouton ou faux badge`)
    }
  })

  test("aucune variante recopiée dans la page : pas de liste de noms de variants", () => {
    for (const path of designSystemFiles) {
      assert.ok(!/"(destructive|accent-1|accent-2-soft|brand-soft)"/.test(code(path)), path)
    }
  })
})

describe("hors du pipeline IA et du domaine Email", () => {
  const aiModules = ["ai-prompt", "anthropic", "anthropic-schema", "generation-draft", "draft-resolver", "generation-context", "generation-request", "generation-validation", "section-catalog", "section-generation", "generate-handler"]

  test("aucun module IA ne connaît le design system", () => {
    for (const name of aiModules) assert.ok(!/design-system|landing-css|DesignSystem/.test(read(`lib/landing/${name}.ts`)), name)
    assert.ok(!/design-system/.test(code("app/api/generate/route.ts")))
  })

  test("le design system n'importe ni le moteur IA, ni Anthropic, ni le contrat de génération", () => {
    for (const path of designSystemFiles) {
      assert.ok(!/@anthropic-ai|lib\/landing|generate-handler|generation-draft|draft-resolver|section-catalog|ai-prompt|process\.env|ANTHROPIC/.test(code(path)), path)
    }
  })

  test("aucune dépendance Landing → Email, ni design system → Email", () => {
    const landing = [...sources("components/sections"), ...sources("components/landing"), ...sources("components/design-system"), ...sources("lib/design-system"), ...sources("lib/landing").filter((path) => !path.includes("/tests/")), pagePath]
    // Les imports seulement : destinations.ts cite lib/email comme provenance, sans l'importer.
    for (const path of landing) assert.ok(!/(from|import\()\s*["'][^"']*(lib\/email|components\/email|app\/email-generator|\/email\/)/.test(code(path)), path)
  })

  test("le code Node (fs) reste côté serveur : aucun composant client ne lit le CSS", () => {
    for (const path of sources("components/design-system")) {
      if (!/^["']use client["']/.test(read(path).trimStart())) continue
      assert.ok(!/landing-css|node:fs/.test(code(path)), path)
    }
    assert.ok(!/^["']use client["']/.test(read(pagePath).trimStart()))
  })
})

describe("navigation", () => {
  const data = code("components/dashboard/dashboard-data.ts")
  const sidebar = code("components/dashboard/app-sidebar.tsx")

  test("« Design System » est dans la navigation du dashboard et mène à /design-system", () => {
    assert.match(data, /\{ title: "Design System", href: "\/design-system", icon: Palette \}/)
    assert.match(data, /Palette,/)
    assert.ok(existsSync(join(root, pagePath)))
    assert.match(code(pagePath), /title: "Design System"/)
  })

  test("une seule navigation : la sidebar existante, la page vit dans le shell du dashboard", () => {
    assert.equal((data.match(/export const navItems/g) ?? []).length, 1)
    assert.match(sidebar, /navItems\.map/)
    assert.match(sidebar, /isActive\(pathname, item\.href\)/)
    assert.ok(!/AppSidebar|SidebarProvider|navItems|components\/ui\/sidebar/.test(designSystemFiles.map((path) => code(path)).join("\n")))
    assert.ok(pagePath.startsWith("app/(dashboard)/"))
  })

  test("la recherche (⌘K) est alimentée par la même navigation", () => {
    assert.match(data, /export const searchableItems = navItems/)
  })

  test("Email apparaît comme « Bientôt », sans Design System Email", () => {
    assert.match(code(pagePath), /Bientôt/)
    assert.ok(!existsSync(join(root, "app/(dashboard)/design-system/email")))
    assert.ok(!existsSync(join(root, "lib/design-system/email-css.ts")))
  })
})
