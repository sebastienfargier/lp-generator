import { parse, type DefaultTreeAdapterTypes } from "parse5"

import { emailDemoAssetPreviews } from "./demo-assets"
import { emailIconNames } from "./manifest"
import { emailSystemElements } from "./system"

/**
 * Adaptation du HTML canonique pour l'aperçu de l'interface, jamais pour
 * l'envoi. `renderEmail()` reste la seule sortie exportable : ses jetons
 * système et ses vrais `href` n'y sont jamais modifiés.
 *
 * - `[URL_CDN_LOGO_STUDI_SOMBRE]` → `/logos/logo_studi_sombre_lowres.png`
 * - `[URL_CDN_ICONE:<nom>]` → `/icones/<nom>.png`, pour les 40 noms du
 *   catalogue uniquement (un autre nom est une erreur)
 * - `[URL_CDN_SOCIAL_01…04]` → pixel transparent : aucun réseau n'est
 *   attribué à ces positions, l'emplacement reste vide sans image cassée
 * - les quatre visuels du mode démo (`https://demo-assets.invalid/…`) →
 *   `/images/email-demo-….jpg`, par un mapping fermé (`demo-assets.ts`) :
 *   une autre URL, même sur ce domaine, reste telle quelle
 * - `<a href="…">` → `<a data-preview-href="…">` : lien inerte, destination
 *   inspectable, sans script
 *
 * Les chemins `/logos/…`, `/icones/…` et `/images/…` sont des ressources locales de
 * l'application : ils n'appartiennent jamais au contrat EmailConfig ni au
 * HTML envoyable. Comme le renderer, la fonction ne re-sérialise rien :
 * parse5 localise les attributs, qui sont remplacés dans le texte d'origine.
 */

export class EmailPreviewError extends Error {
  override name = "EmailPreviewError"
}

const logoToken = emailSystemElements.logo.token
const previewLogo = "/logos/logo_studi_sombre_lowres.png"

const iconToken = /^\[URL_CDN_ICONE:([^\]]+)\]$/
const iconNames: ReadonlySet<string> = new Set(emailIconNames)

const socialTokens: ReadonlySet<string> = new Set([
  emailSystemElements["social-1"].token,
  emailSystemElements["social-2"].token,
  emailSystemElements["social-3"].token,
  emailSystemElements["social-4"].token,
])
/** GIF transparent 1×1 : l'image garde sa place, rien n'est affiché. */
const transparentPixel =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

type Element = DefaultTreeAdapterTypes.Element
type Edit = { start: number; end: number; text: string }

function* elements(node: { childNodes?: DefaultTreeAdapterTypes.ChildNode[] }): Generator<Element> {
  for (const child of node.childNodes ?? []) {
    if ("tagName" in child) {
      yield child
      yield* elements(child)
    }
  }
}

function previewSource(src: string) {
  if (src === logoToken) return previewLogo
  if (socialTokens.has(src)) return transparentPixel
  const demoAsset = emailDemoAssetPreviews.get(src)
  if (demoAsset !== undefined) return demoAsset
  const icon = iconToken.exec(src)?.[1]
  if (icon !== undefined) {
    if (!iconNames.has(icon)) throw new EmailPreviewError(`Icône inconnue du catalogue : "${icon}".`)
    return `/icones/${icon}.png`
  }
  return undefined
}

export function toPreviewHtml(html: string): string {
  const edits: Edit[] = []

  for (const element of elements(parse(html, { sourceCodeLocationInfo: true }))) {
    const attrs = element.sourceCodeLocation?.attrs
    if (!attrs) continue

    if (element.tagName === "img") {
      const src = element.attrs.find((attr) => attr.name === "src")?.value
      const next = src === undefined ? undefined : previewSource(src)
      if (next !== undefined && attrs.src) {
        edits.push({ start: attrs.src.startOffset, end: attrs.src.endOffset, text: `src="${next}"` })
      }
    }

    if (element.tagName === "a" && attrs.href) {
      // Le nom de l'attribut change, sa valeur reste celle du HTML canonique.
      const { startOffset } = attrs.href
      edits.push({ start: startOffset, end: startOffset, text: "data-preview-" })
    }
  }

  let result = html
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }
  return result
}
