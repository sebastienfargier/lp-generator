import { handleBuilderRender } from "@/lib/email-builder/render-handler"

/**
 * POST /api/email-builder/render : HTML du canvas du Builder. Toute la logique
 * est dans `render-handler` (Next n'autorise ici que les exports de méthodes
 * HTTP). Aucun appel de modèle : rendu seulement.
 */
export async function POST(request: Request) {
  return handleBuilderRender(request)
}
