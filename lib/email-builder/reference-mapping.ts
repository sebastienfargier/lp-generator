/**
 * Normalisation du mapping d'une référence : la réponse du modèle (déjà conforme
 * au schéma) devient une liste de sections cohérentes, ou un refus. Pur : ni
 * réseau, ni plan, ni document.
 *
 * Règles (le schéma ne les porte pas) :
 * - une correspondance par section, et une seule ;
 * - `matched` et `approximate` désignent une lame de corps du catalogue ;
 *   `approximate` et `unmatched` disent POURQUOI ; `unmatched` n'a pas de lame ;
 * - jamais de lame de repli : une section sans équivalent reste sans équivalent ;
 * - le contenu d'une lame ne garde que ses champs éditoriaux, une fois chacun, et
 *   jamais un texte qui reprend un fait commercial (prix, pourcentage, date,
 *   garantie, certification, classement, partenaire) : ces éléments sont signalés
 *   (`sensitive`), jamais reproduits comme des faits Studi ;
 * - les images ne viennent que de la banque, compatibles avec la lame.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailBlockType } from "../email/types"
import { emailBlockManifest } from "../email/manifest"
import { compatibleImages } from "./assistant-proposal"
import { editableSlots, type CompositionCatalog } from "./composition"
import { normalizeTextDraft } from "./inline-edit"
import { isReferenceBodyBlock } from "./reference-catalog"
import type { ReferenceMappingEntry, ReferenceResponse, ReferenceSection, ReferenceSensitiveKind } from "./reference-schema"

export type NormalizedSection = {
  ref: string
  analysis: ReferenceSection
  status: "matched" | "approximate" | "unmatched"
  /** Absent si `unmatched`. */
  blockType?: string
  reason: string
  content: { slot: string; value: string }[]
  images: { slot: string; imageId: string }[]
}

export type NormalizedReference = { sections: NormalizedSection[]; sensitive: ReferenceSensitiveKind[]; /** Textes ou images écartés (fait commercial, champ ou image invalide). */ dropped: number }
export type NormalizeResult = { ok: true; value: NormalizedReference } | { ok: false; message: string }

/** Un texte qui ressemble à un fait commercial externe : prix, remise, date, année, garantie, certification, classement, partenaire. */
const sensitiveFact = /\d\s?(?:%|€|\$|£|euros?\b)|[€$£]\s?\d|\b(?:19|20)\d{2}\b|\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b|\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b|garanti|satisfait ou remboursé|certifi|label(?:lis)?é|\bn°\s?1\b|numéro\s?1|premier\s+(?:organisme|centre|réseau)|class[ée]\s|partenaire|\d[\d\s.,]{2,}\s?(?:apprenants|étudiants|diplômés|clients|utilisateurs|avis)/i

/** Un code promotionnel écrit en capitales (« BIENVENUE20 ») : sensible comme une valeur, pas comme un mot. */
const promoCode = /\b[Cc]ode\s+(?:[Pp]romo(?:tionnel)?\s+)?[A-Z0-9][A-Z0-9-]{3,}\b|\b[Cc]oupon\b|\b[Cc]ode\s+[Pp]romo/

/** Raisons contrôlées d'une section dont le visuel n'est pas repris. */
export const imageLostReason = "La structure éditoriale est reproduite, mais le visuel de la référence n'est pas repris."
const imageNotReproduced = "Le visuel de la référence n'est pas repris."

export const containsSensitiveFact = (text: string) => sensitiveFact.test(text) || promoCode.test(text)

const imageSlotsOf = (type: string) => Object.entries((emailBlockManifest as unknown as Record<string, { slots: Record<string, string> }>)[type]?.slots ?? {}).filter(([, kind]) => kind === "asset:visuel").map(([slot]) => slot)

export function normalizeReferenceMapping(response: { analysis: ReferenceResponse["analysis"]; mapping: readonly { ref: string; status: ReferenceMappingEntry["status"]; blockType: string; reason: string; content: { slot: string; value: string }[]; images: { slot: string; imageId: string }[] }[]; sensitive: readonly ReferenceSensitiveKind[] }, catalog: CompositionCatalog): NormalizeResult {
  const { sections } = response.analysis
  const refs = sections.map((section) => section.ref)
  if (new Set(refs).size !== refs.length) return { ok: false, message: "Deux sections portent la même référence." }
  const entries = new Map<string, (typeof response.mapping)[number]>()
  for (const entry of response.mapping) {
    if (entries.has(entry.ref)) return { ok: false, message: `La correspondance de « ${entry.ref} » est donnée deux fois.` }
    entries.set(entry.ref, entry)
  }
  if (entries.size !== refs.length || refs.some((ref) => !entries.has(ref))) return { ok: false, message: "Chaque section doit avoir exactement une correspondance." }

  let dropped = 0
  const normalized: NormalizedSection[] = []
  for (const section of sections) {
    const entry = entries.get(section.ref)!
    const reason = normalizeTextDraft(entry.reason)
    if (entry.status === "unmatched") {
      if (entry.blockType !== "") return { ok: false, message: `La section « ${section.ref} » est sans équivalent : elle ne peut pas désigner une lame.` }
      if (reason === "") return { ok: false, message: `La section « ${section.ref} » sans équivalent doit dire pourquoi.` }
      normalized.push({ ref: section.ref, analysis: section, status: "unmatched", reason, content: [], images: [] })
      continue
    }
    const type = entry.blockType
    if (type === "" || !Object.hasOwn(catalog, type) || !isReferenceBodyBlock(type)) return { ok: false, message: `La section « ${section.ref} » désigne une lame qui n'existe pas ou qui n'est pas une lame de corps.` }
    if (entry.status === "approximate" && reason === "") return { ok: false, message: `La section « ${section.ref} » approchée doit dire pourquoi.` }
    // Fidélité visuelle, règle du code (pas du modèle) : une section avec visuel dont la lame n'a aucun emplacement image compatible ne peut pas être « reproduite ».
    const canShowImage = imageSlotsOf(type).length > 0 && compatibleImages(type as EmailBlockType).length > 0
    const losesImage = section.hasImage && !canShowImage

    const allowed = new Set(editableSlots(type).map((field) => field.slot))
    const seen = new Set<string>()
    const content: { slot: string; value: string }[] = []
    for (const item of entry.content) {
      const value = normalizeTextDraft(item.value)
      if (!allowed.has(item.slot) || seen.has(item.slot) || value === "" || containsSensitiveFact(value)) {
        dropped += 1
        continue
      }
      seen.add(item.slot)
      content.push({ slot: item.slot, value })
    }
    const imageSlots = new Set(imageSlotsOf(type))
    const compatible = new Set<string>(compatibleImages(type as EmailBlockType).map((image) => image.id))
    const usedSlots = new Set<string>()
    const images: { slot: string; imageId: string }[] = []
    for (const item of entry.images) {
      if (!imageSlots.has(item.slot) || usedSlots.has(item.slot) || !compatible.has(item.imageId)) {
        dropped += 1
        continue
      }
      usedSlots.add(item.slot)
      images.push({ slot: item.slot, imageId: item.imageId })
    }
    normalized.push({
      ref: section.ref,
      analysis: section,
      status: losesImage ? "approximate" : entry.status,
      blockType: type,
      reason: losesImage ? (reason === "" ? imageLostReason : /(?:pas|non) repris|absent/i.test(reason) ? reason : `${reason.replace(/\s*\.?\s*$/, ".")} ${imageNotReproduced}`) : reason,
      content,
      images,
    })
  }
  return { ok: true, value: { sections: normalized, sensitive: [...new Set(response.sensitive)], dropped } }
}
