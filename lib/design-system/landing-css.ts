import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Lecture des tokens Landing, directement dans `app/globals.css`, leur seule
 * source de vérité. Ce module ne contient AUCUNE valeur de design : il lit le
 * fichier CSS et regroupe les noms par famille. Serveur uniquement (`node:fs`).
 */

export type CssVariable = { name: string; value: string }

export const landingCssPath = "app/globals.css"

/** Variables `--nom: valeur;` d'un bloc CSS (`:root`, `@theme inline`…). */
function readBlock(css: string, opening: string): CssVariable[] {
  const start = css.indexOf(`${opening} {`)
  if (start === -1) return []
  let depth = 0
  let end = start
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1
    if (css[index] === "}") {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  const body = css.slice(css.indexOf("{", start) + 1, end)
  return [...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((match) => ({ name: match[1]!, value: match[2]!.trim() }))
}

export function parseLandingCss(source: string) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "")
  return { root: readBlock(css, ":root"), themeInline: readBlock(css, "@theme inline") }
}

export function readLandingCss() {
  return parseLandingCss(readFileSync(join(process.cwd(), landingCssPath), "utf8"))
}

/** Un token de couleur : sa valeur déclarée, et la couleur finale si c'est un alias. */
export type ColorToken = { name: string; value: string; resolved: string; alias: boolean }

const isColor = (value: string) => value.startsWith("#") || value.startsWith("var(")

/** Suit les alias `var(--autre)` jusqu'à la couleur déclarée. */
function resolve(value: string, byName: Map<string, string>, seen = new Set<string>()): string {
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(value)
  if (!alias || seen.has(alias[1]!)) return value
  seen.add(alias[1]!)
  const next = byName.get(alias[1]!)
  return next === undefined ? value : resolve(next, byName, seen)
}

/** Familles de noms (pas de valeurs) servant à regrouper les couleurs, dans l'ordre d'affichage. */
const colorFamilies: { id: string; label: string; match: (name: string, value: string) => boolean }[] = [
  { id: "brand", label: "Marque", match: (name) => name.startsWith("brand-") },
  { id: "accents", label: "Accents", match: (name) => /^accent-\d/.test(name) },
  { id: "neutrals", label: "Neutres", match: (name) => name.startsWith("neutral-") },
  { id: "orange", label: "Orange", match: (name) => name.startsWith("orange-") },
  { id: "states", label: "États", match: (name) => ["success", "warning", "danger", "info"].includes(name) },
  { id: "sidebar", label: "Sidebar", match: (name) => name.startsWith("sidebar") },
  { id: "charts", label: "Graphiques", match: (name) => name.startsWith("chart-") },
]

export type ColorGroup = { id: string; label: string; tokens: ColorToken[] }

/**
 * Regroupe les couleurs de `:root` : palette de marque, accents, neutres,
 * états, puis rôles sémantiques (tout ce qui reste). Aucun token n'est omis ni
 * ajouté : chaque variable de couleur est dans exactement un groupe.
 */
export function groupColorTokens(root: CssVariable[]): ColorGroup[] {
  const byName = new Map(root.map((variable) => [variable.name, variable.value]))
  const colors = root.filter((variable) => isColor(variable.value))
  const groups: ColorGroup[] = [...colorFamilies.map(({ id, label }) => ({ id, label, tokens: [] as ColorToken[] })), { id: "roles", label: "Rôles sémantiques", tokens: [] }]
  for (const { name, value } of colors) {
    const family = colorFamilies.findIndex((candidate) => candidate.match(name, value))
    const group = groups[family === -1 ? groups.length - 1 : family]!
    group.tokens.push({ name, value, resolved: resolve(value, byName), alias: value.startsWith("var(") })
  }
  // Ordre d'affichage : marque, accents, neutres, orange, états, rôles, sidebar, graphiques.
  const order = ["brand", "accents", "neutrals", "orange", "states", "roles", "sidebar", "charts"]
  return order.map((id) => groups.find((group) => group.id === id)!).filter((group) => group.tokens.length > 0)
}

/** Noms des styles typographiques déclarés (`--text-<nom>`, sans leurs `--line-height` / `--font-weight`). */
export function typographyTokenNames(themeInline: CssVariable[]) {
  return themeInline.filter((variable) => /^text-[a-z0-9]+$/.test(variable.name)).map((variable) => variable.name.slice("text-".length))
}

/** Noms des rayons déclarés (`--radius-<nom>`). */
export function radiusTokenNames(themeInline: CssVariable[]) {
  return themeInline.filter((variable) => /^radius-[a-z0-9]+$/.test(variable.name)).map((variable) => variable.name.slice("radius-".length))
}
