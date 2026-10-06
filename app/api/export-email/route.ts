import { handleEmailExport } from "@/lib/email/export-handler"

/**
 * POST /api/export-email : export HTML de l'email actuellement affiché. Route
 * EMAIL uniquement. Aucun appel de modèle : toute la logique est dans
 * `export-handler` (Next n'autorise ici que les exports de méthodes HTTP).
 */
export async function POST(request: Request) {
  return handleEmailExport(request)
}
