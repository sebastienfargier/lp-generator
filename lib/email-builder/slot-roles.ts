/**
 * Les NOMS de slots qui portent une valeur de référence commerciale (valeur clé,
 * code promotionnel). Un seul endroit, partagé : la protection par rôle de
 * l'assistant (`slotProtection`, V2.5.2) et le vocabulaire des lames générées
 * (qui n'ont pas le droit de déclarer un tel slot) lisent la même règle.
 *
 * Pur. Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */

import { emailBlockManifest } from "../email/manifest"
import type { EmailBlockType } from "../email/types"

/** Racines des noms contrôlés : tout nom qui commence par l'une d'elles est réservé aux lames officielles. */
export const controlledSlotStems = ["valeur-cle", "code-promo"] as const

/** Le slot d'une lame officielle qui porte une valeur de référence : `valeur-cle`, `code-promo-1`… */
export const isControlledSlotName = (slot: string): boolean => /^(valeur-cle|code-promo-\d+)$/.test(slot)

export type SlotProtection = "valeur de référence" | "mention légale" | "système"

/**
 * Le RÔLE d'un slot décide s'il est contrôlé, jamais sa valeur actuelle : une
 * valeur modifiée à la main reste contrôlée, un texte libre égal par hasard à un
 * fait reste éditable. Source : le manifest (famille de la lame, type du slot) et
 * le vocabulaire de slots du domaine pour les valeurs de référence (`valeur-cle`,
 * `code-promo-N`, que le resolver et la validation des promotions nomment ainsi).
 * `undefined` : slot éditorial, que l'assistant peut viser s'il porte du texte ou
 * une image. Lames OFFICIELLES seulement : une lame générée ne peut pas déclarer de slot
 * contrôlé (`generated/slots.ts` réserve ces noms), elle n'a donc rien à protéger.
 */
export function slotProtection(blockType: EmailBlockType, slot: string): SlotProtection | undefined {
  const { family, slots } = emailBlockManifest[blockType] as { family: string; slots: Record<string, string> }
  if (slots[slot] === "disclaimer") return "mention légale"
  if (isControlledSlotName(slot)) return "valeur de référence"
  // Les en-têtes et pieds de page (date de fin, liens de navigation, désabonnement) appartiennent au système.
  if (family === "Header" || family === "Footer") return "système"
  // Un lien texte (« Voir le Parcours Découverte ») est un lien système, pas du contenu à réécrire : seuls les boutons.
  if (slots[slot] === "lien") return "système"
  return undefined
}
