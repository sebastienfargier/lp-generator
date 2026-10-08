import { entryPreviewHtml } from "@/lib/email-builder/entry-previews"
import { guardRequest } from "@/lib/hcc/guard"

/**
 * Aperçu HTML d'UN email de l'écran d'entrée du Builder (un modèle, ou la scène « partir de
 * zéro »), rendu à la construction par le vrai renderer. Même motif que l'aperçu de la
 * bibliothèque : prérendu au build, un identifiant inconnu n'a pas de route. Le document
 * garde sa largeur de 600 px ; les miniatures l'affichent dans une iframe isolée.
 */
// Protégée (docs/POC_INTEGRATION_HCC.md §6) : rendue à la demande pour une session Builder valide, plus prérendue.
export const dynamic = "force-dynamic"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = guardRequest(request)
  if (!guard.ok) return guard.response
  const { id } = await ctx.params
  const html = entryPreviewHtml(id)
  if (html === null) return new Response("Aperçu inconnu", { status: 404 })
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } })
}
