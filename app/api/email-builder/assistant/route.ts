import { handleAssistant } from "@/lib/email-builder/assistant-handler"

/**
 * POST /api/email-builder/assistant : message à l'assistant éditorial du Builder.
 * Toute la logique est dans `assistant-handler` (Next n'autorise ici que les
 * exports de méthodes HTTP). Serveur uniquement : la clé Anthropic n'en sort jamais.
 */
export async function POST(request: Request) {
  return handleAssistant(request)
}
