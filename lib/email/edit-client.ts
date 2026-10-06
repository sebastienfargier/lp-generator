/**
 * Transport navigateur de l'édition : UN `POST /api/edit-email` par instruction,
 * lecture de la réponse publique. Aucun secret : la clé Anthropic reste côté
 * serveur. Module client-pur : il n'importe rien du moteur ni du renderer.
 * Isolé du composant pour que le transport se remplace dans les tests (un
 * `fetch` simulé) sans toucher à l'interface.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailGenerationSuccess } from "./generation"
import type { EmailEditorError } from "./editor-state"

export type EmailEditClientSuccess = { email: EmailGenerationSuccess; summary: string }

const networkError: EmailEditorError = { code: "network", issues: [] }

/** Réponse de /api/edit-email : un email modifié (rendu + Draft), ou une erreur publique avec son code. */
export function readEditResult(value: unknown): EmailEditClientSuccess | EmailEditorError {
  if (typeof value !== "object" || value === null || !("status" in value)) return networkError
  if (value.status === "success") {
    const { summary, ...rest } = value as EmailGenerationSuccess & { summary?: string; changed?: unknown }
    // `changed` (les champs modifiés) sert aux tests et au serveur : la version n'en garde que l'email et son Draft.
    const email = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== "changed"))
    return { email: email as EmailGenerationSuccess, summary: typeof summary === "string" ? summary : "" }
  }
  if (value.status === "error") {
    const { code, issues } = value as { code?: EmailEditorError["code"]; issues?: EmailEditorError["issues"] }
    return { code: code ?? "internal", issues: Array.isArray(issues) ? issues : [] }
  }
  return networkError
}

/** Envoie l'instruction ; ne lève jamais (une erreur réseau est une erreur publique). */
export async function postEmailEdit(body: unknown): Promise<EmailEditClientSuccess | EmailEditorError> {
  try {
    const response = await fetch("/api/edit-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return readEditResult(await response.json())
  } catch {
    return networkError
  }
}
