import { z } from "zod"

import { buildEmailGenerationContext, type EmailGenerationContext } from "./generation-context"
import {
  safeParseEmailGenerationRequest,
  type EmailGenerationRequest,
} from "./generation-request"
import { EmailBlockSchema, EmailConfigSchema, safeParseEmailConfig } from "./schemas"
import { emailHrefPlaceholders } from "./system"
import type { EmailConfig } from "./types"

/**
 * Assemblage du prompt d'une génération par modèle, sans réseau.
 *
 * requête (données validées) → contexte 5B → { system, user, outputSchema }
 * Sortie attendue : un EmailConfig, en JSON seul. Le prompt n'est jamais une
 * garantie : la réponse passe par `validateGeneratedEmail` (Zod, puis
 * contrôles propres à la requête) avant `renderEmail`.
 */

/* -------------------------------------------------------------------------- */
/* Instructions système                                                       */
/* -------------------------------------------------------------------------- */

export const emailSystemPrompt = `Tu composes un email Studi sous la forme d'un objet JSON EmailConfig, à partir des données du message utilisateur : "request" (la demande et ses faits validés) et "context" (les lames candidates, les règles, le vocabulaire autorisé).

Réponds uniquement par l'objet JSON conforme au schéma de sortie : aucun texte avant ou après, aucun markdown, aucune explication.

Ce que tu décides :
- les lames, parmi context.sections uniquement, et leur ordre ;
- le texte des slots, en français, vouvoiement, phrases courtes, promesse au conditionnel ;
- la surface des lames "configurable", parmi context.surfaces.allowed, en respectant onlySurfaces ; privilégie context.surfaces.recommended pour la zone colorée ;
- le lien de chaque bouton ou lien : l'url exacte d'une entrée de context.links, sinon "${emailHrefPlaceholders.urlToConfirm}" ;
- l'icône d'un slot asset:icone, parmi context.iconNames ;
- le disclaimer d'un slot disclaimer, parmi context.disclaimers (identifiant seulement).

Ce que tu ne fais jamais :
- produire du HTML, du CSS, des classes, des styles ou des couleurs ;
- inventer une lame, un slot ou un type ; chaque lame porte exactement ses slots listés ("nom: type", "?" = optionnel), avec la forme de context.slotKinds ;
- inventer une URL, un visuel ou un chemin : un visuel vient de request.visuals, avec son alt ;
- inventer un fait : prix, montant, pourcentage, remise, code, date, durée, salaire, statistique, certification, financement, partenaire, témoignage. N'utilise que request.facts, request.offer, request.testimonial et request.partner, à l'identique pour un code, un compte à rebours, un témoignage ou un nom de partenaire ;
- écrire un texte juridique : chaque disclaimer est un identifiant ; ajoute la lame de mentions légales quand un fait ou l'offre utilisés l'exigent, avec l'endDate de l'offre si le disclaimer la demande, et un astérisque collé à la mention dans le corps.

Métadonnées : version 1 ; id en minuscules et tirets, dérivé du nom de campagne ; name = nom de campagne ; subject = request.subject s'il est fourni, sinon un objet de 30 à 45 caractères ; preheader de 60 à 90 caractères qui prolonge l'objet.

Respecte context.rules.structural (contraintes vérifiées) et suis context.rules.editorial (recommandations).`

/* -------------------------------------------------------------------------- */
/* Schéma de sortie                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Schéma de sortie dérivé du contrat Zod existant, restreint aux lames
 * candidates : même construction par lame, aucun schéma parallèle. Les
 * vérifications qui ne s'expriment pas en JSON Schema (HTML dans un texte,
 * politique des liens, règles entre lames) restent faites par Zod.
 */
export function buildEmailOutputSchema(candidateTypes: readonly string[]) {
  const allowed = new Set(candidateTypes)
  const options = EmailBlockSchema.options.filter((option) => allowed.has(option.shape.type.value))
  const [first, ...rest] = options
  if (!first) throw new Error("Aucune lame candidate : pas de schéma de sortie.")
  return z.strictObject({
    ...EmailConfigSchema.shape,
    blocks: z.array(z.discriminatedUnion("type", [first, ...rest])).min(1),
  })
}

export function buildEmailOutputJsonSchema(candidateTypes: readonly string[]) {
  return z.toJSONSchema(buildEmailOutputSchema(candidateTypes), { reused: "ref" })
}

/* -------------------------------------------------------------------------- */
/* Composabilité                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Une composition valide est-elle possible avec ces candidates ? Il faut au
 * moins un hero, un footer et une lame de corps. Sinon, diagnostic : on ne
 * demande pas au modèle de combler une donnée manquante.
 */
export function assessEmailComposability(context: EmailGenerationContext): string[] {
  const families = new Set(context.sections.map((section) => section.family))
  const reasons: string[] = []
  if (!families.has("Hero")) reasons.push("Aucun hero possible : fournir un visuel HTTPS, un compte à rebours ou une valeur validée selon le type d'email.")
  if (!context.sections.some((section) => section.type === "email-module-footer-compact-legal")) reasons.push("Footer indisponible.")
  const body = ["Story", "Features", "Benefits", "Offer", "Products", "Diagnostic"]
  if (!body.some((family) => families.has(family as never))) reasons.push("Aucune lame de corps possible.")
  return reasons
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

export type EmailAiPrompt =
  | {
      status: "ready"
      request: EmailGenerationRequest
      context: EmailGenerationContext
      system: string
      /** Message utilisateur : { request, context } en JSON compact. */
      user: string
      outputSchema: ReturnType<typeof buildEmailOutputJsonSchema>
    }
  | { status: "invalid-request"; issues: { path: string; message: string }[] }
  | { status: "impossible"; context: EmailGenerationContext; reasons: string[] }

/** Assemble le prompt. Déterministe : même requête, même prompt. */
export function buildEmailAiPrompt(input: unknown): EmailAiPrompt {
  const parsed = safeParseEmailGenerationRequest(input)
  if (!parsed.success) {
    return {
      status: "invalid-request",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "request", message: issue.message })),
    }
  }
  const request = parsed.data
  const context = buildEmailGenerationContext(request)
  const reasons = assessEmailComposability(context)
  if (reasons.length > 0) return { status: "impossible", context, reasons }

  return {
    status: "ready",
    request,
    context,
    system: emailSystemPrompt,
    user: JSON.stringify({ request, context }),
    outputSchema: buildEmailOutputJsonSchema(context.sections.map((section) => section.type)),
  }
}

/* -------------------------------------------------------------------------- */
/* Validation de la réponse                                                   */
/* -------------------------------------------------------------------------- */

type Issue = { path: string; message: string }
type Slots = Record<string, Record<string, unknown> | undefined>

/**
 * Seconde couche après Zod : la réponse n'utilise que ce que la requête et le
 * contexte autorisent. Les faits recopiés (code, compte à rebours,
 * témoignage, partenaire, date de fin) doivent être identiques.
 */
export function validateGeneratedEmail(
  output: unknown,
  prompt: Extract<EmailAiPrompt, { status: "ready" }>
): { status: "valid"; config: EmailConfig } | { status: "invalid"; issues: Issue[] } {
  const parsed = safeParseEmailConfig(output)
  if (!parsed.success) {
    return {
      status: "invalid",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "(root)", message: issue.message })),
    }
  }

  const { request, context } = prompt
  const issues: Issue[] = []
  const candidates = new Map(context.sections.map((section) => [section.type, section]))
  const hrefs = new Set<string>([...context.links.map((link) => link.url), emailHrefPlaceholders.urlToConfirm])
  const visuals = new Set((request.visuals ?? []).map((visual) => visual.src))
  const disclaimers = new Set(context.disclaimers?.map((entry) => entry.id) ?? [])
  const offer = request.offer

  parsed.data.blocks.forEach((block, index) => {
    const at = (path: string) => `blocks.${index}.${path}`
    const section = candidates.get(block.type)
    if (!section) {
      issues.push({ path: at("type"), message: `Lame hors des candidates : "${block.type}".` })
      return
    }
    const surface = "surface" in block ? block.surface : undefined
    if (surface && section.onlySurfaces && !section.onlySurfaces.includes(surface)) {
      issues.push({ path: at("surface"), message: `Surface "${surface}" exclue pour cette lame.` })
    }
    const expect = (slot: string, actual: unknown, expected: string | undefined) => {
      if (actual !== undefined && actual !== expected) {
        issues.push({ path: at(`slots.${slot}`), message: "Valeur différente du fait fourni par la requête." })
      }
    }

    for (const [slot, value] of Object.entries(block.slots as Slots)) {
      if (!value) continue
      if (typeof value.href === "string" && !hrefs.has(value.href)) {
        issues.push({ path: at(`slots.${slot}.href`), message: "Lien hors des destinations contrôlées." })
      }
      if (typeof value.src === "string" && !visuals.has(value.src)) {
        issues.push({ path: at(`slots.${slot}.src`), message: "Visuel non fourni par la requête." })
      }
      if (typeof value.disclaimer === "string") {
        if (!disclaimers.has(value.disclaimer as never)) {
          issues.push({ path: at(`slots.${slot}.disclaimer`), message: "Disclaimer non proposé par le contexte." })
        }
        if ("endDate" in value && value.endDate !== offer?.endDate) {
          issues.push({ path: at(`slots.${slot}.endDate`), message: "Date de fin différente de celle de l'offre." })
        }
      }
      const text = value.text
      if (slot.startsWith("code-promo")) expect(slot, text, offer?.code)
      const counter = /^compteur-(\d)$/.exec(slot)
      if (counter) expect(slot, text, offer?.countdown?.[Number(counter[1]) - 1]?.value)
      if (slot === "temoignage") expect(slot, text, request.testimonial?.quote)
      if (slot === "temoignage-auteur") expect(slot, text, request.testimonial?.author)
      if (slot === "partenaire") expect(slot, text, request.partner?.name)
    }
  })

  return issues.length > 0 ? { status: "invalid", issues } : { status: "valid", config: parsed.data }
}
