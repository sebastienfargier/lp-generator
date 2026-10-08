/**
 * Cookies du lancement HCC → Email Builder : SERVEUR UNIQUEMENT.
 *
 * - `__Host-hcc_tx` : transaction de lancement `{ v, state, asset, iat }`, scellée, 120 s.
 * - `__Host-hcc_session` : session Builder `{ v, token, expiresAt, assetId, … }`, scellée, au plus la durée du jeton HCC.
 *
 * Attributs : HttpOnly ; Secure ; SameSite=Lax ; Path=/ ; sans Domain (préfixe `__Host-`). `Secure` est toujours posé :
 * Chrome et Firefox l'acceptent sur http://localhost (recette locale) ; HTTPS partout ailleurs. Les expirations sont
 * vérifiées CÔTÉ SERVEUR (contenu chiffré), `Max-Age` n'est qu'une indication au navigateur.
 */
import { z } from "zod"

import { seal, unseal } from "./crypto"

export const TRANSACTION_COOKIE = "__Host-hcc_tx"
export const SESSION_COOKIE = "__Host-hcc_session"
export const TRANSACTION_TTL_SECONDS = 120
/** Marge retirée à la durée du jeton : la session expire avant lui. */
export const SESSION_MARGIN_SECONDS = 30
export const MAX_SESSION_SECONDS = 1800

export const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/

const TransactionSchema = z.strictObject({ v: z.literal(1), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), asset: z.string().regex(ASSET_ID), iat: z.number().int() })
export type HccTransaction = z.infer<typeof TransactionSchema>

const SessionSchema = z.strictObject({
  v: z.literal(1),
  token: z.string().regex(/^hcca_[A-Za-z0-9_-]{43}$/),
  /** Millisecondes. */
  expiresAt: z.number().int(),
  assetId: z.string().regex(ASSET_ID),
  assetName: z.string().max(200),
  userId: z.string().min(1).max(200),
  userName: z.string().max(200),
  permissions: z.strictObject({ canEdit: z.boolean(), canPublish: z.boolean() }),
})
export type BuilderSession = z.infer<typeof SessionSchema>

/** Ce que l'interface peut recevoir d'une session : jamais le jeton. */
export type PublicBuilderSession = Omit<BuilderSession, "token" | "v">
export const publicSession = ({ token: _token, v: _v, ...rest }: BuilderSession): PublicBuilderSession => rest // eslint-disable-line @typescript-eslint/no-unused-vars

/* En-têtes ------------------------------------------------------------------- */

/** Valeur d'un cookie de l'en-tête `Cookie` (première occurrence). */
export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=")
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return undefined
}

export const setCookie = (name: string, value: string, maxAge: number) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`
export const clearCookie = (name: string) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

/* Transaction ---------------------------------------------------------------- */

export const sealTransaction = (key: Buffer, transaction: HccTransaction) => seal(key, TRANSACTION_COOKIE, transaction)

/** La transaction si elle est intacte et âgée de 0 à 120 s ; sinon `null`. */
export function openTransaction(key: Buffer, value: string | undefined, now: number): HccTransaction | null {
  const parsed = TransactionSchema.safeParse(unseal(key, TRANSACTION_COOKIE, value))
  if (!parsed.success) return null
  const age = now - parsed.data.iat
  return age >= 0 && age <= TRANSACTION_TTL_SECONDS * 1000 ? parsed.data : null
}

/* Session -------------------------------------------------------------------- */

export const sealSession = (key: Buffer, session: BuilderSession) => seal(key, SESSION_COOKIE, session)

export type SessionRead = { status: "valid"; session: BuilderSession } | { status: "expired" } | { status: "missing" }

/** `missing` : absente, altérée ou invalide ; `expired` : intacte mais échue (page « Rouvrir depuis le HCC »). */
export function openSession(key: Buffer, value: string | undefined, now: number): SessionRead {
  if (!value) return { status: "missing" }
  const parsed = SessionSchema.safeParse(unseal(key, SESSION_COOKIE, value))
  if (!parsed.success) return { status: "missing" }
  return parsed.data.expiresAt > now ? { status: "valid", session: parsed.data } : { status: "expired" }
}

/* Accès aux pages --------------------------------------------------------------- */

export type PageSessionStatus = "valid" | "expired" | "missing" | "unavailable"

/** Où envoyer une page refusée : jamais l'éditeur. */
export const refusalPath = (status: Exclude<PageSessionStatus, "valid">) => (status === "expired" ? "/hcc/expire" : status === "unavailable" ? "/hcc/erreur?raison=hcc_indisponible" : "/hcc/requis")

/** L'éditeur d'un asset ne s'ouvre que pour une session valide liée à CET asset. */
export function editorAccess(status: PageSessionStatus, sessionAssetId: string | null, requestedAssetId: string): { ok: true } | { ok: false; redirect: string } {
  if (status !== "valid") return { ok: false, redirect: refusalPath(status) }
  return sessionAssetId !== null && sessionAssetId === requestedAssetId ? { ok: true } : { ok: false, redirect: "/hcc/requis" }
}
