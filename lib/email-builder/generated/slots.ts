/**
 * Dérivation des SLOTS d'une spec : pure et déterministe. La spec ne dit pas « le
 * contenu est X » : elle déclare des emplacements (un texte, un bouton, une image,
 * une icône) que le futur bloc remplira, exactement comme les slots d'une lame
 * officielle. Les genres sont alignés sur ceux du manifest (`EmailSlotKind`) pour que
 * l'édition directe, l'assistant et le renderer puissent les réutiliser.
 *
 * Grammaire d'un nom : `[a-z][a-z0-9-]*`, 32 caractères au plus. Les noms sont UNIQUES
 * dans la spec (un slot partagé entre deux nœuds est refusé). Sont réservés aux lames
 * officielles : les valeurs de référence commerciales (`valeur-cle`, `code-promo-*`),
 * les éléments système (logo, réseaux, désabonnement, préférences) et les mentions
 * légales (`disclaimer*`). La règle des valeurs de référence est celle de
 * `slot-roles.ts`, partagée avec la protection de l'assistant : jamais recopiée.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailSystemElements } from "../../email/system"
import { isControlledSlotName, controlledSlotStems } from "../slot-roles"
import type { GeneratedBlockSpec, GeneratedNode } from "./schema"
import { slotNamePattern } from "./schema"
import { buttonMaxLength, generatedLimits, textMaxLength } from "./tokens"

/** Les genres du manifest que les primitives produisent. */
export type GeneratedSlotKind = "texte" | "cta" | "cta:fleche" | "asset:visuel" | "asset:icone"

export type GeneratedSlot = {
  name: string
  kind: GeneratedSlotKind
  /** Texte : court (une ligne : titre, étiquette) ou long (paragraphe), comme `slotEditor`. */
  editor?: "short" | "long"
  /** Longueur maximale du contenu futur (texte et bouton). */
  maxLength?: number
  /** Image : le format de la banque dont dépend son cadre. */
  format?: string
}

export type SlotNameProblem = "reserved" | "grammar"

/** Pourquoi un nom de slot est refusé (hors unicité), ou `null`. */
export function slotNameProblem(name: string): { problem: SlotNameProblem; message: string } | null {
  if (!slotNamePattern.test(name) || name.length > generatedLimits.maxSlotNameLength) return { problem: "grammar", message: `Slot « ${name.slice(0, 40)} » : minuscules, chiffres et tirets, ${generatedLimits.maxSlotNameLength} caractères au plus.` }
  const system = Object.keys(emailSystemElements).includes(name) || name.startsWith("social-") || name.startsWith("lien-desabonnement") || name.startsWith("lien-preferences")
  const controlled = isControlledSlotName(name) || controlledSlotStems.some((stem) => name.startsWith(stem))
  if (system || controlled || name.startsWith("disclaimer")) return { problem: "reserved", message: `Slot « ${name} » : nom réservé aux lames officielles (valeur de référence, élément système ou mention légale).` }
  return null
}

/** Les nœuds dans l'ordre du document (parcours en profondeur). */
export function walkNodes(spec: GeneratedBlockSpec): GeneratedNode[] {
  const out: GeneratedNode[] = []
  const visit = (node: GeneratedNode) => {
    out.push(node)
    if ("children" in node) node.children.forEach(visit)
  }
  spec.root.children.forEach(visit)
  return out
}

/** La définition déterministe des slots d'une spec, dans l'ordre du document. Ne vérifie pas l'unicité (voir `validateGeneratedBlockSpec`). */
export function deriveGeneratedSlots(spec: GeneratedBlockSpec): GeneratedSlot[] {
  return walkNodes(spec).flatMap((node): GeneratedSlot[] => {
    switch (node.t) {
      case "text":
        return [{ name: node.slot, kind: "texte", editor: node.style === "body" ? "long" : "short", maxLength: textMaxLength[node.style] }]
      case "button":
        return [{ name: node.slot, kind: node.arrow ? "cta:fleche" : "cta", maxLength: buttonMaxLength }]
      case "image":
        return [{ name: node.slot, kind: "asset:visuel", format: node.format }]
      case "icon":
        return [{ name: node.slot, kind: "asset:icone" }]
      default:
        return []
    }
  })
}
