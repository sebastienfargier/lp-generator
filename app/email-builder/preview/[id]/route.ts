import { entryPreviewHtml, entryPreviewIds } from "@/lib/email-builder/entry-previews"

/**
 * Aperçu HTML d'UN email de l'écran d'entrée du Builder (un modèle, ou la scène « partir de
 * zéro »), rendu à la construction par le vrai renderer. Même motif que l'aperçu de la
 * bibliothèque : prérendu au build, un identifiant inconnu n'a pas de route. Le document
 * garde sa largeur de 600 px ; les miniatures l'affichent dans une iframe isolée.
 */
export const dynamic = "force-static"
export const dynamicParams = false

export function generateStaticParams() {
  return entryPreviewIds().map((id) => ({ id }))
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const html = entryPreviewHtml(id)
  if (html === null) return new Response("Aperçu inconnu", { status: 404 })
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
