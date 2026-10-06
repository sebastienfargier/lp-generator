/**
 * POST /api/email-builder/render : l'HTML du canvas d'un EmailDocument. Sans
 * état, sans modèle : le serveur ne garde rien, il valide le document reçu
 * (intégrité technique), le rend avec le vrai renderer et renvoie l'aperçu
 * repéré (`canvas.ts`). Le navigateur ne rend jamais lui-même (le renderer lit
 * les templates sur le disque).
 *
 * Le document reçu n'est jamais cru sur parole : un document inexploitable est
 * refusé (422) avec ses problèmes, jamais rendu à moitié.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { renderCanvasHtml } from "./canvas"
import { parseEmailDocument } from "./integrity"

export type BuilderRenderResponse =
  | { status: "success"; html: string }
  | { status: "error"; code: "invalid-request" | "invalid-document" | "rendering"; issues: { path: string; message: string }[] }

const maxBodyLength = 512 * 1024
const headers = { "Cache-Control": "no-store" }

const fail = (status: number, code: Extract<BuilderRenderResponse, { status: "error" }>["code"], issues: { path: string; message: string }[]) =>
  Response.json({ status: "error", code, issues } satisfies BuilderRenderResponse, { status, headers })

export async function handleBuilderRender(request: Request): Promise<Response> {
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > maxBodyLength) return fail(400, "invalid-request", [{ path: "(racine)", message: "Le corps est trop volumineux." }])
    body = JSON.parse(text)
  } catch {
    return fail(400, "invalid-request", [{ path: "(racine)", message: "Le corps doit être du JSON." }])
  }
  if (typeof body !== "object" || body === null || !("document" in body)) return fail(400, "invalid-request", [{ path: "document", message: "Le document est requis." }])

  const parsed = parseEmailDocument((body as { document: unknown }).document)
  if (!parsed.success) return fail(422, "invalid-document", parsed.issues.map(({ path, message }) => ({ path, message })))
  try {
    return Response.json({ status: "success", html: renderCanvasHtml(parsed.data) } satisfies BuilderRenderResponse, { headers })
  } catch {
    return fail(500, "rendering", [{ path: "document", message: "L'email n'a pas pu être rendu." }])
  }
}
