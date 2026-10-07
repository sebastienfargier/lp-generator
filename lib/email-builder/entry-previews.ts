/**
 * Aperçus de l'écran d'entrée du Builder : de VRAIS emails rendus par le renderer, servis en
 * HTML pour de petites miniatures. SERVEUR UNIQUEMENT (le renderer lit les templates).
 *
 * Seuls sont servis : les modèles du Builder (`builderTemplates`, donc ils suivent les modèles
 * sans rien à maintenir) et « blank », la scène « partir de zéro » : un email partiellement
 * construit (le header et deux lames d'un modèle réel). Jamais les 36 lames, jamais une
 * capture statique, jamais un second renderer.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { toPreviewHtml } from "../email/preview"
import { createEmailDocument, type EmailDocument } from "./document"
import { renderDocumentEmail } from "./render"
import { builderTemplates } from "./templates"

/** La scène « partir de zéro » : un email en construction, pas un modèle. */
export const blankPreviewId = "blank"

/** Le modèle d'où vient sa matière (son header et deux lames) : celui qui montre les deux. */
const blankSourceTemplate = "R1-A"
const blankBlockTypes = ["email-module-header-newsletter", "email-module-text-and-cta-variant-01", "email-module-icons-list"] as const

/** Les identifiants servis : « blank » et les modèles du Builder, rien d'autre. */
export const entryPreviewIds = (): string[] => [blankPreviewId, ...builderTemplates().map((template) => template.id)]

function blankDocument(): EmailDocument | undefined {
  const source = builderTemplates().find((template) => template.id === blankSourceTemplate)
  if (!source) return undefined
  const blocks = blankBlockTypes.flatMap((type) => source.document.config.blocks.filter((block) => block.type === type).slice(0, 1))
  if (blocks.length !== blankBlockTypes.length) return undefined
  return createEmailDocument({ ...source.document.config, name: "Aperçu", blocks: structuredClone(blocks) }, { provenance: { origin: "manual" } })
}

/** L'HTML d'aperçu d'un identifiant servi, ou `null` pour tout autre. */
export function entryPreviewHtml(id: string): string | null {
  const document = id === blankPreviewId ? blankDocument() : builderTemplates().find((template) => template.id === id)?.document
  return document ? toPreviewHtml(renderDocumentEmail(document)) : null
}
