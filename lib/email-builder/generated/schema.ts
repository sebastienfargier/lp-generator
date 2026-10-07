/**
 * Schéma de `GeneratedBlockSpec` : un arbre de primitives, FERMÉ et STRICT. Chaque
 * nœud est un objet strict (aucune clé inconnue : ni `style`, ni `className`, ni
 * `href`…) dont toutes les propriétés sont des enums ou des noms de slots. Aucun
 * champ n'est optionnel (compatible avec un futur Structured Output).
 *
 * L'arbre est DÉROULÉ sur la profondeur maximale (pas de schéma récursif) : un
 * nœud conteneur au dernier niveau n'existe tout simplement pas, et une
 * « section » ne peut apparaître que comme racine.
 *
 * Pas de primitive `repeat` : les éléments répétés sont écrits explicitement
 * (des enfants, chacun avec ses slots). Une répétition magique rendrait la
 * dérivation des slots, la validation et l'édition plus difficiles pour un gain nul
 * (le plafond de 40 nœuds borne de toute façon la verbosité).
 *
 * Aucun HTML, CSS ou URL : la spec décrit un BESOIN structurel ; le contenu vit dans
 * les slots du futur bloc.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { referenceRoles } from "../document"
import {
  aligns,
  availableImageFormats,
  buttonVariants,
  cardFills,
  cardPaddings,
  columnAligns,
  columnGaps,
  columnRatios,
  futureImageFormats,
  generatedLimits,
  generatedSpecVersion,
  iconFrames,
  overlaps,
  radii,
  sectionPaddingX,
  sectionPaddingY,
  spacerSizes,
  stackGaps,
  textStyles,
  textTones,
} from "./tokens"

/** Une valeur d'une liste de nombres (px) : refusée si elle n'y est pas. */
const oneOf = <const Values extends readonly number[]>(values: Values, label: string) => z.union(values.map((value) => z.literal(value)) as unknown as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]], { error: `${label} : valeur hors du vocabulaire.` })

/** Un nom de slot : la grammaire seule (les règles de nom — unicité, réservés — sont dans `slots.ts`). */
export const slotNamePattern = /^[a-z][a-z0-9-]*$/
const slot = z.string({ error: "Slot : un nom est requis." }).min(1, "Slot : un nom est requis.").max(generatedLimits.maxSlotNameLength, `Slot : ${generatedLimits.maxSlotNameLength} caractères au plus.`).regex(slotNamePattern, "Slot : minuscules, chiffres et tirets, commençant par une lettre.")

const imageFormat = z.string({ error: "Image : un format est requis." }).refine((value) => (availableImageFormats as readonly string[]).includes(value), {
  error: (issue) => ((futureImageFormats as readonly string[]).includes(String(issue.input)) ? `Le format d'image « ${String(issue.input)} » n'existe pas encore dans la banque.` : `Format d'image inconnu : « ${String(issue.input).slice(0, 40)} ».`),
})

/* Feuilles --------------------------------------------------------------- */

const image = z.strictObject({ t: z.literal("image"), slot, format: imageFormat, radius: oneOf(radii, "Rayon"), align: z.enum(aligns, { error: "Alignement inconnu." }) })
const text = z.strictObject({ t: z.literal("text"), slot, style: z.enum(textStyles, { error: "Style de texte inconnu." }), align: z.enum(aligns, { error: "Alignement inconnu." }), tone: z.enum(textTones, { error: "Ton inconnu." }) })
const button = z.strictObject({ t: z.literal("button"), slot, variant: z.enum(buttonVariants, { error: "Variante de bouton inconnue." }), arrow: z.boolean({ error: "Flèche : vrai ou faux." }), align: z.enum(aligns, { error: "Alignement inconnu." }) })
const icon = z.strictObject({ t: z.literal("icon"), slot, frame: z.enum(iconFrames, { error: "Cadre d'icône inconnu." }) })
const divider = z.strictObject({ t: z.literal("divider") })
const spacer = z.strictObject({ t: z.literal("spacer"), size: oneOf(spacerSizes, "Espace") })
const leaves = [image, text, button, icon, divider, spacer] as const

/* Conteneurs : déroulés sur la profondeur ---------------------------------- */

const ratios = Object.keys(columnRatios) as (keyof typeof columnRatios)[]

/** Le schéma d'un nœud au niveau `level` (1 = enfant direct de la racine). Au dernier niveau : des feuilles seulement. */
function nodeSchema(level: number): z.ZodType<unknown> {
  if (level >= generatedLimits.maxDepth) return z.discriminatedUnion("t", [...leaves], { error: "Primitive inconnue ou conteneur trop profond." })
  const child = nodeSchema(level + 1)
  const children = (min: number, max: number) => z.array(child, { error: "Enfants : une liste est requise." }).min(min, `Au moins ${min} enfant(s).`).max(max, `Au plus ${max} enfants.`)
  const stack = z.strictObject({ t: z.literal("stack"), gap: oneOf(stackGaps, "Écart"), align: z.enum(aligns, { error: "Alignement inconnu." }), children: children(1, 8) })
  const columns = z
    .strictObject({ t: z.literal("columns"), ratio: z.enum(ratios, { error: "Ratio de colonnes inconnu." }), gap: oneOf(columnGaps, "Écart de colonnes"), align: z.enum(columnAligns, { error: "Alignement inconnu." }), children: children(2, 4) })
    .refine((node) => node.children.length === columnRatios[node.ratio], { error: "Le nombre de colonnes ne correspond pas au ratio.", path: ["children"] })
  const card = z.strictObject({ t: z.literal("card"), fill: z.enum(cardFills, { error: "Fond de carte inconnu." }), radius: oneOf(radii, "Rayon"), pad: oneOf(cardPaddings, "Padding"), overlap: oneOf(overlaps, "Chevauchement"), children: children(1, 6) })
  return z.discriminatedUnion("t", [stack, columns, card, ...leaves], { error: "Primitive inconnue." })
}

export const GeneratedBlockSpecSchema = z.strictObject({
  specVersion: z.literal(generatedSpecVersion, { error: `Version de spec inconnue : seule la version ${generatedSpecVersion} existe.` }),
  /** Le même vocabulaire de rôles que `ReferenceAnalysis` (une seule source : `document.ts`). */
  role: z.enum(referenceRoles, { error: "Rôle inconnu." }),
  root: z.strictObject({
    t: z.literal("section", { error: "La racine est une « section »." }),
    padX: oneOf(sectionPaddingX, "Padding horizontal"),
    padY: oneOf(sectionPaddingY, "Padding vertical"),
    children: z.array(nodeSchema(1), { error: "Enfants : une liste est requise." }).min(1, "Au moins un enfant.").max(12, "Au plus 12 enfants."),
  }),
})

/** Un nœud validé : les feuilles et les conteneurs. */
export type GeneratedNode =
  | { t: "stack"; gap: (typeof stackGaps)[number]; align: (typeof aligns)[number]; children: GeneratedNode[] }
  | { t: "columns"; ratio: keyof typeof columnRatios; gap: (typeof columnGaps)[number]; align: (typeof columnAligns)[number]; children: GeneratedNode[] }
  | { t: "card"; fill: (typeof cardFills)[number]; radius: (typeof radii)[number]; pad: (typeof cardPaddings)[number]; overlap: (typeof overlaps)[number]; children: GeneratedNode[] }
  | { t: "image"; slot: string; format: keyof typeof import("../../email/image-bank").emailImageFormats; radius: (typeof radii)[number]; align: (typeof aligns)[number] }
  | { t: "text"; slot: string; style: (typeof textStyles)[number]; align: (typeof aligns)[number]; tone: (typeof textTones)[number] }
  | { t: "button"; slot: string; variant: (typeof buttonVariants)[number]; arrow: boolean; align: (typeof aligns)[number] }
  | { t: "icon"; slot: string; frame: (typeof iconFrames)[number] }
  | { t: "divider" }
  | { t: "spacer"; size: (typeof spacerSizes)[number] }

export type GeneratedBlockSpec = {
  specVersion: typeof generatedSpecVersion
  role: (typeof referenceRoles)[number]
  root: { t: "section"; padX: (typeof sectionPaddingX)[number]; padY: (typeof sectionPaddingY)[number]; children: GeneratedNode[] }
}
