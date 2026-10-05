/**
 * Prompts Email V2, un par recette, sans réseau : requête → recette
 * (déterministe) → contexte Brand compact → { system, user, schéma }. Aucun
 * appel de modèle ici ; c'est le contrat que le futur appel recevra.
 *
 * Trois prompts séparés plutôt qu'un prompt générique à conditions : chacun
 * n'explique que le rôle de sa recette, la structure sémantique attendue, ses
 * contraintes factuelles et ses interdictions. Aucun HTML, aucun CSS, aucun
 * nom de lame, aucune surface : Claude n'a pas besoin de les connaître.
 *
 * Le message utilisateur contient la demande (campagne, brief, audience,
 * faits) et le contexte Brand compact. Les faits de la demande sont la seule
 * source des chiffres de R1 et R2 ; les claims approuvées (R3) sont des
 * identifiants que Claude désigne sans jamais les recopier.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailObjectives } from "./demo-generator"
import { buildRecipeBrandContext, type RecipeBrandContext, type RecipeBrandProvenance } from "./recipe-brand-context"
import { buildRecipeDraftJsonSchema, buildRecipeTransportSchema } from "./recipe-drafts"
import {
  safeParseEmailRecipeRequest,
  selectEmailRecipe,
  type EmailRecipeRequest,
  type EmailRecipeUnsupportedCode,
} from "./recipe-selection"
import type { EmailRecipeId } from "./recipes"

/* -------------------------------------------------------------------------- */
/* Instructions système                                                       */
/* -------------------------------------------------------------------------- */

const outputRule = `Réponds uniquement par l'objet JSON conforme au schéma de sortie : aucun texte avant ou après, aucun markdown, aucune explication.`

const boundaries = `Ce que tu ne produis jamais : d'URL, de lien, de chemin ou d'image (une destination est un id de context.destinations) ; HTML, CSS, couleur, surface ; en-tête, pied de page ou mention légale ; champ hors du schéma.`

const factsRule = `Faits : n'écris aucun prix, remise, pourcentage, chiffre, durée, date, délai, effectif, certification, classement, garantie, témoignage, partenaire, code, offre, urgence ni exclusivité, sauf s'il figure dans request.facts : recopie-le alors à l'identique. context.rules et context.avoid s'appliquent à tout le texte ; context.voice fixe l'adresse et le ton.`

export const discoverySystemPrompt = `Tu rédiges le contenu d'un email Studi de DÉCOUVERTE ET DE RÉASSURANCE, sous la forme d'un objet JSON « brouillon », à partir du message utilisateur : "request" (la demande et ses faits) et "context" (la voix de marque, les règles, les destinations et les intentions visuelles autorisées).

${outputRule}

But : rassurer une personne qui explore une orientation. L'email l'aide à se situer, lui montre une progression simple et l'invite à découvrir, sans engagement.

Structure :
- subject : 30 à 45 caractères (s'il y a un request.subject, recopie-le) ; preheader : 60 à 90 caractères, qui prolonge l'objet sans le répéter ;
- visualIntent : une intention de context.visualIntents, celle qui convient à l'angle ;
- hero : eyebrow (un ou deux mots), title, text (deux phrases au plus) et cta { label, destination } ;
- steps : eyebrow et exactement 3 étapes ordonnées (title, text), par exemple explorer, comparer, choisir ;
- benefits : title et exactement 3 appuis (icon, title, text) ; icon est une valeur de l'enum du schéma ;
- closing : title, text et ctaLabel. Son bouton mène à la même destination que hero.cta : il n'y a qu'un seul appel principal, répété une fois.

Boutons : libellés courts, à l'infinitif, qui invitent à découvrir.

${factsRule}

${boundaries}`

export const newsletterSystemPrompt = `Tu rédiges le contenu d'une NEWSLETTER Studi, sous la forme d'un objet JSON « brouillon », à partir du message utilisateur : "request" (la demande et ses faits) et "context" (la voix de marque, les règles et les destinations autorisées).

${outputRule}

But : une newsletter utile à lire, pas un résumé du brief ni une offre. Choisis d'abord son IDÉE ÉDITORIALE CENTRALE, formulable en une phrase : le hero la porte, le reste la développe sans la reformuler, le bouton en est la suite naturelle.

Structure :
- edition : "banner" (grand visuel, clôture illustrée) ou "portrait-strip" (frise de portraits) ; tu choisis seulement l'édition, ni portraits ni visuels ;
- subject : 30 à 45 caractères (s'il y a un request.subject, recopie-le) ; un angle précis, sans paraphraser le brief ni inventer de fait, pas forcément un verbe en tête ; preheader : 60 à 90 caractères, une promesse de lecture ou une information, sans répéter l'objet ni le hero ;
- hero : eyebrow (un ou deux mots, sans date), title (l'idée centrale : question, tension ou promesse de lecture), text (deux phrases au plus, qui donnent envie de lire la suite), cta { label, destination } ;
- intro : title et text : pourquoi le sujet mérite quelques minutes, comment l'édition est construite ; elle ne reformule pas le hero ;
- rubriques : eyebrow, title et exactement 4 rubriques (title, text), chacune avec une idée distincte (une action, une question à se poser, une chose à observer ou à comparer), un titre spécifique et un texte qui dit quoi faire, regarder ou comparer. Jamais deux rubriques synonymes, jamais quatre variantes de « réfléchissez à votre projet » ;
- closing : title, text, ctaLabel : il prolonge le hero vers ce que le bouton ouvre. Même destination que hero.cta (un seul appel principal), mais un libellé différent de celui du hero ; chaque libellé, court et à l'infinitif, annonce ce que le lecteur trouvera.

Destination : d'après ce que le bouton promet ; un lien vers des profils, des parcours ou des fiches exige que le hero l'annonce.

Concret sans inventer : appuie-toi sur ce que fait le lecteur, en verbe + action observable (noter, lister, comparer, relire, tester, bloquer un créneau, poser une question). Jamais de fait Studi non fourni : chiffre, durée présentée comme vérité, résultat, efficacité, service ou accompagnement précis, détail d'une formation.

Variété : évite de répéter ou d'abuser de « à votre rythme », « repères concrets », « pistes concrètes », « passer à l'action », « pas à pas », « réflexion », « projet professionnel » quand une formulation plus précise existe ; ne reprends pas les mots du brief tels quels.

${factsRule}

${boundaries}`

export const brandProofSystemPrompt = `Tu rédiges le contenu d'un email Studi de PREUVES DE MARQUE, sous la forme d'un objet JSON « brouillon », à partir du message utilisateur : "request" (la demande et ses faits) et "context" (la voix de marque, les règles, les destinations, les intentions visuelles et les claims approuvées).

${outputRule}

But : aider une personne à choisir en confiance grâce à quelques repères vérifiés sur Studi. Les repères sont des claims approuvées : tu les choisis, tu ne les écris pas.

Structure :
- subject : 30 à 45 caractères (s'il y a un request.subject, recopie-le) ; preheader : 60 à 90 caractères, qui prolonge l'objet sans le répéter ;
- visualIntent : une intention de context.visualIntents ;
- hero : eyebrow (un ou deux mots), title, text (deux phrases au plus, sans chiffre) et cta { label, destination } ;
- claims : 2 ou 3 id de context.claims, sans doublon, les plus utiles à la demande. Tu ne recopies, ne reformules ni ne commentes aucun chiffre : le système affiche chaque claim à l'identique ;
- support : un texte par claim, dans le même ordre, sans aucun chiffre. Il dit ce que ce repère change pour la personne, sans le répéter ni l'enrichir ;
- closing : title et text, une phrase de liaison qui invite à utiliser ces repères. Un seul bouton dans tout l'email : celui du hero.

Boutons : libellé court, à l'infinitif, qui invite à découvrir.

Faits : request.facts est la seule source d'informations propres à la campagne ; recopie ce que tu utilises à l'identique. Hors claims choisies, n'écris aucun chiffre, prix, durée, date, effectif, certification, classement, garantie, témoignage, partenaire ni offre. context.rules et context.avoid s'appliquent à tout le texte ; context.voice fixe l'adresse et le ton.

${boundaries}`

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

export type EmailRecipePromptReady = {
  status: "ready"
  recipe: EmailRecipeId
  request: EmailRecipeRequest
  context: RecipeBrandContext
  /** Provenance interne des règles et des claims : jamais envoyée au modèle. */
  provenance: RecipeBrandProvenance
  system: string
  /** Message utilisateur : { request, context } en JSON compact. */
  user: string
  /** JSON Schema du Draft de la recette (Zod). */
  outputSchema: ReturnType<typeof buildRecipeDraftJsonSchema>
  /** Le même, adapté au transport Anthropic (Structured Outputs). */
  transportSchema: ReturnType<typeof buildRecipeTransportSchema>
}

export type EmailRecipePrompt =
  | EmailRecipePromptReady
  | { status: "invalid-request"; issues: { path: string; message: string }[] }
  | { status: "unsupported"; issues: { code: EmailRecipeUnsupportedCode; message: string }[] }

/** Champs de la requête utiles au Draft : le reste (objectif, type, intention) a déjà servi à choisir la recette. */
function requestForPrompt(request: EmailRecipeRequest) {
  return {
    campaignName: request.campaignName,
    ...(request.subject ? { subject: request.subject } : {}),
    brief: request.brief,
    audience: request.audience,
    // L'angle demandé (objectif de l'ancien vocabulaire) : il nuance R1 (découverte ou accompagnement), jamais la recette.
    ...(request.objective ? { focus: emailObjectives.find((objective) => objective.value === request.objective)?.label } : {}),
    ...(request.facts && request.facts.length > 0 ? { facts: request.facts.map((fact) => fact.statement) } : {}),
  }
}

function build(recipe: EmailRecipeId, system: string, request: EmailRecipeRequest): EmailRecipePromptReady {
  const { context, provenance } = buildRecipeBrandContext(recipe, request.audience, request.target)
  const outputSchema = buildRecipeDraftJsonSchema(recipe)
  return {
    status: "ready",
    recipe,
    request,
    context,
    provenance,
    system,
    user: JSON.stringify({ request: requestForPrompt(request), context }),
    outputSchema,
    transportSchema: buildRecipeTransportSchema(recipe),
  }
}

/** Prompt de R1 (découverte et réassurance) pour une requête déjà validée. */
export const buildR1EmailPrompt = (request: EmailRecipeRequest) => build("discovery-reassurance", discoverySystemPrompt, request)

/** Prompt de R2 (newsletter éditoriale) pour une requête déjà validée. */
export const buildR2EmailPrompt = (request: EmailRecipeRequest) => build("editorial-newsletter", newsletterSystemPrompt, request)

/** Prompt de R3 (preuves de marque) pour une requête déjà validée. */
export const buildR3EmailPrompt = (request: EmailRecipeRequest) => build("brand-proof", brandProofSystemPrompt, request)

const builders = {
  "discovery-reassurance": buildR1EmailPrompt,
  "editorial-newsletter": buildR2EmailPrompt,
  "brand-proof": buildR3EmailPrompt,
} as const satisfies Record<EmailRecipeId, (request: EmailRecipeRequest) => EmailRecipePromptReady>

/**
 * Requête inconnue → validation → recette (déterministe) → prompt de cette
 * recette. Une demande non prise en charge est refusée avant tout. Même
 * requête, même prompt.
 */
export function buildEmailRecipePrompt(input: unknown): EmailRecipePrompt {
  const parsed = safeParseEmailRecipeRequest(input)
  if (!parsed.success) {
    return { status: "invalid-request", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "request", message: issue.message })) }
  }
  const selection = selectEmailRecipe(parsed.data)
  if (selection.status === "unsupported") return { status: "unsupported", issues: selection.issues }
  return builders[selection.recipe](parsed.data)
}
