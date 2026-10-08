import { withBuilderSession } from "@/lib/hcc/guard"
import { handleReference } from "@/lib/email-builder/reference-handler"

/**
 * POST /api/email-builder/reference : crée un email depuis la capture d'une
 * référence. Toute la logique est dans `reference-handler` (Next n'autorise ici que
 * les exports de méthodes HTTP). Serveur uniquement : la clé Anthropic n'en sort
 * jamais ; l'image n'est ni écrite, ni gardée.
 *
 * Protégée (docs/POC_INTEGRATION_HCC.md §7) : origine du Builder, session HCC valide, limitation par session.
 */
export async function POST(request: Request) {
  return withBuilderSession(handleReference, "reference")(request)
}
