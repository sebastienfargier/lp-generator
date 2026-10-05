import { emailLibraryEntries, getEmailLibraryEntry } from "@/lib/email/library"
import { renderEmailLibraryPreview } from "@/lib/email/library-fixtures"

/**
 * Aperçu HTML d'UNE lame Email, rendu à la construction par le vrai renderer
 * (template, socle, surfaces) avec la fixture de bibliothèque de la lame. La
 * page de la bibliothèque l'affiche dans une iframe : le document garde sa
 * largeur canonique de 600 px, sans dépendre de la mise en page du dashboard.
 * Une lame inconnue du manifeste n'a pas de route.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return emailLibraryEntries.map((entry) => ({ type: entry.type }))
}

export async function GET(_request: Request, ctx: RouteContext<"/email-library/preview/[type]">) {
  const { type } = await ctx.params
  const entry = getEmailLibraryEntry(type)
  if (!entry) return new Response("Lame inconnue", { status: 404 })
  return new Response(renderEmailLibraryPreview(entry.type), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
