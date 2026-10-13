/**
 * Brief éditorial du HCC (contrat EditorialBriefV2 ; même schéma strict côté HCC : `src/lib/builder/brief.ts`) :
 * SERVEUR UNIQUEMENT.
 *
 *   GET /api/builder/v1/assets/{assetId}/brief → { contractVersion: 2, status: "disponible", brief } | { status: "aucun", brief: null }
 *
 * V2 : le brief n'a plus besoin d'être validé dans le HCC ; l'asset est lié, à sa création, à une version EXACTE du brief
 * (et du cadrage) : une nouvelle version du brief ne modifie jamais un asset déjà créé. Seul « à confirmer » est signalé.
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
const Item = z.strictObject({ texte: texte(800), aConfirmer: z.boolean() })
export type BriefItem = z.infer<typeof Item>
export const briefIntentions = ["promotionnel", "editorial", "evenementiel", "informationnel", "conversion"] as const
export type BriefIntention = (typeof briefIntentions)[number]

export const EditorialBriefSchema = z.strictObject({
  schema: z.literal("editorial-brief"),
  version: z.literal(2),
  briefId: texte(120),
  briefVersion: z.number().int().positive(),
  cadrageVersion: z.number().int().positive(),
  redigeLe: z.iso.datetime(),
  productionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  priseDeParole: z.strictObject({ nom: texte(200) }),
  contenu: z.strictObject({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), titre: texte(150), format: z.literal("email"), moment: texte(80) }),
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
  specificites: z.array(z.strictObject({ libelle: texte(80), texte: texte(500), aConfirmer: z.boolean() })).max(8),
  structure: z.array(z.strictObject({ partie: texte(100), contenu: texte(500) })).min(1).max(10),
  aConfirmer: z.array(texte(300)).max(10),
  /** Version modèle simplifiée : l'IA du HCC n'a pas pu rédiger ce brief. */
  simplifie: z.boolean(),
  /** Informations retenues sur studi.com, avec l'URL exacte de la page (seules sources factuelles du brief). */
  sources: z.array(z.strictObject({ texte: texte(400), url: z.string().regex(/^https:\/\/([a-z0-9-]+\.)*studi\.com(\/|$)/i).max(500) })).max(8),
})
export type EditorialBrief = z.infer<typeof EditorialBriefSchema>

const ResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ contractVersion: z.literal(2), status: z.literal("disponible"), brief: EditorialBriefSchema }),
  z.strictObject({ contractVersion: z.literal(2), status: z.literal("aucun"), brief: z.null() }),
])

/** Ce que le Builder sait du brief : jamais une erreur brute du HCC. */
export type HccBriefState = { status: "disponible"; brief: EditorialBrief } | { status: "aucun" } | { status: "indisponible" }

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
  return parsed.data.status === "disponible" ? { status: "disponible", brief: parsed.data.brief } : { status: "aucun" }
}
