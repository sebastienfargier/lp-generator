/**
 * Fichier de référence : validation PURE (octets et dimensions), partagée par le
 * navigateur (avant l'envoi) et le serveur (qui ne fait jamais confiance au
 * navigateur). Aucune dépendance image : la signature et les dimensions se lisent
 * dans les premiers octets de PNG, JPEG et WebP.
 *
 * Limites : celles de l'API Anthropic (documentation officielle « Vision »,
 * consultée pour V2.8) et de la plateforme.
 * - formats d'entrée de l'API : JPEG, PNG, GIF, WebP ; on n'accepte ni GIF (animé,
 *   seule la première image serait lue) ni PDF ;
 * - dimensions : 8000 x 8000 px au plus par image ; au-delà d'une arête de
 *   2576 px (modèles récents), l'image est réduite avant d'être lue : un texte
 *   trop petit devient alors illisible ;
 * - poids : 10 Mo (base64) par image sur l'API directe ; notre plafond est plus
 *   bas (voir `maxBytes`), pour rester sous la taille de corps de requête d'une
 *   fonction serveur (4,5 Mo sur Vercel : limite de plateforme, non vérifiée dans
 *   le repo) ;
 * - coût : ⌈largeur / 28⌉ × ⌈hauteur / 28⌉ jetons visuels, plafonné par la réduction.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */

export const referenceMediaTypes = ["image/png", "image/jpeg", "image/webp"] as const
export type ReferenceMediaType = (typeof referenceMediaTypes)[number]

export const referenceLimits = {
  /** Poids maximal d'un fichier envoyé au serveur (octets). */
  maxBytes: 4 * 1024 * 1024,
  /** Arête maximale acceptée (l'API accepte jusqu'à 8000 px). */
  maxEdge: 8000,
  /** En dessous, une capture est illisible. */
  minEdge: 200,
  /** Arête à partir de laquelle l'API réduit l'image (modèles récents). */
  readableEdge: 2576,
  /** Largeur minimale d'une capture une fois réduite à `readableEdge` : en dessous, le texte est illisible. */
  minReadableWidth: 280,
  /** Sections d'une référence (analysées et reproduites). */
  maxSections: 14,
} as const

export type ReferenceFileCode = "empty" | "too-large" | "unsupported-type" | "type-mismatch" | "unreadable" | "dimensions"
export type ReferenceFileResult = { ok: true; mediaType: ReferenceMediaType; width: number; height: number } | { ok: false; code: ReferenceFileCode; message: string }

const fail = (code: ReferenceFileCode, message: string): ReferenceFileResult => ({ ok: false, code, message })

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
const be32 = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
const be16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!
const le24 = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)

/** Signature et dimensions d'une image PNG, JPEG ou WebP ; `null` si ce n'est aucune des trois (ou si l'en-tête est tronqué). */
export function sniffImage(bytes: Uint8Array): { mediaType: ReferenceMediaType; width: number; height: number } | null {
  // PNG : signature de 8 octets, puis IHDR (largeur et hauteur sur 4 octets).
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a && ascii(bytes, 12, 4) === "IHDR") {
    return { mediaType: "image/png", width: be32(bytes, 16), height: be32(bytes, 20) }
  }
  // JPEG : SOI, puis les segments jusqu'au premier SOF (hors DHT, JPG, DAC).
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null
      const marker = bytes[at + 1]!
      if (marker === 0xff) {
        at += 1
        continue
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { mediaType: "image/jpeg", height: be16(bytes, at + 5), width: be16(bytes, at + 7) }
      at += 2 + be16(bytes, at + 2)
    }
    return null
  }
  // WebP : conteneur RIFF, puis VP8 (avec perte), VP8L (sans perte) ou VP8X (étendu).
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4)
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { mediaType: "image/webp", width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff, height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)
      return { mediaType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (chunk === "VP8X") return { mediaType: "image/webp", width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 }
  }
  return null
}

/** GIF : reconnu pour être refusé avec un message précis. */
const isGif = (bytes: Uint8Array) => bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")

/**
 * Valide un fichier : non vide, pas trop lourd, type RÉEL (signature) accepté et
 * cohérent avec le type déclaré, dimensions raisonnables. Le type déclaré par
 * le navigateur n'est qu'un indice : il ne décide de rien.
 */
export function validateReferenceBytes(bytes: Uint8Array, declaredType?: string): ReferenceFileResult {
  if (bytes.length === 0) return fail("empty", "Le fichier est vide.")
  if (bytes.length > referenceLimits.maxBytes) return fail("too-large", `Le fichier pèse plus de ${referenceLimits.maxBytes / 1024 / 1024} Mo : réduis ou recadre la capture.`)
  if (isGif(bytes)) return fail("unsupported-type", "Les GIF ne sont pas acceptés : utilise une capture PNG, JPEG ou WebP.")
  const sniffed = sniffImage(bytes)
  if (!sniffed) return fail("unsupported-type", "Format non reconnu : utilise une capture PNG, JPEG ou WebP.")
  if (declaredType && declaredType !== "" && declaredType !== sniffed.mediaType) return fail("type-mismatch", "Le type du fichier ne correspond pas à son contenu.")
  const { width, height } = sniffed
  if (width < 1 || height < 1) return fail("unreadable", "L'image est illisible.")
  if (Math.max(width, height) > referenceLimits.maxEdge) return fail("dimensions", `L'image dépasse ${referenceLimits.maxEdge} px : recadre la capture.`)
  if (Math.min(width, height) < referenceLimits.minEdge) return fail("dimensions", `L'image est trop petite (moins de ${referenceLimits.minEdge} px) pour être lue.`)
  const resizedWidth = Math.max(0, Math.round(width * Math.min(1, referenceLimits.readableEdge / Math.max(width, height))))
  if (resizedWidth < referenceLimits.minReadableWidth) return fail("dimensions", "La capture est trop longue pour être lue : recadre-la en plusieurs parties et envoie la première.")
  return { ok: true, mediaType: sniffed.mediaType, width, height }
}

/**
 * Réduction côté navigateur : la même règle que l'API (arête maximale), faite
 * avant l'envoi pour alléger la requête. Une capture qui deviendrait illisible
 * est refusée au lieu d'être écrasée.
 */
export function planClientResize(width: number, height: number): { ok: true; width: number; height: number; scaled: boolean } | { ok: false; message: string } {
  if (!(width > 0 && height > 0)) return { ok: false, message: "L'image est illisible." }
  if (Math.min(width, height) < referenceLimits.minEdge) return { ok: false, message: `L'image est trop petite (moins de ${referenceLimits.minEdge} px) pour être lue.` }
  const scale = Math.min(1, referenceLimits.readableEdge / Math.max(width, height))
  const resized = { width: Math.round(width * scale), height: Math.round(height * scale) }
  if (resized.width < referenceLimits.minReadableWidth) return { ok: false, message: "La capture est trop longue pour être lue : recadre-la en plusieurs parties et envoie la première." }
  return { ok: true, ...resized, scaled: scale < 1 }
}
