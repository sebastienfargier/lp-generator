/**
 * Transport et téléchargement de l'export HTML, côté navigateur : UN
 * `POST /api/export-email`, puis un vrai téléchargement `.html`. Aucun appel de
 * modèle, aucun secret. Module client-pur : il n'importe rien du moteur ni du
 * renderer.
 *
 * Le navigateur n'envoie JAMAIS de HTML ni d'URL : seulement la génération
 * d'origine et le Draft de la version AFFICHÉE (génération, modification,
 * annulation ou rétablissement). Le serveur recompose l'email, le rend et le
 * transforme avec sa propre configuration.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { currentVersion, type EmailEditorState } from "./editor-state"

export type EmailExportClientSuccess = {
  filename: string
  html: string
  placeholders: string[]
  warnings: string[]
}

export type EmailExportClientError = {
  code: "invalid-request" | "configuration" | "unresolvable" | "rendering" | "export-invalid" | "internal" | "network"
  issues: { path: string; message: string }[]
}

const networkError: EmailExportClientError = { code: "network", issues: [] }

/** Corps de `POST /api/export-email` : la génération d'origine et le Draft de la version affichée. */
export function toEmailExportBody(state: EmailEditorState) {
  const email = currentVersion(state)?.email
  return { generation: state.generation, draft: email?.draft, ...(email?.composition !== undefined ? { composition: email.composition } : {}) }
}

/** Réponse de /api/export-email : un fichier, ou une erreur publique avec son code. */
export function readExportResult(value: unknown): EmailExportClientSuccess | EmailExportClientError {
  if (typeof value !== "object" || value === null || !("status" in value)) return networkError
  if (value.status === "success") {
    const { filename, html, placeholders, warnings } = value as Partial<EmailExportClientSuccess>
    if (typeof filename !== "string" || typeof html !== "string") return networkError
    return { filename, html, placeholders: Array.isArray(placeholders) ? placeholders : [], warnings: Array.isArray(warnings) ? warnings : [] }
  }
  if (value.status === "error") {
    const { code, issues } = value as Partial<EmailExportClientError>
    return { code: code ?? "internal", issues: Array.isArray(issues) ? issues : [] }
  }
  return networkError
}

/** Demande l'export ; ne lève jamais (une erreur réseau est une erreur publique). */
export async function postEmailExport(body: unknown): Promise<EmailExportClientSuccess | EmailExportClientError> {
  try {
    const response = await fetch("/api/export-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return readExportResult(await response.json())
  } catch {
    return networkError
  }
}

export type DownloadEnvironment = {
  document: Pick<Document, "createElement" | "body">
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
}

/**
 * Déclenche un téléchargement `.html` : un Blob, un lien `download`, un clic.
 * Ni nouvelle fenêtre, ni aperçu, ni JSON. L'environnement est injectable.
 */
export function downloadHtmlFile(filename: string, html: string, env: DownloadEnvironment = { document, createObjectURL: (blob) => URL.createObjectURL(blob), revokeObjectURL: (url) => URL.revokeObjectURL(url) }) {
  const url = env.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
  const link = env.document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  link.style.display = "none"
  env.document.body.appendChild(link)
  link.click()
  link.remove()
  // Libération différée : certains navigateurs lisent le Blob après le clic.
  setTimeout(() => env.revokeObjectURL(url), 1000)
}

export const exportButtonLabel = "Télécharger le HTML"

/** Message d'erreur affiché : une phrase, jamais un détail interne. */
export function describeExportError(error: EmailExportClientError): string {
  switch (error.code) {
    case "configuration":
      return "L'export HTML n'est pas disponible pour le moment. Contactez l'équipe."
    case "invalid-request":
    case "unresolvable":
      return error.issues[0]?.message && error.code === "invalid-request" && error.issues[0].path !== "export" ? error.issues[0].message : "L'email affiché ne peut pas être exporté. Régénérez-le, puis réessayez."
    case "network":
      return "Le service d'export n'a pas répondu. Réessayez dans un instant."
    default:
      return "L'export n'a pas pu être préparé. Réessayez dans un instant."
  }
}

/** Notes affichées après un export réussi : ce que le fichier n'est pas encore. */
export function describeExportNotice(success: EmailExportClientSuccess): string[] {
  return [
    `HTML téléchargé : ${success.filename}.`,
    ...(success.placeholders.length > 0 ? ["Les liens de désabonnement et de préférences sont à renseigner par la plateforme d'envoi : le fichier n'est pas prêt à l'envoi tel quel."] : []),
    ...(success.warnings.includes("assets-local") ? ["Les images pointent vers une origine locale : le fichier ne s'affiche complètement que sur cette machine."] : []),
  ]
}
