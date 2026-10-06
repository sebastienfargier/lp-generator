/**
 * Draft R4 (promotion) : ce que Claude décide, et rien de plus. Compact, strict,
 * tous les champs requis, aucune union : il tient en six objets.
 *
 * Claude écrit le CRÉATIF : l'objet, le préheader, l'intention visuelle, le
 * surtitre et l'accroche de l'offre, le libellé du bouton, trois appuis (icône,
 * titre, texte), une clôture. Il ne produit JAMAIS : valeur, montant,
 * pourcentage, prix, code, date, échéance, périmètre, conditions, mention
 * légale, URL, destination, image, lame, surface, classe, HTML. Ces valeurs
 * viennent des Promotion Facts (`promotion-facts.ts`) et sont injectées par le
 * resolver (`promotion-resolver.ts`) ; le Draft n'a aucun champ pour elles, et
 * un champ en trop est refusé (`strictObject`).
 *
 * Le texte rédigé est du texte brut : ni HTML, ni URL, ni chemin d'image. Les
 * garde-fous de contenu (chiffres, dates, urgence, code, financement) sont
 * dans `promotion-copy.ts`, appliqués par la validation après la réponse.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "./anthropic-schema"
import type { EmailVisualIntent } from "./image-bank"
import { emailRecipeIcons } from "./recipes"

const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i

/** Texte rédigé : non vide, sans balisage HTML, sans URL ni chemin libre. */
const text = z
  .string()
  .refine((value) => value.trim() !== "", "Ne doit pas être vide.")
  .refine((value) => !markup.test(value), "HTML interdit : texte brut uniquement.")
  .refine((value) => !looseLink.test(value), "URL ou chemin interdit : la destination et l'image viennent de la demande et de la banque.")

/** Intentions visuelles d'une promotion : portrait de campagne ou mouvement (des visuels énergiques, pas de scène posée). */
export const promotionVisualIntents = ["campaign-portrait", "career-movement"] as const satisfies readonly EmailVisualIntent[]

export const PromotionDraftSchema = z.strictObject({
  subject: text,
  preheader: text,
  visualIntent: z.enum(promotionVisualIntents, { error: "Intention visuelle hors de la recette." }),
  /** L'offre : surtitre, accroche (la valeur, le code, la date et le périmètre sont ajoutés par le système) et libellé du bouton. */
  offer: z.strictObject({ eyebrow: text, text, ctaLabel: text }),
  /** Trois appuis qui aident à se décider : actions de la personne, jamais des faits Studi. */
  support: z.strictObject({
    title: text,
    items: z.array(z.strictObject({ icon: z.enum(emailRecipeIcons, { error: "Icône hors de la liste." }), title: text, text })).length(3),
  }),
  /** Clôture : même destination que le bouton de l'offre (un seul appel principal). */
  closing: z.strictObject({ title: text, text, ctaLabel: text }),
})

export type PromotionDraft = z.infer<typeof PromotionDraftSchema>

export function safeParsePromotionDraft(input: unknown) {
  return PromotionDraftSchema.safeParse(input, { error: z.locales.fr().localeError })
}

/** JSON Schema du Draft (Zod), puis adapté au transport Anthropic (voir `anthropic-schema.ts`). */
export const buildPromotionDraftJsonSchema = () => z.toJSONSchema(PromotionDraftSchema, { reused: "ref" })
export const buildPromotionTransportSchema = () => toAnthropicEmailJsonSchema(buildPromotionDraftJsonSchema())
