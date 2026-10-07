/**
 * Intégrité du document : ce qui empêche RÉELLEMENT le système de le tenir pour
 * exploitable. Rien d'éditorial ici : la terminologie, la densité, l'ordre
 * conseillé, l'écart aux faits ou à une recette sont des RECOMMANDATIONS
 * (`recommendations.ts`), jamais des refus.
 *
 * Quatre familles de problèmes, toutes techniques :
 * 1. la structure du document (schéma, version) ;
 * 2. le contrat STRUCTUREL d'EmailConfig (`safeParseEmailConfigBuilder` :
 *    lames et slots connus, valeurs des catalogues, texte brut, identifiants
 *    uniques). On ne le recopie pas : on l'appelle. Un email en cours de
 *    création peut n'avoir aucune lame (le POC, le renderer et l'export
 *    exigent toujours au moins une lame : un document vide n'est pas exportable). Les
 *    règles de produit du contrat historique (footer unique en dernier,
 *    mentions légales juste avant lui, jamais deux zones colorées à la suite)
 *    n'en font PAS partie : le renderer produit un email HTML valide sans elles,
 *    elles deviennent des recommandations ;
 * 3. la cohérence du document (une métadonnée par lame, les faits d'une
 *    promotion présents) ;
 * 4. les images : le renderer et l'export ne savent publier que celles de la
 *    banque contrôlée.
 *
 * Fonction pure : ne modifie rien, ne lève jamais.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { emailBankImageIdFromSrc } from "../email/image-bank"
import { safeParseEmailConfigBuilder } from "../email/schemas"
import { EmailDocumentSchema, type EmailDocument } from "./document"
import { isGeneratedBlock, validateGeneratedBlock, validateGeneratedLimit } from "./generated-block"

export type DocumentIssueCode = "document-structure" | "config-contract" | "block-meta" | "missing-facts" | "unknown-asset" | "generated-block" | "generated-limit"

export type DocumentIssue = { code: DocumentIssueCode; path: string; message: string }

const frenchErrors = { error: z.locales.fr().localeError }

type RawBlock = { id: string; slots: Record<string, Record<string, unknown>> }

/** Problèmes d'intégrité d'une entrée inconnue ; tableau vide : le document est exploitable. */
export function validateDocumentIntegrity(input: unknown): DocumentIssue[] {
  const structure = EmailDocumentSchema.safeParse(input, frenchErrors)
  if (!structure.success) {
    return structure.error.issues.map((issue) => ({ code: "document-structure", path: issue.path.join(".") || "document", message: issue.message }))
  }
  const document = structure.data
  const rawBlocks = (document.config as { blocks?: unknown }).blocks
  const isGenerated = (block: unknown) => typeof block === "object" && block !== null && isGeneratedBlock(block as { type: string })
  // Les lames générées se valident par leur propre contrat (spec + contenu) ; les officielles, par le contrat EmailConfig, inchangé.
  // Les positions d'erreur sont celles du document complet.
  const all: unknown[] = Array.isArray(rawBlocks) ? rawBlocks : []
  const positions = all.flatMap((block, position) => (isGenerated(block) ? [] : [position]))
  const official = Array.isArray(rawBlocks) ? { ...(document.config as object), blocks: positions.map((position) => all[position]) } : document.config
  const config = safeParseEmailConfigBuilder(official)
  if (!config.success) {
    return config.error.issues.map((issue) => {
      const path = issue.path.map((part, at) => (at === 1 && typeof part === "number" ? (positions[part] ?? part) : part))
      return { code: "config-contract" as const, path: ["config", ...path].join("."), message: issue.message }
    })
  }

  const generated: DocumentIssue[] = []
  const generatedIds: string[] = []
  all.forEach((block, position) => {
    if (!isGenerated(block)) return
    const checked = validateGeneratedBlock(block)
    if (!checked.ok) {
      for (const issue of checked.issues) generated.push({ code: "generated-block", path: `config.blocks.${position}.${issue.path}`, message: issue.message })
      return
    }
    generatedIds.push(checked.block.id)
  })
  const limit = validateGeneratedLimit(all.filter(isGenerated) as { type: string }[])
  if (limit) generated.push({ code: "generated-limit", path: limit.path, message: limit.message })
  // Une seule identité par lame, officielles et générées confondues (les doublons entre officielles sont déjà refusés par leur contrat).
  const seen = new Map<string, boolean>()
  for (const block of all as { id?: unknown }[]) {
    if (typeof block?.id !== "string") continue
    const generatedBlock = isGenerated(block)
    if (seen.has(block.id) && (generatedBlock || seen.get(block.id))) generated.push({ code: "config-contract", path: "config.blocks", message: `Identifiant de lame en double : "${block.id}".` })
    seen.set(block.id, generatedBlock)
  }
  if (generated.length > 0) return generated

  const issues: DocumentIssue[] = []
  const blocks = config.data.blocks as unknown as RawBlock[]
  const ids = new Set([...blocks.map((block) => block.id), ...generatedIds])
  for (const id of ids) {
    if (!document.blockMeta[id]) issues.push({ code: "block-meta", path: `blockMeta.${id}`, message: `Aucune métadonnée pour la lame « ${id} ».` })
  }
  for (const id of Object.keys(document.blockMeta)) {
    if (!ids.has(id)) issues.push({ code: "block-meta", path: `blockMeta.${id}`, message: `Métadonnée orpheline : aucune lame « ${id} ».` })
  }
  if (document.provenance.recipe === "promotion" && !document.facts.promotion) {
    issues.push({ code: "missing-facts", path: "facts.promotion", message: "Un email de promotion porte ses Promotion Facts : sans eux, les valeurs de référence sont perdues." })
  }
  for (const block of blocks) {
    for (const [name, slot] of Object.entries(block.slots)) {
      if (typeof slot.src === "string" && emailBankImageIdFromSrc(slot.src) === undefined) {
        issues.push({ code: "unknown-asset", path: `config.blocks.${block.id}.slots.${name}`, message: "Image hors de la banque contrôlée : le renderer et l'export ne publient que ces images." })
      }
    }
  }
  return issues
}

export type DocumentParseResult = { success: true; data: EmailDocument } | { success: false; issues: DocumentIssue[] }

/** Frontière pour une entrée inconnue (JSON, stockage, import) : intégrité, puis document typé. */
export function parseEmailDocument(input: unknown): DocumentParseResult {
  const issues = validateDocumentIntegrity(input)
  return issues.length === 0 ? { success: true, data: input as EmailDocument } : { success: false, issues }
}
