/**
 * Prompt Email du mode Draft : requête → contexte compact → { system, user,
 * schéma }, sans réseau. Claude ne produit que l'`EmailGenerationDraft`
 * (`generation-draft.ts`) ; le resolver ajoute le shell, les liens, l'image
 * et la surface, puis la validation finale (`validateGeneratedDraftEmail`)
 * contrôle l'`EmailConfig` obtenu.
 *
 * Le contexte ne contient que ce qui sert au choix : les sept types de blocs,
 * dix destinations par identifiant, trois images par identifiant, huit icônes.
 * Ni URL, ni `src`, ni alt, ni lame du manifeste, ni surface, ni footer, ni
 * HTML. Les faits de la requête sont repris tels quels.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { validateEmailAgainst, type EmailValidationPolicy } from "./ai-prompt"
import { toAnthropicEmailJsonSchema } from "./anthropic-schema"
import { emailDestinations, emailDestinationUrl, type EmailDestinationId } from "./destinations"
import { emailDisclaimers } from "./disclaimers"
import {
  buildEmailDraftJsonSchema,
  emailDraftBodyLames,
  emailDraftDestinations,
  emailDraftHeroBlocks,
  emailDraftIcons,
  emailDraftImageIds,
} from "./generation-draft"
import { safeParseEmailGenerationRequest, type EmailGenerationRequest } from "./generation-request"
import { buildEmailImageView, emailImageBlocks, emailImagesForBlock, resolveEmailImage } from "./image-catalog"
import { emailHrefPlaceholders } from "./system"
import type { EmailConfig } from "./types"

/* -------------------------------------------------------------------------- */
/* Instructions système                                                       */
/* -------------------------------------------------------------------------- */

export const emailDraftSystemPrompt = `Tu rédiges le contenu d'un email Studi sous la forme d'un objet JSON « brouillon », à partir du message utilisateur : "request" (la demande et ses faits) et "context" (les blocs, destinations, images et icônes autorisés).

Réponds uniquement par l'objet JSON conforme au schéma de sortie : aucun texte avant ou après, aucun markdown, aucune explication.

Structure :
- subject : l'objet, de 30 à 45 caractères (s'il y a un request.subject, recopie-le) ; preheader : de 60 à 90 caractères, qui prolonge l'objet sans le répéter ;
- blocks : de 2 à 5 blocs. Le premier est le hero, le seul ; viens ensuite de 1 à 4 blocs de corps choisis parmi context.blocks, chaque type au plus une fois ;
- le hero et, au plus, un autre bloc (feature ou cta) portent un bouton ;
- respecte les champs de chaque bloc et son nombre exact d'éléments (items).

Ressources, désignées par identifiant uniquement :
- image du hero : un id de context.images ;
- destination d'un bouton : un id de context.destinations ;
- icône d'un bloc icons : un nom de context.icons.
N'écris jamais d'URL, de lien, de chemin ni d'image.

Ce que tu ne produis jamais : header, footer, mentions légales, surface ou couleur, HTML, CSS, classes, markdown, bloc ou champ hors du vocabulaire.

Faits : n'écris aucun prix, remise, pourcentage, durée, statistique, effectif, nombre d'apprenants, certification, classement, garantie, témoignage, partenaire, date, heure, échéance, code promo, offre, urgence ni exclusivité, sauf s'il figure dans request.facts : recopie-le alors à l'identique. Un fait qui porte un "disclaimer" se recopie tel quel, suivi d'un astérisque « * » collé.

Style : français, vouvoiement, phrases courtes, promesse au conditionnel, un seul sujet par email ; libellés de bouton courts, à l'infinitif.`

/* -------------------------------------------------------------------------- */
/* Contexte                                                                   */
/* -------------------------------------------------------------------------- */

/** Vocabulaire du Draft : le rôle éditorial de chaque type et ses champs. */
const blockVocabulary = [
  { type: "hero", use: "Ouverture, une seule, en premier. Le surtitre n'est pas affiché avec l'image tablette-interieur.", fields: "image, eyebrow, title, text, cta" },
  { type: "steps", use: "Trois étapes ordonnées ou trois points successifs.", fields: "eyebrow, items (3 × title, text)" },
  { type: "grid", use: "Quatre atouts, sans icône.", fields: "eyebrow, title, items (4 × title, text)" },
  { type: "icons", use: "Trois atouts ou services à présenter en liste.", fields: "title, items (3 × icon, title, text)" },
  { type: "text", use: "Paragraphe éditorial ou clôture sans bouton.", fields: "title, text" },
  { type: "feature", use: "Paragraphe suivi d'un encart mis en avant, avec bouton.", fields: "title, text, cardTitle, cardText, cta" },
  { type: "cta", use: "Relance de l'action en fin d'email, avec bouton.", fields: "title, text, cta" },
] as const

/** Un cta se compose de `label` (libellé court) et `destination` (id de context.destinations). */
const ctaNote = "cta = { label, destination }"

/** Champs de la requête utiles au Draft : le reste (offre, témoignage, partenaire, visuels) n'est pas pris en charge en V1. */
function requestForDraft(request: EmailGenerationRequest) {
  return {
    campaignName: request.campaignName,
    ...(request.subject ? { subject: request.subject } : {}),
    brief: request.brief,
    audience: request.audience,
    objective: request.objective,
    ...(request.emailType ? { emailType: request.emailType } : {}),
    ...(request.facts && request.facts.length > 0 ? { facts: request.facts } : {}),
  }
}

export function buildEmailDraftContext() {
  return {
    blocks: blockVocabulary,
    cta: ctaNote,
    destinations: emailDraftDestinations.map((id) => ({
      id,
      label: emailDestinations[id].label,
      usage: emailDestinations[id].usage,
    })),
    // Vue du catalogue d'images restreinte aux héros V1 : l'identifiant et ce que montre la photo.
    images: buildEmailImageView(emailDraftHeroBlocks).map(({ id, hint }) => ({ id, hint })),
    icons: emailDraftIcons,
  }
}

export type EmailDraftContext = ReturnType<typeof buildEmailDraftContext>

/* -------------------------------------------------------------------------- */
/* Périmètre de la V1                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ce que la V1 ne sait pas composer : refusé avant tout appel, plutôt que
 * d'ignorer silencieusement une donnée ou de fabriquer une offre. Promotion
 * (type « promo ») exige une offre validée ; l'offre, le témoignage, le
 * partenaire et les visuels fournis n'ont pas de bloc dans le vocabulaire ; un
 * disclaimer à date de fin suppose une offre ; la lame de mentions légales
 * porte deux disclaimers au plus.
 */
export function unsupportedEmailDraftReasons(request: EmailGenerationRequest): string[] {
  const reasons: string[] = []
  if (request.emailType === "promo") reasons.push("Les emails promotionnels exigent une offre validée : non pris en charge.")
  if (request.offer) reasons.push("Les offres ne sont pas prises en charge par la génération.")
  if (request.testimonial) reasons.push("Les témoignages ne sont pas pris en charge par la génération.")
  if (request.partner) reasons.push("Les partenaires ne sont pas pris en charge par la génération.")
  if (request.visuals && request.visuals.length > 0) reasons.push("Les visuels fournis ne sont pas pris en charge : les images viennent du catalogue.")
  const disclaimers = [...new Set((request.facts ?? []).flatMap((fact) => (fact.disclaimer ? [fact.disclaimer] : [])))]
  if (disclaimers.some((id) => "parameter" in emailDisclaimers[id])) reasons.push("Un disclaimer à date de fin suppose une offre : non pris en charge.")
  if (disclaimers.length > 2) reasons.push("Au plus deux mentions légales distinctes.")
  return reasons
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

export type EmailDraftPrompt =
  | {
      status: "ready"
      request: EmailGenerationRequest
      context: EmailDraftContext
      system: string
      /** Message utilisateur : { request, context } en JSON compact. */
      user: string
      /** JSON Schema du Draft (Zod). */
      outputSchema: ReturnType<typeof buildEmailDraftJsonSchema>
      /** Le même, adapté au transport Anthropic (Structured Outputs). */
      transportSchema: ReturnType<typeof toAnthropicEmailJsonSchema>
    }
  | { status: "invalid-request"; issues: { path: string; message: string }[] }
  | { status: "unsupported"; reasons: string[] }

/** Assemble le prompt. Déterministe : même requête, même prompt. */
export function buildEmailDraftPrompt(input: unknown): EmailDraftPrompt {
  const parsed = safeParseEmailGenerationRequest(input)
  if (!parsed.success) {
    return {
      status: "invalid-request",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "request", message: issue.message })),
    }
  }
  const request = parsed.data
  const reasons = unsupportedEmailDraftReasons(request)
  if (reasons.length > 0) return { status: "unsupported", reasons }

  const context = buildEmailDraftContext()
  const outputSchema = buildEmailDraftJsonSchema()
  return {
    status: "ready",
    request,
    context,
    system: emailDraftSystemPrompt,
    user: JSON.stringify({ request: requestForDraft(request), context }),
    outputSchema,
    transportSchema: toAnthropicEmailJsonSchema(outputSchema),
  }
}

/* -------------------------------------------------------------------------- */
/* Validation finale du mode Draft                                            */
/* -------------------------------------------------------------------------- */

/** Lames qu'un Draft V1 peut produire : héros, corps, et shell posé par le resolver. */
const shellLames = [
  "email-module-header-newsletter",
  "email-module-header-seasonal-campaign",
  "email-module-legal-disclaimer",
  "email-module-footer-compact-legal",
] as const

const footerDestinationIds = ["catalogue-formations", "alternance", "trajectoire-magazine"] as const satisfies readonly EmailDestinationId[]

/**
 * Politique du mode Draft : mêmes contrôles qu'un EmailConfig direct, avec les
 * ressources du vocabulaire V1. Les liens sont les URLs des dix destinations
 * du Draft et des trois du footer (sans `[URL À CONFIRMER]`, que le resolver
 * ne produit jamais), les visuels ceux des trois images de hero, les
 * disclaimers ceux des faits de la requête.
 */
export function emailDraftValidationPolicy(request: EmailGenerationRequest): EmailValidationPolicy {
  const lames = [...emailDraftHeroBlocks, ...emailDraftBodyLames, ...shellLames]
  const hrefs = [...emailDraftDestinations, ...footerDestinationIds].map(emailDestinationUrl)
  const visuals = emailDraftImageIds.flatMap((id) => emailImageBlocks(id).map((type) => resolveEmailImage(id, type).src))
  return {
    request,
    candidates: new Map(lames.map((type) => [type, {}])),
    hrefs: new Set<string>(hrefs),
    visuals: new Set(visuals),
    disclaimers: new Set((request.facts ?? []).flatMap((fact) => (fact.disclaimer ? [fact.disclaimer] : []))),
  }
}

type Issue = { path: string; message: string }

/**
 * Validation métier finale d'un EmailConfig résolu depuis un Draft : `schemas.ts`
 * d'abord (par `validateEmailAgainst`), puis le vocabulaire, les liens, les
 * visuels et les disclaimers de la politique V1, et enfin ce que seul le mode
 * Draft sait : l'image d'une lame est exactement celle du catalogue (`src` et
 * alt), et les icônes viennent de l'enum du Draft. Aucune ressource libre ne
 * peut donc entrer après la résolution.
 */
export function validateGeneratedDraftEmail(
  output: unknown,
  request: EmailGenerationRequest
): { status: "valid"; config: EmailConfig } | { status: "invalid"; issues: Issue[] } {
  const base = validateEmailAgainst(output, emailDraftValidationPolicy(request))
  if (base.status === "invalid") return base

  const issues: Issue[] = []
  base.config.blocks.forEach((block, index) => {
    for (const [slot, value] of Object.entries(block.slots as Record<string, Record<string, unknown> | undefined>)) {
      if (!value) continue
      if (typeof value.src === "string") {
        const catalogued = emailImagesForBlock(block.type).some((id) => {
          const image = resolveEmailImage(id, block.type)
          return image.src === value.src && image.alt === value.alt
        })
        if (!catalogued) issues.push({ path: `blocks.${index}.slots.${slot}`, message: "Image différente de celle du catalogue pour cette lame." })
      }
      if (typeof value.icon === "string" && !(emailDraftIcons as readonly string[]).includes(value.icon)) {
        issues.push({ path: `blocks.${index}.slots.${slot}.icon`, message: "Icône hors de la liste du Draft." })
      }
      if (typeof value.href === "string" && value.href === emailHrefPlaceholders.urlToConfirm) {
        issues.push({ path: `blocks.${index}.slots.${slot}.href`, message: "Lien non confirmé : le Draft ne produit que des destinations contrôlées." })
      }
    }
  })
  return issues.length > 0 ? { status: "invalid", issues } : base
}
