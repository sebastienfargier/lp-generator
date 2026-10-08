import { getEmailLibraryEntry } from "@/lib/email/library"
import { renderEmailLibraryPreview } from "@/lib/email/library-fixtures"
import { guardRequest } from "@/lib/hcc/guard"

/**
 * Aperçu HTML d'UNE lame Email, rendu à la construction par le vrai renderer
 * (template, socle, surfaces) avec la fixture de bibliothèque de la lame. La
 * page de la bibliothèque l'affiche dans une iframe : le document garde sa
 * largeur canonique de 600 px, sans dépendre de la mise en page du dashboard.
 * Une lame inconnue du manifeste répond 404.
 *
 * Protégée (docs/POC_INTEGRATION_HCC.md §6) : le panneau des lames du Builder l'affiche en iframe ; une session Builder
 * valide est exigée, l'aperçu est donc rendu à la demande.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request, ctx: RouteContext<"/email-library/preview/[type]">) {
  const guard = guardRequest(request)
  if (!guard.ok) return guard.response
  const { type } = await ctx.params
  const entry = getEmailLibraryEntry(type)
  if (!entry) return new Response("Lame inconnue", { status: 404 })
  return new Response(renderEmailLibraryPreview(entry.type), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  })
}
