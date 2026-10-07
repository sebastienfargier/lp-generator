/**
 * POST /api/email-builder/assistant : un message à l'assistant éditorial. Sans
 * état : le navigateur envoie le document COURANT, la conversation et le message ;
 * le serveur valide, appelle le moteur (UN appel), et renvoie un message et,
 * éventuellement, une proposition. Rien n'est appliqué, rien n'est gardé.
 *
 * Le document reçu n'est jamais cru sur parole (intégrité technique). Les erreurs
 * du moteur ne sortent jamais telles quelles : un message simple, un code, et un
 * journal serveur (type, identifiant de requête, règle) sans contenu, sans clé.
 *
 * `devMock` : réponses simulées (aucun appel Anthropic), refusé en production.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailGenerationErrorKind } from "../email/anthropic"
import { runAssistant, type AssistantEngineInput, type AssistantEngineResult } from "./assistant-engine"
import { createMockAssistantClient } from "./assistant-mock"
import type { AssistantProposal } from "./assistant-proposal"
import { AssistantRequestSchema } from "./assistant-schema"
import { isEmptyDocument } from "./document"
import { parseEmailDocument } from "./integrity"

export type AssistantPublicCode = "invalid-request" | "invalid-document" | "unavailable" | "provider" | "invalid-output" | "internal"

export type AssistantResponseBody =
  | { status: "success"; message: string; proposal?: AssistantProposal }
  | { status: "error"; code: AssistantPublicCode; message: string }

export type AssistantHandlerOptions = {
  /** Moteur ; par défaut Claude (ou le client simulé en développement). Injecté par les tests. */
  engine?: (input: AssistantEngineInput, options: { devMock: boolean }) => Promise<AssistantEngineResult>
  env?: Readonly<Record<string, string | undefined>>
  log?: (entry: { kind: string; status?: number; requestId?: string; rule?: string }) => void
}

const maxBodyLength = 600 * 1024
const headers = { "Cache-Control": "no-store" }

const simple = { retry: "Je n'ai pas pu préparer cette proposition. Réessaie.", silent: "L'assistant n'a pas répondu. Réessaie dans un instant.", off: "L'assistant n'est pas disponible pour le moment. Contactez l'équipe." }

const mapping: Record<EmailGenerationErrorKind, { status: number; code: AssistantPublicCode; message: string }> = {
  "invalid-request": { status: 400, code: "invalid-request", message: simple.retry },
  unsupported: { status: 400, code: "invalid-request", message: simple.retry },
  "missing-api-key": { status: 503, code: "unavailable", message: simple.off },
  authentication: { status: 503, code: "unavailable", message: simple.off },
  "rate-limit": { status: 429, code: "provider", message: simple.silent },
  rejected: { status: 502, code: "provider", message: simple.silent },
  server: { status: 503, code: "provider", message: simple.silent },
  "api-error": { status: 502, code: "provider", message: simple.silent },
  network: { status: 502, code: "provider", message: simple.silent },
  timeout: { status: 504, code: "provider", message: simple.silent },
  refusal: { status: 422, code: "invalid-output", message: simple.retry },
  truncated: { status: 422, code: "invalid-output", message: simple.retry },
  interrupted: { status: 422, code: "invalid-output", message: simple.retry },
  "empty-output": { status: 422, code: "invalid-output", message: simple.retry },
  "invalid-json": { status: 422, code: "invalid-output", message: simple.retry },
  "invalid-draft": { status: 422, code: "invalid-output", message: simple.retry },
  "draft-resolution": { status: 422, code: "invalid-output", message: simple.retry },
  "invalid-config": { status: 422, code: "invalid-output", message: simple.retry },
  "validation-failed": { status: 422, code: "invalid-output", message: simple.retry },
  "brand-violation": { status: 422, code: "invalid-output", message: simple.retry },
  unexpected: { status: 500, code: "internal", message: simple.retry },
}

const defaultLog: NonNullable<AssistantHandlerOptions["log"]> = (entry) => console.error("[email-assistant]", JSON.stringify(entry))

const fail = (status: number, code: AssistantPublicCode, message: string) => Response.json({ status: "error", code, message } satisfies AssistantResponseBody, { status, headers })

export async function handleAssistant(request: Request, options: AssistantHandlerOptions = {}): Promise<Response> {
  const env = options.env ?? process.env
  const log = options.log ?? defaultLog
  const engine = options.engine ?? ((input, { devMock }) => runAssistant(input, devMock ? { client: createMockAssistantClient(), env } : { env }))

  let body: unknown
  try {
    const text = await request.text()
    if (text.length > maxBodyLength) return fail(400, "invalid-request", "La demande est trop volumineuse.")
    body = JSON.parse(text)
  } catch {
    return fail(400, "invalid-request", "La demande est invalide.")
  }
  const parsed = AssistantRequestSchema.safeParse(body)
  if (!parsed.success) return fail(400, "invalid-request", parsed.error.issues[0]?.message ?? "La demande est invalide.")
  const document = parseEmailDocument(parsed.data.document)
  if (!document.success) return fail(422, "invalid-document", "L'email ne peut pas être analysé : il est invalide.")
  // Un email vide n'a rien à relire : aucun appel du moteur, donc aucun appel de modèle.
  if (isEmptyDocument(document.data)) return fail(422, "invalid-document", "Ajoute une première lame pour utiliser l'assistant.")

  // Simulation : jamais en production, quoi que demande le navigateur.
  const devMock = parsed.data.devMock === true && env.NODE_ENV !== "production"
  let result: AssistantEngineResult
  try {
    result = await engine({ document: document.data, history: parsed.data.history, message: parsed.data.message }, { devMock })
  } catch {
    log({ kind: "engine-threw" })
    return fail(500, "internal", simple.retry)
  }

  if (result.status === "error") {
    const { kind, status, requestId, issues } = result.error
    log({ kind, ...(status ? { status } : {}), ...(requestId ? { requestId } : {}), ...(issues?.[0]?.code ? { rule: issues[0].code } : {}) })
    const mapped = mapping[kind] ?? mapping.unexpected
    return fail(mapped.status, mapped.code, mapped.message)
  }
  return Response.json({ status: "success", message: result.message, ...(result.proposal ? { proposal: result.proposal } : {}) } satisfies AssistantResponseBody, { headers })
}
