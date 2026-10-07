/**
 * Compilateur déterministe des lames générées (V2.9.2) : `GeneratedBlockSpec`
 * validée → gabarit HTML email → injection contrôlée du contenu.
 *
 * Règle non négociable : TOUT le HTML, les attributs, les classes et les styles
 * viennent de CE fichier. La spec ne fournit que des noms d'un vocabulaire fermé
 * (chaque valeur passe par un mapping constant ou une liste fermée, même si
 * TypeScript la type déjà : l'entrée runtime n'est pas de confiance) ; le contenu
 * ne fournit que du texte échappé, une destination Studi, une image de la banque
 * et une icône du catalogue.
 *
 * Résultat intermédiaire : un gabarit `parts` = chaînes constantes + trous typés
 * (texte, libellé, href, src, alt, icône). Il se compile une fois par
 * (spec, surface, marqueurs) et se remplit par contenu. Les couleurs sont les rôles
 * de la surface (`emailSurfaceRecipes`), jamais une valeur de la spec.
 *
 * Pas de flexbox ni de grid : tables, comme les 36 lames officielles. Les colonnes
 * reprennent `cols` / `stack` / `stack-gap` / `hide-m` du socle (empilement mobile).
 *
 * Pas encore branché au document, à `EmailBlockSchema` ni au renderer principal.
 * Un futur bloc `{ id, type: "generated", spec, slots, surface }` appellera
 * `renderGeneratedBlock` pour sa lame, sans réécriture.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailDestinations, emailDestinationUrl, type EmailDestinationId } from "../../email/destinations"
import { emailBank, emailBankDerivative, emailImageFormats, EmailImageBankError, isEmailBankImageId, type EmailBankImageId } from "../../email/image-bank"
import { emailIconNames, type EmailIconName } from "../../email/manifest"
import { escapeAttribute, escapeText } from "../../email/renderer"
import { emailSurfaceRecipes, emailSurfaces, resolveColorRole, type EmailColorRole, type EmailSurface } from "../../email/surfaces"
import { emailIconToken } from "../../email/system"
import type { GeneratedNode } from "../generated/schema"
import { deriveGeneratedSlots, type GeneratedSlot } from "../generated/slots"
import { buttonVariants, cardPaddings, columnGaps, overlaps, radii, sectionPaddingX, sectionPaddingY, spacerSizes, stackGaps } from "../generated/tokens"
import { deriveGeneratedCapabilities, validateGeneratedBlockSpec } from "../generated/validate"
import { lintGeneratedHtml } from "./hygiene"

/* Contenu ------------------------------------------------------------------ */

/** Le contenu d'un slot, typé par son genre : aucune URL libre, aucun HTML. */
export type GeneratedSlotContent =
  | { text: string }
  | { label: string; destination: EmailDestinationId }
  | { imageId: EmailBankImageId }
  | { icon: EmailIconName }

export type GeneratedBlockContent = Record<string, GeneratedSlotContent>

export type GeneratedCompatibility = "robust" | "degraded"

export type GeneratedRenderIssue = { code: "spec" | "surface" | "content" | "slot-missing" | "slot-extra" | "kind" | "text" | "image-unknown" | "image-incompatible" | "destination" | "icon" | "hygiene"; path: string; message: string }

export type GeneratedRenderResult =
  | { ok: true; html: string; compatibility: GeneratedCompatibility; compatibilityReasons: "overlap"[]; slots: GeneratedSlot[] }
  | { ok: false; issues: GeneratedRenderIssue[] }

/* Gabarit ------------------------------------------------------------------ */

type Hole =
  | { hole: "text"; slot: string }
  | { hole: "label"; slot: string; arrow: boolean }
  | { hole: "href"; slot: string }
  | { hole: "src"; slot: string; format: string }
  | { hole: "alt"; slot: string }
  | { hole: "icon"; slot: string }
type Part = string | Hole

export type CompiledGeneratedBlock = {
  parts: readonly Part[]
  slots: GeneratedSlot[]
  compatibility: GeneratedCompatibility
  compatibilityReasons: "overlap"[]
}

/** Erreur de développement : un mapping ne couvre pas une valeur. Jamais une valeur de contenu. */
export class GeneratedCompileError extends Error {
  override name = "GeneratedCompileError"
}

/* Mappings constants ------------------------------------------------------- */

const font = "font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;"

/** Styles typographiques : valeurs observées dans les templates officiels ; classe `fsN` quand le socle la réduit sur mobile. */
const textStyles = {
  eyebrow: { css: "font-size:12px;line-height:normal;font-weight:700;text-transform:uppercase;letter-spacing:0.88px;", cls: "" },
  "title-xl": { css: "font-size:38px;line-height:1.06;font-weight:700;", cls: "fs38" },
  title: { css: "font-size:28px;line-height:1.1;font-weight:700;", cls: "fs28" },
  subtitle: { css: "font-size:17px;line-height:normal;font-weight:600;", cls: "" },
  body: { css: "font-size:15px;line-height:1.55;font-weight:400;", cls: "" },
  caption: { css: "font-size:13px;line-height:1.5;font-weight:400;", cls: "" },
  stat: { css: "font-size:48px;line-height:normal;font-weight:800;", cls: "fs48" },
  pill: { css: "font-size:12px;line-height:normal;font-weight:700;", cls: "" },
} as const

/** Ton → rôle de couleur de la surface. « muted » et « text » partagent le rôle `texte` : le système n'a pas de rôle plus discret. */
const toneRoles = { title: "titre", text: "texte", muted: "texte" } as const satisfies Record<string, EmailColorRole>

const sectionPadX = { 0: "", 20: "px20", 32: "px32", 40: "px40", 48: "px48", 56: "px56" } as const
const sectionPadY = { 0: "", 32: "py32", 40: "", 48: "py48", 56: "py56", 64: "py64" } as const
const alignAttr = { start: "left", center: "center" } as const
const textAlign = alignAttr
const columnValign = { top: "top", middle: "middle" } as const

/** Écart implicite entre les enfants d'une section / d'une carte (la spec ne le porte pas). */
const sectionGap = 24
const cardGap = 12
/** Retrait horizontal d'une carte qui chevauche. */
const overlapInset = 24
const iconSize = { none: 22, circle: 44 } as const
const iconGlyph = 22
const pillRadius = 4

/** Une valeur numérique de la spec n'entre dans le CSS que si elle est dans sa liste fermée. */
function closed(values: readonly number[], value: unknown, what: string): number {
  if (typeof value !== "number" || !values.includes(value)) throw new GeneratedCompileError(`${what} hors vocabulaire.`)
  return value
}
function pick<T>(map: Readonly<Record<string, T>>, key: unknown, what: string): T {
  if (typeof key !== "string" && typeof key !== "number") throw new GeneratedCompileError(`${what} hors vocabulaire.`)
  if (!Object.hasOwn(map, key)) throw new GeneratedCompileError(`${what} hors vocabulaire.`)
  return map[key]!
}


/* Compilation -------------------------------------------------------------- */

type Ctx = { surface: EmailSurface; avail: number; markers: boolean }
const roles = (surface: EmailSurface) => emailSurfaceRecipes[surface]
const marker = (ctx: Ctx, slot: string) => (ctx.markers ? ` data-slot="${escapeAttribute(slot)}"` : "")
const table = (extra = "") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${extra}">`
const gapRow = (gap: number) => `<tr><td height="${gap}" style="height:${gap}px;line-height:${gap}px;font-size:0;">&nbsp;</td></tr>`

function rows(children: readonly GeneratedNode[], gap: number, ctx: Ctx, align: "start" | "center"): Part[] {
  const out: Part[] = [table()]
  children.forEach((child, index) => {
    const overlapping = child.t === "card" && child.overlap > 0
    if (index > 0 && !overlapping) out.push(gapRow(gap))
    out.push(`<tr><td align="${pick(alignAttr, align, "Alignement")}" style="padding:0;text-align:${pick(textAlign, align, "Alignement")};">`, ...node(child, ctx, align), "</td></tr>")
  })
  out.push("</table>")
  return out
}

function node(n: GeneratedNode, ctx: Ctx, align: "start" | "center"): Part[] {
  const palette = roles(ctx.surface)
  switch (n.t) {
    case "stack":
      closed(stackGaps, n.gap, "Écart")
      return rows(n.children, n.gap, ctx, n.align)
    case "columns":
      return columns(n, ctx)
    case "inset": {
      // Même mécanisme que la section : classes `pxN` / `pyN` du socle (réduites sur mobile), valeurs lues dans des listes fermées.
      const x = closed(sectionPaddingX, n.padX, "Padding horizontal")
      const y = closed(sectionPaddingY, n.padY, "Padding vertical")
      const cls = [pick(sectionPadX, x, "Padding horizontal"), pick(sectionPadY, y, "Padding vertical")].filter(Boolean).join(" ")
      return [`${table()}<tr><td${cls ? ` class="${cls}"` : ""} style="padding:${y}px ${x}px;">`, ...rows(n.children, sectionGap, { ...ctx, avail: ctx.avail - 2 * x }, "start"), "</td></tr></table>"]
    }
    case "card":
      return card(n, ctx)
    case "text": {
      const style = pick(textStyles, n.style, "Style de texte")
      const color = palette[pick(toneRoles, n.tone, "Ton")]
      const cls = style.cls ? ` class="${style.cls}"` : ""
      const paragraph: Part[] = [`<p${cls} style="${font}${style.css}color:${color};margin:0;text-align:${pick(textAlign, n.align, "Alignement")};"${marker(ctx, n.slot)}>`, { hole: "text", slot: n.slot }, "</p>"]
      if (n.style !== "pill") return paragraph
      return [`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${pick(alignAttr, n.align, "Alignement")}" style="border-collapse:separate;"><tr><td style="background:${palette.fond};border:1px solid ${palette.filet};border-radius:${pillRadius}px;padding:6px 12px;">`, ...paragraph, "</td></tr></table>"]
    }
    case "button":
      return button(n, ctx)
    case "image": {
      const frame = emailImageFormats[n.format as keyof typeof emailImageFormats]?.frame
      if (!frame) throw new GeneratedCompileError("Format d'image hors vocabulaire.")
      const width = Math.min(frame.width, ctx.avail)
      const height = Math.round((width * frame.height) / frame.width)
      const radius = closed(radii, n.radius, "Rayon")
      const margin = n.align === "center" ? "margin:0 auto;" : ""
      return [`<img src="`, { hole: "src", slot: n.slot, format: n.format }, `" alt="`, { hole: "alt", slot: n.slot }, `" width="${width}" height="${height}"${marker(ctx, n.slot)} style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${radius}px;${margin}">`]
    }
    case "icon": {
      const glyph = `<img src="`
      const img: Part[] = [glyph, { hole: "icon", slot: n.slot }, `" width="${iconGlyph}" height="${iconGlyph}" alt=""${marker(ctx, n.slot)} style="display:block;width:${iconGlyph}px;height:${iconGlyph}px;border:0;">`]
      if (n.frame === "none") return [`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${pick(alignAttr, align, "Alignement")}"><tr><td style="padding:0;">`, ...img, "</td></tr></table>"]
      const size = iconSize.circle
      const bg = resolveColorRole("icon-background", ctx.surface, "background", "#FFFFFF")
      if (!bg) throw new GeneratedCompileError("Fond d'icône non établi pour cette surface.")
      return [`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${pick(alignAttr, align, "Alignement")}" style="width:${size}px;background:${bg};border-radius:50%;"><tr><td align="center" valign="middle" height="${size}" style="height:${size}px;"><div style="display:inline-block;">`, ...img, "</div></td></tr></table>"]
    }
    case "divider":
      return [`${table()}<tr><td height="1" style="height:1px;line-height:1px;font-size:0;background:${palette.filet};">&nbsp;</td></tr></table>`]
    case "spacer": {
      const size = closed(spacerSizes, n.size, "Espace")
      return [`<div style="height:${size}px;line-height:${size}px;font-size:0;">&nbsp;</div>`]
    }
  }
}

/** Boutons : même construction que les lames officielles (cellule colorée + lien), couleurs tirées des rôles. */
function button(n: Extract<GeneratedNode, { t: "button" }>, ctx: Ctx): Part[] {
  const variant = pick(Object.fromEntries(buttonVariants.map((v) => [v, v])) as Record<string, string>, n.variant, "Variante de bouton")
  const palette = roles(ctx.surface)
  const accent = ctx.surface === "accent-1" ? palette : emailSurfaceRecipes["accent-1"]
  const colors =
    variant === "primary" ? { bg: palette.fondCta, fg: palette.libelleCta } :
    variant === "inverse" ? { bg: palette.libelleCta, fg: palette.fondCta } :
    variant === "accent" ? (ctx.surface === "accent-1" ? { bg: palette.fondCta, fg: palette.libelleCta } : { bg: accent.fond, fg: accent.titre }) :
    undefined
  const label: Part = { hole: "label", slot: n.slot, arrow: n.arrow }
  const href: Part = { hole: "href", slot: n.slot }
  const align = pick(alignAttr, n.align, "Alignement")
  if (!colors) {
    return [`<a href="`, href, `"${marker(ctx, n.slot)} style="${font}font-size:13px;font-weight:600;color:${palette.titre};text-decoration:none;display:block;text-align:${align};">`, label, "</a>"]
  }
  return [`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="border-collapse:separate;"><tr><td style="background:${colors.bg};border:none;border-radius:9999px;padding:12px 24px;${font}font-size:14px;line-height:20px;font-weight:600;color:${colors.fg};white-space:nowrap;"><a href="`, href, `"${marker(ctx, n.slot)} style="color:${colors.fg};text-decoration:none;">`, label, "</a></td></tr></table>"]
}

function columns(n: Extract<GeneratedNode, { t: "columns" }>, ctx: Ctx): Part[] {
  const gap = closed(columnGaps, n.gap, "Écart de colonnes")
  const units = pick({ "1:1": [1, 1], "1:2": [1, 2], "2:1": [2, 1], "1:1:1": [1, 1, 1], "1:1:1:1": [1, 1, 1, 1] } as Record<string, number[]>, n.ratio, "Ratio de colonnes")
  if (units.length !== n.children.length) throw new GeneratedCompileError("Colonnes : nombre d'enfants incohérent.")
  const sum = units.reduce((a, b) => a + b, 0)
  const free = ctx.avail - gap * (units.length - 1)
  const widths = units.map((unit) => Math.floor((free * unit) / sum))
  widths[widths.length - 1]! += free - widths.reduce((a, b) => a + b, 0)
  const valign = pick(columnValign, n.align, "Alignement")
  const out: Part[] = [`<table role="presentation" class="cols" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;width:100%;"><tr>`]
  n.children.forEach((child, index) => {
    if (index > 0) out.push(`<td class="hide-m" width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td>`)
    out.push(`<td class="stack stack-gap" width="${widths[index]}" valign="${valign}" style="width:${widths[index]}px;padding:0;">`, ...node(child, { ...ctx, avail: widths[index]! }, "start"), "</td>")
  })
  out.push("</tr></table>")
  return out
}

function card(n: Extract<GeneratedNode, { t: "card" }>, ctx: Ctx): Part[] {
  const radius = closed(radii, n.radius, "Rayon")
  const pad = closed(cardPaddings, n.pad, "Padding")
  const overlap = closed(overlaps, n.overlap, "Chevauchement")
  // Une carte est une surface imbriquée : « plain » se lit comme Page, « soft » comme Bloc.
  const inner: EmailSurface = pick({ plain: "page", soft: "bloc" } as Record<string, EmailSurface>, n.fill, "Fond de carte")
  const palette = roles(inner)
  const base = `box-sizing:border-box;background:${palette.fond};border:1px solid ${palette.filet};border-radius:${radius}px;padding:${pad}px;`
  // Chevauchement : marge négative sur un bloc positionné. Là où le client l'ignore, la carte reste sous le visuel (lisible, sans recouvrement).
  const outer = overlap > 0 ? `position:relative;margin:-${overlap}px ${overlapInset}px 0 ${overlapInset}px;` : "width:100%;"
  const avail = ctx.avail - 2 * pad - 2 - (overlap > 0 ? 2 * overlapInset : 0)
  return [`<div style="${outer}${base}">`, ...rows(n.children, cardGap, { ...ctx, surface: inner, avail }, "start"), "</div>"]
}

/** Valide la spec puis la compile en gabarit. Refuse une spec invalide ou une surface inconnue. */
export function compileGeneratedBlock(input: unknown, options: { surface?: unknown; slotMarkers?: boolean } = {}): { ok: true; compiled: CompiledGeneratedBlock } | { ok: false; issues: GeneratedRenderIssue[] } {
  const validated = validateGeneratedBlockSpec(input)
  if (!validated.ok) return { ok: false, issues: validated.issues.map((issue) => ({ code: "spec" as const, path: issue.path, message: `${issue.code} : ${issue.message}` })) }
  const surface = options.surface === undefined ? "page" : options.surface
  if (typeof surface !== "string" || !(emailSurfaces as readonly string[]).includes(surface)) return { ok: false, issues: [{ code: "surface", path: "surface", message: "Surface inconnue." }] }
  const spec = validated.spec
  const ctx: Ctx = { surface: surface as EmailSurface, avail: 600, markers: options.slotMarkers === true }
  const root = spec.root
  const x = closed(sectionPaddingX, root.padX, "Padding horizontal")
  const y = closed(sectionPaddingY, root.padY, "Padding vertical")
  const cls = [pick(sectionPadX, x, "Padding horizontal"), pick(sectionPadY, y, "Padding vertical")].filter(Boolean).join(" ")
  const inner = { ...ctx, avail: 600 - 2 * x }
  const parts: Part[] = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;">\n<tr><td align="center" style="padding:0;">\n<table role="presentation" class="lame" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">\n<tr><td${cls ? ` class="${cls}"` : ""} style="background:${roles(ctx.surface).fond};padding:${y}px ${x}px;">`,
    ...rows(root.children, sectionGap, inner, "start"),
    "</td></tr>\n</table>\n</td></tr>\n</table>",
  ]
  const { usesOverlap } = deriveGeneratedCapabilities(spec)
  return { ok: true, compiled: { parts, slots: deriveGeneratedSlots(spec), compatibility: usesOverlap ? "degraded" : "robust", compatibilityReasons: usesOverlap ? ["overlap"] : [] } }
}

/* Contenu : validation puis injection --------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))

/** Vérifie le contenu contre les slots dérivés : exactement les mêmes noms, le bon genre, des valeurs du système. */
export function validateGeneratedContent(slots: readonly GeneratedSlot[], content: unknown): GeneratedRenderIssue[] {
  if (!isRecord(content)) return [{ code: "content", path: "content", message: "Le contenu est un objet { slot: valeur }." }]
  const issues: GeneratedRenderIssue[] = []
  const names = new Set(slots.map((slot) => slot.name))
  for (const name of Object.keys(content)) if (!names.has(name)) issues.push({ code: "slot-extra", path: name, message: `Slot « ${name.slice(0, 40)} » : absent de la spec.` })
  for (const slot of slots) {
    const path = slot.name
    if (!Object.hasOwn(content, slot.name)) {
      issues.push({ code: "slot-missing", path, message: `Slot « ${slot.name} » : contenu manquant.` })
      continue
    }
    const value = content[slot.name]
    const bad = (code: GeneratedRenderIssue["code"], message: string) => issues.push({ code, path, message })
    const text = (candidate: unknown, max: number, label: string) => {
      if (typeof candidate !== "string" || candidate.trim() === "") return bad("text", `Slot « ${slot.name} » : ${label} requis.`)
      if (candidate.length > max) return bad("text", `Slot « ${slot.name} » : ${max} caractères au plus.`)
      if (controlCharacters.test(candidate)) return bad("text", `Slot « ${slot.name} » : caractères de contrôle interdits.`)
    }
    switch (slot.kind) {
      case "texte":
        if (!isRecord(value) || !exactKeys(value, ["text"])) bad("kind", `Slot « ${slot.name} » : { text } attendu.`)
        else text(value.text, slot.maxLength ?? 0, "texte")
        break
      case "cta":
      case "cta:fleche":
        if (!isRecord(value) || !exactKeys(value, ["label", "destination"])) bad("kind", `Slot « ${slot.name} » : { label, destination } attendu.`)
        else {
          text(value.label, slot.maxLength ?? 0, "libellé")
          if (typeof value.destination !== "string" || !Object.hasOwn(emailDestinations, value.destination)) bad("destination", `Slot « ${slot.name} » : destination inconnue du système.`)
        }
        break
      case "asset:visuel":
        if (!isRecord(value) || !exactKeys(value, ["imageId"])) bad("kind", `Slot « ${slot.name} » : { imageId } attendu.`)
        else if (typeof value.imageId !== "string" || !isEmailBankImageId(value.imageId)) bad("image-unknown", `Slot « ${slot.name} » : image inconnue de la banque.`)
        else {
          try {
            emailBankDerivative(value.imageId, slot.format ?? "")
          } catch (error) {
            if (!(error instanceof EmailImageBankError)) throw error
            bad("image-incompatible", `Slot « ${slot.name} » : l'image « ${value.imageId} » n'a pas de dérivé « ${slot.format} ».`)
          }
        }
        break
      case "asset:icone":
        if (!isRecord(value) || !exactKeys(value, ["icon"])) bad("kind", `Slot « ${slot.name} » : { icon } attendu.`)
        else if (typeof value.icon !== "string" || !(emailIconNames as readonly string[]).includes(value.icon)) bad("icon", `Slot « ${slot.name} » : icône hors catalogue.`)
        break
    }
  }
  return issues
}

/** Remplit un gabarit avec un contenu DÉJÀ validé. */
export function fillGeneratedBlock(compiled: CompiledGeneratedBlock, content: GeneratedBlockContent): string {
  return compiled.parts
    .map((part) => {
      if (typeof part === "string") return part
      const value = content[part.slot] as unknown as Record<string, string>
      switch (part.hole) {
        case "text":
          return escapeText(value.text!)
        case "label":
          return escapeText(value.label!) + (part.arrow ? " &nbsp;&#8594;" : "")
        case "href":
          return escapeAttribute(emailDestinationUrl(value.destination as EmailDestinationId))
        case "src":
          return escapeAttribute(emailBankDerivative(value.imageId!, part.format).src)
        case "alt":
          return escapeAttribute(emailBank[value.imageId as EmailBankImageId].alt)
        case "icon":
          return escapeAttribute(emailIconToken(value.icon as EmailIconName))
      }
    })
    .join("")
}

/**
 * Le point d'entrée : spec + contenu + surface → HTML de la lame. Refuse tout ce qui
 * est incohérent (aucun repli qui invente du contenu). Le même appel sert l'aperçu
 * (`slotMarkers: true`) et l'export (`false`, par défaut).
 */
export function renderGeneratedBlock(input: { spec: unknown; content: unknown; surface?: unknown; slotMarkers?: boolean }): GeneratedRenderResult {
  const compiled = compileGeneratedBlock(input.spec, { surface: input.surface, slotMarkers: input.slotMarkers })
  if (!compiled.ok) return compiled
  const issues = validateGeneratedContent(compiled.compiled.slots, input.content)
  if (issues.length > 0) return { ok: false, issues }
  const html = fillGeneratedBlock(compiled.compiled, input.content as GeneratedBlockContent)
  const lint = lintGeneratedHtml(html, { slotMarkers: input.slotMarkers === true })
  if (lint.length > 0) return { ok: false, issues: lint.map((entry) => ({ code: "hygiene" as const, path: "html", message: entry.message })) }
  return { ok: true, html, compatibility: compiled.compiled.compatibility, compatibilityReasons: compiled.compiled.compatibilityReasons, slots: compiled.compiled.slots }
}
