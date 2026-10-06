/**
 * Requête R4 → validation → prompt et schéma de la promotion, sans réseau.
 * Aucun appel de modèle ici : c'est le contrat que l'appel recevra.
 *
 * Avant tout appel, la demande est refusée si :
 * - elle n'est pas conforme au contrat (valeur absente, destination inconnue,
 *   code mal formé, date invalide, champ réservé au resolver, informations
 *   libres, intention autre) ;
 * - la date de fin est dépassée ;
 * - le texte libre (brief, objet imposé, nom de campagne) énonce une valeur, une
 *   date ou un code différents des Promotion Facts (deux vérités possibles) ;
 * - l'objet imposé enfreint les règles de copie d'une promotion.
 *
 * Un prompt court, séparé de R1, R2 et R3. Claude voit l'offre pour écrire
 * autour, mais le resolver ne lui fait jamais confiance pour la restituer : le
 * prompt ne contient NI le code NI la date, et la valeur n'y figure que pour
 * l'objet et le préheader, qui ne peuvent la citer qu'à l'identique.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailDestinations } from "./destinations"
import { lintPromotionCopy } from "./promotion-copy"
import { buildPromotionDraftJsonSchema, buildPromotionTransportSchema } from "./promotion-draft"
import {
  promotionOfferValue,
  promotionPastDate,
  promotionRequestConflicts,
  safeParseEmailPromotionRequest,
  todayIsoDate,
  type EmailPromotionRequest,
  type PromotionRequestIssue,
} from "./promotion-facts"
import { buildPromotionBrandContext, type PromotionBrandContext, type RecipeBrandProvenance } from "./recipe-brand-context"

/* -------------------------------------------------------------------------- */
/* Validation de la demande                                                   */
/* -------------------------------------------------------------------------- */

export type PromotionRequestCheck =
  | { status: "valid"; request: EmailPromotionRequest }
  | { status: "invalid"; issues: { path: string; message: string }[] }

/**
 * Entrée inconnue → requête de promotion valide, ou liste de problèmes
 * corrigeables par la personne qui fait la demande. `today` : AAAA-MM-JJ
 * (par défaut, la date du serveur).
 */
export function checkPromotionRequest(input: unknown, options: { today?: string } = {}): PromotionRequestCheck {
  const parsed = safeParseEmailPromotionRequest(input)
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "request", message: issue.message })) }
  }
  const request = parsed.data
  const found: PromotionRequestIssue[] = []
  const past = promotionPastDate(request.promotion, options.today ?? todayIsoDate())
  if (past) found.push(past)
  found.push(...promotionRequestConflicts(request))
  if (request.subject) {
    for (const issue of lintPromotionCopy(request.subject, "subject", request.promotion)) {
      found.push({ code: "conflicting-value", path: "subject", message: `${issue.message} (« ${issue.match} »)` })
    }
  }
  if (found.length > 0) return { status: "invalid", issues: found.map(({ path, message }) => ({ path, message })) }
  return { status: "valid", request }
}

/* -------------------------------------------------------------------------- */
/* Instructions système                                                       */
/* -------------------------------------------------------------------------- */

const outputRule = `Réponds uniquement par l'objet JSON conforme au schéma de sortie : aucun texte avant ou après, aucun markdown, aucune explication.`

export const promotionSystemPrompt = `Tu rédiges le contenu d'un email Studi de PROMOTION, sous la forme d'un objet JSON « brouillon », à partir du message utilisateur : "request" (la demande et l'offre) et "context" (la voix de marque, les règles et les intentions visuelles autorisées).

${outputRule}

But : présenter une offre de façon claire et sobre. L'offre est déjà définie : le système affiche lui-même sa valeur, son code éventuel, sa date de fin, son périmètre, sa mention légale et la destination du bouton. Tu écris AUTOUR de l'offre ; tu ne l'écris pas.

Structure :
- subject : 30 à 45 caractères (s'il y a un request.subject, recopie-le) ; preheader : 60 à 90 caractères, qui prolonge l'objet sans le répéter. Ils peuvent citer request.promotion.value, recopiée à l'identique, ou ne citer aucune valeur ;
- visualIntent : une intention de context.visualIntents ;
- offer : eyebrow (un ou deux mots, par exemple « Offre Studi »), text (une ou deux phrases qui disent pourquoi cette offre mérite un regard, sans répéter la valeur, le périmètre ni la date) et ctaLabel (court, à l'infinitif, qui invite à découvrir : request.promotion.cta dit ce que le bouton ouvre) ;
- support : title et exactement 3 appuis (icon, title, text) : ce que la personne peut faire pour se décider (explorer, comparer, choisir), jamais un fait sur Studi ; icon est une valeur de l'enum du schéma ;
- closing : title, text et ctaLabel, un libellé différent de offer.ctaLabel : la clôture prolonge l'accroche vers ce que le bouton ouvre. Même destination que le bouton de l'offre : un seul appel principal.

Règles de l'offre :
- aucun chiffre, ni % ni €, dans eyebrow, text, support et closing ; l'objet et le préheader ne citent que request.promotion.value, à l'identique ;
- n'écris ni le code, ni la date de fin, ni aucun délai ou calcul de jours (« jusqu'au », « plus que », « dernier jour ») ; aucune pression ni urgence ;
- n'écris ni « jusqu'à », ni « à partir de », ni « économisez » : la valeur est exacte, tu ne la nuances pas ;
- aucune mention de financement, de CPF, de gratuité, de garantie, de conseiller ou de service précis : aucun de ces faits n'est fourni ;
- le contrôle refuse aussi, même employés autrement : « éligible », « prise en charge », « sans frais », « accompagné à chaque étape », « accompagnement personnalisé », « unique », « exclusif », « profitez-en », « demain », « ce mois », « cette semaine », tout mois ou jour de la semaine, un nombre en toutes lettres suivi d'une durée (« un mois », « deux ans ») et tout mot en capitales ; ne reprends pas les mots de request.promotion.scope ;
- context.rules et context.avoid s'appliquent à tout le texte ; context.voice fixe l'adresse et le ton.

Variété : évite de répéter « à votre rythme », « avancer », « repères », « sereinement » dans un même email.

Ce que tu ne produis jamais : d'URL, de lien, de chemin ou d'image ; HTML, CSS, couleur, surface ; en-tête, pied de page ou mention légale ; champ hors du schéma.`

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

export type PromotionPromptReady = {
  status: "ready"
  recipe: "promotion"
  request: EmailPromotionRequest
  context: PromotionBrandContext
  /** Provenance interne des règles : jamais envoyée au modèle. */
  provenance: RecipeBrandProvenance
  system: string
  /** Message utilisateur : { request, context } en JSON compact. */
  user: string
  outputSchema: ReturnType<typeof buildPromotionDraftJsonSchema>
  transportSchema: ReturnType<typeof buildPromotionTransportSchema>
}

export type PromotionPrompt = PromotionPromptReady | { status: "invalid-request"; issues: { path: string; message: string }[] }

/**
 * Ce que Claude voit de la demande : le brief, l'audience, l'objet imposé, et de
 * l'offre seulement sa valeur (espace ordinaire), son périmètre et ce que le
 * bouton ouvre. Ni code, ni date, ni mention légale, ni identifiant technique.
 */
function requestForPrompt(request: EmailPromotionRequest) {
  const { promotion } = request
  const destination = emailDestinations[promotion.destination]
  return {
    campaignName: request.campaignName,
    ...(request.subject ? { subject: request.subject } : {}),
    brief: request.brief,
    audience: request.audience,
    promotion: {
      value: promotionOfferValue(promotion).replace(/ /g, " "),
      scope: promotion.scope,
      cta: { label: destination.label, usage: destination.usage ?? "" },
    },
  }
}

/** Requête inconnue → validation → prompt de la promotion. Même requête, même prompt. */
export function buildPromotionPrompt(input: unknown, options: { today?: string } = {}): PromotionPrompt {
  const check = checkPromotionRequest(input, options)
  if (check.status === "invalid") return { status: "invalid-request", issues: check.issues }
  const { context, provenance } = buildPromotionBrandContext(check.request.audience, check.request.target)
  return {
    status: "ready",
    recipe: "promotion",
    request: check.request,
    context,
    provenance,
    system: promotionSystemPrompt,
    user: JSON.stringify({ request: requestForPrompt(check.request), context }),
    outputSchema: buildPromotionDraftJsonSchema(),
    transportSchema: buildPromotionTransportSchema(),
  }
}
