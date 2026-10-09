import { handleHccRender } from "@/lib/hcc/render-handler"

export const dynamic = "force-dynamic"

/**
 * POST /api/hcc/v1/render : aperçu HTML d'un EmailDocument pour le HCC, appel SERVEUR À SERVEUR signé HMAC (clé
 * dédiée HCC → Builder). Sans session Builder ; la route est volontairement hors du filtre de `proxy.ts` : sa seule
 * protection est sa vérification de signature, toujours exécutée (logique dans `render-handler`).
 */
export async function POST(request: Request) {
  return handleHccRender(request)
}
