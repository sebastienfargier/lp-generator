/**
 * Le BLUEPRINT d'une lame générée depuis une référence (V2.9.4c.1) : le contrat de TRANSPORT du second appel.
 *
 * Le fournisseur ne connaît pas l'AST de `GeneratedBlockSpec` (sa grammaire compilée dépassait la limite de l'API) :
 * le modèle choisit une composition dans un vocabulaire FERMÉ et PLAT, le code Studi construit la spec réelle.
 *
 *   blueprint (modèle) → validation sémantique → compatibilité avec les gaps → `compile…` → GeneratedBlockSpec
 *
 * Un seul objet, jamais d'union ni de récursion : `archetype` et des paramètres toujours présents (une valeur
 * NEUTRE dit « sans objet »). Le CODE refuse les combinaisons incohérentes. Trois archétypes couvrent les 7 gaps
 * exprimables :
 *
 * - `items` : `count` éléments en `columns` colonnes (1 = pile), style `plain` / `card` / `icon` / `icon-card` /
 *   `stat` ; couvre columns, column-proportions (2 colonnes), repeated-cards, icon-items, stat-emphasis ;
 * - `media` : un visuel EN HAUT, À GAUCHE ou À DROITE d'un texte ; couvre image-placement, columns (côté),
 *   column-proportions (côté) ;
 * - `overlap` : un visuel en bandeau et une carte qui le chevauche ; couvre card-over-image, image-placement.
 *
 * Le blueprint ne porte AUCUN contenu, rôle, nom de slot, HTML, CSS, URL, destination, identifiant d'image, taille
 * libre, couleur ni position libre. Les slots sont DÉTERMINISTES (`title`, `card-2-body`, `icon-1`, `stat-3-label`…)
 * et le rôle de la spec est celui du candidat. La spec compilée repasse TOUJOURS par `validateGeneratedBlockSpec` ;
 * le DSL (V2.9.1) n'est pas modifié.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import type { referenceRoles } from "./document"
import type { GeneratedBlockSpec, GeneratedNode } from "./generated/schema"
import { deriveGeneratedSlots, type GeneratedSlot } from "./generated/slots"
import type { ExpressibleReferenceGap } from "./reference-gap"

type Role = (typeof referenceRoles)[number]

/* Vocabulaire --------------------------------------------------------------- */

export const blueprintArchetypes = ["items", "media", "overlap"] as const
export const blueprintItemStyles = ["plain", "card", "icon", "icon-card", "stat"] as const
export const blueprintProportions = ["equal", "first-wide", "second-wide"] as const
export const blueprintImagePositions = ["none", "top", "left", "right"] as const
export const blueprintImageFormats = ["none", "band", "medium", "large", "split"] as const
export const blueprintAligns = ["start", "center"] as const
export const blueprintIntros = ["none", "title", "title-body", "eyebrow-title-body"] as const
export const blueprintCounts = [1, 2, 3, 4] as const
export const blueprintColumns = [1, 2, 3, 4] as const
export const blueprintOverlaps = [0, 24, 40, 56] as const

/** Formats d'image admis selon la position : en haut, un cadre large ; sur le côté, un cadre étroit ou moyen. */
export const blueprintFormatsByPosition = { top: ["band", "medium", "large"], left: ["split", "medium"], right: ["split", "medium"] } as const

/** Les gaps qu'un archétype PEUT couvrir (selon ses paramètres). La couverture réelle d'un blueprint est `coveredBlueprintGaps`. */
export const blueprintArchetypeCapabilities: Record<(typeof blueprintArchetypes)[number], readonly ExpressibleReferenceGap[]> = {
  items: ["columns", "column-proportions", "repeated-cards", "icon-items", "stat-emphasis"],
  media: ["columns", "column-proportions", "image-placement"],
  overlap: ["card-over-image", "image-placement"],
}

/** Les slots de texte et d'icône POSSIBLES : une énumération fermée du transport (le texte « stat-N » est rempli par le système, il n'y figure pas). */
const upTo = (n: number) => Array.from({ length: n }, (_, index) => index + 1)
export const generatedReferenceTextSlots = ["eyebrow", "title", "body", ...(["item", "card", "icon"] as const).flatMap((stem) => upTo(4).flatMap((n) => [`${stem}-${n}-title`, `${stem}-${n}-body`])), ...upTo(4).map((n) => `stat-${n}-label`)] as [string, ...string[]]
export const generatedReferenceIconSlots = [...upTo(4).map((n) => `icon-${n}`), ...upTo(4).map((n) => `card-${n}-icon`)] as [string, ...string[]]
export const generatedReferenceButtonSlot = "cta"
export const generatedReferenceImageSlot = "image"

/* Schéma de transport ------------------------------------------------------- */

/** Une valeur d'une liste de nombres : `enum` de nombres (un seul nœud, sans `anyOf`). */
const numberOf = <const Values extends readonly number[]>(values: Values, label: string) => z.literal([...values], { error: `${label} : valeur hors du vocabulaire.` })

/** UN objet strict, tous les champs requis, aucune union ni récursion. */
export const GeneratedReferenceBlueprintSchema = z.strictObject({
  archetype: z.enum(blueprintArchetypes, { error: "Archétype inconnu." }),
  count: numberOf(blueprintCounts, "Nombre d'éléments"),
  columns: numberOf(blueprintColumns, "Colonnes"),
  itemStyle: z.enum(blueprintItemStyles, { error: "Style d'élément inconnu." }),
  proportion: z.enum(blueprintProportions, { error: "Proportion inconnue." }),
  imagePosition: z.enum(blueprintImagePositions, { error: "Position du visuel inconnue." }),
  imageFormat: z.enum(blueprintImageFormats, { error: "Format de visuel inconnu." }),
  overlap: numberOf(blueprintOverlaps, "Chevauchement"),
  align: z.enum(blueprintAligns, { error: "Alignement inconnu." }),
  intro: z.enum(blueprintIntros, { error: "Introduction inconnue." }),
  cta: z.boolean({ error: "Bouton : vrai ou faux." }),
})
export type GeneratedReferenceBlueprint = z.infer<typeof GeneratedReferenceBlueprintSchema>

/* Validation sémantique ----------------------------------------------------- */

export type BlueprintIssue = { path: string; message: string }
export type BlueprintValidation = { ok: true; blueprint: GeneratedReferenceBlueprint } | { ok: false; issues: BlueprintIssue[] }

/** Les règles de combinaison, sur un blueprint déjà bien typé. Fonction pure ; renvoie les problèmes. */
export function blueprintCombinationIssues(bp: GeneratedReferenceBlueprint): BlueprintIssue[] {
  const issues: BlueprintIssue[] = []
  const bad = (path: string, message: string) => issues.push({ path, message })
  if (bp.archetype === "items") {
    if (bp.imagePosition !== "none") bad("imagePosition", "« items » n'a pas de visuel : la position est « none ».")
    if (bp.imageFormat !== "none") bad("imageFormat", "« items » n'a pas de visuel : le format est « none ».")
    if (bp.overlap !== 0) bad("overlap", "« items » n'a pas de chevauchement : 0.")
    if (bp.columns > bp.count) bad("columns", "Plus de colonnes que d'éléments.")
    else if (bp.columns > 1 && bp.count % bp.columns !== 0) bad("columns", "Le nombre d'éléments doit remplir toutes les lignes de colonnes.")
    if (bp.proportion !== "equal" && bp.columns !== 2) bad("proportion", "Une proportion inégale suppose exactement 2 colonnes.")
    return issues
  }
  if (bp.count !== 1) bad("count", "Hors « items », le nombre d'éléments est 1.")
  if (bp.columns !== 1) bad("columns", "Hors « items », les colonnes sont 1 (la disposition vient de la position du visuel).")
  if (bp.itemStyle !== "plain") bad("itemStyle", "Hors « items », le style d'élément est « plain ».")
  if (bp.intro === "none") bad("intro", "Un texte est requis : au moins un titre.")
  if (bp.imagePosition === "none") {
    bad("imagePosition", "Un visuel est requis.")
    return issues
  }
  const allowed = (blueprintFormatsByPosition as Record<string, readonly string[]>)[bp.imagePosition] ?? []
  if (!allowed.includes(bp.imageFormat)) bad("imageFormat", `Format « ${bp.imageFormat} » non admis pour un visuel « ${bp.imagePosition} ».`)
  if (bp.archetype === "media") {
    if (bp.overlap !== 0) bad("overlap", "« media » n'a pas de chevauchement : 0.")
    if (bp.imagePosition === "top" && bp.proportion !== "equal") bad("proportion", "Une proportion suppose un visuel à gauche ou à droite.")
  } else {
    if (bp.imagePosition !== "top") bad("imagePosition", "« overlap » place le visuel en haut.")
    if (bp.overlap === 0) bad("overlap", "« overlap » chevauche de 24, 40 ou 56.")
    if (bp.proportion !== "equal") bad("proportion", "« overlap » n'a pas de proportion.")
  }
  return issues
}

/** Le blueprint : forme (schéma strict), puis combinaisons. Tout ou rien : jamais corrigé. */
export function validateGeneratedReferenceBlueprint(input: unknown): BlueprintValidation {
  const parsed = GeneratedReferenceBlueprintSchema.safeParse(input, { error: z.locales.fr().localeError })
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "blueprint", message: issue.message })) }
  const issues = blueprintCombinationIssues(parsed.data)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, blueprint: parsed.data }
}

/* Couverture des gaps ------------------------------------------------------- */

/** Les gaps que CE blueprint couvre, selon ses paramètres (toujours un sous-ensemble des capacités de son archétype). */
export function coveredBlueprintGaps(bp: GeneratedReferenceBlueprint): ExpressibleReferenceGap[] {
  const gaps: ExpressibleReferenceGap[] = []
  if (bp.archetype === "items") {
    if (bp.columns >= 2) gaps.push("columns")
    if (bp.columns === 2 && bp.proportion !== "equal") gaps.push("column-proportions")
    if (bp.itemStyle === "card" || bp.itemStyle === "icon-card") gaps.push("repeated-cards")
    if (bp.itemStyle === "icon" || bp.itemStyle === "icon-card") gaps.push("icon-items")
    if (bp.itemStyle === "stat") gaps.push("stat-emphasis")
  } else if (bp.archetype === "media") {
    gaps.push("image-placement")
    if (bp.imagePosition === "left" || bp.imagePosition === "right") {
      gaps.push("columns")
      if (bp.proportion !== "equal") gaps.push("column-proportions")
    }
  } else {
    gaps.push("card-over-image", "image-placement")
  }
  return gaps
}

export type BlueprintCandidate = { layout: string; hasImage: boolean; hasCta: boolean; structure: readonly ExpressibleReferenceGap[] }

/** Où un visuel « media » se place pour un layout d'image donné. */
const positionOfLayout: Record<string, GeneratedReferenceBlueprint["imagePosition"]> = { "image-top": "top", "image-left": "left", "image-right": "right" }
export type BlueprintCompatibility = { ok: true } | { ok: false; reason: "blueprint-coverage" | "image-not-allowed" | "cta-not-allowed"; gap?: ExpressibleReferenceGap }

/** Niveau 1 : le blueprint est compatible avec la DEMANDE (visuel et bouton permis, chaque gap couvert par ses paramètres). */
export function checkGeneratedReferenceBlueprint(bp: GeneratedReferenceBlueprint, candidate: BlueprintCandidate): BlueprintCompatibility {
  if (!candidate.hasImage && bp.imagePosition !== "none") return { ok: false, reason: "image-not-allowed" }
  if (!candidate.hasCta && bp.cta) return { ok: false, reason: "cta-not-allowed" }
  const covered = new Set(coveredBlueprintGaps(bp))
  const capable = new Set(blueprintArchetypeCapabilities[bp.archetype])
  for (const gap of candidate.structure) if (!covered.has(gap) || !capable.has(gap)) return { ok: false, reason: "blueprint-coverage", gap }
  // Un visuel placé « comme la référence » : le layout image-top / image-left / image-right fixe la position du visuel d'un « media ».
  const expected = positionOfLayout[candidate.layout]
  if (bp.archetype === "media" && candidate.structure.includes("image-placement") && expected && bp.imagePosition !== expected) return { ok: false, reason: "blueprint-coverage", gap: "image-placement" }
  return { ok: true }
}

/* Compilation --------------------------------------------------------------- */

type TextNode = Extract<GeneratedNode, { t: "text" }>
const text = (slot: string, style: TextNode["style"], tone: "title" | "text" | "muted", align: "start" | "center"): GeneratedNode => ({ t: "text", slot, style, align, tone })
const stack = (children: GeneratedNode[], align: "start" | "center", gap: 8 | 12 | 18 = 12): GeneratedNode => ({ t: "stack", gap, align, children })
const card = (children: GeneratedNode[], overlap: 0 | 24 | 40 | 56 = 0, fill: "plain" | "soft" = "soft"): GeneratedNode => ({ t: "card", fill, radius: 12, pad: 24, overlap, children })
const ratioOf = (columns: number, proportion: GeneratedReferenceBlueprint["proportion"]): "1:1" | "1:2" | "2:1" | "1:1:1" | "1:1:1:1" =>
  columns === 3 ? "1:1:1" : columns === 4 ? "1:1:1:1" : proportion === "first-wide" ? "2:1" : proportion === "second-wide" ? "1:2" : "1:1"

/** Le texte d'introduction (étiquette, titre, paragraphe) puis le bouton : noms de slots fixes. */
function introNodes(bp: GeneratedReferenceBlueprint, titleStyle: "title" | "title-xl"): GeneratedNode[] {
  const align = bp.align
  const nodes: GeneratedNode[] = []
  if (bp.intro === "eyebrow-title-body") nodes.push(text("eyebrow", "eyebrow", "muted", align))
  if (bp.intro !== "none") nodes.push(text("title", titleStyle, "title", align))
  if (bp.intro === "title-body" || bp.intro === "eyebrow-title-body") nodes.push(text("body", "body", "text", align))
  return nodes
}
const ctaNodes = (bp: GeneratedReferenceBlueprint): GeneratedNode[] => (bp.cta ? [{ t: "button", slot: generatedReferenceButtonSlot, variant: "primary", arrow: true, align: bp.align }] : [])

function itemCell(bp: GeneratedReferenceBlueprint, n: number): GeneratedNode {
  const { align } = bp
  const heading = (stem: string) => [text(`${stem}-${n}-title`, "subtitle", "title", align), text(`${stem}-${n}-body`, "body", "muted", align)]
  switch (bp.itemStyle) {
    case "plain":
      return stack(heading("item"), align, 8)
    case "icon":
      return stack([{ t: "icon", slot: `icon-${n}`, frame: "circle" }, ...heading("icon")], align, 8)
    case "card":
      return card([stack(heading("card"), align)])
    case "icon-card":
      return card([stack([{ t: "icon", slot: `card-${n}-icon`, frame: "circle" }, ...heading("card")], align)])
    case "stat":
      return stack([text(`stat-${n}`, "stat", "title", align), text(`stat-${n}-label`, "caption", "muted", align)], align, 8)
  }
}

function itemChildren(bp: GeneratedReferenceBlueprint): GeneratedNode[] {
  const cells = Array.from({ length: bp.count }, (_, index) => itemCell(bp, index + 1))
  if (bp.columns === 1) return cells
  const rows: GeneratedNode[] = []
  for (let at = 0; at < cells.length; at += bp.columns) rows.push({ t: "columns", ratio: ratioOf(bp.columns, bp.proportion), gap: 24, align: "top", children: cells.slice(at, at + bp.columns) })
  return rows
}

function compileChildren(bp: GeneratedReferenceBlueprint): GeneratedNode[] {
  if (bp.archetype === "items") return [...introNodes(bp, "title"), ...itemChildren(bp), ...ctaNodes(bp)]
  const image: GeneratedNode = { t: "image", slot: generatedReferenceImageSlot, format: bp.imageFormat as Exclude<GeneratedReferenceBlueprint["imageFormat"], "none">, radius: 16, align: bp.align }
  const copy = (gap: 12 | 18) => stack([...introNodes(bp, "title"), ...ctaNodes(bp)], bp.align, gap)
  if (bp.archetype === "overlap") return [image, card([copy(12)], bp.overlap as 24 | 40 | 56, "plain")]
  if (bp.imagePosition === "top") return [image, copy(18)]
  const parts = bp.imagePosition === "left" ? [image, copy(12)] : [copy(12), image]
  return [{ t: "columns", ratio: ratioOf(2, bp.proportion), gap: 24, align: "middle", children: parts }]
}

export type BlueprintCompilation = { ok: true; spec: GeneratedBlockSpec } | { ok: false; issues: BlueprintIssue[] }

/**
 * Blueprint → `GeneratedBlockSpec` : PUR et déterministe. Le rôle est celui du candidat. Rejoue la validation
 * sémantique (un blueprint incohérent ne compile pas) ; la spec produite repasse ensuite par `validateGeneratedBlockSpec`.
 */
export function compileGeneratedReferenceBlueprint(input: unknown, role: Role): BlueprintCompilation {
  const validated = validateGeneratedReferenceBlueprint(input)
  if (!validated.ok) return validated
  const spec: GeneratedBlockSpec = { specVersion: 1, role, root: { t: "section", padX: 40, padY: 40, children: compileChildren(validated.blueprint) } }
  return { ok: true, spec }
}

/** Les slots que ce blueprint déclare (dérivés de la spec compilée : une seule source), ou `undefined` si le blueprint est invalide. */
export function deriveGeneratedReferenceBlueprintSlots(input: unknown, role: Role = "other"): GeneratedSlot[] | undefined {
  const compiled = compileGeneratedReferenceBlueprint(input, role)
  return compiled.ok ? deriveGeneratedSlots(compiled.spec) : undefined
}
