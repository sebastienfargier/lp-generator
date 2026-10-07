/**
 * Mapping normalisé → `CompositionPlan`, de façon DÉTERMINISTE : le modèle n'a
 * choisi ni place, ni ancre, ni opération. L'ordre est celui des sections de la
 * référence.
 *
 * - l'enveloppe Studi (en-tête et footer) est posée par le système : l'en-tête en
 *   premier, le footer à la fin du corps (une section d'en-tête ou de pied de page
 *   de la référence n'est jamais comptée une seconde fois : elle n'est pas
 *   analysée) ;
 * - chaque section `matched` ou `approximate` devient une lame ajoutée, juste
 *   après la précédente ; une section `unmatched` n'est pas ajoutée ;
 * - mentions légales : jamais inventées ici.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { AddAction, CompositionCatalog, CompositionLimits, CompositionPlan } from "./composition"
import type { NormalizedSection } from "./reference-mapping"
import { referenceLimits } from "./reference-file"

export const referenceShell = { header: "email-module-header-newsletter", footer: "email-module-footer-compact-legal" } as const

/** Plafond d'ajouts d'une référence : les sections de corps et l'enveloppe. Le défaut du moteur (l'assistant) reste 5. */
export const referenceCompositionLimits: Partial<CompositionLimits> = { add: referenceLimits.maxSections + 2 }

export const placedSections = (sections: readonly NormalizedSection[]) => sections.filter((section) => section.status !== "unmatched" && section.blockType)

export function buildReferencePlan(sections: readonly NormalizedSection[], catalog: CompositionCatalog): CompositionPlan {
  const add: AddAction[] = []
  const hasHeader = Object.hasOwn(catalog, referenceShell.header)
  if (hasHeader) add.push({ ref: "shell-header", blockType: referenceShell.header, placement: { where: "first", anchor: "" }, content: [] })
  let previous = hasHeader ? "shell-header" : ""
  for (const [index, section] of placedSections(sections).entries()) {
    const ref = `b${index + 1}`
    add.push({
      ref,
      blockType: section.blockType!,
      placement: previous === "" ? { where: "first", anchor: "" } : { where: "after", anchor: previous },
      content: section.content,
      ...(section.images.length > 0 ? { images: section.images } : {}),
    })
    previous = ref
  }
  if (Object.hasOwn(catalog, referenceShell.footer)) add.push({ ref: "shell-footer", blockType: referenceShell.footer, placement: { where: "last", anchor: "" }, content: [] })
  return { content: [], add, move: [], remove: [] }
}
