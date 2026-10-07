/**
 * Contrat de la SORTIE du futur appel texte « lames générées » (V2.9.4a, transport V2.9.4c.1) : un schéma strict, hors ligne.
 *
 *   { items: [{ ref, blueprint, texts, buttons, icons, images }] }
 *
 * - `blueprint` : la composition COMPACTE (`reference-generated-blueprint.ts`), jamais l'AST du DSL : le code Studi
 *   la compile en `GeneratedBlockSpec` (le fournisseur refusait la grammaire de l'AST, V2.9.4c) ;
 * - `texts` : `{ slot, value }` (les textes éditoriaux ; le texte « stat » n'y figure PAS : le système le remplit) ;
 * - `buttons` : `{ slot, label }` : un libellé, jamais une destination ;
 * - `icons` : `{ slot, icon }` : une icône du catalogue fermé ;
 * - `images` : `{ slot, intent }` : une INTENTION visuelle fermée, jamais un identifiant de la banque.
 *
 * Les noms de slots sont une ÉNUMÉRATION fermée (les noms déterministes du compilateur), jamais un nom inventé.
 * Aucun HTML, aucun CSS, aucune URL, aucune destination, aucun `imageId`, aucune surface, aucune clé en plus
 * (objets stricts). Pas d'optionnel : un tableau vide dit « aucun ». `ref` n'accepte que les références
 * demandées. Les longueurs et la couverture exacte des slots ne sont pas dans la grammaire (le transport
 * Anthropic ne porte pas `maxLength`) : `reference-generated-build.ts` les impose, toujours.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "../email/anthropic-schema"
import { emailVisualIntents } from "../email/image-bank"
import { emailIconNames } from "../email/manifest"
import { maxGeneratedReferenceCandidates } from "./reference-gap"
import { GeneratedReferenceBlueprintSchema, generatedReferenceButtonSlot, generatedReferenceIconSlots, generatedReferenceImageSlot, generatedReferenceTextSlots } from "./reference-generated-blueprint"

/** Noms de slots : des énumérations fermées (les noms que le compilateur de blueprint dérive), jamais une chaîne libre. */
const textSlot = z.enum(generatedReferenceTextSlots, { error: "Slot de texte inconnu." })
const iconSlot = z.enum(generatedReferenceIconSlots, { error: "Slot d'icône inconnu." })
const buttonSlot = z.enum([generatedReferenceButtonSlot], { error: "Slot de bouton inconnu." })
const imageSlot = z.enum([generatedReferenceImageSlot], { error: "Slot de visuel inconnu." })
/** Texte brut : la valeur est revalidée (longueur par style, faits commerciaux, balises, liens) par le builder. */
const plainText = z.string({ error: "Texte : une chaîne est requise." })

export function buildGeneratedReferenceOutputSchema(refs: readonly string[]) {
  if (refs.length === 0 || refs.length > maxGeneratedReferenceCandidates) throw new RangeError(`Une sortie porte 1 à ${maxGeneratedReferenceCandidates} références.`)
  const ref = z.enum(refs as [string, ...string[]], { error: "Référence inconnue : seules les références demandées sont admises." })
  return z.strictObject({
    items: z.array(
      z.strictObject({
        ref,
        blueprint: GeneratedReferenceBlueprintSchema,
        texts: z.array(z.strictObject({ slot: textSlot, value: plainText })),
        buttons: z.array(z.strictObject({ slot: buttonSlot, label: plainText })),
        icons: z.array(z.strictObject({ slot: iconSlot, icon: z.enum(emailIconNames, { error: "Icône hors du catalogue." }) })),
        images: z.array(z.strictObject({ slot: imageSlot, intent: z.enum(emailVisualIntents, { error: "Intention visuelle inconnue." }) })),
      }),
    ),
  })
}

export type GeneratedReferenceOutput = z.infer<ReturnType<typeof buildGeneratedReferenceOutputSchema>>
export type GeneratedReferenceItem = GeneratedReferenceOutput["items"][number]

export type GeneratedReferenceOutputParse = { ok: true; value: GeneratedReferenceOutput } | { ok: false; issues: { path: string; message: string }[] }

/** Valide une sortie : le schéma, puis « une entrée par référence au plus » (un doublon est un refus, pas une fusion). */
export function parseGeneratedReferenceOutput(refs: readonly string[], input: unknown): GeneratedReferenceOutputParse {
  const parsed = buildGeneratedReferenceOutputSchema(refs).safeParse(input, { error: z.locales.fr().localeError })
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "sortie", message: issue.message })) }
  const seen = new Set<string>()
  for (const item of parsed.data.items) {
    if (seen.has(item.ref)) return { ok: false, issues: [{ path: "items", message: `La référence « ${item.ref} » est donnée deux fois.` }] }
    seen.add(item.ref)
  }
  return { ok: true, value: parsed.data }
}

/** Le JSON Schema de la sortie, adapté au transport Anthropic (jamais envoyé ici). */
export const buildGeneratedReferenceTransportSchema = (refs: readonly string[]) => toAnthropicEmailJsonSchema(z.toJSONSchema(buildGeneratedReferenceOutputSchema(refs), { reused: "ref" }))

const count = (value: unknown, key: string) => (JSON.stringify(value).match(new RegExp(`"${key}"`, "g")) ?? []).length

/** Taille du schéma de transport : octets, `anyOf`, `$ref`, `$defs`. Un risque à lever avec l'API en V2.9.4c. */
export function measureGeneratedReferenceSchema(refs: readonly string[]) {
  const schema = buildGeneratedReferenceTransportSchema(refs)
  return { bytes: JSON.stringify(schema).length, anyOf: count(schema, "anyOf"), refs: count(schema, "\\$ref"), defs: Object.keys((schema.$defs as object | undefined) ?? {}).length }
}
