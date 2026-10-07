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
import type { AddAction, CompositionCatalog, CompositionLimits, DomainCompositionPlan, GeneratedAddAction } from "./composition"
import type { NormalizedSection } from "./reference-mapping"
import { referenceLimits } from "./reference-file"

export const referenceShell = { header: "email-module-header-newsletter", footer: "email-module-footer-compact-legal" } as const

/** Plafond d'ajouts d'une référence : les sections de corps et l'enveloppe. Le défaut du moteur (l'assistant) reste 5. */
export const referenceCompositionLimits: Partial<CompositionLimits> = { add: referenceLimits.maxSections + 2 }

export const placedSections = (sections: readonly NormalizedSection[]) => sections.filter((section) => section.status !== "unmatched" && section.blockType)

/** Une lame générée à poser à la place d'une section : sa spec et son contenu (déjà validés par `reference-generated-build.ts`). */
export type ReferenceGeneratedPlacement = { spec: unknown; slots: Record<string, unknown> }

/**
 * Le plan d'une référence. Les lames générées (`generated`, par `ref` de section) REMPLACENT la lame officielle de leur
 * section : jamais les deux. Le moteur de composition traite d'abord tous les ajouts officiels, puis les générés ; les
 * ancres sont donc choisies pour que l'ORDRE DE LECTURE soit respecté :
 * - une lame officielle s'ancre sur la lame OFFICIELLE précédente (jamais sur une générée, pas encore posée) ;
 * - une lame générée s'ancre sur la lame qui la précède dans l'ordre de lecture, officielle (déjà posée) ou générée
 *   déclarée plus tôt, donc juste après elle, avant l'officielle suivante.
 * Sans lame générée, le plan est exactement celui de V2.8.
 */
export function buildReferencePlan(sections: readonly NormalizedSection[], catalog: CompositionCatalog, generated: ReadonlyMap<string, ReferenceGeneratedPlacement> = new Map()): DomainCompositionPlan {
  const add: AddAction[] = []
  const addGenerated: GeneratedAddAction[] = []
  const hasHeader = Object.hasOwn(catalog, referenceShell.header)
  if (hasHeader) add.push({ ref: "shell-header", blockType: referenceShell.header, placement: { where: "first", anchor: "" }, content: [] })
  let previousOfficial = hasHeader ? "shell-header" : ""
  let previousAny = previousOfficial
  let officials = 0
  for (const section of sections) {
    const replacement = generated.get(section.ref)
    if (replacement) {
      const ref = `g${addGenerated.length + 1}`
      addGenerated.push({ ref, spec: replacement.spec, slots: replacement.slots, placement: previousAny === "" ? { where: "first", anchor: "" } : { where: "after", anchor: previousAny } })
      previousAny = ref
      continue
    }
    if (section.status === "unmatched" || !section.blockType) continue
    officials += 1
    const ref = `b${officials}`
    add.push({
      ref,
      blockType: section.blockType,
      placement: previousOfficial === "" ? { where: "first", anchor: "" } : { where: "after", anchor: previousOfficial },
      content: section.content,
      ...(section.images.length > 0 ? { images: section.images } : {}),
    })
    previousOfficial = ref
    previousAny = ref
  }
  if (Object.hasOwn(catalog, referenceShell.footer)) add.push({ ref: "shell-footer", blockType: referenceShell.footer, placement: { where: "last", anchor: "" }, content: [] })
  return { content: [], add, move: [], remove: [], ...(addGenerated.length > 0 ? { addGenerated } : {}) }
}
