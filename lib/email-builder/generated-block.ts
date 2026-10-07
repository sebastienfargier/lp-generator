/**
 * La lame GÉNÉRÉE comme bloc d'un document (V2.9.3) : `{ id, type: "generated", spec,
 * slots, surface }`. La spec reste INLINE (aucun registre global, aucun manifest
 * dynamique) : le document est autonome et son JSON suffit à le rendre.
 *
 * - `spec` : la structure (V2.9.1), jamais modifiée après création ;
 * - `slots` : le contenu (V2.9.2) : `{ text }`, `{ label, destination }`, `{ imageId }`,
 *   `{ icon }`, un par slot DÉRIVÉ de la spec, ni plus ni moins ;
 * - `surface` : une surface Studi ; absente = Page (écriture canonique, comme les lames officielles).
 *
 * Rien n'est stocké qui se dérive : ni HTML compilé, ni cache, ni compatibilité.
 *
 * Frontière : `EmailBlock` et `emailBlockManifest` restent ceux des lames OFFICIELLES
 * (renderer historique, recettes, export du générateur). `DocumentBlock` est ce que
 * contient un document du Builder : une lame officielle OU une lame générée.
 *
 * Pur : aucun import du renderer (ce module sert aussi dans le navigateur).
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { EmailIdSchema } from "../email/schemas"
import { emailSurfaces, type EmailSurface } from "../email/surfaces"
import type { EmailBlock, EmailConfig } from "../email/types"
import { validateGeneratedContent, type GeneratedBlockContent } from "./generated-html/content"
import type { GeneratedBlockSpec } from "./generated/schema"
import { deriveGeneratedSlots, type GeneratedSlot } from "./generated/slots"
import { maxGeneratedBlocksPerEmail } from "./generated/tokens"
import { validateGeneratedBlockSpec } from "./generated/validate"

export const generatedBlockType = "generated" as const

export type GeneratedEmailBlock = {
  id: string
  type: typeof generatedBlockType
  spec: GeneratedBlockSpec
  slots: GeneratedBlockContent
  surface?: EmailSurface
}

/** Ce que contient un document du Builder. */
export type DocumentBlock = EmailBlock | GeneratedEmailBlock

/** Un EmailConfig dont les lames peuvent être générées. Une `EmailConfig` historique en est un cas particulier. */
export type DocumentConfig = Omit<EmailConfig, "blocks"> & { blocks: DocumentBlock[] }

export const isGeneratedBlock = (block: { type: string }): block is GeneratedEmailBlock => block.type === generatedBlockType

export const countGeneratedBlocks = (blocks: readonly { type: string }[]) => blocks.filter(isGeneratedBlock).length

/** Les slots d'une lame générée, dérivés de sa spec : la seule source de vérité de ses emplacements. */
export const generatedBlockSlots = (block: GeneratedEmailBlock): GeneratedSlot[] => deriveGeneratedSlots(block.spec)

/** Forme du bloc, avant tout contrôle de sa spec et de son contenu. */
const GeneratedBlockShapeSchema = z.strictObject({
  id: EmailIdSchema,
  type: z.literal(generatedBlockType),
  spec: z.unknown(),
  slots: z.record(z.string(), z.unknown()),
  surface: z.enum(emailSurfaces).optional(),
})

export type GeneratedBlockIssue = { path: string; message: string }

/**
 * Contrôle complet d'un bloc généré : sa forme, sa spec (V2.9.1) et son contenu
 * contre les slots que la spec dérive (V2.9.2). Pas de réparation silencieuse.
 * Le plafond par email est une règle du DOCUMENT (`validateGeneratedLimit`).
 */
export function validateGeneratedBlock(input: unknown): { ok: true; block: GeneratedEmailBlock } | { ok: false; issues: GeneratedBlockIssue[] } {
  const shape = GeneratedBlockShapeSchema.safeParse(input, { error: z.locales.fr().localeError })
  if (!shape.success) return { ok: false, issues: shape.error.issues.map((issue) => ({ path: issue.path.join(".") || "(bloc)", message: issue.message })) }
  const spec = validateGeneratedBlockSpec(shape.data.spec)
  if (!spec.ok) return { ok: false, issues: spec.issues.map((issue) => ({ path: `spec.${issue.path}`, message: `${issue.code} : ${issue.message}` })) }
  const content = validateGeneratedContent(spec.slots, shape.data.slots)
  if (content.length > 0) return { ok: false, issues: content.map((issue) => ({ path: `slots.${issue.path}`, message: issue.message })) }
  return { ok: true, block: shape.data as unknown as GeneratedEmailBlock }
}

/** Au plus `maxGeneratedBlocksPerEmail` lames générées PAR email (les blocs présents dans le document, pas les versions). */
export function validateGeneratedLimit(blocks: readonly { type: string }[]): GeneratedBlockIssue | null {
  return countGeneratedBlocks(blocks) > maxGeneratedBlocksPerEmail ? { path: "config.blocks", message: `Un email contient ${maxGeneratedBlocksPerEmail} lames générées au plus.` } : null
}

/**
 * La vue OFFICIELLE d'un document : ses lames du manifeste seules, au contrat EmailConfig
 * historique (recettes, validation d'une promotion, export du générateur). Les lames générées
 * n'y figurent pas : ces validateurs ne les connaissent pas, et c'est voulu.
 */
export const officialConfigOf = (config: DocumentConfig): EmailConfig => ({ ...config, blocks: config.blocks.filter((block): block is EmailBlock => !isGeneratedBlock(block)) })
