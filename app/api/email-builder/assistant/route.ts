import { withBuilderSession } from "@/lib/hcc/guard"
import { handleAssistant } from "@/lib/email-builder/assistant-handler"

/**
 * POST /api/email-builder/assistant : message à l'assistant éditorial du Builder.
 * Toute la logique est dans `assistant-handler` (Next n'autorise ici que les
 * exports de méthodes HTTP). Serveur uniquement : la clé Anthropic n'en sort jamais.
 *
 * Protégée (docs/POC_INTEGRATION_HCC.md §7) : origine du Builder, session HCC valide, limitation par session.
 */
export async function POST(request: Request) {
  return withBuilderSession(handleAssistant, "assistant")(request)
}
