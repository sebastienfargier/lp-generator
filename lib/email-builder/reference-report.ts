/**
 * Compte rendu d'une création depuis une référence : informatif, pur, sans
 * score de fidélité. Il dit ce qui a été reproduit, approché, laissé sans
 * équivalent, et que les faits commerciaux de la référence n'ont pas été repris.
 * Il alimente aussi le résumé de provenance (compact : rôle, disposition,
 * intention des seules sections sans équivalent).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { ReferenceProvenance } from "./document"
import { controlledSlotsOf } from "./reference-catalog"
import type { CompositionCatalog } from "./composition"
import type { NormalizedReference, NormalizedSection } from "./reference-mapping"
import { placedSections } from "./reference-plan"
import type { ReferenceSensitiveKind } from "./reference-schema"

export type ReferenceReportLine = { status: "approximate" | "unmatched"; text: string }
export type ReferenceReport = {
  sections: number
  matched: number
  approximate: number
  unmatched: number
  lines: ReferenceReportLine[]
  sensitive: ReferenceSensitiveKind[]
  /** Textes ou images écartés par le système (fait commercial, champ ou image invalides). */
  dropped: number
  /**
   * La RÉFÉRENCE contient une offre : au moins une section d'analyse de rôle `offer`. La vérité vient de
   * l'analyse, jamais du type de lame choisi (une lame « promotionnelle » peut servir un chiffre clé).
   */
  promotional: boolean
  /** Une section d'offre a été reproduite par une lame (sinon l'offre est seulement signalée). */
  promotionalReproduced: boolean
  /** Noms des lames utilisées dont des valeurs contrôlées restent « à définir » (offre ou non). */
  pendingValues: string[]
}

const sensitiveLabels: Record<ReferenceSensitiveKind, string> = {
  price: "un prix",
  percentage: "un pourcentage ou une remise",
  date: "une date",
  guarantee: "une garantie ou une certification",
  "quantified-proof": "une preuve chiffrée",
  "promo-code": "un code promotionnel",
  partner: "un partenaire",
}

const roleLabels: Record<string, string> = { hero: "Ouverture", text: "Texte", "feature-list": "Liste", benefits: "Bénéfices", proof: "Preuve", testimonial: "Témoignage", offer: "Offre", cta: "Appel à l'action", products: "Produits", divider: "Séparateur", other: "Section" }
const layoutLabels: Record<string, string> = {
  "image-top": "visuel en haut",
  "image-left": "visuel à gauche",
  "image-right": "visuel à droite",
  "image-background": "visuel en fond",
  "columns-2": "2 colonnes",
  "columns-3": "3 colonnes",
  "columns-4": "4 colonnes",
  list: "liste",
  "single-column": "une colonne",
  cards: "cartes",
  banner: "bandeau",
  other: "mise en page particulière",
}

/** Une section décrite sans la recopier : son rôle et sa disposition, jamais une phrase coupée. */
const describeSection = (section: NormalizedSection) => `${roleLabels[section.analysis.role] ?? "Section"} (${layoutLabels[section.analysis.layout] ?? "mise en page particulière"})`

/** Une raison complète (le schéma la limite à 160 caractères) : ni coupée, ni sans ponctuation. */
const sentence = (value: string) => (/[.!?…]$/.test(value) ? value : `${value}.`)

export function buildReferenceReport(reference: NormalizedReference, catalog: CompositionCatalog): ReferenceReport {
  const count = (status: NormalizedSection["status"]) => reference.sections.filter((section) => section.status === status).length
  const lines = reference.sections.flatMap((section): ReferenceReportLine[] =>
    section.status === "approximate"
      ? [{ status: "approximate", text: `${describeSection(section)} → approchée avec « ${catalog[section.blockType!]?.name ?? section.blockType} ». ${sentence(section.reason)}` }]
      : section.status === "unmatched"
        ? [{ status: "unmatched", text: `${describeSection(section)} → aucun équivalent. ${sentence(section.reason)}` }]
        : [],
  )
  return { sections: reference.sections.length, matched: count("matched"), approximate: count("approximate"), unmatched: count("unmatched"), lines,
    sensitive: reference.sensitive,
    dropped: reference.dropped,
    promotional: reference.sections.some((section) => section.analysis.role === "offer"),
    promotionalReproduced: reference.sections.some((section) => section.analysis.role === "offer" && section.status !== "unmatched"),
    pendingValues: [...new Set(reference.sections.flatMap((section) => (section.status !== "unmatched" && section.blockType && controlledSlotsOf(section.blockType).length > 0 ? [catalog[section.blockType]?.name ?? section.blockType] : [])))],
  }
}

/** Le résumé gardé dans le document : des comptes, et de quoi décrire les sections sans équivalent. */
export function referenceProvenance(reference: NormalizedReference): ReferenceProvenance {
  return {
    sections: reference.sections.length,
    matched: reference.sections.filter((section) => section.status === "matched").length,
    approximate: reference.sections.filter((section) => section.status === "approximate").length,
    unmatched: reference.sections
      .filter((section) => section.status === "unmatched")
      .map(({ analysis }) => ({ role: analysis.role, layout: analysis.layout, intent: analysis.intent.slice(0, 160), hasImage: analysis.hasImage, repeatedItems: analysis.repeatedItems, hasCta: analysis.hasCta })),
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** Le premier message du nouveau workspace : une explication, pas une proposition. */
export function referenceReportMessage(report: ReferenceReport): string {
  const reproduced = report.matched
  const head = `J'ai analysé ${plural(report.sections, "section", "sections")} : ${plural(reproduced, "reproduite", "reproduites")}, ${plural(report.approximate, "approchée", "approchées")}, ${report.unmatched} sans équivalent dans la bibliothèque.`
  const parts = [head, ...report.lines.map((line) => `${line.status === "approximate" ? "≈" : "?"} ${line.text}`)]
  if (report.sensitive.length > 0) parts.push(`La référence contenait ${report.sensitive.map((kind) => sensitiveLabels[kind]).join(", ")} : cela n'a pas été repris comme un fait Studi.`)
  if (report.promotional) {
    parts.push(
      report.promotionalReproduced
        ? "Une offre promotionnelle a été reconnue : sa structure est reproduite, mais ses valeurs commerciales (remise, prix, code, échéance) n'ont pas été reprises."
        : "Une offre promotionnelle a été reconnue, mais aucune lame ne la reproduit : ses valeurs commerciales ne sont pas reprises.",
    )
  }
  if (report.pendingValues.length > 0) parts.push(`Des valeurs restent « à définir » (${report.pendingValues.map((name) => `« ${name} »`).join(", ")}) : renseigne-les avec tes vraies données.`)
  parts.push("L'en-tête et le pied de page Studi ont été ajoutés. Les textes sont provisoires : relis-les avant de t'en servir.")
  return parts.join("\n")
}

export const placedCount = (reference: NormalizedReference) => placedSections(reference.sections).length
