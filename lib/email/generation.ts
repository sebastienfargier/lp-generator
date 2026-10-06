import type { ZodError } from "zod"

import { EmailBriefSchema, generateDemoEmail } from "./demo-generator"
import { EmailPreviewError, toPreviewHtml } from "./preview"
import { EmailTemplateError, renderEmail } from "./renderer"
import { safeParseEmailConfig } from "./schemas"

/**
 * Génération côté serveur (mode démo) : brief inconnu → brief validé →
 * EmailConfig déterministe → validation Zod → HTML rendu.
 *
 * Serveur uniquement : passe par `renderer.ts` (`node:fs`). Un composant
 * client n'en importe que les types.
 */

export type EmailGenerationIssue = { path: string; message: string }

export type EmailGenerationSuccess = {
  status: "success"
  subject: string
  preheader: string
  blockCount: number
  /** HTML canonique de renderEmail() : jetons système et vrais liens. */
  html: string
  /** Adaptation réservée à l'aperçu (assets locaux, liens inertes). */
  previewHtml: string
  /**
   * Draft éditable de l'email (textes éditoriaux seulement), renvoyé par le
   * moteur V2 pour permettre l'édition : le client le rend tel quel à
   * `/api/edit-email`, qui le revalide. Absent du mode démo.
   */
  draft?: unknown
  /**
   * Composition (opérations de structure et de visuel) de cette version :
   * présente après une modification de composition ; absente sinon.
   */
  composition?: unknown
}

export type EmailGenerationError = {
  status: "error"
  title: string
  issues: EmailGenerationIssue[]
}

export type EmailGenerationResult = EmailGenerationSuccess | EmailGenerationError

function toIssues(error: ZodError): EmailGenerationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "brief",
    message: issue.message,
  }))
}

export function runEmailGeneration(input: unknown): EmailGenerationResult {
  const brief = EmailBriefSchema.safeParse(input)
  if (!brief.success) {
    return { status: "error", title: "Brief incomplet", issues: toIssues(brief.error) }
  }

  const config = safeParseEmailConfig(generateDemoEmail(brief.data))
  if (!config.success) {
    return { status: "error", title: "Email généré invalide", issues: toIssues(config.error) }
  }

  let html: string
  let previewHtml: string
  try {
    html = renderEmail(config.data)
    previewHtml = toPreviewHtml(html)
  } catch (error) {
    if (!(error instanceof EmailTemplateError || error instanceof EmailPreviewError)) throw error
    return {
      status: "error",
      title: "Rendu impossible",
      issues: [{ path: error instanceof EmailPreviewError ? "preview" : "renderer", message: error.message }],
    }
  }

  return {
    status: "success",
    subject: config.data.subject,
    preheader: config.data.preheader,
    blockCount: config.data.blocks.length,
    html,
    previewHtml,
  }
}
