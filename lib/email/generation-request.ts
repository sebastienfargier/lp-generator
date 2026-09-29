import { z } from "zod"

import { emailObjectives, type EmailBrief, type EmailObjective } from "./demo-generator"
import { emailDisclaimers, type EmailDisclaimerId } from "./disclaimers"
import { ImageAssetSlotSchema } from "./schemas"

/**
 * Contrat d'entrée d'une génération par un modèle : les données structurées
 * disponibles, distinctes du brief du mode démo (`EmailBrief`, inchangé).
 *
 * Le modèle rédige ; il n'invente aucun fait. Tout fait sensible — valeur,
 * remise, code, échéance, chiffre, témoignage, partenaire, visuel — arrive
 * ici, déjà validé par la personne qui fait la demande, jamais extrait d'une
 * phrase du brief. Les champs viennent des besoins des lames (slots du
 * manifeste) et des règles du projet Email (`instructions-projet.md` §5-6,
 * `experience-generation.md` §4, `copy-email.md`).
 */

/** Types d'email des sources (`experience-generation.md` §4). */
export const emailTypes = [
  "promo",
  "lifecycle-debut",
  "lifecycle-fin",
  "newsletter",
  "transactionnel",
] as const

export type EmailType = (typeof emailTypes)[number]

const text = (label: string) => z.string().trim().min(1, `${label} est requis.`)
const disclaimerIds = Object.keys(emailDisclaimers) as [EmailDisclaimerId, ...EmailDisclaimerId[]]
const DisclaimerIdSchema = z.enum(disclaimerIds, { error: "Disclaimer inconnu du catalogue." })
const needsEndDate = (id: EmailDisclaimerId) => {
  const entry = emailDisclaimers[id]
  return "parameter" in entry && entry.parameter === "endDate"
}

/** Fait validé, utilisable tel quel (ex. un chiffre des guidelines, chapitre 9). */
const FactSchema = z.strictObject({
  statement: text("Le fait"),
  /** Disclaimer qu'appelle ce fait (ex. chiffres Audirep). */
  disclaimer: DisclaimerIdSchema.optional(),
})

/** Offre validée : les lames promo n'utilisent que ces valeurs. */
const OfferSchema = z
  .strictObject({
    /** Ce qu'est l'offre, en une phrase validée. */
    summary: text("Le résumé de l'offre"),
    /** Valeur clé affichée (ex. « −30 % »). */
    value: text("La valeur").optional(),
    /** Code promo, en capitales. */
    code: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Code promo : capitales, chiffres et tirets.")
      .optional(),
    endDate: z.iso.date("Date de fin : AAAA-MM-JJ.").optional(),
    /** Compte à rebours figé à l'envoi : trois valeurs et leurs unités. */
    countdown: z
      .array(z.strictObject({ value: text("La valeur"), unit: text("L'unité") }))
      .length(3, "Le compte à rebours a trois compteurs.")
      .optional(),
    /** Disclaimer de l'offre (offre promotionnelle, bourse d'études…). */
    disclaimer: DisclaimerIdSchema,
  })
  .superRefine((offer, ctx) => {
    if (needsEndDate(offer.disclaimer) && !offer.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Ce disclaimer exige la date de fin de l'offre." })
    }
    if (offer.countdown && !offer.endDate) {
      ctx.addIssue({ code: "custom", path: ["countdown"], message: "Un compte à rebours exige une date de fin." })
    }
  })

export const EmailGenerationRequestSchema = z.strictObject({
  campaignName: text("Le nom de campagne"),
  /** Objet imposé ; sinon le modèle le rédige. */
  subject: text("L'objet").optional(),
  brief: text("Le brief"),
  audience: text("L'audience"),
  objective: z.enum(
    emailObjectives.map((objective) => objective.value) as [EmailObjective, ...EmailObjective[]],
    { error: "Objectif inconnu." }
  ),
  emailType: z.enum(emailTypes, { error: "Type d'email inconnu." }).optional(),
  facts: z.array(FactSchema).optional(),
  offer: OfferSchema.optional(),
  /** Témoignage réel et validé, cité mot pour mot. */
  testimonial: z.strictObject({ quote: text("La citation"), author: text("L'auteur") }).optional(),
  /** Partenaire académique réel, nommé tel quel. */
  partner: z.strictObject({ name: text("Le nom du partenaire") }).optional(),
  /** Visuels envoyables : URL HTTPS (contrat ImageAssetSlot), jamais un chemin local. */
  visuals: z.array(ImageAssetSlotSchema).optional(),
})

export type EmailGenerationRequest = z.infer<typeof EmailGenerationRequestSchema>

export function safeParseEmailGenerationRequest(input: unknown) {
  return EmailGenerationRequestSchema.safeParse(input, { error: z.locales.fr().localeError })
}

/**
 * Brief du mode démo → requête sans fait structuré (aucune donnée inventée).
 * L'objectif Promotion, propre à la démo, devient `emailType: "promo"` ; sa
 * valeur fictive n'est pas transmise comme une offre validée.
 */
export function emailBriefToGenerationRequest(brief: EmailBrief): EmailGenerationRequest {
  const request = {
    campaignName: brief.campaignName,
    subject: brief.subject,
    brief: brief.brief,
    audience: brief.audience,
  }
  return brief.objective === "promotion"
    ? { ...request, objective: "decouverte-formations", emailType: "promo" }
    : { ...request, objective: brief.objective }
}
