import { assistantWithHccBrief } from "@/lib/hcc/assistant-brief"
import { withBuilderSession } from "@/lib/hcc/guard"

/**
 * POST /api/email-builder/assistant : message à l'assistant éditorial du Builder.
 * Toute la logique est dans `assistant-handler` (Next n'autorise ici que les
 * exports de méthodes HTTP). Serveur uniquement : la clé Anthropic n'en sort jamais.
 *
 * Protégée (docs/POC_INTEGRATION_HCC.md §7) : origine du Builder, session HCC valide, limitation par session.
 * Brief HCC (option B) : relu côté serveur à chaque appel, pour l'asset de la session (`assistant-brief.ts`).
 */
const assistant = assistantWithHccBrief()

export async function POST(request: Request) {
  return withBuilderSession(assistant, "assistant")(request)
}
