import { approvedProvenanceOf, scopeOf } from "./provenance"
import type { ApprovedProvenance } from "./types"

/**
 * Claims approuvées : uniquement les valeurs de `15-chiffres-cles`, le seul
 * document de données au statut `approuve` (« Chiffres clés descriptifs
 * (2026) », owner : direction marketing). Les formulations sont celles du
 * document, au caractère près : aucune n'est paraphrasée.
 *
 * Les chiffres des documents `en_revue` (Audirep, salaires, tarifs…) et les
 * valeurs de test des anciens smokes (« Plus de 300 formations »…) n'y sont
 * pas : ce ne sont pas des claims approuvées. `approvedProvenanceOf` refuse
 * tout document qui n'est pas approuvé.
 *
 * Le document précise que toute modification (chiffres, positionnement, noms
 * de partenaires) doit être validée par la direction marketing avant diffusion :
 * on reprend donc la phrase telle quelle, on ne la transforme pas.
 */

export type BrandClaim = {
  id: string
  /** Formulation exacte du document. */
  statement: string
  provenance: ApprovedProvenance
  channels: readonly string[]
  audiences: readonly string[]
  /** Identifiant de disclaimer, seulement quand la claim en exige un (aucune des claims approuvées actuelles). */
  disclaimerId?: string
  /** La claim ne peut pas être publiée sans validation humaine préalable. */
  requiresHumanApproval: boolean
  /** Précaution propre à la claim. */
  note?: string
}

const provenance = approvedProvenanceOf("chiffres-cles")
const scope = scopeOf("chiffres-cles")

const claim = (id: string, statement: string, note?: string): BrandClaim => ({
  id,
  statement,
  provenance,
  channels: scope.channels,
  audiences: scope.audiences,
  requiresHumanApproval: false,
  ...(note ? { note } : {}),
})

export const approvedClaims = [
  claim("apprenants-en-formation", "59 000 apprenants en cours de formation"),
  claim("catalogue-formations", "Plus de 400 formations, du CAP au Bac+5, dans 18 filières"),
  claim("formateurs-conseillers", "Près de 1 000 formateurs et conseillers pédagogiques (dont 700 formateurs)"),
  claim("formations-alternance", "Plus de 130 formations en alternance"),
  claim(
    "partenaires-academiques",
    "Partenaires académiques : ESG, Hetic, Elije, Digital Campus, LISAA, Naratiiv, Cours Florent...",
    "Noms de partenaires : toute modification doit être validée par la direction marketing."
  ),
  claim(
    "financement-dispositifs",
    "Financement : CPF, France Travail, alternance, entreprise, paiement jusqu'à 36 mois",
    "Touche au financement : les règles 07 à 12 (en revue) s'appliquent à toute formulation dérivée."
  ),
] as const satisfies readonly BrandClaim[]

export type ApprovedClaimId = (typeof approvedClaims)[number]["id"]

export const approvedClaimIds = approvedClaims.map((entry) => entry.id) as ApprovedClaimId[]

export function getApprovedClaim(id: string): BrandClaim | undefined {
  return approvedClaims.find((entry) => entry.id === id)
}
