import { runGeneration } from "@/lib/generator/generate"

/**
 * POST /api/generate — mode démo : brief → génération simulée → validation
 * Zod → LandingPageConfig. Aucune clé ni service externe requis.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      {
        status: "error",
        title: "Requête invalide",
        issues: [{ path: "(racine)", message: "Le corps doit être du JSON." }],
      },
      { status: 400 }
    )
  }

  const result = runGeneration(body)
  const status =
    result.status === "success"
      ? 200
      : result.title === "Brief incomplet"
        ? 400
        : 500
  return Response.json(result, { status })
}
