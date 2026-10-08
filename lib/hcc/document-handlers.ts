/**
 * PUT /api/email-builder/hcc/document : sauvegarde du document de travail dans le HCC, pour la session du navigateur.
 * SERVEUR UNIQUEMENT. Le navigateur n'envoie que `{ assetId, baseRevision, statutEditorial, document }` ; le jeton HCC
 * vient de la session scellée, la signature est calculée ici.
 *
 *   garde (Origin, session, limitation) → asset = celui de la session → taille → `parseEmailDocument` → PUT signé
 *   → { status: "saved", revision } | { status: "conflict", revision } | { status: "error", code, message }
 */
import { z } from "zod"

import { parseEmailDocument } from "../email-builder/integrity"
import { tryReadHccConfig } from "./config"
import { editorialStatuses, MAX_DOCUMENT_BYTES, saveHccDocument, type HccCallDependencies, type HccFailure } from "./documents"
import { guardRequest } from "./guard"

export type SaveResponseBody =
  | { status: "saved"; revision: number; updatedAt: string }
  | { status: "conflict"; revision: number | null; message: string }
  | { status: "error"; code: HccFailure | "asset" | "invalid_request"; message: string }

const BodySchema = z.strictObject({
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  baseRevision: z.number().int().min(0),
  statutEditorial: z.enum(editorialStatuses),
  document: z.unknown(),
})

/** Corps maximal accepté (octets) : document de 512 Ko + enveloppe. */
const MAX_REQUEST_BYTES = 600 * 1024

export const saveMessages: Record<HccFailure | "asset" | "invalid_request", string> = {
  session: "Ta session a expiré : rouvre l'Email Builder depuis le HCC. Tes modifications restent affichées dans cette page.",
  not_found: "Cette création n'est plus accessible depuis le HCC.",
  conflict: "Le document a été modifié ailleurs depuis ton dernier enregistrement.",
  locked: "Cette création n'est plus un brouillon dans le HCC : elle ne peut plus être modifiée.",
  invalid_document: "Le HCC a refusé ce document.",
  too_large: "Le document est trop volumineux pour être enregistré.",
  rate_limited: "Trop d'enregistrements rapprochés : réessaie dans un instant.",
  unavailable: "Le HCC ne répond pas : réessaie dans un instant.",
  invalid_response: "Réponse inattendue du HCC : réessaie dans un instant.",
  asset: "Cette page n'est pas liée à la création ouverte depuis le HCC.",
  invalid_request: "Demande d'enregistrement invalide.",
}

const statusOf: Record<HccFailure | "asset" | "invalid_request", number> = {
  session: 401,
  not_found: 404,
  conflict: 409,
  locked: 409,
  invalid_document: 422,
  too_large: 413,
  rate_limited: 429,
  unavailable: 502,
  invalid_response: 502,
  asset: 403,
  invalid_request: 400,
}

const reply = (body: SaveResponseBody, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
const fail = (code: HccFailure | "asset" | "invalid_request") => reply({ status: "error", code, message: saveMessages[code] }, statusOf[code])

export async function handleHccDocumentSave(request: Request, dependencies: HccCallDependencies & { env?: Readonly<Record<string, string | undefined>> } = {}): Promise<Response> {
  const guard = guardRequest(request, { env: dependencies.env, now: dependencies.now, family: "save" })
  if (!guard.ok) return guard.response
  const config = tryReadHccConfig(dependencies.env ?? process.env)
  if (!config) return fail("unavailable")

  if (Number(request.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) return fail("too_large")
  const text = await request.text()
  if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) return fail("too_large")
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return fail("invalid_request")
  }
  const body = BodySchema.safeParse(json)
  if (!body.success) return fail("invalid_request")
  if (body.data.assetId !== guard.session.assetId) return fail("asset")
  if (Buffer.byteLength(JSON.stringify(body.data.document) ?? "", "utf8") > MAX_DOCUMENT_BYTES) return fail("too_large")
  // Le Builder garantit le contrat EmailDocument : rien d'invalide ne part vers le HCC.
  if (!parseEmailDocument(body.data.document).success) return fail("invalid_document")

  const saved = await saveHccDocument(config, guard.session.token, body.data.assetId, { document: body.data.document, statutEditorial: body.data.statutEditorial, baseRevision: body.data.baseRevision }, dependencies)
  if (saved.ok) return reply({ status: "saved", revision: saved.revision, updatedAt: saved.updatedAt }, 200)
  if (saved.reason === "conflict") return reply({ status: "conflict", revision: saved.revision ?? null, message: saveMessages.conflict }, 409)
  return fail(saved.reason)
}
