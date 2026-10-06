/**
 * Export HTML d'un email : le document que l'on télécharge. Transformation
 * DÉTERMINISTE du HTML canonique de `renderEmail()` (jetons système, vrais
 * liens), jamais de l'aperçu (`toPreviewHtml`, réservé à l'interface) et jamais
 * d'un HTML fourni par le client : le serveur recompose l'email validé, le rend,
 * puis passe par ce module. Aucune EmailConfig n'est mutée.
 *
 * Ce que `renderEmail()` laisse et que l'export résout :
 * - les jetons d'assets : logo `[URL_CDN_LOGO_STUDI_SOMBRE]`, icônes
 *   `[URL_CDN_ICONE:<nom>]`, visuels `https://demo-assets.invalid/…` →
 *   URLs ABSOLUES sous une base publique contrôlée (`EMAIL_ASSETS_BASE_URL`),
 *   par les mêmes mappings fermés que l'aperçu (`image-bank`, `demo-assets`) ;
 * - les icônes de réseaux sociaux `[URL_CDN_SOCIAL_01…04]` : leur réseau n'est
 *   pas arbitré et aucun fichier n'existe : la rangée est RETIRÉE, pas laissée
 *   cassée ;
 * - le suffixe de suivi `?[UTM À DÉFINIR — CRM]` des liens : retiré (les
 *   destinations sont exportées propres ; le suivi est décidé par le CRM, il
 *   n'est pas inventé ici) ;
 * - les commentaires de gabarit (« coller ici les corps de lames ») : retirés ;
 *   les commentaires conditionnels Outlook sont conservés.
 *
 * Ce que l'export laisse VOLONTAIREMENT, visible et nommé : les deux liens de
 * gestion d'abonnement `[URL_DESABONNEMENT]` et `[URL_PREFERENCES]`, que la
 * plateforme d'envoi doit remplacer. Le fichier n'est donc pas prêt à l'envoi
 * en production ; il est prêt à être importé dans une plateforme d'envoi.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { parse, type DefaultTreeAdapterTypes } from "parse5"

import { emailDemoAssetPreviews } from "./demo-assets"
import { emailBankPreviews } from "./image-bank"
import { emailIconNames } from "./manifest"
import { emailHrefPlaceholders, emailSystemElements } from "./system"

/* -------------------------------------------------------------------------- */
/* Configuration des assets                                                   */
/* -------------------------------------------------------------------------- */

/** Variable d'environnement serveur : l'origine publique (et son éventuel préfixe) qui sert `/logos`, `/icones` et `/images`. */
export const exportAssetsEnvVar = "EMAIL_ASSETS_BASE_URL"

/** Logo de l'export : la version haute définition (1007 × 338), affichée à 80 × 28. L'aperçu utilise la version basse définition. */
export const exportLogoPath = "/logos/logo_studi_sombre_highres.png"

/** Hôtes autorisés pour un lien : studi.com et le service Meet (`destinations.ts`). Jamais une base fournie par le client. */
export const exportLinkHosts = ["www.studi.com", "meet.studi.fr"] as const

/** Jetons laissés à la plateforme d'envoi : explicites, jamais silencieux. */
export const exportDeferredPlaceholders = [emailSystemElements["lien-desabonnement"].token, emailSystemElements["lien-preferences"].token] as const

type Env = Readonly<Record<string, string | undefined>>

export type ExportAssetsBase =
  | { ok: true; base: string; /** Origine locale (développement) : les images ne sont pas servies hors de cette machine. */ local: boolean }
  | { ok: false; reason: "missing" | "invalid" | "insecure" | "local-in-production"; message: string }

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * Base publique des assets, lue dans l'environnement SERVEUR. Aucune valeur par
 * défaut : sans configuration, l'export refuse (un fichier dont les images
 * pointent nulle part n'est pas un export). HTTPS obligatoire ; `http` n'est admis
 * que pour une origine locale, hors production (mode POC documenté).
 */
export function resolveExportAssetsBase(env: Env): ExportAssetsBase {
  const raw = env[exportAssetsEnvVar]?.trim()
  if (!raw) return { ok: false, reason: "missing", message: `${exportAssetsEnvVar} n'est pas configurée : l'export a besoin de l'origine publique qui sert les images et le logo.` }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: "invalid", message: `${exportAssetsEnvVar} n'est pas une URL valide.` }
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.search || url.hash) {
    return { ok: false, reason: "invalid", message: `${exportAssetsEnvVar} : une origine HTTPS sans identifiants, requête ni fragment.` }
  }
  const local = localHosts.has(url.hostname)
  if (local && env.NODE_ENV === "production") {
    return { ok: false, reason: "local-in-production", message: `${exportAssetsEnvVar} ne peut pas être une origine locale en production.` }
  }
  if (url.protocol === "http:" && !local) {
    return { ok: false, reason: "insecure", message: `${exportAssetsEnvVar} doit être en HTTPS.` }
  }
  return { ok: true, base: `${url.origin}${url.pathname.replace(/\/+$/, "")}`, local }
}

/* -------------------------------------------------------------------------- */
/* Nom de fichier                                                             */
/* -------------------------------------------------------------------------- */

/** « Offre rentrée alternance » → `studi-offre-rentree-alternance.html`. Slug ASCII, 60 caractères au plus, jamais de séparateur de chemin. */
export function exportFilename(name: string | undefined): string {
  const slug = (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  if (!slug) return "studi-email.html"
  return `${slug.startsWith("studi") ? slug : `studi-${slug}`}.html`
}

/* -------------------------------------------------------------------------- */
/* Transformation                                                             */
/* -------------------------------------------------------------------------- */

export type ExportErrorCode = "unknown-asset" | "unknown-icon" | "url-to-confirm" | "social-row" | "invalid-link"

export class EmailExportError extends Error {
  override name = "EmailExportError"
  readonly code: ExportErrorCode

  constructor(code: ExportErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

type Node = DefaultTreeAdapterTypes.Node
type Element = DefaultTreeAdapterTypes.Element
type CommentNode = DefaultTreeAdapterTypes.CommentNode
type Edit = { start: number; end: number; text: string }

function* nodes(node: { childNodes?: DefaultTreeAdapterTypes.ChildNode[] }): Generator<DefaultTreeAdapterTypes.ChildNode> {
  for (const child of node.childNodes ?? []) {
    yield child
    yield* nodes(child as { childNodes?: DefaultTreeAdapterTypes.ChildNode[] })
  }
}

const isElement = (node: Node): node is Element => "tagName" in node
const isComment = (node: Node): node is CommentNode => node.nodeName === "#comment"
const attribute = (element: Element, name: string) => element.attrs.find((attr) => attr.name === name)?.value

const socialTokens: ReadonlySet<string> = new Set([
  emailSystemElements["social-1"].token,
  emailSystemElements["social-2"].token,
  emailSystemElements["social-3"].token,
  emailSystemElements["social-4"].token,
])
const iconToken = /^\[URL_CDN_ICONE:([^\]]+)\]$/
const iconNames: ReadonlySet<string> = new Set(emailIconNames)
const deferred: ReadonlySet<string> = new Set(exportDeferredPlaceholders)

/** Chemin public d'un asset connu (jamais d'une URL libre), ou erreur. */
function assetPath(src: string): string {
  if (src === emailSystemElements.logo.token) return exportLogoPath
  const known = emailDemoAssetPreviews.get(src) ?? emailBankPreviews.get(src)
  if (known !== undefined) return known
  const icon = iconToken.exec(src)?.[1]
  if (icon !== undefined) {
    if (!iconNames.has(icon)) throw new EmailExportError("unknown-icon", `Icône inconnue du catalogue : « ${icon} ».`)
    return `/icones/${icon}.png`
  }
  throw new EmailExportError("unknown-asset", `Image hors des assets contrôlés : « ${src.slice(0, 80)} ».`)
}

const attrEscape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")

/** Ancêtres `tr` d'un élément, du plus proche au plus éloigné. */
function ancestorRows(element: Element): Element[] {
  const rows: Element[] = []
  let current = element.parentNode as Node | null
  while (current) {
    if (isElement(current) && current.tagName === "tr") rows.push(current)
    current = (current as { parentNode?: Node | null }).parentNode ?? null
  }
  return rows
}

/** Rangée à retirer pour une icône sociale : la rangée du pied de page qui les contient toutes, et l'espaceur qui la suit. */
function socialRowEdit(images: Element[]): Edit | undefined {
  const outer = new Set(images.map((image) => ancestorRows(image)[1]))
  if (outer.size === 0) return undefined
  if (outer.size !== 1 || [...outer].some((row) => !row?.sourceCodeLocation)) throw new EmailExportError("social-row", "La rangée des réseaux sociaux n'a pas la structure attendue.")
  const row = [...outer][0]!
  const siblings = (row.parentNode as { childNodes: Node[] }).childNodes.filter(isElement)
  const spacer = siblings[siblings.indexOf(row) + 1]
  const isSpacer = !!spacer && spacer.tagName === "tr" && spacer.childNodes.filter(isElement).length === 1 && attribute(spacer.childNodes.filter(isElement)[0]!, "height") !== undefined
  const end = isSpacer ? spacer!.sourceCodeLocation!.endOffset : row.sourceCodeLocation!.endOffset
  return { start: row.sourceCodeLocation!.startOffset, end, text: "" }
}

export type ExportResult = {
  html: string
  /** Jetons laissés à la plateforme d'envoi, présents dans le fichier. */
  placeholders: string[]
}

/**
 * HTML canonique → HTML d'export. `assetsBase` : une base validée par
 * `resolveExportAssetsBase` (sans barre finale). Lève `EmailExportError` pour un
 * asset ou un lien hors des catalogues contrôlés.
 */
export function buildExportableEmailHtml(canonicalHtml: string, assetsBase: string): ExportResult {
  const edits: Edit[] = []
  const socials: Element[] = []
  const document = parse(canonicalHtml, { sourceCodeLocationInfo: true })

  for (const node of nodes(document)) {
    if (isComment(node)) {
      // Commentaires de gabarit retirés ; commentaires conditionnels Outlook conservés.
      if (!/^\[if\b|^<!\[endif\]/.test(node.data.trim()) && node.sourceCodeLocation) edits.push({ start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset, text: "" })
      continue
    }
    if (!isElement(node)) continue
    const attrs = node.sourceCodeLocation?.attrs
    if (!attrs) continue

    if (node.tagName === "img") {
      const src = attribute(node, "src")
      if (src === undefined || !attrs.src) continue
      if (socialTokens.has(src)) {
        socials.push(node)
        continue
      }
      edits.push({ start: attrs.src.startOffset, end: attrs.src.endOffset, text: `src="${attrEscape(`${assetsBase}${assetPath(src)}`)}"` })
    }

    if (node.tagName === "a") {
      const href = attribute(node, "href")
      if (href === undefined || !attrs.href) continue
      if (deferred.has(href)) continue
      if (href.includes(emailHrefPlaceholders.urlToConfirm)) throw new EmailExportError("url-to-confirm", "Un lien est encore à confirmer : l'export est refusé.")
      const clean = href.endsWith(`?${emailHrefPlaceholders.utm}`) ? href.slice(0, -(emailHrefPlaceholders.utm.length + 1)) : href
      if (clean !== href) edits.push({ start: attrs.href.startOffset, end: attrs.href.endOffset, text: `href="${attrEscape(clean)}"` })
    }
  }

  const row = socialRowEdit(socials)
  if (row) edits.push(row)

  let html = canonicalHtml
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.text + html.slice(edit.end)
  html = html.replace(/\n{3,}/g, "\n\n")
  return { html, placeholders: exportDeferredPlaceholders.filter((token) => html.includes(token)) }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type ExportIssue = { code: string; message: string }

/** Marques du builder, d'un Draft ou d'un fournisseur de modèle : aucune ne doit figurer dans le fichier. */
const forbiddenMarks = /anthropic|claude|visualintent|promocode|data-preview|data-slot|data-system|__next|draft|studi generator|email generator|api\/(?:generate|edit|export)/i

/**
 * Contrôles déterministes du document exporté. Une liste vide : le fichier est
 * un document HTML complet, sans script, dont chaque image est absolue sous la
 * base des assets et dont chaque lien est une destination contrôlée ou un jeton
 * explicite de la plateforme d'envoi.
 */
export function validateExportHtml(html: string, options: { assetsBase: string; local: boolean }): ExportIssue[] {
  const issues: ExportIssue[] = []
  const issue = (code: string, message: string) => issues.push({ code, message })

  if (!/^<!doctype html>/i.test(html.trimStart())) issue("doctype", "Le document ne commence pas par <!DOCTYPE html>.")
  for (const tag of ["html", "head", "body", "title"]) if (!new RegExp(`<${tag}[\\s>]`, "i").test(html)) issue("structure", `Balise <${tag}> absente.`)
  if (!/<title>\s*[^<\s][^<]*<\/title>/i.test(html)) issue("title", "Le titre du document est vide.")
  if (!/<meta[^>]+name="viewport"/i.test(html)) issue("responsive", "Balise meta viewport absente.")
  if (!/@media only screen and \(max-width:599px\)/.test(html)) issue("responsive", "La media query mobile est absente.")
  if (/<script/i.test(html)) issue("script", "Une balise script figure dans le document.")
  if (/<iframe|<object|<embed|<form/i.test(html)) issue("embed", "Une balise iframe, object, embed ou form figure dans le document.")
  if (/javascript:/i.test(html)) issue("javascript", "Une URL javascript: figure dans le document.")
  if (/\bon[a-z]+\s*=\s*["']/i.test(html.replace(/<style[\s\S]*?<\/style>/gi, ""))) issue("handler", "Un gestionnaire d'événement figure dans le document.")
  if (/demo-assets\.invalid/.test(html)) issue("asset", "Une URL de démonstration (demo-assets.invalid) figure dans le document.")
  if (/\[URL_CDN|\[URL À CONFIRMER\]|\[UTM|\[OBJET DE L'EMAIL\]|\[PREHEADER\]/.test(html)) issue("token", "Un jeton non résolu figure dans le document.")
  if (!options.local && /localhost|127\.0\.0\.1|\[::1\]/i.test(html)) issue("localhost", "Une référence locale figure dans le document.")
  if (forbiddenMarks.test(html)) issue("builder", "Une marque du builder, d'un Draft ou d'un fournisseur de modèle figure dans le document.")

  const document = parse(html, { sourceCodeLocationInfo: false })
  let images = 0
  for (const node of nodes(document)) {
    if (!isElement(node)) continue
    if (node.tagName === "img") {
      images += 1
      const src = attribute(node, "src") ?? ""
      if (!src.startsWith(`${options.assetsBase}/`)) issue("asset", `Image hors de la base des assets : « ${src.slice(0, 80)} ».`)
      if (attribute(node, "alt") === undefined) issue("alt", "Une image n'a pas d'attribut alt.")
      if (attribute(node, "width") === undefined) issue("dimensions", "Une image n'a pas d'attribut width.")
    }
    if (node.tagName === "a") {
      const href = attribute(node, "href") ?? ""
      if (deferred.has(href)) continue
      let url: URL | undefined
      try {
        url = new URL(href)
      } catch {
        url = undefined
      }
      if (!url || url.protocol !== "https:" || !(exportLinkHosts as readonly string[]).includes(url.hostname) || url.username || url.password) issue("link", `Lien hors des destinations contrôlées : « ${href.slice(0, 80)} ».`)
    }
    if (node.tagName === "link" || node.tagName === "base") issue("external", `Balise <${node.tagName}> interdite.`)
  }
  if (images === 0) issue("asset", "Aucune image : un email Studi porte au moins son logo.")
  return issues
}
