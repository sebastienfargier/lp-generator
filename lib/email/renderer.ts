import { readFileSync } from "node:fs"
import { join } from "node:path"

import { parseFragment, type DefaultTreeAdapterTypes } from "parse5"

import { emailDisclaimers } from "./disclaimers"
import { emailBlockManifest, type EmailSlotKind } from "./manifest"
import { parseEmailConfig } from "./schemas"
import {
  emailColorRoles,
  emailColorSubstitutions,
  emailSurfaceRecipes,
  resolveColorRole,
  type EmailColorRole,
  type EmailColorRoleName,
  type EmailSurface,
} from "./surfaces"
import {
  emailDocumentTokens,
  emailIconToken,
  emailSystemElements,
  type EmailSystemElement,
} from "./system"
import type {
  CtaSlot,
  DisclaimerSlot,
  EmailBlock,
  EmailBlockType,
  EmailConfig,
  EmailSlotValueMap,
  IconAssetSlot,
  ImageAssetSlot,
  LinkSlot,
  TextSlot,
} from "./types"

/**
 * Renderer HTML des emails : EmailConfig valide → socle + templates → HTML.
 *
 * Aucun HTML ne vient de la config. Chaque lame est un template connu
 * (`block.type`) ; le renderer n'y modifie que ce que le manifeste autorise :
 * le contenu et les attributs des éléments `data-slot`, les couleurs des
 * lames `configurable` selon la recette de leur surface, et les lignes
 * `data-optional` d'un slot optionnel absent. Les attributs internes
 * (`data-slot`, `data-system`, `data-optional`, `data-color-role`) servent à
 * toutes ces opérations, puis sont retirés du HTML final.
 *
 * Le HTML des templates n'est jamais re-sérialisé : parse5 sert à localiser
 * les éléments (positions exactes dans la source), puis des remplacements
 * ponctuels sont appliqués au texte d'origine. Tout le reste — tables,
 * classes, styles, commentaires, entités — reste octet pour octet.
 *
 * Toute incohérence entre template et manifeste est une erreur explicite.
 */

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

/** D'où viennent le socle et les templates (injectable pour les tests). */
export type EmailTemplateSource = {
  socle: () => string
  template: (file: string) => string
}

/**
 * Source par défaut : les fichiers de `lib/email/`, lus depuis la racine du
 * projet. Une future route devra les inclure dans le bundle serveur
 * (`outputFileTracingIncludes`) ou les embarquer au build.
 */
export const emailFileTemplateSource: EmailTemplateSource = {
  socle: () => readEmailFile("socle-email.html"),
  template: (file) => readEmailFile(join("templates", file)),
}

function readEmailFile(path: string) {
  return readFileSync(join(process.cwd(), "lib", "email", path), "utf8")
}

/** Incohérence template / manifeste / socle : erreur de développement. */
export class EmailTemplateError extends Error {
  override name = "EmailTemplateError"
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

type RenderOptions = {
  source?: EmailTemplateSource
  /**
   * Garde l'attribut `data-slot` de chaque slot dans le HTML rendu. Réservé à
   * l'aperçu du Builder, qui retrouve ainsi « quelle lame, quel slot » sans rien
   * deviner dans le texte : jamais pour l'email envoyé ni l'export. Aucun effet
   * visuel ; faux par défaut.
   */
  slotMarkers?: boolean
}

/**
 * Rend un email complet. `config` doit déjà être valide (`parseEmailConfig`) :
 * le renderer ne revalide pas le contrat, il vérifie ses propres hypothèses
 * sur les templates.
 */
export function renderEmail(
  config: EmailConfig,
  { source = emailFileTemplateSource }: RenderOptions = {}
): string {
  const { head, blocks, tail } = renderEmailParts(config, { source })
  return [head, ...blocks, tail].join("\n")
}

/**
 * Le même rendu, en morceaux : l'en-tête du socle (objet et préheader résolus,
 * jusqu'au marqueur de début des lames), le HTML de chaque lame dans l'ordre,
 * puis la fin du socle. `renderEmail` en est exactement la jointure par "\n".
 * Sert à repérer les lames dans l'HTML (canvas du Builder) sans les chercher
 * après coup dans le texte rendu.
 */
export function renderEmailParts(
  config: EmailConfig,
  { source = emailFileTemplateSource, slotMarkers = false }: RenderOptions = {}
): { head: string; blocks: string[]; tail: string } {
  const blocks = config.blocks.map((block) => renderBlock(block, source, slotMarkers))
  return renderDocument(source.socle(), config, blocks)
}

/**
 * Frontière pour une entrée inconnue (JSON, Claude, stockage) : validation
 * Zod puis rendu. Lève une `ZodError` si la config est invalide.
 */
export function renderEmailFromUnknown(
  input: unknown,
  options: RenderOptions = {}
): string {
  return renderEmail(parseEmailConfig(input), options)
}

/* -------------------------------------------------------------------------- */
/* Échappement                                                                */
/* -------------------------------------------------------------------------- */

/** Contenu textuel d'un élément : `&`, `<`, `>`. Liquid reste une chaîne. */
function escapeText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** Valeur d'attribut entre guillemets doubles : en plus `"`. */
function escapeAttribute(value: string) {
  return escapeText(value).replaceAll('"', "&quot;")
}

/* -------------------------------------------------------------------------- */
/* Document                                                                   */
/* -------------------------------------------------------------------------- */

const lamesStart = "<!-- ===== LAMES : coller ici les corps de lames, dans l'ordre ===== -->"
const lamesEnd = "<!-- ===== FIN DES LAMES ===== -->"

function renderDocument(socle: string, config: EmailConfig, blocks: string[]) {
  const start = expectOnce(socle, lamesStart, "marqueur de début des lames")
  const end = expectOnce(socle, lamesEnd, "marqueur de fin des lames")
  if (end < start) throw new EmailTemplateError("Socle : marqueurs LAMES inversés.")

  // Objet et préheader sont remplacés dans l'en-tête du socle, avant
  // l'insertion des lames : un texte de config ne peut pas viser ces jetons.
  const head = socle.slice(0, start + lamesStart.length)
  for (const [token, label] of [
    [emailDocumentTokens.subject, "jeton d'objet"],
    [emailDocumentTokens.preheader, "jeton de préheader"],
  ] as const) {
    expectOnce(head, token, label)
  }
  const filledHead = head
    .replace(emailDocumentTokens.subject, () => escapeText(config.subject))
    .replace(emailDocumentTokens.preheader, () => escapeText(config.preheader))

  // Les lames, dans l'ordre de config.blocks, entre les deux marqueurs.
  return { head: filledHead, blocks, tail: socle.slice(end) }
}

function expectOnce(html: string, token: string, label: string) {
  const index = html.indexOf(token)
  if (index === -1 || html.indexOf(token, index + token.length) !== -1) {
    throw new EmailTemplateError(`Socle : ${label} « ${token} » absent ou en double.`)
  }
  return index
}

/* -------------------------------------------------------------------------- */
/* Templates : lecture et intégrité                                           */
/* -------------------------------------------------------------------------- */

type Element = DefaultTreeAdapterTypes.Element
type Range = { start: number; end: number }

type LocatedSlot = {
  kind: EmailSlotKind
  /** Contenu entre les balises (absent pour `<img>`). */
  content?: Range
  /** Plage `nom="valeur"` de chaque attribut. */
  attrs: Record<string, Range>
}

type StyleAttribute = {
  range: Range
  value: string
  /** Rôle explicite de l'élément (`data-color-role`), sinon table §3. */
  colorRole?: EmailColorRoleName
}

type PreparedTemplate = {
  html: string
  slots: Map<string, LocatedSlot>
  /** Plages supprimables, par slot optionnel. */
  optionalRows: Map<string, Range[]>
  /** Attributs `style` porteurs de couleurs (lames configurables). */
  styles: StyleAttribute[]
  /** Attributs internes à retirer du HTML final (espace précédent inclus). */
  internalAttributes: (Range & { name: string })[]
}

/** Attributs du renderer, jamais publiés dans l'email. */
const internalAttributeNames = [
  "data-slot",
  "data-system",
  "data-optional",
  "data-color-role",
] as const

type ManifestEntry = {
  file: string
  surfaceMode: "configurable" | "fixed"
  slots: Readonly<Record<string, EmailSlotKind>>
  optional?: readonly string[]
  system?: readonly EmailSystemElement[]
}

const tagsByKind: Record<EmailSlotKind, readonly string[]> = {
  texte: ["p", "strong", "span", "td"],
  cta: ["a"],
  "cta:fleche": ["a"],
  lien: ["a"],
  "asset:visuel": ["img"],
  "asset:icone": ["img"],
  disclaimer: ["p"],
}

/** Gabarit `{libellé} &nbsp;&#8594;` : la flèche fait partie du template. */
const ctaArrow = " &nbsp;&#8594;"

const cache = new WeakMap<EmailTemplateSource, Map<EmailBlockType, PreparedTemplate>>()

function prepare(type: EmailBlockType, source: EmailTemplateSource) {
  let prepared = cache.get(source)
  if (!prepared) {
    prepared = new Map()
    cache.set(source, prepared)
  }
  const cached = prepared.get(type)
  if (cached) return cached

  const entry: ManifestEntry | undefined = emailBlockManifest[type]
  if (!entry) throw new EmailTemplateError(`Lame inconnue du manifeste : "${type}".`)
  const template = prepareTemplate(type, entry, source.template(entry.file))
  prepared.set(type, template)
  return template
}

function prepareTemplate(
  type: EmailBlockType,
  entry: ManifestEntry,
  html: string
): PreparedTemplate {
  const fail = (message: string): never => {
    throw new EmailTemplateError(`Template "${entry.file}" (${type}) : ${message}`)
  }
  const slots = new Map<string, LocatedSlot>()
  const systems = new Set<string>()
  const optionalRows = new Map<string, Range[]>()
  const styles: StyleAttribute[] = []
  const internalAttributes: (Range & { name: string })[] = []

  const optional = new Set(entry.optional ?? [])
  const declaredSystem = new Set<string>(entry.system ?? [])

  for (const element of elements(parseFragment(html, { sourceCodeLocationInfo: true }))) {
    const location = element.sourceCodeLocation
    if (!location?.startTag) {
      // Élément implicite du parser (ex. <tbody>) : absent de la source, donc
      // sans attribut de template ; ses enfants sont parcourus normalement.
      if (element.attrs.length > 0) fail(`<${element.tagName}> implicite avec attributs.`)
      continue
    }
    const attr = (name: string) =>
      element.attrs.find((attribute) => attribute.name === name)?.value
    const attrRange = (name: string) => {
      const range = location?.attrs?.[name]
      return range ? { start: range.startOffset, end: range.endOffset } : undefined
    }

    for (const name of internalAttributeNames) {
      const range = attrRange(name)
      if (!range) continue
      const start = /\s/.test(html[range.start - 1] ?? "") ? range.start - 1 : range.start
      internalAttributes.push({ start, end: range.end, name })
    }

    const slot = attr("data-slot")
    if (slot !== undefined) {
      const kind = entry.slots[slot]
      if (!kind) fail(`data-slot "${slot}" non déclaré dans le manifeste.`)
      if (slots.has(slot)) fail(`data-slot "${slot}" en double.`)
      if (!tagsByKind[kind].includes(element.tagName)) {
        fail(`data-slot "${slot}" (${kind}) porté par <${element.tagName}>.`)
      }
      const located: LocatedSlot = { kind, attrs: {} }
      const needed =
        kind === "asset:visuel" ? ["src", "alt"] :
        kind === "asset:icone" ? ["src"] :
        kind === "cta" || kind === "cta:fleche" || kind === "lien" ? ["href"] : []
      for (const name of needed) {
        const range = attrRange(name)
        if (!range) fail(`data-slot "${slot}" sans attribut ${name}.`)
        else located.attrs[name] = range
      }
      if (element.tagName !== "img") {
        if (!location?.endTag) fail(`data-slot "${slot}" sans balise fermante.`)
        if (!element.childNodes.every((child) => child.nodeName === "#text")) {
          fail(`data-slot "${slot}" contient des éléments : seul du texte est remplaçable.`)
        }
        located.content = {
          start: location!.startTag!.endOffset,
          end: location!.endTag!.startOffset,
        }
        const inner = html.slice(located.content.start, located.content.end)
        if (kind === "cta:fleche" && !inner.endsWith(ctaArrow)) {
          fail(`data-slot "${slot}" (cta:fleche) sans la flèche du gabarit.`)
        }
        if (kind === "cta" && inner.includes("&#8594;")) {
          fail(`data-slot "${slot}" (cta) contient une flèche : cta:fleche attendu.`)
        }
      }
      slots.set(slot, located)
    }

    const system = attr("data-system")
    if (system !== undefined) {
      if (!declaredSystem.has(system)) fail(`data-system "${system}" non déclaré.`)
      if (systems.has(system)) fail(`data-system "${system}" en double.`)
      const { token } = emailSystemElements[system as EmailSystemElement]
      const value = element.tagName === "a" ? attr("href") : attr("src")
      if (value !== token) fail(`data-system "${system}" : jeton ${token} attendu.`)
      systems.add(system)
    }

    const optionalFor = attr("data-optional")
    if (optionalFor !== undefined) {
      if (!optional.has(optionalFor)) fail(`data-optional "${optionalFor}" ne vise aucun slot optionnel.`)
      if (!location?.endTag) fail(`data-optional "${optionalFor}" sans balise fermante.`)
      const rows = optionalRows.get(optionalFor) ?? []
      rows.push({ start: location!.startTag!.startOffset, end: location!.endTag!.endOffset })
      optionalRows.set(optionalFor, rows)
    }

    const colorRoleValue = attr("data-color-role")
    let colorRole: EmailColorRoleName | undefined
    if (colorRoleValue !== undefined) {
      const known: readonly string[] = emailColorRoles
      if (!known.includes(colorRoleValue)) fail(`data-color-role "${colorRoleValue}" inconnu.`)
      if (entry.surfaceMode !== "configurable") fail(`data-color-role sur une lame fixed.`)
      colorRole = colorRoleValue as EmailColorRoleName
    }

    const style = attr("style")
    const styleRange = attrRange("style")
    if (entry.surfaceMode === "configurable" && style !== undefined && styleRange) {
      // Vérifie dès la lecture que chaque couleur a un rôle : explicite
      // (data-color-role), sinon celui de la table §3 — jamais deviné.
      for (const declaration of colorDeclarations(style)) {
        const known = colorRole
          ? declaration.group !== undefined &&
            resolveColorRole(colorRole, "page", declaration.group, declaration.hex) !== undefined
          : declaration.role !== undefined
        if (!known) {
          fail(`couleur ${declaration.property}:${declaration.hex} sans rôle${colorRole ? ` pour "${colorRole}"` : " dans la table de substitution"}.`)
        }
      }
      if (/#[0-9a-f]{6}\b/i.test(style)) {
        styles.push({ range: styleRange, value: style, colorRole })
      }
    } else if (colorRole) {
      fail(`data-color-role "${colorRole}" sans couleur à porter.`)
    }
  }

  for (const slot of Object.keys(entry.slots)) {
    if (!slots.has(slot)) fail(`slot "${slot}" du manifeste absent du template.`)
  }
  for (const system of declaredSystem) {
    if (!systems.has(system)) fail(`élément système "${system}" absent du template.`)
  }
  for (const slot of optional) {
    if (!optionalRows.has(slot)) fail(`slot optionnel "${slot}" sans ligne data-optional.`)
  }
  return { html, slots, optionalRows, styles, internalAttributes }
}

/** Parcours en profondeur, dans l'ordre du document. */
function* elements(node: { childNodes?: DefaultTreeAdapterTypes.ChildNode[] }): Generator<Element> {
  for (const child of node.childNodes ?? []) {
    if ("tagName" in child) {
      yield child
      yield* elements(child)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

type ColorDeclaration = {
  property: string
  group: "background" | "color" | "border" | undefined
  hex: string
  role: EmailColorRole | undefined
  /** Position de la valeur hexadécimale dans l'attribut `style`. */
  index: number
}

function propertyGroup(
  property: string
): "background" | "color" | "border" | undefined {
  if (property === "background" || property === "background-color") return "background"
  if (property === "color") return "color"
  if (property.startsWith("border")) return "border"
  return undefined
}

/** Déclarations CSS inline porteuses d'une couleur hexadécimale. */
function colorDeclarations(style: string): ColorDeclaration[] {
  const found: ColorDeclaration[] = []
  let offset = 0
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":")
    if (colon !== -1) {
      const property = declaration.slice(0, colon).trim().toLowerCase()
      const group = propertyGroup(property)
      for (const match of declaration.slice(colon + 1).matchAll(/#[0-9a-f]{6}\b/gi)) {
        const hex = match[0].toUpperCase()
        const table: Readonly<Record<string, EmailColorRole>> | undefined =
          group ? emailColorSubstitutions[group] : undefined
        found.push({
          property,
          group,
          hex,
          role: table?.[hex],
          index: offset + colon + 1 + (match.index ?? 0),
        })
      }
    }
    offset += declaration.length + 1
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* Lames                                                                      */
/* -------------------------------------------------------------------------- */

type Edit = Range & { text: string }

function renderBlock(block: EmailBlock, source: EmailTemplateSource, slotMarkers = false) {
  const entry: ManifestEntry = emailBlockManifest[block.type]
  const template = prepare(block.type, source)
  const values: Record<string, unknown> = block.slots
  const edits: Edit[] = []
  const removedRows: Range[] = []

  for (const [slot, located] of template.slots) {
    const value = values[slot]
    if (value === undefined) {
      const rows = template.optionalRows.get(slot)
      if (!rows) {
        throw new EmailTemplateError(`Lame "${block.id}" : slot requis "${slot}" absent.`)
      }
      // Seule suppression structurelle autorisée : les lignes du slot absent.
      for (const row of rows) {
        removedRows.push(row)
        edits.push({ ...row, text: "" })
      }
      continue
    }
    edits.push(...slotEdits(located.kind, located, value, `${block.id}.${slot}`))
  }

  if (entry.surfaceMode === "configurable") {
    const surface: EmailSurface =
      "surface" in block && block.surface ? block.surface : "page"
    const recipe = emailSurfaceRecipes[surface]
    for (const style of template.styles) {
      let value = style.value
      for (const declaration of colorDeclarations(style.value).reverse()) {
        const next = style.colorRole
          ? resolveColorRole(style.colorRole, surface, declaration.group!, declaration.hex)
          : recipe[declaration.role!]
        if (next === undefined) {
          throw new EmailTemplateError(
            `Lame "${block.id}" : rendu de "${style.colorRole}" non établi sur la surface "${surface}".`
          )
        }
        value =
          value.slice(0, declaration.index) + next + value.slice(declaration.index + 7)
      }
      if (value !== style.value) {
        edits.push({ ...style.range, text: `style="${escapeAttribute(value)}"` })
      }
    }
  }

  // Attributs internes retirés en dernier, dans la même passe (positions du
  // template d'origine), sauf dans les lignes déjà supprimées.
  for (const range of template.internalAttributes) {
    if (slotMarkers && range.name === "data-slot") continue
    const inRemovedRow = removedRows.some(
      (row) => row.start <= range.start && range.end <= row.end
    )
    if (!inRemovedRow) edits.push({ ...range, text: "" })
  }

  return applyEdits(template.html, edits)
}

/**
 * Le type du slot vient du template (vérifié contre le manifeste) et la
 * valeur de la config (validée par Zod pour ce même slot) : TypeScript ne
 * peut pas relier les deux dans une boucle, d'où ce point de conversion.
 */
function slotValue<Kind extends EmailSlotKind>(_kind: Kind, value: unknown) {
  return value as EmailSlotValueMap[Kind]
}

function slotEdits(kind: EmailSlotKind, located: LocatedSlot, value: unknown, path: string): Edit[] {
  const attribute = (name: string, content: string): Edit => ({
    ...located.attrs[name]!,
    text: `${name}="${escapeAttribute(content)}"`,
  })
  const content = (text: string): Edit => ({ ...located.content!, text })

  switch (kind) {
    case "texte": {
      const { text }: TextSlot = slotValue(kind, value)
      return [content(escapeText(text))]
    }
    case "cta":
    case "lien": {
      const { label, href }: CtaSlot | LinkSlot = slotValue(kind, value)
      return [attribute("href", href), content(escapeText(label))]
    }
    case "cta:fleche": {
      const { label, href }: CtaSlot = slotValue(kind, value)
      return [attribute("href", href), content(escapeText(label) + ctaArrow)]
    }
    case "asset:visuel": {
      const { src, alt }: ImageAssetSlot = slotValue(kind, value)
      return [attribute("src", src), attribute("alt", alt)]
    }
    case "asset:icone": {
      const { icon }: IconAssetSlot = slotValue(kind, value)
      return [attribute("src", emailIconToken(icon))]
    }
    case "disclaimer": {
      const disclaimer: DisclaimerSlot = slotValue(kind, value)
      return [content(`*${escapeText(disclaimerText(disclaimer, path))}`)]
    }
  }
}

function disclaimerText(slot: DisclaimerSlot, path: string) {
  const { text } = emailDisclaimers[slot.disclaimer]
  if (!("endDate" in slot)) return text
  const [year, month, day] = slot.endDate.split("-")
  if (!text.includes("JJ/MM/AAAA")) {
    throw new EmailTemplateError(`${path} : disclaimer sans emplacement de date.`)
  }
  return text.replace("JJ/MM/AAAA", `${day}/${month}/${year}`)
}

/** Applique des remplacements disjoints, de la fin vers le début. */
function applyEdits(html: string, edits: Edit[]) {
  const sorted = [...edits].sort((a, b) => b.start - a.start)
  let result = html
  let limit = Infinity
  for (const edit of sorted) {
    if (edit.end > limit) {
      throw new EmailTemplateError("Remplacements qui se chevauchent dans une lame.")
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
    limit = edit.start
  }
  return result
}
