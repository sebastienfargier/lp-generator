/**
 * Versions nommées et statut : trois notions DISTINCTES, jamais fusionnées.
 *
 * - le TRAVAIL courant : l'EmailDocument manipulé, avec son historique immédiat
 *   (annuler / rétablir, `history.ts`) ;
 * - une VERSION : un snapshot volontaire, complet et immuable du travail à un
 *   instant (« V2 – Plus dynamique ») ; aucun patch, aucune reconstruction ;
 * - le STATUT : où en est le travail éditorial (Brouillon, À valider, Prêt à
 *   envoyer). « Prêt à envoyer » veut dire « l'équipe le juge prêt », pas « le
 *   Builder garantit sa conformité » : le statut est libre, sans transition
 *   imposée, et les recommandations restent indépendantes de lui.
 *
 * Pur, sérialisable, sans interface ni horloge : la date est fournie par
 * l'appelant. Rien n'est persisté. Aucun auteur : pas d'authentification.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailDocument } from "./document"

export const documentStatuses = ["draft", "review", "ready"] as const
export type DocumentStatus = (typeof documentStatuses)[number]

export const statusLabels: Record<DocumentStatus, string> = {
  draft: "Brouillon",
  review: "À valider",
  ready: "Prêt à envoyer",
}

export type EmailVersion = {
  /** Stable : `v` + numéro. */
  id: string
  /** 1, 2, 3… attribué par le système, jamais réutilisé. */
  number: number
  /** Nom éditorial court ; peut être vide (la version s'appelle alors « V3 »). */
  name: string
  /** Snapshot COMPLET et indépendant du travail courant. */
  document: EmailDocument
  /** Statut du travail au moment de l'enregistrement : historique, jamais modifié ensuite. */
  status: DocumentStatus
  /** Date ISO. */
  createdAt: string
}

/** Numéro de la prochaine version : un de plus que le plus grand existant. */
export const nextVersionNumber = (versions: readonly EmailVersion[]) => versions.reduce((highest, version) => Math.max(highest, version.number), 0) + 1

/** « V2 – Plus dynamique », ou « V2 » sans nom. */
export const versionLabel = (version: Pick<EmailVersion, "number" | "name">) => (version.name ? `V${version.number} – ${version.name}` : `V${version.number}`)

/** Début du libellé d'une prochaine version : « V3 – ». */
export const nextVersionPrefix = (versions: readonly EmailVersion[]) => `V${nextVersionNumber(versions)} –`

/** Un nom saisi : espaces normalisés, court. */
export const normalizeVersionName = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 60)

export type NewVersion = { name: string; document: EmailDocument; status: DocumentStatus; createdAt: string }

/** Une version, avec son snapshot cloné : ce que devient ensuite le travail ne peut pas l'atteindre. */
export function createVersion(existing: readonly EmailVersion[], input: NewVersion): EmailVersion {
  const number = nextVersionNumber(existing)
  return { id: `v${number}`, number, name: normalizeVersionName(input.name), document: structuredClone(input.document), status: input.status, createdAt: input.createdAt }
}

/** JSON à clés triées : deux documents de même contenu ont le même texte, quel que soit l'ordre de construction des clés. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** Même contenu sérialisable : ni références, ni dates, ni état d'interface, ni historique. */
export const sameDocumentContent = (a: EmailDocument, b: EmailDocument) => canonicalJson(a) === canonicalJson(b)

/** « il y a 20 min » : `now` est fourni (millisecondes), jamais lu ici. */
export function relativeTime(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(createdAt)) / 1000))
  if (seconds < 60) return "à l'instant"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  return `il y a ${days} j`
}
