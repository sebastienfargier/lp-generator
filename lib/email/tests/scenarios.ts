/** Requêtes de référence des tests et des mesures de prompt. */
import { defaultEmailBrief } from "../demo-generator"
import { emailBriefToGenerationRequest, type EmailGenerationRequest } from "../generation-request"

const base = emailBriefToGenerationRequest(defaultEmailBrief)

export const scenarios: Record<string, EmailGenerationRequest> = {
  reconversion: base,
  accompagnement: {
    ...base,
    campaignName: "Accompagnement",
    subject: "Vous ne serez pas seul pour vous former",
    brief: "Présenter l'accompagnement Studi à des personnes qui hésitent à se former seules.",
    audience: "Personnes en poste qui craignent de se former seules",
    objective: "accompagnement",
    emailType: "lifecycle-debut",
  },
  evolution: {
    ...base,
    campaignName: "Évolution de carrière",
    subject: "Et si vous passiez à l'étape suivante ?",
    brief: "Encourager des salariés à monter en compétences en management ou en ressources humaines.",
    audience: "Salariés qui veulent évoluer",
    objective: "evolution-carriere",
    emailType: "newsletter",
  },
  promo: {
    ...base,
    campaignName: "Offre de rentrée",
    subject: "La remise de rentrée prend fin bientôt",
    brief: "Email promo de rentrée pour présenter la bourse d'études.",
    audience: "Personnes en poste",
    objective: "decouverte-formations",
    emailType: "promo",
    offer: {
      summary: "Bourse d'études jusqu'à −30 % sur une sélection de formations",
      value: "−30 %",
      code: "RENTREE26",
      endDate: "2026-10-31",
      countdown: [
        { value: "03", unit: "JOURS" },
        { value: "12", unit: "HEURES" },
        { value: "45", unit: "MINUTES" },
      ],
      disclaimer: "offre-promotionnelle",
    },
  },
}
