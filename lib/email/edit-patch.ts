/**
 * Le PATCH éditorial : ce que Claude produit pour modifier un email. Compact,
 * strict, sans union : une phrase de résumé et une liste de { champ, texte }.
 *
 * Choix (patch plutôt que Draft complet) :
 * - sûr : le patch ne peut nommer QUE les champs de texte de la liste fermée
 *   décidée par le code (`edit-fields.ts`) : il n'a aucun moyen d'exprimer un
 *   code, une valeur, une date, un lien, une image, une claim ou un légal ;
 *   un Draft complet obligerait Claude à reproduire ces champs, puis à
 *   démontrer qu'il ne les a pas touchés ;
 * - petit : seuls les champs modifiés sont renvoyés (un à trois en pratique) ;
 * - compatible Structured Output : deux objets, deux propriétés chacun, un
 *   `enum` de chemins, aucun optionnel, aucune union ; la liste des chemins est
 *   fixée AVANT l'appel, par famille (aucune union R1/R2/R3/R4) ;
 * - facile à valider et à annuler : on applique le patch à une copie du Draft,
 *   le resolver recompose l'email, et chaque version garde son Draft entier.
 *
 * Le texte est du texte brut : ni HTML, ni URL, ni chemin d'image.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { toAnthropicEmailJsonSchema } from "./anthropic-schema"

const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i

const text = z
  .string()
  .refine((value) => value.trim() !== "", "Ne doit pas être vide.")
  .refine((value) => !markup.test(value), "HTML interdit : texte brut uniquement.")
  .refine((value) => !looseLink.test(value), "URL ou chemin interdit : les liens et les images sont contrôlés.")

export const editSummaryMaxLength = 140

/** Schéma du patch pour une liste fermée de chemins. Au moins une modification, aucun chemin deux fois. */
export function buildEditPatchSchema(paths: readonly string[]) {
  if (paths.length === 0) throw new Error("Aucun champ éditable.")
  return z
    .strictObject({
      summary: z.string().refine((value) => value.trim() !== "" && value.length <= editSummaryMaxLength, `Une phrase courte (${editSummaryMaxLength} caractères au maximum).`),
      edits: z.array(z.strictObject({ field: z.enum(paths as [string, ...string[]], { error: "Champ non modifiable." }), text })).min(1, "Au moins une modification."),
    })
    .superRefine((patch, ctx) => {
      const seen = new Set<string>()
      patch.edits.forEach((edit, index) => {
        if (seen.has(edit.field)) ctx.addIssue({ code: "custom", path: ["edits", index, "field"], message: "Un champ ne se modifie qu'une fois." })
        seen.add(edit.field)
      })
    })
}

export type EditPatch = { summary: string; edits: { field: string; text: string }[] }

/** JSON Schema du patch, adapté au transport Anthropic (voir `anthropic-schema.ts`). */
export function buildEditTransportSchema(paths: readonly string[]) {
  return toAnthropicEmailJsonSchema(z.toJSONSchema(buildEditPatchSchema(paths), { reused: "ref" }))
}

export function safeParseEditPatch(paths: readonly string[], input: unknown) {
  return buildEditPatchSchema(paths).safeParse(input, { error: z.locales.fr().localeError })
}
