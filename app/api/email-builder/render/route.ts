import { withBuilderSession } from "@/lib/hcc/guard"
import { handleBuilderRender } from "@/lib/email-builder/render-handler"

/**
 * POST /api/email-builder/render : HTML du canvas du Builder. Toute la logique
 * est dans `render-handler` (Next n'autorise ici que les exports de méthodes
 * HTTP). Aucun appel de modèle : rendu seulement.
 *
 * Protégée (docs/POC_INTEGRATION_HCC.md §7) : origine du Builder, session HCC valide, limitation par session.
 */
export async function POST(request: Request) {
  return withBuilderSession(handleBuilderRender, "render")(request)
}
