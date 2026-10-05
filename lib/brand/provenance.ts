import type { ApprovedProvenance, BrandProvenance, BrandStatus } from "./types"

/**
 * Registre des vingt documents de `ressources/brand/guidelines/`, tel que leur
 * front matter le déclare. Le statut n'est jamais promu : un document `en_revue`
 * ou `brouillon` reste tel quel, et toute donnée qui en vient le porte avec elle.
 *
 * Les quatre documents de `ressources/brand/generation/` n'ont pas de front
 * matter (ni statut, ni owner) : ils ne sont pas des sources de données ici.
 *
 * Un test relit les fichiers Markdown et vérifie que ce registre ne diverge pas.
 */

type Entry = {
  file: string
  status: BrandStatus
  owner?: string
  legalScope: boolean
  channels: readonly string[]
  audiences: readonly string[]
}

const reviewed = "2026-10-02"
const all = ["tous"] as const

const entries = {
  "identite-marque": { file: "01-identite-marque", status: "draft", legalScope: false, channels: all, audiences: all },
  "promesse-editoriale": { file: "02-promesse-editoriale", status: "in-review", legalScope: true, channels: all, audiences: all },
  "adaptation-par-cible": {
    file: "03-adaptation-par-cible",
    status: "draft",
    legalScope: false,
    channels: all,
    audiences: ["reconversion", "actifs_en_poste", "alternants", "b2b_rh", "demandeurs_emploi"],
  },
  "lexique-marque": { file: "04-lexique-marque", status: "in-review", legalScope: true, channels: all, audiences: all },
  "regles-editoriales": { file: "05-regles-editoriales", status: "draft", legalScope: false, channels: ["LP", "ads", "CRM", "social", "SEO"], audiences: all },
  "diplomes-certifications": { file: "06-diplomes-certifications", status: "in-review", owner: "Aurélie Lasselin", legalScope: true, channels: all, audiences: all },
  "financement-general": { file: "07-financement-general", status: "in-review", owner: "Aurélie Lasselin", legalScope: true, channels: all, audiences: all },
  "financement-cpf": { file: "08-financement-cpf", status: "in-review", owner: "Aurélie Lasselin", legalScope: true, channels: all, audiences: all },
  "financement-france-travail": { file: "09-financement-france-travail", status: "in-review", legalScope: true, channels: all, audiences: ["demandeurs_emploi"] },
  "financement-personnel": { file: "10-financement-personnel", status: "in-review", legalScope: true, channels: ["LP", "ads"], audiences: all },
  "financement-alternance": { file: "11-financement-alternance", status: "in-review", legalScope: true, channels: all, audiences: ["alternants"] },
  "financement-appel-offre": { file: "12-financement-appel-offre", status: "in-review", legalScope: true, channels: ["B2B"], audiences: ["entreprises_opco"] },
  logos: { file: "13-logos", status: "in-review", owner: "Aurélie Lasselin", legalScope: true, channels: all, audiences: all },
  accompagnement: { file: "14-accompagnement", status: "draft", legalScope: false, channels: all, audiences: all },
  "chiffres-cles": { file: "15-chiffres-cles", status: "approved", owner: "direction marketing", legalScope: true, channels: all, audiences: all },
  "chiffres-performance": { file: "16-chiffres-performance", status: "in-review", legalScope: true, channels: all, audiences: all },
  salaires: { file: "17-salaires", status: "in-review", legalScope: true, channels: all, audiences: all },
  "offres-bourses": {
    file: "18-offres-bourses",
    status: "in-review",
    owner: "Anaig EPIE (acquisition) / Olivia Matmuller (CRM)",
    legalScope: true,
    channels: ["acquisition", "CRM"],
    audiences: all,
  },
  "disclaimers-recap": { file: "19-disclaimers-recap", status: "approved", owner: "dérivé automatiquement (voir note)", legalScope: true, channels: all, audiences: all },
  "legal-decret-influence": { file: "20-legal-decret-influence", status: "approved", owner: "juridique", legalScope: true, channels: ["social"], audiences: all },
} as const satisfies Record<string, Entry>

export type BrandDocumentId = keyof typeof entries

export const brandDocumentIds = Object.keys(entries) as BrandDocumentId[]

/** Provenance complète d'un document du corpus. */
export function provenanceOf(documentId: BrandDocumentId): BrandProvenance {
  const entry: Entry = entries[documentId]
  return {
    documentId,
    path: `ressources/brand/guidelines/${entry.file}.md`,
    status: entry.status,
    ...(entry.owner ? { owner: entry.owner } : {}),
    lastReview: reviewed,
    legalScope: entry.legalScope,
  }
}

/** Canaux et audiences déclarés par le document (« tous » quand il ne restreint rien). */
export function scopeOf(documentId: BrandDocumentId): { channels: readonly string[]; audiences: readonly string[] } {
  const entry: Entry = entries[documentId]
  return { channels: entry.channels, audiences: entry.audiences }
}

export function isApproved(provenance: BrandProvenance): provenance is ApprovedProvenance {
  return provenance.status === "approved"
}

/**
 * Provenance d'un document approuvé, ou une erreur : c'est la seule porte par
 * laquelle une donnée peut devenir une « claim approuvée ». Un document
 * `en_revue` ou `brouillon` ne passe pas.
 */
export function approvedProvenanceOf(documentId: BrandDocumentId): ApprovedProvenance {
  const provenance = provenanceOf(documentId)
  if (!isApproved(provenance)) {
    throw new Error(`« ${documentId} » est ${provenance.status} : il ne peut pas fonder une donnée approuvée.`)
  }
  return provenance
}
