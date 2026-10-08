/**
 * Chargement initial de l'éditeur pour un asset (SERVEUR UNIQUEMENT) : session liée à l'asset, puis document du HCC.
 * Le résultat ne contient jamais le jeton. Aucun document n'est créé ni écrit ici : un asset neuf (révision 0, document
 * `null`) ouvre l'écran de départ ; un document existant est validé (`parseEmailDocument`) puis chargé tel quel. Toute
 * erreur mène à une page fixe, jamais à un éditeur vide qui pourrait écraser un document existant.
 */
import { parseEmailDocument } from "../email-builder/integrity"
import type { EmailDocument } from "../email-builder/document"
import { tryReadHccConfig } from "./config"
import { editorialStatuses, fetchHccDocument, type EditorialStatus, type HccCallDependencies } from "./documents"
import { editorAccess, openSession, publicSession, type PublicBuilderSession } from "./session"

export type EditorLoad =
  | { status: "ready"; session: PublicBuilderSession; document: EmailDocument | null; revision: number; editorialStatus: EditorialStatus }
  | { status: "redirect"; to: string }

export async function loadEditorDocument(input: { cookieValue: string | undefined; assetId: string; env?: Readonly<Record<string, string | undefined>> } & HccCallDependencies): Promise<EditorLoad> {
  const config = tryReadHccConfig(input.env ?? process.env)
  const now = (input.now ?? Date.now)()
  const read = config ? openSession(config.keys.cookie, input.cookieValue, now) : null
  const access = editorAccess(read ? read.status : "unavailable", read?.status === "valid" ? read.session.assetId : null, input.assetId)
  if (!access.ok) return { status: "redirect", to: access.redirect }
  if (!config || read?.status !== "valid") return { status: "redirect", to: "/hcc/requis" }

  const fetched = await fetchHccDocument(config, read.session.token, input.assetId, input)
  if (!fetched.ok) {
    const to = fetched.reason === "session" ? "/hcc/expire" : fetched.reason === "not_found" ? "/hcc/requis" : "/hcc/erreur?raison=hcc_indisponible"
    return { status: "redirect", to }
  }
  const { document, revision, statutEditorial } = fetched.value
  const editorialStatus: EditorialStatus = (editorialStatuses as readonly string[]).includes(statutEditorial ?? "") ? (statutEditorial as EditorialStatus) : "draft"
  if (document === null) return { status: "ready", session: publicSession(read.session), document: null, revision: 0, editorialStatus: "draft" }
  const parsed = parseEmailDocument(document)
  if (!parsed.success) return { status: "redirect", to: "/hcc/erreur?raison=document_invalide" }
  return { status: "ready", session: publicSession(read.session), document: parsed.data, revision, editorialStatus }
}
