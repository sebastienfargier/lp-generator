/**
 * POST /api/hcc/v1/render : rendu HTML d'un EmailDocument v1 pour l'aperçu du HCC. SERVEUR UNIQUEMENT.
 *
 *   pas d'Origin → taille → signature HMAC (clé dédiée HCC → Builder) → JSON strict → `parseEmailDocument` → non vide
 *   → `renderDocumentEmail` (sans repères d'édition) → `toPreviewHtml` (médias absolus sous EMAIL_ASSETS_BASE_URL,
 *   liens inertes) → contrôle final (aucun script, aucun événement, aucun repère, aucune URL de démonstration)
 *   → 200 { html, contractVersion: 1 }
 *
 * Aucune session Builder, aucune écriture, aucun appel réseau (ni HCC, ni Anthropic). Erreurs du contrat HCC :
 * `{ error: { code, message } }`, codes fermés ; le journal ne contient ni document, ni signature, ni secret.
 */
import { z } from "zod"

import { resolveExportAssetsBase } from "../email/export-html"
import { toPreviewHtml, transparentPixel } from "../email/preview"
import { isEmptyDocument } from "../email-builder/document"
import { parseEmailDocument } from "../email-builder/integrity"
import { renderDocumentEmail } from "../email-builder/render"
import { tryReadHccConfig } from "./config"
import { consumeRateLimit } from "./guard"
import { verifyHccSignature } from "./verify"

export const RENDER_CONTRACT_VERSION = 1
/** Corps maximal (octets) : document de 512 Ko + enveloppe, comme l'API documentaire du HCC. */
export const RENDER_MAX_BODY_BYTES = 600 * 1024
export const RENDER_RATE_LIMIT = 600

export const renderErrorCodes = {
  invalid_request: { status: 400, message: "Requête invalide." },
  invalid_client: { status: 401, message: "Client non authentifié." },
  origin_refusee: { status: 403, message: "Appel depuis un navigateur refusé." },
  payload_too_large: { status: 413, message: "Document trop volumineux." },
  invalid_document: { status: 422, message: "Document invalide." },
  empty_document: { status: 422, message: "Document vide : aucune lame à rendre." },
  rate_limited: { status: 429, message: "Trop de requêtes, réessaie dans un instant." },
  render_failed: { status: 500, message: "Le rendu a échoué." },
  client_non_configure: { status: 503, message: "Rendu indisponible." },
} as const
export type RenderErrorCode = keyof typeof renderErrorCodes

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "HCC-Contract-Version": String(RENDER_CONTRACT_VERSION) } as const

const fail = (code: RenderErrorCode) => Response.json({ error: { code, message: renderErrorCodes[code].message } }, { status: renderErrorCodes[code].status, headers: { ...headers, ...(code === "invalid_client" ? { "WWW-Authenticate": 'HCC-HMAC error="invalid_client"' } : {}) } })

const BodySchema = z.strictObject({ document: z.unknown() })

/** Chemins publics servis par le Builder pour l'aperçu : logo, icônes, banque d'images. */
const mediaPaths = ["/logos/", "/icones/", "/images/"]

/**
 * Une image d'aperçu est-elle autorisée ? Le pixel transparent prévu (réseaux sociaux), ou une URL de la base des médias
 * VALIDÉE (`resolveExportAssetsBase` : HTTPS en production, http://localhost seulement hors production) : même origine
 * exacte, chemin sous la base et dans un dossier public de médias, sans identifiants, requête, fragment, `..` ni `\`.
 */
export function isAllowedPreviewSource(src: string, assetsBase: string): boolean {
  if (src === transparentPixel) return true
  if (!src.startsWith(`${assetsBase}/`) || /[\\\s"'<>]|\.\.|%2e%2e|%5c/i.test(src)) return false
  let url: URL
  let base: URL
  try {
    url = new URL(src)
    base = new URL(assetsBase)
  } catch {
    return false
  }
  if (url.origin !== base.origin || url.username || url.password || url.search || url.hash || url.href !== src) return false
  const basePath = base.pathname.replace(/\/+$/, "")
  const path = url.pathname.slice(basePath.length)
  return url.pathname.startsWith(`${basePath}/`) && mediaPaths.some((prefix) => path.startsWith(prefix))
}

/** Ce qu'un HTML d'aperçu ne doit jamais contenir (filet après le rendu, en plus des garanties du renderer). */
export function unsafePreviewReasons(html: string, assetsBase: string): string[] {
  const reasons: string[] = []
  const withoutStyle = html.replace(/<style[\s\S]*?<\/style>/gi, "")
  if (/<script|<iframe|<object|<embed|<form|<link|<base/i.test(html)) reasons.push("balise")
  if (/\son[a-z]+\s*=/i.test(withoutStyle)) reasons.push("evenement")
  if (/javascript:|vbscript:/i.test(html)) reasons.push("protocole")
  if (/\shref\s*=/i.test(withoutStyle)) reasons.push("lien-actif")
  if (/data-slot|builder-block/i.test(html)) reasons.push("repere")
  if (/demo-assets\.invalid|\[URL_CDN/i.test(html)) reasons.push("asset")
  for (const match of withoutStyle.matchAll(/\ssrc="([^"]*)"/gi)) if (!isAllowedPreviewSource(match[1]!, assetsBase)) reasons.push("src")
  return reasons
}

export type RenderDependencies = { env?: Readonly<Record<string, string | undefined>>; now?: () => number; log?: (event: string) => void }

export async function handleHccRender(request: Request, dependencies: RenderDependencies = {}): Promise<Response> {
  const env = dependencies.env ?? process.env
  const now = (dependencies.now ?? Date.now)()
  const log = dependencies.log ?? ((event: string) => console.error("[hcc-render]", JSON.stringify({ evenement: event })))

  if (request.method !== "POST") return fail("invalid_request")
  if (request.headers.has("origin")) return fail("origin_refusee")
  const config = tryReadHccConfig(env)
  const assets = resolveExportAssetsBase(env)
  if (!config || !assets.ok || (assets.local && env.NODE_ENV === "production")) {
    log("configuration_invalide")
    return fail("client_non_configure")
  }
  if (Number(request.headers.get("content-length") ?? "0") > RENDER_MAX_BODY_BYTES) return fail("payload_too_large")
  const body = await request.text()
  if (Buffer.byteLength(body, "utf8") > RENDER_MAX_BODY_BYTES) return fail("payload_too_large")

  if (!verifyHccSignature({ method: request.method, url: request.url, headers: request.headers, body }, config, now)) {
    log("signature_refusee")
    return fail("invalid_client")
  }
  if (!consumeRateLimit(`hcc-render:${config.clientId}`, RENDER_RATE_LIMIT, now).ok) return fail("rate_limited")

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return fail("invalid_request")
  }
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) return fail("invalid_request")
  const document = parseEmailDocument(parsed.data.document)
  if (!document.success) return fail("invalid_document")
  if (isEmptyDocument(document.data)) return fail("empty_document")

  let html: string
  try {
    html = toPreviewHtml(renderDocumentEmail(document.data), { assetsBase: assets.base })
  } catch {
    log("rendu_echoue")
    return fail("render_failed")
  }
  if (unsafePreviewReasons(html, assets.base).length > 0) {
    log("rendu_refuse")
    return fail("render_failed")
  }
  log("rendu_ok")
  return Response.json({ html, contractVersion: RENDER_CONTRACT_VERSION }, { status: 200, headers })
}
