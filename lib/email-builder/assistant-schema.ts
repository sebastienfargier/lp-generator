/**
 * Contrat de l'assistant. Deux schémas, tous deux stricts :
 *
 * - la RÉPONSE du modèle : `{ message, summary, changes, add, move, remove }`.
 *   Tout vide = un conseil, sans proposition. `changes` : `{ target, value }`,
 *   `target` un champ de la liste FERMÉE décidée par le code avant l'appel
 *   (`assistantFields`). `add` : une lame de la liste fermée des types ajoutables,
 *   sa place, une référence locale et le texte de ses champs. `move` / `remove` :
 *   une lame existante (liste fermée des identifiants). Une API de haut niveau :
 *   aucune opération, aucun HTML, aucune surface, aucun lien, aucun statut. Pas
 *   d'union, aucun optionnel ;
 * - la REQUÊTE du navigateur : document, historique de conversation borné, message.
 *
 * Le schéma contraint la génération ; le système revalide tout (`validateProposal`).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "../email/anthropic-schema"
import { maxProposalChanges } from "./assistant-proposal"
import { compositionLimits, placementWheres, type AddAction, type MoveAction, type RemoveAction } from "./composition"

/** Texte brut : ni balise, ni URL, ni chemin de fichier (mêmes règles que le patch d'édition). */
const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i
const plainText = (label: string) =>
  z
    .string()
    .refine((value) => value.trim() !== "", `${label} : ne doit pas être vide.`)
    .refine((value) => !markup.test(value), `${label} : HTML interdit, texte brut uniquement.`)
    .refine((value) => !looseLink.test(value), `${label} : ni URL, ni chemin, ni fichier.`)

export const assistantMessageMaxLength = 1500

/** Les listes FERMÉES décidées par le code avant l'appel : champs de contenu, lames existantes, types de lame ajoutables. */
export type AssistantSchemaContext = { targets: readonly string[]; blockIds: readonly string[]; blockTypes: readonly string[] }

const closed = (values: readonly string[], fallback: string, error: string) => (values.length > 0 ? z.enum(values as [string, ...string[]], { error }) : z.enum([fallback]))

/** Un mot court sans balise : une référence, un champ, une ancre (le système les revalide contre le document). */
const shortWord = (label: string) => z.string().refine((value) => value.length <= 60 && !markup.test(value) && !looseLink.test(value), `${label} : un mot court.`)

/** Fabrique (jamais un schéma partagé) : le JSON Schema n'a ainsi aucune référence `$ref`. */
const placementSchema = () => z.strictObject({ where: z.enum(placementWheres, { error: "Place inconnue." }), anchor: shortWord("Ancre") })

export function buildAssistantResponseSchema(context: AssistantSchemaContext) {
  const target = closed(context.targets, "aucun-champ", "Champ non modifiable.")
  const blockId = closed(context.blockIds, "aucune-lame", "Lame inconnue.")
  const blockType = closed(context.blockTypes, "aucune-lame-ajoutable", "Lame non ajoutable.")
  return z.strictObject({
    /** Ce que l'assistant dit : un avis, une explication, ou ce qu'il propose. */
    message: plainText("Message").refine((value) => value.length <= assistantMessageMaxLength, `Message : ${assistantMessageMaxLength} caractères au plus.`),
    /** Une phrase sur la proposition ; vide quand il n'y en a pas. */
    summary: z.string().refine((value) => !markup.test(value) && value.length <= 200, "Résumé : texte court."),
    /** Contenus des lames EXISTANTES. */
    changes: z.array(z.strictObject({ target, value: plainText("Valeur") })).refine((changes) => changes.length <= maxProposalChanges, `Au plus ${maxProposalChanges} changements.`),
    /** Lames officielles à ajouter, avec le texte de leurs champs ; `ref` : un nom local, pour s'y placer. */
    add: z
      .array(z.strictObject({ ref: shortWord("Référence"), blockType, placement: placementSchema(), content: z.array(z.strictObject({ slot: shortWord("Champ"), value: plainText("Valeur") })) }))
      .refine((actions) => actions.length <= compositionLimits.add, `Au plus ${compositionLimits.add} ajouts.`),
    move: z.array(z.strictObject({ blockId, placement: placementSchema() })).refine((actions) => actions.length <= compositionLimits.move, `Au plus ${compositionLimits.move} déplacements.`),
    remove: z.array(z.strictObject({ blockId })).refine((actions) => actions.length <= compositionLimits.remove, `Au plus ${compositionLimits.remove} suppressions.`),
  })
}

export type AssistantResponse = { message: string; summary: string; changes: { target: string; value: string }[]; add: AddAction[]; move: MoveAction[]; remove: RemoveAction[] }

export function safeParseAssistantResponse(context: AssistantSchemaContext, input: unknown) {
  return buildAssistantResponseSchema(context).safeParse(input, { error: z.locales.fr().localeError })
}

/** JSON Schema de la réponse, adapté au transport Anthropic. */
export const buildAssistantTransportSchema = (context: AssistantSchemaContext) => toAnthropicEmailJsonSchema(z.toJSONSchema(buildAssistantResponseSchema(context), { reused: "ref" }))

/* -------------------------------------------------------------------------- */
/* Requête                                                                    */
/* -------------------------------------------------------------------------- */

export const assistantHistoryLimit = 12
export const assistantTurnMaxLength = 4000
export const assistantRequestMaxLength = 2000

export const AssistantRequestSchema = z.strictObject({
  /** Le document COURANT, à chaque appel : jamais celui du premier message. */
  document: z.unknown(),
  /** Les tours précédents, du plus ancien au plus récent. */
  history: z.array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().max(assistantTurnMaxLength) })).max(assistantHistoryLimit * 2),
  message: z.string().trim().min(1, "Écrivez un message.").max(assistantRequestMaxLength, `Le message tient en ${assistantRequestMaxLength} caractères au plus.`),
  /** Ce que la personne a sélectionné dans le canvas : un indice pour « cette lame », jamais une autorisation. */
  selection: z.strictObject({ blockId: z.string().min(1).max(100), slot: z.string().min(1).max(100).optional() }).nullable().optional(),
  /** Développement seulement : réponses simulées, aucun appel Anthropic. Ignoré en production. */
  devMock: z.boolean().optional(),
})

export type AssistantRequest = z.infer<typeof AssistantRequestSchema>
