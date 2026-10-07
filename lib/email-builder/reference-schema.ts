/**
 * Contrat de la réponse du modèle pour une référence : `{ status, sensitive,
 * analysis, mapping }`. Le modèle DÉCRIT ce qu'il voit (`analysis`) puis dit ce qu'il
 * en fait avec les lames Studi (`mapping`). Il ne produit jamais le plan de
 * composition : ni place, ni ancre, ni opération, ni HTML, ni CSS, ni coordonnées.
 *
 * Listes fermées partout où c'est possible (rôles, dispositions, types de lame,
 * images de la banque, faits sensibles). Aucune union, aucun champ optionnel
 * (Structured Output) : un champ « vide » est une chaîne ou un tableau vide, et le
 * système revalide la cohérence (`reference-mapping.ts`).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "../email/anthropic-schema"
import { emailBankImageIds } from "../email/image-bank"
import { referenceLayouts, referenceRoles } from "./document"
import { referenceGaps } from "./reference-gap"
import { referenceLimits } from "./reference-file"

export const referenceStatuses = ["valid", "not-an-email"] as const
export const referenceMappingStatuses = ["matched", "approximate", "unmatched"] as const
export const referenceTones = ["light", "dark", "brand", "neutral"] as const
/** Faits sensibles OBSERVÉS dans la référence : un signal pour le compte rendu, jamais une donnée Studi. */
export const referenceSensitiveKinds = ["price", "percentage", "date", "promo-code", "guarantee", "quantified-proof", "partner"] as const
export type ReferenceSensitiveKind = (typeof referenceSensitiveKinds)[number]

/** Texte brut : ni balise, ni URL, ni chemin de fichier. */
const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i
const shortText = (label: string, max: number) => z.string().refine((value) => value.length <= max && !markup.test(value) && !looseLink.test(value), `${label} : texte brut, ${max} caractères au plus, ni HTML ni URL.`)

export type ReferenceSchemaContext = { blockTypes: readonly string[] }

export function buildReferenceResponseSchema(context: ReferenceSchemaContext) {
  const blockType = z.enum(["", ...context.blockTypes] as [string, ...string[]], { error: "Lame non ajoutable." })
  const imageId = z.enum(emailBankImageIds as unknown as [string, ...string[]], { error: "Image inconnue de la banque." })
  return z.strictObject({
    /** `not-an-email` : l'image ne représente pas un email exploitable ; les tableaux restent alors vides. */
    status: z.enum(referenceStatuses, { error: "Statut inconnu." }),
    /** Faits sensibles vus dans la référence (liste fermée) : signalés, jamais repris. */
    sensitive: z.array(z.enum(referenceSensitiveKinds, { error: "Fait sensible inconnu." })),
    analysis: z.strictObject({
      sections: z
        .array(
          z.strictObject({
            ref: z.string().regex(/^s[0-9]{1,2}$/, "Référence : s1, s2…"),
            role: z.enum(referenceRoles, { error: "Rôle inconnu." }),
            layout: z.enum(referenceLayouts, { error: "Disposition inconnue." }),
            intent: shortText("Intention", 160),
            hasImage: z.boolean(),
            imageCount: z.number().int().min(0).max(20),
            hasCta: z.boolean(),
            repeatedItems: z.number().int().min(0).max(20),
            tone: z.enum(referenceTones, { error: "Tonalité inconnue." }),
          }),
        )
        .refine((sections) => sections.length <= referenceLimits.maxSections, `Au plus ${referenceLimits.maxSections} sections.`),
    }),
    mapping: z
      .array(
        z.strictObject({
          ref: z.string().regex(/^s[0-9]{1,2}$/, "Référence : s1, s2…"),
          status: z.enum(referenceMappingStatuses, { error: "Statut de correspondance inconnu." }),
          blockType,
          reason: shortText("Raison", 160),
          /**
           * Les écarts de STRUCTURE (valeurs fermées de `reference-gap.ts`) entre la section et la meilleure lame ; [] si aucun.
           * La `reason` ci-dessus reste descriptive (compte rendu) : elle ne décide JAMAIS d'une lame générée, seul `structure` et le code.
           */
          structure: z.array(z.enum(referenceGaps, { error: "Écart de structure inconnu." })),
          content: z.array(z.strictObject({ slot: shortText("Champ", 60), value: shortText("Valeur", 400) })),
          images: z.array(z.strictObject({ slot: shortText("Visuel", 60), imageId })),
        }),
      )
      .refine((entries) => entries.length <= referenceLimits.maxSections, `Au plus ${referenceLimits.maxSections} correspondances.`),
  })
}

export type ReferenceResponse = z.infer<ReturnType<typeof buildReferenceResponseSchema>>
export type ReferenceSection = ReferenceResponse["analysis"]["sections"][number]
export type ReferenceMappingEntry = ReferenceResponse["mapping"][number]

export function safeParseReferenceResponse(context: ReferenceSchemaContext, input: unknown) {
  return buildReferenceResponseSchema(context).safeParse(input, { error: z.locales.fr().localeError })
}

/** JSON Schema de la réponse, adapté au transport Anthropic. */
export const buildReferenceTransportSchema = (context: ReferenceSchemaContext) => toAnthropicEmailJsonSchema(z.toJSONSchema(buildReferenceResponseSchema(context), { reused: "ref" }))
