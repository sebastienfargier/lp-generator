/**
 * POST /api/email-builder/reference : crée un email depuis la capture d'une
 * référence. Sans état : l'image arrive en `multipart/form-data`, est vérifiée,
 * envoyée au modèle, puis abandonnée (rien n'est écrit sur disque, rien n'est gardé).
 * La route (`route.ts`) n'a aucune logique : tout est ici.
 *
 *   formulaire → fichier (taille, signature réelle, dimensions) → analyse
 *   multimodale (`reference-engine`) → création déterministe
 *   (`reference-pipeline` : mapping → plan → moteur de composition) →
 *   { document, rapport }
 *
 * Aucune requête ne reçoit de repli : image qui n'est pas un email, correspondance
 * absente ou plan invalide sont des erreurs claires. Le journal serveur ne garde
 * que la nature de l'échec.
 *
 * `devMock` : analyse simulée (aucun appel Anthropic), refusée en production.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailGenerationErrorKind } from "../email/anthropic"
import type { EmailDocument } from "./document"
import { referenceLimits, validateReferenceBytes } from "./reference-file"
import { analyzeReference, type ReferenceEngineInput, type ReferenceEngineResult } from "./reference-engine"
import { createMockReferenceClient, mockScenarioFor } from "./reference-mock"
import { createDocumentFromReference } from "./reference-pipeline"
import type { ReferenceReport } from "./reference-report"
import { builderLames } from "./catalog"
import { compositionCatalog } from "./composition"

export type ReferencePublicCode = "invalid-request" | "invalid-file" | "not-an-email" | "no-match" | "unavailable" | "provider" | "invalid-output" | "internal"

export type ReferenceResponseBody = { status: "success"; document: EmailDocument; report: ReferenceReport } | { status: "error"; code: ReferencePublicCode; message: string; report?: ReferenceReport }

export type ReferenceHandlerOptions = {
  env?: Readonly<Record<string, string | undefined>>
  log?: (entry: { kind: string; status?: number; requestId?: string; rule?: string }) => void
  /** Pour les tests : remplace l'analyse multimodale. */
  engine?: (input: ReferenceEngineInput, options: { devMock: boolean; fileName: string }) => Promise<ReferenceEngineResult>
}

const headers = { "Cache-Control": "no-store" }
/** Marge du formulaire (en-têtes multipart) au-dessus du poids maximal du fichier. */
const maxRequestBytes = referenceLimits.maxBytes + 64 * 1024

const simple = {
  unavailable: "L'analyse n'est pas disponible pour le moment. Contactez l'équipe.",
  retry: "Je n'ai pas pu analyser cette référence. Réessaie.",
  noAnswer: "L'analyse n'a pas répondu. Réessaie dans un instant.",
}

const mapping: Record<EmailGenerationErrorKind | string, { status: number; code: ReferencePublicCode; message: string }> = {
  "missing-api-key": { status: 503, code: "unavailable", message: simple.unavailable },
  authentication: { status: 503, code: "unavailable", message: simple.unavailable },
  permission: { status: 503, code: "unavailable", message: simple.unavailable },
  "invalid-request": { status: 500, code: "internal", message: simple.retry },
  timeout: { status: 504, code: "provider", message: simple.noAnswer },
  network: { status: 502, code: "provider", message: simple.noAnswer },
  "rate-limit": { status: 429, code: "provider", message: simple.noAnswer },
  overloaded: { status: 503, code: "provider", message: simple.noAnswer },
  "api-error": { status: 502, code: "provider", message: simple.noAnswer },
  unexpected: { status: 500, code: "internal", message: simple.retry },
}
const invalidOutput = { status: 422, code: "invalid-output" as const, message: simple.retry }

const defaultLog: NonNullable<ReferenceHandlerOptions["log"]> = (entry) => console.error("[email-reference]", JSON.stringify(entry))

const fail = (status: number, code: ReferencePublicCode, message: string, report?: ReferenceReport) => Response.json({ status: "error", code, message, ...(report ? { report } : {}) } satisfies ReferenceResponseBody, { status, headers })

/** Un `File` du formulaire : un objet lisible, pas une chaîne. */
const isFile = (value: unknown): value is File => typeof value === "object" && value !== null && typeof (value as File).arrayBuffer === "function" && typeof (value as File).size === "number"

export async function handleReference(request: Request, options: ReferenceHandlerOptions = {}): Promise<Response> {
  const env = options.env ?? process.env
  const log = options.log ?? defaultLog
  const engine = options.engine ?? ((input, { devMock, fileName }) => analyzeReference(input, devMock ? { client: createMockReferenceClient(mockScenarioFor(fileName)), env } : { env }))

  // La taille annoncée d'abord : on ne lit pas un corps manifestement trop lourd.
  const announced = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(announced) && announced > maxRequestBytes) return fail(400, "invalid-file", `Le fichier pèse plus de ${referenceLimits.maxBytes / 1024 / 1024} Mo : réduis ou recadre la capture.`)
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) return fail(400, "invalid-request", "La demande doit être un formulaire avec une image.")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, "invalid-request", "La demande est invalide.")
  }
  const file = form.get("image")
  if (!isFile(file)) return fail(400, "invalid-request", "Ajoute une image de référence.")
  if (file.size > referenceLimits.maxBytes) return fail(400, "invalid-file", `Le fichier pèse plus de ${referenceLimits.maxBytes / 1024 / 1024} Mo : réduis ou recadre la capture.`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const checked = validateReferenceBytes(bytes, file.type)
  if (!checked.ok) return fail(400, "invalid-file", checked.message)

  // Simulation : jamais en production, quoi que demande le navigateur.
  const devMock = form.get("devMock") === "true" && env.NODE_ENV !== "production"
  let result: ReferenceEngineResult
  try {
    result = await engine({ image: { mediaType: checked.mediaType, base64: Buffer.from(bytes).toString("base64") } }, { devMock, fileName: typeof file.name === "string" ? file.name : "" })
  } catch {
    log({ kind: "engine-threw" })
    return fail(500, "internal", simple.retry)
  }
  if (result.status === "error") {
    const { kind, status, requestId, issues } = result.error
    log({ kind, ...(status ? { status } : {}), ...(requestId ? { requestId } : {}), ...(issues?.[0]?.path ? { rule: issues[0].path } : {}) })
    const mapped = kind === "invalid-draft" || kind === "invalid-json" ? invalidOutput : (mapping[kind] ?? mapping.unexpected!)
    return fail(mapped.status, mapped.code, mapped.message)
  }

  const created = createDocumentFromReference(result.response, compositionCatalog(builderLames()))
  if (created.status === "not-an-email") return fail(422, "not-an-email", "Cette image ne semble pas représenter un email exploitable.")
  if (created.status === "no-match") {
    log({ kind: "no-match" })
    return fail(422, "no-match", "La bibliothèque actuelle ne permet pas encore de reconstruire suffisamment cette référence.", created.report)
  }
  if (created.status === "invalid") {
    log({ kind: "invalid-output", rule: "pipeline" })
    return fail(invalidOutput.status, invalidOutput.code, invalidOutput.message)
  }
  return Response.json({ status: "success", document: created.document, report: created.report } satisfies ReferenceResponseBody, { headers })
}
