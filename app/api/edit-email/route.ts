import { handleEmailEdit } from "@/lib/email/edit-handler"

/**
 * POST /api/edit-email : modification conversationnelle d'un email déjà généré.
 * Route EMAIL uniquement, distincte de `/api/generate-email`. Toute la logique
 * est dans `edit-handler` : Next n'autorise ici que les exports de méthodes
 * HTTP. Serveur uniquement : la clé Anthropic n'en sort jamais.
 */
export async function POST(request: Request) {
  return handleEmailEdit(request)
}
