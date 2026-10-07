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

export type ReferenceReportLine = { status: "approximate" | "unmatched" | "generated"; text: string }

/**
 * Ce qu'est devenue une section dont une lame GÉNÉRÉE a été envisagée (V2.9.4b) : `generated` (elle remplace
 * l'approximation ou comble le vide), `failed` (tentée, non retenue : on garde l'officielle ou on reste sans équivalent),
 * `limit` (candidate, non tentée : au plus 3 lames générées par email). Une section absente n'a pas été concernée.
 */
export type ReferenceSectionOutcome = "generated" | "failed" | "limit"

export type ReferenceGenerationOutcome = {
  sections: ReadonlyMap<string, ReferenceSectionOutcome>
  /** Le second appel n'a rien donné d'utilisable (échec du moteur, réponse inexploitable, plan non assemblable) : le résultat officiel est celui de V2.8. */
  unavailable: boolean
  /** Une lame générée retenue utilise un effet dont le rendu peut varier selon le client (chevauchement). */
  degraded: boolean
  /** Une lame générée retenue porte un bouton (destination par défaut du système). */
  buttons: boolean
}

/** Le volet « structures sur mesure » du rapport : présent seulement si une lame générée a été envisagée. */
export type ReferenceGenerationReport = { generated: number; failed: number; notAttempted: number; unavailable: boolean; degraded: boolean; buttons: boolean }
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
  /** Absent d'un rapport V2.8 : aucune lame générée n'a été envisagée. Les comptes ci-dessus ne contiennent plus les sections remplacées. */
  generation?: ReferenceGenerationReport
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

const generatedNotes: Record<Exclude<ReferenceSectionOutcome, "generated">, string> = {
  failed: "Une structure sur mesure a été tentée mais n'a pas été retenue.",
  limit: "Une structure sur mesure n'a pas été tentée : au plus 3 lames sur mesure par email.",
}

export function buildReferenceReport(reference: NormalizedReference, catalog: CompositionCatalog, generation?: ReferenceGenerationOutcome): ReferenceReport {
  const outcome = (section: NormalizedSection) => generation?.sections.get(section.ref)
  // Une section remplacée par une lame générée n'est ni « approchée » ni « sans équivalent » : elle est reproduite sur mesure.
  const count = (status: NormalizedSection["status"]) => reference.sections.filter((section) => section.status === status && outcome(section) !== "generated").length
  const note = (section: NormalizedSection) => {
    const value = outcome(section)
    return value === "failed" || value === "limit" ? ` ${generatedNotes[value]}` : ""
  }
  const lines = reference.sections.flatMap((section): ReferenceReportLine[] =>
    outcome(section) === "generated"
      ? [{ status: "generated", text: `${describeSection(section)} → reproduite avec une structure sur mesure.` }]
      : section.status === "approximate"
        ? [{ status: "approximate", text: `${describeSection(section)} → approchée avec « ${catalog[section.blockType!]?.name ?? section.blockType} ». ${sentence(section.reason)}${note(section)}` }]
        : section.status === "unmatched"
          ? [{ status: "unmatched", text: `${describeSection(section)} → aucun équivalent. ${sentence(section.reason)}${note(section)}` }]
          : [],
  )
  const outcomes = [...(generation?.sections.values() ?? [])]
  return { sections: reference.sections.length, matched: count("matched"), approximate: count("approximate"), unmatched: count("unmatched"), lines,
    sensitive: reference.sensitive,
    dropped: reference.dropped,
    promotional: reference.sections.some((section) => section.analysis.role === "offer"),
    promotionalReproduced: reference.sections.some((section) => section.analysis.role === "offer" && section.status !== "unmatched"),
    pendingValues: [...new Set(reference.sections.flatMap((section) => (outcome(section) !== "generated" && section.status !== "unmatched" && section.blockType && controlledSlotsOf(section.blockType).length > 0 ? [catalog[section.blockType]?.name ?? section.blockType] : [])))],
    ...(generation
      ? { generation: { generated: outcomes.filter((value) => value === "generated").length, failed: outcomes.filter((value) => value === "failed").length, notAttempted: outcomes.filter((value) => value === "limit").length, unavailable: generation.unavailable, degraded: generation.degraded, buttons: generation.buttons } }
      : {}),
  }
}

/** Le résumé gardé dans le document : des comptes, et de quoi décrire les sections sans équivalent. */
export function referenceProvenance(reference: NormalizedReference, generation?: ReferenceGenerationOutcome): ReferenceProvenance {
  const replaced = (section: NormalizedSection) => generation?.sections.get(section.ref) === "generated"
  const generated = reference.sections.filter(replaced).length
  return {
    sections: reference.sections.length,
    matched: reference.sections.filter((section) => section.status === "matched").length,
    approximate: reference.sections.filter((section) => section.status === "approximate" && !replaced(section)).length,
    unmatched: reference.sections
      .filter((section) => section.status === "unmatched" && !replaced(section))
      .map(({ analysis }) => ({ role: analysis.role, layout: analysis.layout, intent: analysis.intent.slice(0, 160), hasImage: analysis.hasImage, repeatedItems: analysis.repeatedItems, hasCta: analysis.hasCta })),
    // Seulement le NOMBRE : la spec et le contenu vivent dans les lames du document, jamais dans la provenance. Absent sans lame générée (document V2.8 identique).
    ...(generated > 0 ? { generated } : {}),
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/** Le premier message du nouveau workspace : une explication, pas une proposition. */
export function referenceReportMessage(report: ReferenceReport): string {
  const reproduced = report.matched
  const custom = report.generation && report.generation.generated > 0 ? `, ${plural(report.generation.generated, "reproduite avec une structure sur mesure", "reproduites avec une structure sur mesure")}` : ""
  const head = `J'ai analysé ${plural(report.sections, "section", "sections")} : ${plural(reproduced, "reproduite", "reproduites")}, ${plural(report.approximate, "approchée", "approchées")}${custom}, ${report.unmatched} sans équivalent dans la bibliothèque.`
  const mark = { approximate: "≈", unmatched: "?", generated: "+" } as const
  const parts = [head, ...report.lines.map((line) => `${mark[line.status]} ${line.text}`)]
  if (report.sensitive.length > 0) parts.push(`La référence contenait ${report.sensitive.map((kind) => sensitiveLabels[kind]).join(", ")} : cela n'a pas été repris comme un fait Studi.`)
  if (report.promotional) {
    parts.push(
      report.promotionalReproduced
        ? "Une offre promotionnelle a été reconnue : sa structure est reproduite, mais ses valeurs commerciales (remise, prix, code, échéance) n'ont pas été reprises."
        : "Une offre promotionnelle a été reconnue, mais aucune lame ne la reproduit : ses valeurs commerciales ne sont pas reprises.",
    )
  }
  if (report.pendingValues.length > 0) parts.push(`Des valeurs restent « à définir » (${report.pendingValues.map((name) => `« ${name} »`).join(", ")}) : renseigne-les avec tes vraies données.`)
  const custom2 = report.generation
  if (custom2?.unavailable) parts.push("Certaines structures sur mesure n'ont pas pu être générées.")
  if (custom2 && custom2.generated > 0 && custom2.degraded) parts.push("Certains effets visuels peuvent être simplifiés selon le client email.")
  if (custom2 && custom2.generated > 0 && custom2.buttons) parts.push("Les boutons des structures sur mesure utilisent le catalogue Studi comme destination par défaut.")
  parts.push("L'en-tête et le pied de page Studi ont été ajoutés. Les textes sont provisoires : relis-les avant de t'en servir.")
  return parts.join("\n")
}

export const placedCount = (reference: NormalizedReference) => placedSections(reference.sections).length
