/**
 * Contrôle d'hygiène du HTML PRODUIT par notre compilateur (V2.9.2). Ce n'est pas un
 * filtre pour du HTML venu d'ailleurs : la whitelist décrit ce que NOTRE code a le droit
 * d'émettre, et sert de filet si un mapping ou un échappement régresse. Un HTML qui
 * n'y passe pas n'est jamais rendu.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5"

import { emailDemoAssetHost } from "../../email/demo-assets"
import { emailDestinations, emailDestinationUrl, type EmailDestinationId } from "../../email/destinations"
import { emailIconNames } from "../../email/manifest"
import { emailSurfaceRecipes } from "../../email/surfaces"
import { emailIconToken } from "../../email/system"

export type GeneratedHtmlIssue = { message: string }

type Element = DefaultTreeAdapterTypes.Element
type Node = DefaultTreeAdapterTypes.ChildNode

const allowedAttributes: Record<string, readonly string[]> = {
  table: ["role", "width", "cellpadding", "cellspacing", "border", "align", "class", "style"],
  tbody: [],
  tr: [],
  td: ["align", "valign", "width", "height", "class", "style"],
  p: ["class", "style", "data-slot"],
  a: ["href", "style", "data-slot"],
  img: ["src", "alt", "width", "height", "style", "data-slot"],
  div: ["style"],
}

const allowedClasses = new Set(["lame", "cols", "stack", "stack-gap", "hide-m", "px20", "px32", "px40", "px48", "px56", "py32", "py48", "py56", "py64", "fs28", "fs38", "fs48"])
const allowedProperties = new Set([
  "font-family", "font-size", "line-height", "font-weight", "text-transform", "letter-spacing", "color", "margin", "text-align", "background", "border", "border-radius",
  "padding", "width", "max-width", "height", "display", "border-collapse", "table-layout", "position", "box-sizing", "white-space", "text-decoration",
])
/** La palette fermée : toute couleur émise est un rôle d'une surface. */
const palette = new Set<string>(Object.values(emailSurfaceRecipes).flatMap((recipe) => Object.values(recipe)).concat(["#FFFFFF"]))
const imagePattern = new RegExp(`^https://${emailDemoAssetHost.replaceAll(".", "\\.")}/email-v2/[a-z0-9-]+--(?:medium|large|split|band|offer)\\.jpg$`)
const iconTokens = new Set(emailIconNames.map((name) => emailIconToken(name)))
const destinationUrls = new Set<string>((Object.keys(emailDestinations) as EmailDestinationId[]).map((id) => emailDestinationUrl(id)))
const residue = /undefined|NaN|\[object|\$\{|\{\{|__/

function* elements(node: { childNodes?: Node[] }): Generator<Element> {
  for (const child of node.childNodes ?? []) {
    if ("tagName" in child) {
      yield child
      yield* elements(child)
    }
  }
}

export function lintGeneratedHtml(html: string, options: { slotMarkers: boolean }): GeneratedHtmlIssue[] {
  const issues: GeneratedHtmlIssue[] = []
  const bad = (message: string) => issues.push({ message })
  const errors: string[] = []
  const fragment = parseFragment(html, { onParseError: (error) => errors.push(error.code) })
  if (errors.length > 0) bad(`HTML mal formé : ${[...new Set(errors)].join(", ")}.`)

  // parse5 referme silencieusement les balises omises : l'équilibre se compte sur la source (le contenu est échappé, un « < » n'y est jamais du texte).
  for (const tag of ["table", "tr", "td", "p", "a", "div"]) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length
    const closed = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length
    if (opened !== closed) bad(`Balises <${tag}> déséquilibrées (${opened} ouvertes, ${closed} fermées).`)
  }

  const top = fragment.childNodes.filter((child) => !("value" in child) || child.value.trim() !== "")
  if (top.length !== 1 || !("tagName" in top[0]!) || top[0].tagName !== "table") bad("La lame doit être une unique table racine.")

  const lames = [...elements(fragment)].filter((element) => element.attrs.some((attr) => attr.name === "class" && attr.value.split(" ").includes("lame")))
  if (lames.length !== 1 || lames[0]!.attrs.find((attr) => attr.name === "width")?.value !== "600") bad("Exactement une table « lame » de 600 px est attendue.")

  for (const element of elements(fragment)) {
    const tag = element.tagName
    const allowed = allowedAttributes[tag]
    if (!allowed) {
      bad(`Balise interdite : <${tag}>.`)
      continue
    }
    for (const { name, value } of element.attrs) {
      if (name === "data-slot") {
        if (!options.slotMarkers) bad("data-slot présent hors mode marqueurs.")
        else if (!/^[a-z][a-z0-9-]*$/.test(value)) bad("data-slot invalide.")
        if (!allowed.includes(name)) bad(`Attribut data-slot interdit sur <${tag}>.`)
        continue
      }
      if (/^on/i.test(name)) bad(`Gestionnaire d'événement interdit : ${name}.`)
      if (!allowed.includes(name)) {
        bad(`Attribut interdit : <${tag} ${name}>.`)
        continue
      }
      if (residue.test(value)) bad(`Résidu interne dans ${tag}.${name}.`)
      if (/javascript:|data:|vbscript:/i.test(value)) bad(`Schéma d'URL interdit dans ${tag}.${name}.`)
      if (name === "class") for (const cls of value.split(/\s+/)) if (!allowedClasses.has(cls)) bad(`Classe inconnue : ${cls}.`)
      if (name === "width" || name === "height") {
        if (!/^(?:100%|\d+)$/.test(value)) bad(`Dimension invalide : ${tag}.${name}.`)
        else if (/^\d+$/.test(value) && Number(value) > 600 && name === "width") bad("Largeur supérieure à 600 px.")
      }
      if (name === "style") lintStyle(value, bad)
      if (name === "href") {
        if (!destinationUrls.has(value)) bad("Lien hors des destinations contrôlées.")
      }
      if (name === "src" && !imagePattern.test(value) && !iconTokens.has(value)) bad("Source d'image hors de la banque ou du catalogue d'icônes.")
    }
    // Structure de table : table > tbody > tr > td, jamais de texte libre entre eux.
    const parentRule: Record<string, string[]> = { table: ["tbody"], tbody: ["tr"], tr: ["td"] }
    const expected = parentRule[tag]
    if (expected) {
      for (const child of element.childNodes) {
        if ("tagName" in child && !expected.includes(child.tagName)) bad(`<${child.tagName}> dans <${tag}> : structure de table incohérente.`)
        if ("value" in child && child.nodeName === "#text" && child.value.trim() !== "") bad(`Texte libre dans <${tag}>.`)
      }
    }
    if (tag === "img" && !element.attrs.some((attr) => attr.name === "alt")) bad("Image sans alt.")
  }
  return issues
}

function lintStyle(style: string, bad: (message: string) => void) {
  if (/url\(|expression|@import|javascript|[<>\\]/i.test(style)) bad("Style : construction interdite.")
  for (const declaration of style.split(";")) {
    if (declaration.trim() === "") continue
    const colon = declaration.indexOf(":")
    const property = declaration.slice(0, colon).trim().toLowerCase()
    if (colon === -1 || !allowedProperties.has(property)) bad(`Propriété CSS interdite : ${property || declaration.trim()}.`)
    for (const hex of declaration.matchAll(/#[0-9a-f]{3,8}\b/gi)) if (!palette.has(hex[0].toUpperCase())) bad(`Couleur hors palette : ${hex[0]}.`)
    if (/(?:rgb|hsl)a?\(/i.test(declaration)) bad("Couleur fonctionnelle interdite.")
  }
}
