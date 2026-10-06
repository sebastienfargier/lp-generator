/**
 * Promotion Facts : le contrat des données commerciales d'un email R4
 * (promotion / campagne commerciale). Ce sont des VÉRITÉS CONTRÔLÉES, saisies
 * par la personne qui fait la demande : jamais générées, jamais reformulées,
 * jamais lues dans le texte libre d'un brief. Claude écrit autour ; le resolver
 * injecte ces valeurs telles quelles.
 *
 * Contrat minimal, strict, sans optionnel inutile :
 * - `offer` : une petite union déterministe côté REQUÊTE (jamais envoyée à
 *   Anthropic) : remise en montant (`amount`, euros entiers) ou en pourcentage
 *   (`percent`, entier). L'unité n'est pas libre : le rendu est déterministe
 *   (« -500 € », « -20 % »), espace insécable comprise ;
 * - `code` : facultatif ; affiché à l'identique (casse, tirets), jamais écrit
 *   par Claude. Sans code, aucune lame ni phrase ne le mentionne ;
 * - `endDate` : OBLIGATOIRE (AAAA-MM-JJ, date de calendrier réelle). La seule
 *   mention légale promotionnelle du catalogue (`offre-promotionnelle`) porte
 *   « valable jusqu'au JJ/MM/AAAA » : une promotion sans date de fin n'aurait
 *   aucune mention légale contrôlée. Un mécanisme de texte légal propre à la
 *   campagne exigerait un nouveau type de slot (contrat EmailConfig) : hors V1 ;
 * - `scope` : le périmètre de l'offre, un groupe nominal court (« les formations
 *   diplômantes »), injecté tel quel dans « Offre valable sur … » ;
 * - `destination` : un identifiant de destination contrôlée (liste fermée).
 *
 * Aucun champ de présentation (surface, classe, HTML, URL, image, lame, mention
 * légale) : le schéma est `strict`, un champ réservé au resolver est refusé
 * avant tout appel.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import type { EmailDestinationId } from "./destinations"
import { emailRecipeTargets } from "./recipe-selection"

/** Destinations d'une promotion : le catalogue et ses entrées. Pas de financement (aucun fait approuvé), pas de blog. */
export const promotionDestinations = ["catalogue-formations", "alternance", "diplomes", "certificats"] as const satisfies readonly EmailDestinationId[]
export type PromotionDestination = (typeof promotionDestinations)[number]

export const promotionOfferTypes = ["amount", "percent"] as const
export type PromotionOfferType = (typeof promotionOfferTypes)[number]

/** Longueurs du périmètre (caractères). */
export const promotionScopeLimits = { min: 3, max: 80 } as const

const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i

const PromotionOfferSchema = z.discriminatedUnion(
  "type",
  [
    z.strictObject({ type: z.literal("amount"), amount: z.number({ error: "Montant : un nombre entier d'euros." }).int("Montant : un nombre entier d'euros.").min(1, "Montant : au moins 1 €.").max(100_000, "Montant : 100 000 € au maximum.") }),
    z.strictObject({ type: z.literal("percent"), percent: z.number({ error: "Pourcentage : un nombre entier." }).int("Pourcentage : un nombre entier.").min(1, "Pourcentage : au moins 1 %.").max(100, "Pourcentage : 100 % au maximum.") }),
  ],
  { error: "Type d'offre inconnu : remise en montant ou en pourcentage." }
)

/** Code promo : capitales, chiffres et tirets (même forme que le contrat d'offre V1), affiché à l'identique. */
export const promotionCodePattern = /^[A-Z0-9][A-Z0-9-]{1,19}$/

export const PromotionFactsSchema = z.strictObject({
  offer: PromotionOfferSchema,
  code: z.string({ error: "Code promo : texte." }).regex(promotionCodePattern, "Code promo : capitales, chiffres et tirets, 2 à 20 caractères.").optional(),
  endDate: z.iso.date("Date de fin : AAAA-MM-JJ, une date de calendrier réelle."),
  scope: z
    .string({ error: "Périmètre : texte." })
    .trim()
    .min(promotionScopeLimits.min, "Périmètre : trop court.")
    .max(promotionScopeLimits.max, `Périmètre : ${promotionScopeLimits.max} caractères au maximum.`)
    .refine((value) => !markup.test(value), "Périmètre : HTML interdit.")
    .refine((value) => !looseLink.test(value), "Périmètre : aucune URL ni chemin."),
  destination: z.enum(promotionDestinations, { error: "Destination inconnue : une destination contrôlée de la liste." }),
})

export type PromotionFacts = z.infer<typeof PromotionFactsSchema>

/**
 * Requête R4 : le brief éditorial (Claude écrit à partir de lui) et les
 * Promotion Facts (le système les affiche). Aucun autre champ : ni `facts`
 * libres, ni offre V1, ni visuel, ni mention légale, ni recette.
 */
export const EmailPromotionRequestSchema = z.strictObject({
  campaignName: z.string().trim().min(1, "Le nom de campagne est requis."),
  subject: z.string().trim().min(1, "L'objet est requis.").optional(),
  brief: z.string().trim().min(1, "Le brief est requis."),
  audience: z.string().trim().min(1, "L'audience est requise."),
  target: z.enum(emailRecipeTargets, { error: "Cible inconnue." }),
  intent: z.literal("promotion", { error: "L'intention d'une promotion est « promotion »." }),
  promotion: PromotionFactsSchema,
})

export type EmailPromotionRequest = z.infer<typeof EmailPromotionRequestSchema>

export function safeParseEmailPromotionRequest(input: unknown) {
  return EmailPromotionRequestSchema.safeParse(input, { error: z.locales.fr().localeError })
}

/** Une entrée est une demande de promotion dès qu'elle porte l'intention « promotion » ou des données d'offre. */
export function isEmailPromotionInput(input: unknown): boolean {
  if (!input || typeof input !== "object") return false
  const candidate = input as Record<string, unknown>
  return candidate.intent === "promotion" || "promotion" in candidate
}

/* -------------------------------------------------------------------------- */
/* Affichage déterministe                                                     */
/* -------------------------------------------------------------------------- */

const nbsp = " "

/** Marqueur qui relie la valeur à la mention légale (comme dans la référence : « -20 %* »). */
export const promotionLegalMarker = "*"

/** « 1500 » → « 1 500 » (espace insécable) : un nombre ne se coupe jamais en deux lignes. */
const groupThousands = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, nbsp)

/** Valeur de l'offre : « -500 € », « -20 % » (signe moins ASCII, espace insécable avant l'unité). */
export function promotionOfferValue(facts: Pick<PromotionFacts, "offer">): string {
  return facts.offer.type === "amount" ? `-${groupThousands(facts.offer.amount)}${nbsp}€` : `-${facts.offer.percent}${nbsp}%`
}

/** Texte du slot « valeur » : la valeur et le marqueur de mention légale. */
export const promotionValueSlot = (facts: Pick<PromotionFacts, "offer">) => `${promotionOfferValue(facts)}${promotionLegalMarker}`

const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"] as const
export const frenchMonths: readonly string[] = months

/** « 2026-10-15 » → « 15 octobre 2026 » (pas d'`Intl` : le texte ne dépend ni de la locale ni de la plateforme). Le 1er : « 1er ». */
export function formatPromotionDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number]
  return `${day === 1 ? "1er" : day} ${months[month - 1]} ${year}`
}

/** Étiquette de l'en-tête de campagne : la date de fin, jamais calculée ni reformulée. */
export const promotionDeadlineLabel = (facts: Pick<PromotionFacts, "endDate">) => `Offre valable jusqu'au ${formatPromotionDate(facts.endDate)}`

/** Phrase système du périmètre, ajoutée au texte d'accroche : ce que couvre l'offre, tel que saisi. */
export const promotionScopeSentence = (facts: Pick<PromotionFacts, "scope">) => `Offre valable sur ${facts.scope.replace(/[.\s]+$/, "")}.`

/** Lien texte secondaire du hero d'offre : libellé et destination fixes (système), jamais écrits par Claude. */
export const promotionSecondaryLink = { label: "Voir le Parcours Découverte", destination: "parcours-decouverte" } as const satisfies { label: string; destination: EmailDestinationId }

/* -------------------------------------------------------------------------- */
/* Nombres autorisés                                                          */
/* -------------------------------------------------------------------------- */

/** Chiffres d'un texte, sans séparateur de milliers (« 1 500 » → « 1500 »). */
export function numberTokens(value: string): string[] {
  return (value.match(/\d+(?:[   .,]\d+)*/g) ?? []).map((token) => token.replace(/[   ]/g, ""))
}

/** Plus petit sous-ensemble utile : le nombre et l'unité de la valeur d'offre. */
export function promotionOfferNumber(facts: Pick<PromotionFacts, "offer">): { digits: string; unit: "€" | "%" } {
  return facts.offer.type === "amount" ? { digits: String(facts.offer.amount), unit: "€" } : { digits: String(facts.offer.percent), unit: "%" }
}

/* -------------------------------------------------------------------------- */
/* Validation de la demande (avant tout appel de modèle)                      */
/* -------------------------------------------------------------------------- */

export type PromotionRequestIssue = { code: "past-date" | "conflicting-value" | "conflicting-date" | "conflicting-code"; path: string; message: string }

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

const valueMention = /(?:^|[^\d])(\d[\d   .,]*\d|\d)\s?(%|€|euros?\b|pour cent)/gi
const dateMention = new RegExp(`(?:^|[^\\d])(\\d{1,2})(?:er)?\\s+(${months.map(fold).join("|")})(?:\\s+(\\d{4}))?`, "gi")
const numericDateMention = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g
const codeMention = /\bcode\s+(?:promo\s+)?:?\s*([A-Z0-9][A-Z0-9-]{1,19})\b/g

/**
 * Ambiguïtés entre le texte libre de la demande et les Promotion Facts : une
 * valeur, une date ou un code que le brief (ou l'objet imposé, ou le nom de
 * campagne) énonce autrement que les faits. La demande est alors refusée : on
 * ne laisse pas Claude choisir entre deux vérités. Une mention identique aux
 * faits est admise.
 */
export function promotionRequestConflicts(request: Pick<EmailPromotionRequest, "campaignName" | "subject" | "brief" | "promotion">): PromotionRequestIssue[] {
  const issues: PromotionRequestIssue[] = []
  const { promotion } = request
  const expected = promotionOfferNumber(promotion)
  const [year, month, day] = promotion.endDate.split("-").map(Number) as [number, number, number]
  const fields = [
    { path: "campaignName", text: request.campaignName },
    { path: "brief", text: request.brief },
    ...(request.subject ? [{ path: "subject", text: request.subject }] : []),
  ]
  for (const { path, text } of fields) {
    for (const match of text.matchAll(valueMention)) {
      const digits = match[1]!.replace(/[   ]/g, "")
      const unit = /^%|pour cent/i.test(match[2]!) ? "%" : "€"
      if (digits !== expected.digits || unit !== expected.unit) {
        issues.push({ code: "conflicting-value", path, message: `« ${match[0].trim()} » diffère de la valeur de l'offre (${promotionOfferValue(promotion)}) : retirez-la du texte libre ou corrigez l'offre.` })
      }
    }
    for (const match of fold(text).matchAll(dateMention)) {
      const sameDay = Number(match[1]) === day
      const sameMonth = fold(months[month - 1]!) === match[2]
      const sameYear = match[3] === undefined || Number(match[3]) === year
      if (!(sameDay && sameMonth && sameYear)) issues.push({ code: "conflicting-date", path, message: `« ${match[0].trim()} » diffère de la date de fin de l'offre : retirez-la du texte libre ou corrigez la date.` })
    }
    for (const match of text.matchAll(numericDateMention)) {
      if (!(Number(match[1]) === day && Number(match[2]) === month && Number(match[3]) === year)) issues.push({ code: "conflicting-date", path, message: `« ${match[0]} » diffère de la date de fin de l'offre.` })
    }
    for (const match of text.matchAll(codeMention)) {
      if (match[1] !== promotion.code) issues.push({ code: "conflicting-code", path, message: `Le code « ${match[1]} » diffère du code de l'offre${promotion.code ? "" : " (aucun code n'est défini)"}.` })
    }
  }
  return issues
}

/** Date de fin déjà passée (`today` : AAAA-MM-JJ, injectée pour rester testable). */
export function promotionPastDate(promotion: Pick<PromotionFacts, "endDate">, today: string): PromotionRequestIssue | undefined {
  return promotion.endDate < today ? { code: "past-date", path: "promotion.endDate", message: "La date de fin est dépassée : une offre expirée ne se diffuse pas." } : undefined
}

/** Date du jour (AAAA-MM-JJ, heure locale du serveur). */
export const todayIsoDate = (now: Date = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
