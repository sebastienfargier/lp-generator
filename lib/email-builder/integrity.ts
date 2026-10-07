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

export type DocumentIssueCode = "document-structure" | "config-contract" | "block-meta" | "missing-facts" | "unknown-asset"

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
  const config = safeParseEmailConfigBuilder(document.config)
  if (!config.success) {
    return config.error.issues.map((issue) => ({ code: "config-contract", path: ["config", ...issue.path].join("."), message: issue.message }))
  }

  const issues: DocumentIssue[] = []
  const blocks = config.data.blocks as unknown as RawBlock[]
  const ids = new Set(blocks.map((block) => block.id))
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
