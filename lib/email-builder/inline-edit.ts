/**
 * Édition directe du contenu : règles pures, sans interface. Quel éditeur pour
 * quel slot, comment un brouillon devient une VALEUR de slot, et quand une
 * modification ne change rien.
 *
 * Le design system contrôle la forme, la personne contrôle le contenu : un
 * brouillon n'est jamais que du texte (et, pour un bouton, un lien). Ni police,
 * ni taille, ni couleur, ni HTML : la valeur produite est celle du contrat
 * EmailConfig (`{ text }`, `{ label, href }`), appliquée par l'opération
 * `set-slot`. Le brouillon vit dans le composant d'édition ; le document n'est
 * modifié qu'à la validation.
 *
 * Retours à la ligne : le contrat d'un slot texte est du texte brut que le
 * renderer échappe dans un paragraphe ; un retour à la ligne y est un simple
 * espace, jamais une rupture de ligne. Aucun slot ne le porte : les brouillons
 * sont normalisés sur une ligne, et Entrée valide.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailBlockManifest, type EmailSlotKind } from "../email/manifest"
import type { EmailBlockType } from "../email/types"

/** `short` : titre ou libellé (un champ) ; `long` : paragraphe (zone de texte) ; `cta` : bouton ou lien (libellé + destination) ; `image` : visuel de la banque. */
export type SlotEditor = "short" | "long" | "cta" | "image"

/** Slots texte COURTS, d'après leur nom dans le manifeste ; tout autre slot texte est un paragraphe. */
const shortText = /^(?:sur-titre|sous-titre|titre-[a-z]+(?:-\d)?|valeur-cle|label(?:-\d)?|code-promo-\d|compteur-\d|temoignage-auteur|partenaire|texte-separation|item-\d-titre|produit-\d-titre)$/

const kindOf = (blockType: EmailBlockType, slot: string): EmailSlotKind | undefined => (emailBlockManifest[blockType].slots as Record<string, EmailSlotKind>)[slot]

/**
 * L'éditeur d'un slot, ou `null` s'il ne s'édite pas en direct : les icônes
 * (catalogue fermé) et les mentions légales (texte du catalogue) ne sont pas du
 * contenu libre.
 */
export function slotEditor(blockType: EmailBlockType, slot: string): SlotEditor | null {
  switch (kindOf(blockType, slot)) {
    case "texte":
      return shortText.test(slot) ? "short" : "long"
    case "cta":
    case "cta:fleche":
    case "lien":
      return "cta"
    case "asset:visuel":
      return "image"
    default:
      return null
  }
}

/** Brouillon d'édition : du texte, rien d'autre. */
export type SlotDraft = { text: string } | { label: string; href: string }

/** Un retour à la ligne devient un espace ; les bords sont rognés. */
export const normalizeTextDraft = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim()

/** Valeur de slot (contrat EmailConfig) d'un brouillon ; le renderer échappe le texte, aucune balise n'est interprétée. */
export function slotValueFromDraft(draft: SlotDraft): { text: string } | { label: string; href: string } {
  return "text" in draft ? { text: normalizeTextDraft(draft.text) } : { label: normalizeTextDraft(draft.label), href: draft.href.trim() }
}

/** Même valeur : la validation ne crée alors ni opération ni entrée d'historique. */
export const sameSlotValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Le brouillon de départ d'un slot, d'après sa valeur actuelle. */
export function initialDraft(editor: Exclude<SlotEditor, "image">, current: unknown): SlotDraft {
  const value = (current ?? {}) as { text?: string; label?: string; href?: string }
  return editor === "cta" ? { label: value.label ?? "", href: value.href ?? "" } : { text: value.text ?? "" }
}
