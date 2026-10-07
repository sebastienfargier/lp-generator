/**
 * Contrat de l'assistant éditorial. Deux schémas, tous deux stricts :
 *
 * - la RÉPONSE du modèle : `{ message, summary, changes }`. `changes` vide = un
 *   conseil, sans proposition. Chaque changement est `{ target, value }` où
 *   `target` est un champ de la liste FERMÉE décidée par le code avant l'appel
 *   (`assistantFields`) : le schéma ne sait rien exprimer d'autre qu'un texte,
 *   un libellé de bouton ou une image sur un champ existant. Pas d'ajout, de
 *   suppression, de déplacement, de surface, de lien, de statut, de HTML, de CSS
 *   ni d'opération : aucune clé ne les porte. Compatible Structured Output : deux
 *   objets, aucune union, aucun optionnel ;
 * - la REQUÊTE du navigateur : document, historique de conversation borné, message.
 *
 * Le schéma contraint la génération ; le système revalide tout (`validateProposal`).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "../email/anthropic-schema"
import { maxProposalChanges } from "./assistant-proposal"

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

export function buildAssistantResponseSchema(targets: readonly string[]) {
  const target = targets.length > 0 ? z.enum(targets as [string, ...string[]], { error: "Champ non modifiable." }) : z.enum(["aucun-champ"])
  return z.strictObject({
    /** Ce que l'assistant dit : un avis, une explication, ou ce qu'il propose. */
    message: plainText("Message").refine((value) => value.length <= assistantMessageMaxLength, `Message : ${assistantMessageMaxLength} caractères au plus.`),
    /** Une phrase sur la proposition ; vide quand il n'y en a pas. */
    summary: z.string().refine((value) => !markup.test(value) && value.length <= 200, "Résumé : texte court."),
    changes: z.array(z.strictObject({ target, value: plainText("Valeur") })).refine((changes) => changes.length <= maxProposalChanges, `Au plus ${maxProposalChanges} changements.`),
  })
}

export type AssistantResponse = { message: string; summary: string; changes: { target: string; value: string }[] }

export function safeParseAssistantResponse(targets: readonly string[], input: unknown) {
  return buildAssistantResponseSchema(targets).safeParse(input, { error: z.locales.fr().localeError })
}

/** JSON Schema de la réponse, adapté au transport Anthropic. */
export const buildAssistantTransportSchema = (targets: readonly string[]) => toAnthropicEmailJsonSchema(z.toJSONSchema(buildAssistantResponseSchema(targets), { reused: "ref" }))

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
  /** Développement seulement : réponses simulées, aucun appel Anthropic. Ignoré en production. */
  devMock: z.boolean().optional(),
})

export type AssistantRequest = z.infer<typeof AssistantRequestSchema>
