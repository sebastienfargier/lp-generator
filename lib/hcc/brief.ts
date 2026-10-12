/**
 * Brief éditorial du HCC (contrat EditorialBriefV1, option B ; même schéma strict côté HCC : `src/lib/builder/brief.ts`) :
 * SERVEUR UNIQUEMENT.
 *
 *   GET /api/builder/v1/assets/{assetId}/brief → { contractVersion: 1, status: "valide", brief } | { status: "obsolete" | "aucun", brief: null }
 *
 * Même appel signé que le document (`Authorization: Bearer` de la session serveur + HMAC, nonce unique, sans `Origin`,
 * sans redirection, délai borné, aucune nouvelle tentative). Le brief n'est JAMAIS stocké dans le cookie de session ni
 * accepté du navigateur : il est relu ici, côté serveur, à l'ouverture de l'éditeur et à chaque appel de l'assistant.
 * Une erreur ne bloque jamais l'éditeur : elle devient l'état « indisponible ».
 */
import { z } from "zod"

import type { HccConfig } from "./config"
import { randomToken, signRequest } from "./crypto"
import { HCC_TIMEOUT_MS, type HccCallDependencies } from "./documents"

export const briefPath = (assetId: string) => `/api/builder/v1/assets/${assetId}/brief`

const texte = (max: number) => z.string().min(1).max(max)
export const briefStatuses = ["acquis", "hypothese", "a_confirmer"] as const
export type BriefItemStatus = (typeof briefStatuses)[number]
const Item = z.strictObject({ texte: texte(800), statut: z.enum(briefStatuses) })
export const briefIntentions = ["promotionnel", "editorial", "evenementiel", "informationnel", "conversion"] as const
export type BriefIntention = (typeof briefIntentions)[number]

export const EditorialBriefV1Schema = z.strictObject({
  schema: z.literal("editorial-brief"),
  version: z.literal(1),
  briefId: texte(120),
  briefVersion: z.number().int().positive(),
  valideLe: z.iso.datetime(),
  productionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  priseDeParole: z.strictObject({ nom: texte(200) }),
  contenu: z.strictObject({ id: z.string().regex(/^C\d{1,2}$/), titre: texte(150), format: z.literal("email"), canal: texte(80) }),
  intention: z.strictObject({ valeur: z.enum(briefIntentions), justification: texte(300) }),
  objectif: Item,
  audience: Item,
  angle: Item,
  promesse: Item,
  messages: z.strictObject({ principal: Item, secondaires: z.array(Item).max(5) }),
  tonalite: Item,
  cta: Item,
  preuves: z.array(Item).max(6),
  contraintes: z.array(Item).max(8),
  criteresReussite: z.array(Item).max(6),
  specificites: z.array(z.strictObject({ libelle: texte(80), texte: texte(500), statut: z.enum(briefStatuses) })).max(8),
  structure: z.array(z.strictObject({ partie: texte(100), contenu: texte(500) })).min(1).max(10),
  aConfirmer: z.array(texte(300)).max(10),
})
export type EditorialBriefV1 = z.infer<typeof EditorialBriefV1Schema>

const ResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ contractVersion: z.literal(1), status: z.literal("valide"), brief: EditorialBriefV1Schema }),
  z.strictObject({ contractVersion: z.literal(1), status: z.enum(["obsolete", "aucun"]), brief: z.null() }),
])

/** Ce que le Builder sait du brief : jamais une erreur brute du HCC. */
export type HccBriefState = { status: "valide"; brief: EditorialBriefV1 } | { status: "obsolete" } | { status: "aucun" } | { status: "indisponible" }

const assetPattern = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Lecture signée du brief. Ne lève pas : réponse non conforme, erreur réseau, 4xx/5xx → « indisponible » (l'éditeur
 * reste utilisable ; l'assistant travaille alors sans brief).
 */
export async function fetchHccBrief(config: HccConfig, token: string, assetId: string, dependencies: HccCallDependencies = {}): Promise<HccBriefState> {
  if (!assetPattern.test(assetId)) return { status: "indisponible" }
  const path = briefPath(assetId)
  const timestamp = String(Math.floor((dependencies.now ?? Date.now)() / 1000))
  const nonce = randomToken(16)
  let response: Response
  try {
    response = await (dependencies.fetch ?? globalThis.fetch)(`${config.apiOrigin}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "HCC-Client-Id": config.clientId,
        "HCC-Key-Id": config.keyId,
        "HCC-Timestamp": timestamp,
        "HCC-Nonce": nonce,
        "HCC-Signature": signRequest(config.signingKey, { method: "GET", pathAndQuery: path, timestamp, nonce, body: "", clientId: config.clientId }),
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(HCC_TIMEOUT_MS),
    })
  } catch {
    return { status: "indisponible" }
  }
  if (!response.ok) return { status: "indisponible" }
  const parsed = ResponseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) return { status: "indisponible" }
  return parsed.data.status === "valide" ? { status: "valide", brief: parsed.data.brief } : { status: parsed.data.status }
}
