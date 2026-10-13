/**
 * Modèles recommandés pour un brief HCC (option B, L1) : correspondance DÉTERMINISTE entre l'intention de communication
 * du brief et deux des modèles Studi existants (`templates.ts`), avec la raison du choix. Aucun modèle n'est inventé,
 * aucun choix aléatoire : à intention égale, même recommandation, et la personne peut toujours choisir un autre modèle.
 *
 * Pas de modèle « Promotion » (voir `templates.ts`) : un brief promotionnel recommande des modèles sans bloc d'offre ;
 * aucune valeur, aucun code, aucune date n'est créé — les faits d'offre viendront d'une saisie dédiée.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { BriefIntention, EditorialBrief } from "../hcc/brief"
import type { BuilderTemplate } from "./templates"

export const intentionLabels: Record<BriefIntention, string> = {
  promotionnel: "Email promotionnel",
  editorial: "Newsletter éditoriale",
  evenementiel: "Email événementiel",
  informationnel: "Email informationnel",
  conversion: "Email de conversion",
}

/** Deux modèles par intention, dans l'ordre de recommandation, et pourquoi. */
export const intentionTemplates: Record<BriefIntention, readonly { id: string; reason: string }[]> = {
  editorial: [
    { id: "R2-A", reason: "Bandeau de newsletter, rubriques et lien secondaire : la hiérarchie d'un contenu éditorial à découvrir." },
    { id: "R2-B", reason: "Newsletter à rubriques avec frise de portraits : pour mettre en avant plusieurs contenus ou parcours." },
  ],
  promotionnel: [
    { id: "R1-A", reason: "Grand visuel et appel à l'action final : met l'offre en avant sans bloc de prix ni de code (rien n'est inventé ; les éléments d'offre restent à confirmer)." },
    { id: "R3-B", reason: "Bandeau fort et claim Studi approuvé en titre : appuie l'offre sur une preuve déjà validée par Studi." },
  ],
  conversion: [
    { id: "R1-A", reason: "Problème, étapes, bénéfices puis appel à l'action : la progression d'un email qui fait passer à l'action." },
    { id: "R3-A", reason: "Trois preuves Studi approuvées avant l'appel à l'action : lève les freins par la réassurance." },
  ],
  informationnel: [
    { id: "R1-B", reason: "Message essentiel en tête, explications en étapes numérotées, une seule action." },
    { id: "R2-A", reason: "Information à lire, avec un lien secondaire pour approfondir." },
  ],
  evenementiel: [
    { id: "R1-B", reason: "Accroche, déroulé en étapes (programme, informations pratiques) et inscription en bouton final. Aucun modèle Événement dédié n'existe." },
    { id: "R1-A", reason: "Grand visuel d'accroche pour l'événement et appel à l'inscription. Aucun modèle Événement dédié n'existe." },
  ],
}

export type TemplateRecommendation = { intention: BriefIntention; label: string; justification: string; templates: { template: BuilderTemplate; reason: string }[] }

/** Recommandation pour un brief valide ; `null` sans brief. Seuls les modèles réellement disponibles sont retenus. */
export function recommendTemplates(brief: EditorialBrief | null | undefined, templates: readonly BuilderTemplate[]): TemplateRecommendation | null {
  if (!brief) return null
  const intention = brief.intention.valeur
  const recommended = intentionTemplates[intention].flatMap(({ id, reason }) => {
    const template = templates.find((candidate) => candidate.id === id)
    return template ? [{ template, reason }] : []
  })
  return { intention, label: intentionLabels[intention], justification: brief.intention.justification, templates: recommended }
}
