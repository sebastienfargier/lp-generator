/**
 * Catalogue fermé des disclaimers obligatoires : `guidelines-communication.md`,
 * chapitre 12, textes recopiés au caractère près. Une config choisit un
 * identifiant, jamais un texte ; le renderer écrit `*` suivi de `text`.
 * Une même lame ne peut pas porter deux fois le même disclaimer (règle du
 * futur schéma).
 *
 * Seule substitution autorisée : `JJ/MM/AAAA` dans l'offre promotionnelle,
 * remplacé par `endDate` au format JJ/MM/AAAA.
 */

type EmailDisclaimerEntry = {
  /** Intitulé du cas dans les guidelines. */
  label: string
  text: string
  /** Paramètre obligatoire de la sélection. */
  parameter?: "endDate"
}

export const emailDisclaimers = {
  "financement-100-general": {
    label: "Financement jusqu'à 100% (général)",
    text: "Vérifiez votre éligibilité à un financement avec un conseiller formation. La prise en charge à 100 % n'est pas automatique et dépend de votre situation professionnelle.",
  },
  "financement-cpf-100": {
    label: "Financement CPF jusqu'à 100%",
    text: "Sous réserve d'un crédit suffisant de vos droits formation CPF et d'un cas d'exonération d'une participation financière.",
  },
  "financement-appel-offre": {
    label: "Financement appel d'offre",
    text: "Places limitées. Vérifiez votre éligibilité à un financement avec un conseiller formation. La prise en charge à 100 % n'est pas automatique et dépend de votre situation professionnelle.",
  },
  "financement-personnel": {
    label: "Financement personnel",
    text: "Sous réserve d'acceptation. Vous disposez d'un délai de rétractation. Voir les conditions.",
  },
  "bourse-etudes-30": {
    label: "Bourse d'études jusqu'à -30%",
    text: "Bourse d'études fonction de votre profil. Consultez votre conseiller en formation.",
  },
  "offre-promotionnelle": {
    label: "Offre promotionnelle",
    text: "Offre soumise à conditions d'éligibilité, pour toute inscription à une formation diplômante. Offre non cumulable avec toute autre offre en cours, réservée aux particuliers et valable jusqu'au JJ/MM/AAAA.",
    parameter: "endDate",
  },
  "diplome-ou-rembourse": {
    label: "Diplômé ou Remboursé",
    text: "Soumis à conditions.",
  },
  "salaires-metier": {
    label: "Salaires par métier",
    text: "Salaire moyen brut mensuel en France en 2025. Source Talent.com.",
  },
  "chiffres-performance": {
    label: "Chiffres de performance",
    text: "Source : Résultat de l'enquête Audirep réalisée en janvier 2025 sur un échantillon de 2309 répondants diplômés ayant terminé leur formation entre janvier 2021 et juin 2023.",
  },
} as const satisfies Record<string, EmailDisclaimerEntry>

export type EmailDisclaimerId = keyof typeof emailDisclaimers
