/**
 * Rendu d'un EmailDocument : le renderer principal, avec ses lames officielles (inchangées)
 * ET ses lames générées. SERVEUR UNIQUEMENT (le renderer lit les templates). Aperçu et
 * export passent par ici : un seul chemin, la lame générée n'a pas de rendu à part.
 *
 * Une lame générée est rendue par `renderGeneratedBlock` depuis sa spec et son contenu,
 * jamais depuis un HTML stocké. Un bloc invalide ne se rend pas à moitié : le rendu échoue
 * (`GeneratedBlockRenderError`), comme le renderer historique face à une lame inconnue.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { renderEmailParts } from "../email/renderer"
import type { EmailDocument } from "./document"
import type { GeneratedEmailBlock } from "./generated-block"
import { renderGeneratedBlock } from "./generated-html/compile"

export class GeneratedBlockRenderError extends Error {
  override name = "GeneratedBlockRenderError"
}

function renderGenerated(block: GeneratedEmailBlock, slotMarkers: boolean): string {
  const result = renderGeneratedBlock({ spec: block.spec, content: block.slots, surface: block.surface, slotMarkers })
  if (!result.ok) throw new GeneratedBlockRenderError(`Lame générée « ${block.id} » non rendable : ${result.issues[0]?.message ?? "invalide"}`)
  return result.html
}

/** Les morceaux du rendu (en-tête, lames, fin), pour repérer les lames dans l'HTML (canvas). */
export function renderDocumentParts(document: EmailDocument, options: { slotMarkers?: boolean } = {}) {
  return renderEmailParts<GeneratedEmailBlock>(document.config, { slotMarkers: options.slotMarkers ?? false, renderExtra: renderGenerated })
}

/** L'HTML canonique de l'email (sans marqueurs) : l'entrée de l'export (`buildExportableEmailHtml`), identique pour les deux sortes de lames. */
export function renderDocumentEmail(document: EmailDocument): string {
  const { head, blocks, tail } = renderDocumentParts(document)
  return [head, ...blocks, tail].join("\n")
}
