/**
 * Session d'une PAGE (Server Component) : lit le cookie scellé via `cookies()` de Next. SERVEUR UNIQUEMENT. Ne renvoie
 * jamais le jeton : seulement ce que l'interface peut afficher.
 */
import { cookies } from "next/headers"

import { tryReadHccConfig } from "./config"
import { loadEditorDocument, type EditorLoad } from "./editor-load"
import { openSession, publicSession, SESSION_COOKIE, type PublicBuilderSession } from "./session"

export type PageSession = { status: "valid"; session: PublicBuilderSession } | { status: "expired" } | { status: "missing" } | { status: "unavailable" }

export async function readPageSession(): Promise<PageSession> {
  // `cookies()` d'abord : la page devient dynamique en toute circonstance (jamais une redirection figée au build).
  const value = (await cookies()).get(SESSION_COOKIE)?.value
  const config = tryReadHccConfig()
  if (!config) return { status: "unavailable" }
  const read = openSession(config.keys.cookie, value, Date.now())
  return read.status === "valid" ? { status: "valid", session: publicSession(read.session) } : read
}

export { editorAccess, refusalPath } from "./session"

/** Chargement de l'éditeur d'un asset depuis le HCC (session de la requête courante). */
export async function loadPageEditor(assetId: string): Promise<EditorLoad> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value
  return loadEditorDocument({ cookieValue: value, assetId })
}
