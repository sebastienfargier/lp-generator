import { handleEmailGeneration } from "@/lib/email/generate-handler"

/**
 * POST /api/generate-email : génération d'un email par Claude. Route EMAIL
 * uniquement (Landing a la sienne, `/api/generate`). Toute la logique est dans
 * `generate-handler` : Next n'autorise ici que les exports de méthodes HTTP.
 * Serveur uniquement : la clé Anthropic n'en sort jamais. Le moteur
 * déterministe de démonstration n'est plus appelé par cette route.
 */
export async function POST(request: Request) {
  return handleEmailGeneration(request)
}
