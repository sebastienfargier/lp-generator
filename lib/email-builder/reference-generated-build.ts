/**
 * Construction d'une lame générée depuis la sortie du futur appel texte (V2.9.4a) : PUR, sans réseau, sans
 * modèle, sans mutation de document. Du `GeneratedReferenceItem` d'un candidat à un `GeneratedEmailBlock` prêt
 * à être donné au domaine (`add-generated-block`), ou un échec CONTRÔLÉ (une raison d'une liste fermée, jamais
 * un message libre utilisé par le code). Fail closed : au moindre doute, le candidat est rejeté.
 *
 *   1. la référence correspond au candidat ;
 *   2. le BLUEPRINT (V2.9.4c.1) : validé, compatible avec la demande (visuel, bouton, gaps), COMPILÉ en spec avec le
 *      rôle du candidat, puis `validateGeneratedBlockSpec` ; slots dérivés (noms déterministes) ;
 *   3. couverture EXACTE des slots : textes ↔ `texts`, boutons ↔ `buttons`, icônes ↔ `icons`, images ↔ `images` ;
 *      le texte « stat » n'est PAS fourni par le modèle : le système le remplit (`controlledPlaceholders`) pour
 *      qu'un chiffre de la référence ne devienne jamais une assertion ;
 *   4. textes : normalisés, bornés par le style, sans caractère de contrôle, balise ni lien, sans fait commercial
 *      (`containsSensitiveFact`) ; une valeur invalide rejette le candidat (aucune suppression partielle) ;
 *   5. icônes du catalogue ; images : l'INTENTION vient du modèle, le choix de la banque est celui du système
 *      (compatible avec le format du slot, de cette intention, stable, jamais aléatoire) ;
 *   6. destinations : la politique du système (`generatedReferenceDefaultDestination`), jamais le modèle ;
 *   7. contenu et bloc validés (V2.9.2 / V2.9.3), couverture structurelle des gaps déclarés, puis rendu et
 *      hygiène (V2.9.2) : un bloc qui ne se rend pas n'est pas retenu.
 *
 * Aucune surface n'est posée (la tonalité de la référence n'est pas appliquée, comme pour les lames officielles).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailDestinationId } from "../email/destinations"
import { emailBank, emailBankImageIds, emailVisualIntents, type EmailBankImageId } from "../email/image-bank"
import { emailIconNames } from "../email/manifest"
import { blockCompatibility } from "./block-entry"
import { generatedBlockSlots, validateGeneratedBlock, type GeneratedEmailBlock } from "./generated-block"
import { renderGeneratedBlock } from "./generated-html/compile"
import type { GeneratedBlockContent } from "./generated-html/content"
import { walkNodes } from "./generated/slots"
import { buttonMaxLength, textMaxLength } from "./generated/tokens"
import { validateGeneratedBlockSpec } from "./generated/validate"
import { normalizeTextDraft } from "./inline-edit"
import { containsSensitiveFact } from "./reference-mapping"
import { controlledPlaceholders } from "./reference-catalog"
import { checkGeneratedReferenceBlueprint, compileGeneratedReferenceBlueprint, validateGeneratedReferenceBlueprint } from "./reference-generated-blueprint"
import { checkGeneratedReferenceStructure } from "./reference-generated-coverage"
import type { GeneratedReferenceCandidate } from "./reference-generated-request"
import type { GeneratedReferenceItem } from "./reference-generated-schema"

/**
 * La destination des boutons générés d'une référence : UNE politique, ici. Décision temporaire de V2.9.4 : le
 * catalogue Studi (déjà la destination par défaut des recettes). Le modèle fournit un libellé, jamais une
 * destination ; la destination n'est pas modifiable dans le Builder (V2.9.3).
 */
export const generatedReferenceDefaultDestination = (): EmailDestinationId => "catalogue-formations"

export const generatedReferenceFailures = [
  "missing-output",
  "unknown-ref",
  "invalid-blueprint",
  "blueprint-coverage",
  "blueprint-compile",
  "invalid-spec",
  "slot-coverage",
  "invalid-text",
  "sensitive-content",
  "invalid-icon",
  "invalid-image-intent",
  "image-unavailable",
  "invalid-content",
  "structural-coverage",
  "image-not-allowed",
  "cta-not-allowed",
  "render-invalid",
] as const
export type GeneratedReferenceFailure = (typeof generatedReferenceFailures)[number]

export type GeneratedReferenceBuild = { ref: string } & (
  | { ok: true; block: GeneratedEmailBlock; /** Dérivée de la spec, jamais stockée. */ compatibility: "robust" | "degraded"; imageIds: EmailBankImageId[] }
  | { ok: false; reason: GeneratedReferenceFailure }
)

/* Textes -------------------------------------------------------------------- */

// Mêmes règles que le contenu d'une correspondance V2.8 (`reference-schema.ts`) : texte brut, ni balise ni lien.
const markup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i
const looseLink = /https?:\/\/|www\.|\bmailto:|\bjavascript:|(?:^|\s)\/(?:images|public|ressources)\/|\.(?:jpe?g|png|webp|gif|svg)\b/i
const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

type TextVerdict = { ok: true; value: string } | { ok: false; reason: "invalid-text" | "sensitive-content" }

function cleanText(raw: string, max: number): TextVerdict {
  if (controlCharacters.test(raw)) return { ok: false, reason: "invalid-text" }
  const value = normalizeTextDraft(raw)
  if (value === "" || value.length > max || markup.test(value) || looseLink.test(value)) return { ok: false, reason: "invalid-text" }
  if (containsSensitiveFact(value)) return { ok: false, reason: "sensitive-content" }
  return { ok: true, value }
}

/* Images -------------------------------------------------------------------- */

const hash = (text: string) => {
  let h = 0x811c9dc5
  for (const char of text) h = Math.imul(h ^ char.codePointAt(0)!, 0x01000193) >>> 0
  return h
}

/**
 * L'image que le SYSTÈME choisit pour un slot : parmi la banque, celles qui existent au format du slot ET de
 * l'intention demandée, dans l'ordre de la banque ; le point de départ vient d'une empreinte de `ref|slot`
 * (même entrée, même image) ; une image déjà utilisée dans l'email est évitée si une autre existe. Aucun
 * aléa. `undefined` : aucune image compatible.
 */
export function chooseGeneratedReferenceImage(input: { ref: string; slot: string; format: string; intent: string; used?: ReadonlySet<string> }): EmailBankImageId | undefined {
  const pool = emailBankImageIds.filter((id) => emailBank[id].intent === input.intent && (emailBank[id].formats as readonly string[]).includes(input.format))
  if (pool.length === 0) return undefined
  const start = hash(`${input.ref}|${input.slot}`) % pool.length
  for (let step = 0; step < pool.length; step += 1) {
    const id = pool[(start + step) % pool.length]!
    if (!input.used?.has(id)) return id
  }
  return pool[start]
}

/* Construction ------------------------------------------------------------- */

const fail = (ref: string, reason: GeneratedReferenceFailure): GeneratedReferenceBuild => ({ ref, ok: false, reason })

/** Les clés d'une liste de `{ slot }` : `undefined` si un slot y figure deux fois. */
function bySlot<Entry extends { slot: string }>(entries: readonly Entry[]): Map<string, Entry> | undefined {
  const map = new Map<string, Entry>()
  for (const entry of entries) {
    if (map.has(entry.slot)) return undefined
    map.set(entry.slot, entry)
  }
  return map
}

export function buildGeneratedReferenceBlock(candidate: GeneratedReferenceCandidate, item: GeneratedReferenceItem | undefined, options: { usedImages?: ReadonlySet<string> } = {}): GeneratedReferenceBuild {
  const ref = candidate.ref
  if (!item) return fail(ref, "missing-output")
  if (item.ref !== ref) return fail(ref, "unknown-ref")

  // Blueprint (V2.9.4c.1) : valide, compatible avec la demande, puis compilé en spec. Le rôle est celui du candidat.
  const blueprint = validateGeneratedReferenceBlueprint(item.blueprint)
  if (!blueprint.ok) return fail(ref, "invalid-blueprint")
  const compatible = checkGeneratedReferenceBlueprint(blueprint.blueprint, candidate)
  if (!compatible.ok) return fail(ref, compatible.reason)
  const compiled = compileGeneratedReferenceBlueprint(blueprint.blueprint, candidate.role)
  if (!compiled.ok) return fail(ref, "blueprint-compile")
  const validated = validateGeneratedBlockSpec(compiled.spec)
  if (!validated.ok) return fail(ref, "invalid-spec")
  const spec = validated.spec

  // Couverture exacte : chaque slot dérivé est fourni par le bon genre, une fois ; rien en trop.
  const slots = validated.slots
  const styles = new Map(walkNodes(spec).flatMap((node) => (node.t === "text" ? [[node.slot, node.style] as const] : [])))
  const texts = bySlot(item.texts)
  const buttons = bySlot(item.buttons)
  const icons = bySlot(item.icons)
  const images = bySlot(item.images)
  if (!texts || !buttons || !icons || !images) return fail(ref, "slot-coverage")
  const expected = {
    texts: slots.filter((slot) => slot.kind === "texte" && styles.get(slot.name) !== "stat").map((slot) => slot.name),
    buttons: slots.filter((slot) => slot.kind === "cta" || slot.kind === "cta:fleche").map((slot) => slot.name),
    icons: slots.filter((slot) => slot.kind === "asset:icone").map((slot) => slot.name),
    images: slots.filter((slot) => slot.kind === "asset:visuel").map((slot) => slot.name),
  }
  const exact = (given: Map<string, unknown>, wanted: string[]) => given.size === wanted.length && wanted.every((name) => given.has(name))
  if (!exact(texts, expected.texts) || !exact(buttons, expected.buttons) || !exact(icons, expected.icons) || !exact(images, expected.images)) return fail(ref, "slot-coverage")

  const content: GeneratedBlockContent = {}
  const imageIds: EmailBankImageId[] = []
  const used = new Set(options.usedImages ?? [])
  for (const slot of slots) {
    switch (slot.kind) {
      case "texte": {
        // Le texte « stat » est rempli par le système : un chiffre de la référence ne devient jamais une assertion.
        if (styles.get(slot.name) === "stat") {
          content[slot.name] = { text: controlledPlaceholders.value }
          break
        }
        const verdict = cleanText(texts.get(slot.name)!.value, textMaxLength[styles.get(slot.name) as keyof typeof textMaxLength])
        if (!verdict.ok) return fail(ref, verdict.reason)
        content[slot.name] = { text: verdict.value }
        break
      }
      case "cta":
      case "cta:fleche": {
        const verdict = cleanText(buttons.get(slot.name)!.label, buttonMaxLength)
        if (!verdict.ok) return fail(ref, verdict.reason)
        content[slot.name] = { label: verdict.value, destination: generatedReferenceDefaultDestination() }
        break
      }
      case "asset:icone": {
        const icon = icons.get(slot.name)!.icon
        if (!(emailIconNames as readonly string[]).includes(icon)) return fail(ref, "invalid-icon")
        content[slot.name] = { icon: icon as (typeof emailIconNames)[number] }
        break
      }
      case "asset:visuel": {
        const intent = images.get(slot.name)!.intent
        if (!(emailVisualIntents as readonly string[]).includes(intent)) return fail(ref, "invalid-image-intent")
        const imageId = chooseGeneratedReferenceImage({ ref, slot: slot.name, format: slot.format ?? "", intent, used })
        if (!imageId) return fail(ref, "image-unavailable")
        used.add(imageId)
        imageIds.push(imageId)
        content[slot.name] = { imageId }
        break
      }
    }
  }

  const block: GeneratedEmailBlock = { id: `generated-${ref}`, type: "generated", spec, slots: content }
  if (!validateGeneratedBlock(block).ok || generatedBlockSlots(block).length !== slots.length) return fail(ref, "invalid-content")

  const structure = checkGeneratedReferenceStructure(spec, candidate)
  if (!structure.ok) return fail(ref, structure.reason)

  if (!renderGeneratedBlock({ spec, content, surface: undefined }).ok) return fail(ref, "render-invalid")
  return { ref, ok: true, block, compatibility: blockCompatibility(block), imageIds }
}

/**
 * Tous les candidats d'une requête : chacun réussit ou échoue INDÉPENDAMMENT (une génération ratée n'en fait pas perdre
 * une bonne). Les images déjà prises par un candidat réussi sont évitées par les suivants. Une entrée de la sortie
 * qui ne correspond à aucun candidat est signalée (`unknownRefs`) et ignorée.
 */
export function buildGeneratedReferenceBlocks(candidates: readonly GeneratedReferenceCandidate[], items: readonly GeneratedReferenceItem[]): { results: GeneratedReferenceBuild[]; unknownRefs: string[] } {
  const used = new Set<string>()
  const results = candidates.map((candidate) => {
    const result = buildGeneratedReferenceBlock(candidate, items.find((item) => item.ref === candidate.ref), { usedImages: used })
    if (result.ok) for (const id of result.imageIds) used.add(id)
    return result
  })
  const known = new Set(candidates.map((candidate) => candidate.ref))
  return { results, unknownRefs: items.filter((item) => !known.has(item.ref)).map((item) => item.ref) }
}
