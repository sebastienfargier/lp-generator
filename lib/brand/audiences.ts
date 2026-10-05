import { provenanceOf } from "./provenance"
import type { BrandProvenance } from "./types"

/**
 * Les cinq cibles du corpus (`03-adaptation-par-cible`, statut brouillon) avec
 * la guidance minimale utile à l'exécution. Les identifiants sont ceux du front
 * matter du document. La voix Studi reste constante ; seuls le ton et les
 * accroches s'adaptent. Le vouvoiement est la règle (`01`), le tutoiement ne
 * vaut que pour les alternants.
 *
 * Aucune cible n'est encore reliée au formulaire ni aux moteurs.
 */
export const brandAudienceIds = ["reconversion", "actifs_en_poste", "alternants", "b2b_rh", "demandeurs_emploi"] as const

export type BrandAudienceId = (typeof brandAudienceIds)[number]

export type BrandAudience = {
  id: BrandAudienceId
  label: string
  /** Vouvoiement par défaut ; tutoiement uniquement en alternance. */
  addressMode: "vouvoiement" | "tutoiement"
  /** Ton attendu, tel que le document le formule. */
  tone: string
  /** Points d'accroche, tels que le document les formule. */
  keyPoints: readonly string[]
  /** Sensibilité pertinente à l'exécution, quand le corpus en porte une. */
  sensitivity?: string
  provenance: BrandProvenance
}

const source = provenanceOf("adaptation-par-cible")

export const brandAudiences = {
  reconversion: {
    id: "reconversion",
    label: "Reconversion professionnelle",
    addressMode: "vouvoiement",
    tone: "Rassurant, structurant",
    keyPoints: ["Sécurité", "accompagnement", "clarté du parcours"],
    provenance: source,
  },
  actifs_en_poste: {
    id: "actifs_en_poste",
    label: "Actifs en poste",
    addressMode: "vouvoiement",
    tone: "Concret, pragmatique",
    keyPoints: ["Gain de compétences", "évolution", "compatibilité emploi"],
    provenance: source,
  },
  alternants: {
    id: "alternants",
    label: "Alternants",
    addressMode: "tutoiement",
    tone: "Dynamique, accessible",
    keyPoints: ["Insertion pro", "accompagnement", "rythme"],
    sensitivity: "Financement de l'alternance encadré (11-financement-alternance, en revue).",
    provenance: source,
  },
  b2b_rh: {
    id: "b2b_rh",
    label: "B2B / RH",
    addressMode: "vouvoiement",
    tone: "Institutionnel, expert",
    keyPoints: ["Données", "crédibilité", "structuration des parcours"],
    sensitivity: "Financement en appel d'offre encadré (12-financement-appel-offre, en revue).",
    provenance: source,
  },
  demandeurs_emploi: {
    id: "demandeurs_emploi",
    label: "Demandeurs d'emploi",
    addressMode: "vouvoiement",
    tone: "Empathique, bienveillant",
    keyPoints: ["Financement", "confiance", "accompagnement"],
    sensitivity: "Situation parfois fragile ; le financement France Travail (09-financement-france-travail, en revue) ne s'adresse qu'à cette cible.",
    provenance: source,
  },
} as const satisfies Record<BrandAudienceId, BrandAudience>

export function getBrandAudience(id: BrandAudienceId): BrandAudience {
  return brandAudiences[id]
}

export function isBrandAudienceId(value: unknown): value is BrandAudienceId {
  return typeof value === "string" && (brandAudienceIds as readonly string[]).includes(value)
}
