import { handleLandingGeneration } from "@/lib/landing/generate-handler"

/**
 * POST /api/generate : génération d'une landing page par Claude. Route LANDING
 * uniquement (Email a la sienne). Toute la logique est dans `generate-handler` :
 * Next n'autorise ici que les exports de méthodes HTTP. Serveur uniquement :
 * la clé Anthropic n'en sort jamais.
 */
export async function POST(request: Request) {
  return handleLandingGeneration(request)
}
