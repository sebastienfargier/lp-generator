/**
 * EmailDocument : la source de vérité du futur Email Builder. Il ENVELOPPE
 * l'`EmailConfig` du domaine Email (renderer, export et templates inchangés) et
 * ajoute ce qu'un `EmailConfig` ne dit pas :
 *
 * - `facts` : les faits de RÉFÉRENCE de l'email (Promotion Facts, claims). Ils
 *   distinguent « ce que l'email contient maintenant » (`config`) de « ce que
 *   l'email est censé dire » ; l'écart n'est jamais bloqué, il devient une
 *   recommandation (`recommendations.ts`) ;
 * - `provenance` : comment l'email est né (recette, ou à la main) ;
 * - `blockMeta` : une métadonnée minimale par lame (d'où elle vient) ;
 * - `registry` : la version du manifeste des lames avec laquelle le document a
 *   été écrit (un document sauvegardé survit à une évolution des lames).
 *
 * Le document est du JSON pur : aucun HTML rendu, aucun état d'interface. Une
 * copie (`cloneEmailDocument`) est un snapshot complet.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { emailManifestSource } from "../email/manifest"
import { PromotionFactsSchema, type PromotionFacts } from "../email/promotion-facts"
import { emailRecipeIds } from "../email/recipes"
import type { EmailConfig } from "../email/types"

export const emailDocumentSchemaVersion = 1

/** Version du registre de lames (manifeste + normalisation) du code courant. */
export const currentEmailRegistry = () => ({ manifestVersion: `${emailManifestSource.version}/${emailManifestSource.normalization}` })

export const emailDocumentOrigins = ["recipe", "manual"] as const
export type EmailDocumentOrigin = (typeof emailDocumentOrigins)[number]

/** D'où vient une lame : de la composition d'origine, ou ajoutée depuis dans le Builder. */
export const emailBlockOrigins = ["recipe", "builder"] as const
export type EmailBlockOrigin = (typeof emailBlockOrigins)[number]

export const emailDocumentRecipes = [...emailRecipeIds, "promotion"] as const
export type EmailDocumentRecipe = (typeof emailDocumentRecipes)[number]

/**
 * Structure du document, `config` mis à part : il est validé par le contrat
 * EmailConfig lui-même (`integrity.ts`), jamais par une copie de ce contrat.
 */
export const EmailDocumentSchema = z.strictObject({
  schemaVersion: z.literal(emailDocumentSchemaVersion),
  config: z.unknown(),
  facts: z.strictObject({
    promotion: PromotionFactsSchema.optional(),
    /** Identifiants des claims approuvées sur lesquelles l'email s'appuie. */
    claimIds: z.array(z.string().min(1)).optional(),
  }),
  provenance: z.strictObject({
    origin: z.enum(emailDocumentOrigins),
    recipe: z.enum(emailDocumentRecipes).optional(),
  }),
  blockMeta: z.record(z.string(), z.strictObject({ origin: z.enum(emailBlockOrigins) })),
  registry: z.strictObject({ manifestVersion: z.string().min(1) }),
})

export type EmailDocumentFacts = { promotion?: PromotionFacts; claimIds?: string[] }

export type EmailDocument = {
  schemaVersion: typeof emailDocumentSchemaVersion
  config: EmailConfig
  facts: EmailDocumentFacts
  provenance: { origin: EmailDocumentOrigin; recipe?: EmailDocumentRecipe }
  /** Une entrée par lame, clé = `id` de la lame. */
  blockMeta: Record<string, { origin: EmailBlockOrigin }>
  registry: { manifestVersion: string }
}

export type CreateEmailDocumentOptions = {
  facts?: EmailDocumentFacts
  provenance?: EmailDocument["provenance"]
}

/**
 * Enveloppe un EmailConfig. Ne valide rien : `validateDocumentIntegrity` dit si
 * le résultat est exploitable. Les lames sont marquées « recipe » quand le
 * document vient d'une recette, « builder » sinon.
 */
export function createEmailDocument(config: EmailConfig, options: CreateEmailDocumentOptions = {}): EmailDocument {
  const provenance = options.provenance ?? { origin: "manual" as const }
  const origin: EmailBlockOrigin = provenance.origin === "recipe" ? "recipe" : "builder"
  return {
    schemaVersion: emailDocumentSchemaVersion,
    config: structuredClone(config),
    facts: structuredClone(options.facts ?? {}),
    provenance: structuredClone(provenance),
    blockMeta: Object.fromEntries(config.blocks.map((block) => [block.id, { origin }])),
    registry: currentEmailRegistry(),
  }
}

/** Snapshot indépendant : modifier la copie ne touche jamais l'original. */
export const cloneEmailDocument = (document: EmailDocument): EmailDocument => structuredClone(document)

/** JSON stable (clés dans l'ordre de construction) : le document n'a rien d'autre que du JSON. */
export const serializeEmailDocument = (document: EmailDocument): string => JSON.stringify(document)
