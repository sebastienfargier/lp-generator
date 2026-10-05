/**
 * Trois Drafts distincts, un par recette : ce que Claude décidera, et rien de
 * plus. La recette est connue AVANT l'appel (`recipe-selection.ts`), donc
 * chaque appel ne reçoit que le schéma de sa recette : jamais d'union des
 * trois au niveau du transport.
 *
 * Un Draft ne contient que du contenu sémantique : l'objet, le préheader, un
 * hero, les textes des sections que la recette prévoit, une intention
 * visuelle (R1, R3), une édition (R2), des identifiants fermés de destination,
 * d'icône et de claim. Aucun champ de présentation : ni lame, ni classe, ni
 * couleur, ni surface, ni image, ni chemin, ni crop, ni alt, ni footer, ni
 * mention légale, ni URL. Tous les objets sont stricts, tous les champs
 * requis, aucun optionnel.
 *
 * Le code décide du reste, de façon déterministe, depuis la requête :
 * disposition du hero, frise de portraits, surface d'empathie, destination du
 * second bouton, image, shell, mentions légales. `toRecipeComposition` convertit
 * un Draft validé en `EmailRecipeComposition` ; le resolver de recettes
 * (`recipe-resolver.ts`) fait le reste.
 *
 * Claims (R3) : le Draft ne désigne que des identifiants. Aucun champ ne peut
 * réécrire une claim ; le resolver copie la formulation exacte depuis Brand.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "./anthropic-schema"
import type { EmailRecipeRequest } from "./recipe-selection"
import { emailImagesForIntent, emailPortraitStripIds, type EmailVisualIntent } from "./image-bank"
import {
  composeEmailRecipe,
  stableIndex,
  type EmailRecipeComposition,
  type EmailRecipeResolution,
  type EmailRecipeSection,
} from "./recipe-resolver"
import { classifyEmailRecipeDiagnostics } from "./recipe-validation"
import { emailRecipeHeroLames, emailRecipeIcons, emailRecipes, type EmailHeroLayout, type EmailRecipeId } from "./recipes"

/* -------------------------------------------------------------------------- */
/* Briques                                                                    */
/* -------------------------------------------------------------------------- */

const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i

/** Texte rédigé : non vide, sans balisage HTML, sans URL libre (les liens sont des identifiants). */
const text = z
  .string()
  .refine((value) => value.trim() !== "", "Ne doit pas être vide.")
  .refine((value) => !markup.test(value), "HTML interdit : texte brut uniquement.")
  .refine((value) => !looseLink.test(value), "URL ou chemin interdit : un lien se désigne par un identifiant de destination, une image par une intention.")

const item = z.strictObject({ title: text, text })

const destination = (recipe: EmailRecipeId) => z.enum([...emailRecipes[recipe].destinations] as [string, ...string[]], { error: "Destination inconnue." })

const hero = (recipe: EmailRecipeId) =>
  z.strictObject({
    eyebrow: text,
    title: text,
    text,
    cta: z.strictObject({ label: text, destination: destination(recipe) }),
  })

const intents = (recipe: EmailRecipeId) =>
  z.enum([...emailRecipes[recipe].images.intents] as [EmailVisualIntent, ...EmailVisualIntent[]], { error: "Intention visuelle hors de la recette." })

/** Libellé d'un second bouton : sa destination est celle du hero (un seul CTA principal). */
const closing = z.strictObject({ title: text, text, ctaLabel: text })

/* -------------------------------------------------------------------------- */
/* R1 — découverte et réassurance                                             */
/* -------------------------------------------------------------------------- */

export const DiscoveryDraftSchema = z.strictObject({
  subject: text,
  preheader: text,
  visualIntent: intents("discovery-reassurance"),
  hero: hero("discovery-reassurance"),
  steps: z.strictObject({ eyebrow: text, items: z.array(item).length(3) }),
  benefits: z.strictObject({
    title: text,
    items: z.array(z.strictObject({ icon: z.enum(emailRecipeIcons, { error: "Icône hors de la liste." }), title: text, text })).length(3),
  }),
  closing,
})

/* -------------------------------------------------------------------------- */
/* R2 — newsletter éditoriale                                                 */
/* -------------------------------------------------------------------------- */

/** Éditions de la newsletter : bandeau image ou frise de portraits. La frise elle-même est choisie par le code. */
export const newsletterEditions = ["banner", "portrait-strip"] as const
export type NewsletterEdition = (typeof newsletterEditions)[number]

export const NewsletterDraftSchema = z.strictObject({
  edition: z.enum(newsletterEditions, { error: "Édition de newsletter inconnue." }),
  subject: text,
  preheader: text,
  hero: hero("editorial-newsletter"),
  intro: z.strictObject({ title: text, text }),
  rubriques: z.strictObject({ eyebrow: text, title: text, items: z.array(item).length(4) }),
  closing,
})

/* -------------------------------------------------------------------------- */
/* R3 — preuves de marque                                                     */
/* -------------------------------------------------------------------------- */

/** Identifiant de claim approuvée, tel que le resolver le type (la couche Brand n'est importée que par lui). */
type ApprovedClaimId = Extract<EmailRecipeSection, { kind: "claim-text" }>["claim"]

const proofClaimIds = emailRecipes["brand-proof"].claims.allowed as readonly ApprovedClaimId[]

export const BrandProofDraftSchema = z
  .strictObject({
    subject: text,
    preheader: text,
    visualIntent: intents("brand-proof"),
    hero: hero("brand-proof"),
    /** Identifiants de claims approuvées, 2 ou 3, sans doublon : jamais une formulation. */
    claims: z.array(z.enum(proofClaimIds as readonly [ApprovedClaimId, ...ApprovedClaimId[]], { error: "Claim inconnue, non approuvée ou hors de la recette." })),
    /** Un texte d'appui par claim, sans chiffre : il l'introduit ou la situe, il ne la reformule pas. */
    support: z.array(text),
    closing: z.strictObject({ title: text, text }),
  })
  .superRefine((draft, ctx) => {
    if (draft.claims.length < 2 || draft.claims.length > 3) {
      ctx.addIssue({ code: "custom", path: ["claims"], message: "Deux ou trois claims sont attendues." })
    }
    if (new Set(draft.claims).size !== draft.claims.length) {
      ctx.addIssue({ code: "custom", path: ["claims"], message: "Une claim ne se répète pas." })
    }
    if (draft.support.length !== draft.claims.length) {
      ctx.addIssue({ code: "custom", path: ["support"], message: "Un texte d'appui par claim, dans le même ordre." })
    }
  })

export type DiscoveryDraft = z.infer<typeof DiscoveryDraftSchema>
export type NewsletterDraft = z.infer<typeof NewsletterDraftSchema>
export type BrandProofDraft = z.infer<typeof BrandProofDraftSchema>

export const emailRecipeDraftSchemas = {
  "discovery-reassurance": DiscoveryDraftSchema,
  "editorial-newsletter": NewsletterDraftSchema,
  "brand-proof": BrandProofDraftSchema,
} as const satisfies Record<EmailRecipeId, z.ZodType>

export type EmailRecipeDraft = DiscoveryDraft | NewsletterDraft | BrandProofDraft

export function safeParseEmailRecipeDraft(recipe: EmailRecipeId, input: unknown) {
  return emailRecipeDraftSchemas[recipe].safeParse(input, { error: z.locales.fr().localeError })
}

/** JSON Schema du Draft de la recette (Zod), puis adapté au transport Anthropic (voir `anthropic-schema.ts`). */
export function buildRecipeDraftJsonSchema(recipe: EmailRecipeId) {
  return z.toJSONSchema(emailRecipeDraftSchemas[recipe], { reused: "ref" })
}

export function buildRecipeTransportSchema(recipe: EmailRecipeId) {
  return toAnthropicEmailJsonSchema(buildRecipeDraftJsonSchema(recipe))
}

/* -------------------------------------------------------------------------- */
/* Décisions du code                                                          */
/* -------------------------------------------------------------------------- */

const empathyCues = ["demandeur", "sans emploi", "chomage", "recherche d'emploi"]
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Surface d'empathie : décidée par le code d'après l'audience (mêmes indices que le Draft V1), jamais par le modèle. */
export function surfaceIntentFor(audience: string, target?: string): "default" | "empathy" {
  if (target) return target === "demandeurs_emploi" ? "empathy" : "default"
  const folded = fold(audience)
  return empathyCues.some((cue) => folded.includes(cue)) ? "empathy" : "default"
}

/** Disposition du hero : choisie par le code parmi celles de la recette qui ont une image pour l'intention, de façon stable. */
export function heroLayoutFor(recipe: EmailRecipeId, intent: EmailVisualIntent, seed: string): EmailHeroLayout {
  const layouts = emailRecipes[recipe].heroLayouts.filter((layout) => emailImagesForIntent(intent, emailRecipeHeroLames[layout]).length > 0)
  if (layouts.length === 0) throw new Error(`Aucune disposition de hero avec une image « ${intent} » pour la recette « ${recipe} ».`)
  return layouts[stableIndex(`${seed}|layout`, layouts.length)]!
}

/* -------------------------------------------------------------------------- */
/* Draft → composition                                                        */
/* -------------------------------------------------------------------------- */

type Triple<T> = readonly [T, T, T]

const subjectOf = (request: EmailRecipeRequest, draft: { subject: string }) => request.subject ?? draft.subject

function heroOf(draft: { hero: DiscoveryDraft["hero"] }, layout: EmailHeroLayout) {
  const { eyebrow, ...rest } = draft.hero
  // Le hero moyen n'a pas de surtitre : celui du Draft est alors sans objet (même règle que le Draft V1).
  return layout === "medium" ? rest : { eyebrow, ...rest }
}

function discoveryComposition(request: EmailRecipeRequest, draft: DiscoveryDraft): EmailRecipeComposition {
  const heroLayout = heroLayoutFor("discovery-reassurance", draft.visualIntent, request.campaignName)
  return {
    recipe: "discovery-reassurance",
    campaignName: request.campaignName,
    subject: subjectOf(request, draft),
    preheader: draft.preheader,
    heroLayout,
    visualIntent: draft.visualIntent,
    surfaceIntent: surfaceIntentFor(request.audience, request.target),
    seed: request.campaignName,
    hero: heroOf(draft, heroLayout) as EmailRecipeComposition["hero"],
    sections: [
      { kind: "steps", eyebrow: draft.steps.eyebrow, items: draft.steps.items as unknown as Triple<{ title: string; text: string }> },
      { kind: "benefits", title: draft.benefits.title, items: draft.benefits.items as unknown as Extract<EmailRecipeSection, { kind: "benefits" }>["items"] },
      { kind: "closing", title: draft.closing.title, text: draft.closing.text, cta: { label: draft.closing.ctaLabel, destination: draft.hero.cta.destination as never } },
    ],
  }
}

function newsletterComposition(request: EmailRecipeRequest, draft: NewsletterDraft): EmailRecipeComposition {
  const banner = draft.edition === "banner"
  const cta = { label: draft.closing.ctaLabel, destination: draft.hero.cta.destination as never }
  return {
    recipe: "editorial-newsletter",
    campaignName: request.campaignName,
    subject: subjectOf(request, draft),
    preheader: draft.preheader,
    heroLayout: banner ? "banner" : "portrait-strip",
    ...(banner ? { visualIntent: "editorial-work" as const } : { stripId: emailPortraitStripIds[stableIndex(`${request.campaignName}|strip`, emailPortraitStripIds.length)]! }),
    seed: request.campaignName,
    hero: draft.hero as EmailRecipeComposition["hero"],
    sections: [
      { kind: "text", title: draft.intro.title, text: draft.intro.text },
      { kind: "grid", eyebrow: draft.rubriques.eyebrow, title: draft.rubriques.title, items: draft.rubriques.items as unknown as Extract<EmailRecipeSection, { kind: "grid" }>["items"] },
      banner ? { kind: "illustrated", title: draft.closing.title, text: draft.closing.text, cta } : { kind: "closing", title: draft.closing.title, text: draft.closing.text, cta },
    ],
  }
}

function brandProofComposition(request: EmailRecipeRequest, draft: BrandProofDraft): EmailRecipeComposition {
  const heroLayout = heroLayoutFor("brand-proof", draft.visualIntent, request.campaignName)
  const proofs: EmailRecipeSection[] =
    draft.claims.length === 3
      ? [{ kind: "claim-list", eyebrow: draft.hero.eyebrow, claims: draft.claims as unknown as Triple<ApprovedClaimId>, texts: draft.support as unknown as Triple<string> }]
      : draft.claims.map((claim, index) => ({ kind: "claim-text" as const, claim, text: draft.support[index]! }))
  return {
    recipe: "brand-proof",
    campaignName: request.campaignName,
    subject: subjectOf(request, draft),
    preheader: draft.preheader,
    heroLayout,
    visualIntent: draft.visualIntent,
    seed: request.campaignName,
    hero: heroOf(draft, heroLayout) as EmailRecipeComposition["hero"],
    sections: [...proofs, { kind: "text", title: draft.closing.title, text: draft.closing.text }],
  }
}

/** Draft validé + requête → composition. Déterministe : mêmes entrées, même composition. */
export function toRecipeComposition(request: EmailRecipeRequest, recipe: EmailRecipeId, draft: EmailRecipeDraft): EmailRecipeComposition {
  switch (recipe) {
    case "discovery-reassurance":
      return discoveryComposition(request, draft as DiscoveryDraft)
    case "editorial-newsletter":
      return newsletterComposition(request, draft as NewsletterDraft)
    case "brand-proof":
      return brandProofComposition(request, draft as BrandProofDraft)
  }
}

/* -------------------------------------------------------------------------- */
/* Pipeline hors ligne                                                        */
/* -------------------------------------------------------------------------- */

export type EmailRecipeDraftResolution =
  | (Extract<EmailRecipeResolution, { status: "resolved" }> & { policy: ReturnType<typeof classifyEmailRecipeDiagnostics> })
  | { status: "invalid-draft"; issues: { path: string; message: string }[] }
  | Exclude<EmailRecipeResolution, { status: "resolved" }>

/**
 * Draft inconnu → validation du Draft de la recette → composition → resolver
 * (EmailConfig, schéma, recette, terminologie). Les faits de la demande
 * servent à admettre leurs nombres. Aucun appel de modèle, aucune correction,
 * aucune relance : un Draft qui ne passe pas est une erreur.
 */
export function resolveEmailRecipeDraft(request: EmailRecipeRequest, recipe: EmailRecipeId, input: unknown): EmailRecipeDraftResolution {
  const draft = safeParseEmailRecipeDraft(recipe, input)
  if (!draft.success) {
    return { status: "invalid-draft", issues: draft.error.issues.map((issue) => ({ path: issue.path.join(".") || "draft", message: issue.message })) }
  }
  const composition = toRecipeComposition(request, recipe, draft.data as EmailRecipeDraft)
  const resolution = composeEmailRecipe(composition, { facts: (request.facts ?? []).map((fact) => fact.statement) })
  return resolution.status === "resolved" ? { ...resolution, policy: classifyEmailRecipeDiagnostics(resolution.diagnostics) } : resolution
}
