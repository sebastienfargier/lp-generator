/**
 * Les NOMS de slots qui portent une valeur de référence commerciale (valeur clé,
 * code promotionnel). Un seul endroit, partagé : la protection par rôle de
 * l'assistant (`slotProtection`, V2.5.2) et le vocabulaire des lames générées
 * (qui n'ont pas le droit de déclarer un tel slot) lisent la même règle.
 *
 * Pur. Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */

/** Racines des noms contrôlés : tout nom qui commence par l'une d'elles est réservé aux lames officielles. */
export const controlledSlotStems = ["valeur-cle", "code-promo"] as const

/** Le slot d'une lame officielle qui porte une valeur de référence : `valeur-cle`, `code-promo-1`… */
export const isControlledSlotName = (slot: string): boolean => /^(valeur-cle|code-promo-\d+)$/.test(slot)
