/**
 * Composition éditable (V1.5) : quelques opérations STRUCTURELLES et VISUELLES
 * contrôlées, que Claude exprime comme des intentions et que le système applique.
 * Pas un éditeur universel : quatre opérations, quatre cibles, des valeurs
 * fermées. Claude ne choisit jamais un nom de lame, un slot, une couleur, une
 * URL, un chemin d'image ni une date.
 *
 * Modèle : l'email visible = le resolver de la famille (Draft + demande), PUIS
 * une liste ordonnée d'opérations rejouées dessus, de façon déterministe. La
 * liste (`EmailComposition`) est l'état de la composition : le navigateur la
 * garde avec le Draft de chaque version (annuler et rétablir la restaurent), et
 * le serveur la revalide à chaque édition et à chaque export. Le resolver des
 * recettes, leurs Drafts, leurs prompts et le renderer ne sont pas modifiés.
 *
 * Opérations :
 * - `add-section` / `remove-section` : le bloc « date de fin » (R4 seulement,
 *   sous l'offre) et le bloc d'appuis (R4, retirable puis rétablissable) ;
 * - `change-surface` : une variante sémantique (clair, jaune, vert, sombre) pour
 *   un bloc de corps CONFIGURABLE (R4 : date de fin, appuis, conclusion). Les
 *   lames d'offre ont des couleurs FIXES : leur panneau n'a pas de variante ;
 * - `change-image` : une autre image de la banque, pour l'image principale
 *   (hero ou, à défaut, illustration de conclusion) ; jamais une frise.
 *
 * Le « compte à rebours » : les lames `hero-countdown` sont des cases statiques
 * (aucun script, aucune horloge) : leurs valeurs seraient fausses dès le
 * lendemain et l'export ne serait plus déterministe. Elles ne sont donc JAMAIS
 * utilisées comme compte à rebours. Leur mise en forme sert un bloc « fin de
 * l'offre » dont les trois cases sont le jour, le mois et l'année de
 * `Promotion Facts.endDate` : la seule source temporelle, jamais fausse.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import type { EmailEditFamily } from "./edit-fields"
import { emailBank, emailBankImageIdFromSrc, emailBankImageIds, emailImagesForIntent, emailPortraitStripBlock, emailVisualIntents, resolveEmailBankImage, type EmailBankImageId } from "./image-bank"
import { promotionVisualIntents } from "./promotion-draft"
import { formatPromotionDate, type PromotionFacts } from "./promotion-facts"
import { emailRecipes } from "./recipes"
import { safeParseEmailConfig } from "./schemas"
import type { EmailSurface } from "./surfaces"
import type { EmailBlock, EmailConfig } from "./types"

/* -------------------------------------------------------------------------- */
/* Vocabulaire                                                                */
/* -------------------------------------------------------------------------- */

export const compositionOperations = ["add-section", "remove-section", "change-surface", "change-image"] as const
export type CompositionOperationName = (typeof compositionOperations)[number]

/** Rôles de sections que Claude peut viser. Jamais un nom de lame. */
export const compositionTargets = ["end-date", "support", "closing", "main-image"] as const
export type CompositionTarget = (typeof compositionTargets)[number]

/** Variantes SÉMANTIQUES de surface : jamais un code couleur. Chacune est une surface fermée de la bibliothèque. */
export const compositionSurfaceVariants = { clair: "page", jaune: "accent-1", vert: "marque", sombre: "encre" } as const satisfies Record<string, EmailSurface>
export type CompositionSurfaceVariant = keyof typeof compositionSurfaceVariants

export const compositionValues = ["default", "alternative", "clair", "jaune", "vert", "sombre", ...emailVisualIntents] as const
export type CompositionValue = (typeof compositionValues)[number]

export const CompositionOperationSchema = z.strictObject({
  op: z.enum(compositionOperations, { error: "Opération inconnue." }),
  target: z.enum(compositionTargets, { error: "Cible inconnue." }),
  value: z.enum(compositionValues, { error: "Valeur inconnue." }),
})
export type CompositionOperation = z.infer<typeof CompositionOperationSchema>

/** L'état de la composition : les opérations appliquées, dans l'ordre. Borné. */
export const EmailCompositionSchema = z.strictObject({ operations: z.array(CompositionOperationSchema).max(24, "Trop d'opérations.") })
export type EmailComposition = z.infer<typeof EmailCompositionSchema>
export const emptyEmailComposition: EmailComposition = { operations: [] }

export function safeParseEmailComposition(input: unknown) {
  return EmailCompositionSchema.safeParse(input ?? emptyEmailComposition, { error: z.locales.fr().localeError })
}

/* -------------------------------------------------------------------------- */
/* Blocs                                                                      */
/* -------------------------------------------------------------------------- */

const roleBlockIds = { "end-date": "date-block", support: "support", closing: "closing" } as const satisfies Record<Exclude<CompositionTarget, "main-image">, string>

const dateLame = "email-module-hero-countdown-variant-01" as const

type RawBlock = { id: string; type: string; surface?: string; slots: Record<string, Record<string, unknown>> }
const raw = (block: EmailBlock) => block as unknown as RawBlock
const asBlock = (value: unknown) => value as EmailBlock

/**
 * Bloc « fin de l'offre » : trois cases (jour, mois, année) tirées de
 * `Promotion Facts.endDate`, un titre et une phrase fixes. Rien n'y vient de
 * Claude ; rien n'y dépend de l'heure.
 */
export function buildEndDateBlock(facts: Pick<PromotionFacts, "endDate">): EmailBlock {
  const [year, month, day] = facts.endDate.split("-") as [string, string, string]
  return asBlock({
    id: roleBlockIds["end-date"],
    type: dateLame,
    slots: {
      "compteur-1": { text: day },
      "label-1": { text: "Jour" },
      "compteur-2": { text: month },
      "label-2": { text: "Mois" },
      "compteur-3": { text: year },
      "label-3": { text: "Année" },
      "titre-principal": { text: "Fin de l'offre" },
      "texte-descriptif": { text: `Offre valable jusqu'au ${formatPromotionDate(facts.endDate)}.` },
    },
  })
}

/** Lames qui portent l'image principale : les visuels de la banque, jamais la frise de portraits. */
function mainImageIndex(config: EmailConfig): number {
  return config.blocks.findIndex((block) => {
    if (block.type === emailPortraitStripBlock) return false
    return Object.values(raw(block).slots).some((slot) => typeof slot.src === "string" && emailBankImageIdFromSrc(slot.src) !== undefined)
  })
}

const imageSlotName = (block: RawBlock) => Object.entries(block.slots).find(([, slot]) => typeof slot.src === "string" && emailBankImageIdFromSrc(slot.src) !== undefined)![0]

/** Intentions visuelles de la famille (jamais d'autres). */
function familyIntents(family: EmailEditFamily): readonly string[] {
  return family === "promotion" ? promotionVisualIntents : emailRecipes[family].images.intents
}

/* -------------------------------------------------------------------------- */
/* Capacités                                                                  */
/* -------------------------------------------------------------------------- */

export type CompositionCapabilities = {
  operations: CompositionOperationName[]
  targets: CompositionTarget[]
  values: CompositionValue[]
}

/**
 * Ce que l'on peut demander à CET email : décidé par le code AVANT l'appel,
 * d'après la famille et l'email visible. R4 : date de fin, appuis, surfaces,
 * image. Les autres familles : l'image seulement, et seulement si elle est
 * remplaçable (pas une frise de portraits). R3 : jamais autre chose qu'une
 * image : les preuves ne bougent pas.
 */
export function compositionCapabilities(family: EmailEditFamily, config: EmailConfig): CompositionCapabilities | undefined {
  const image = mainImageIndex(config) >= 0
  if (family === "promotion") {
    return {
      operations: ["add-section", "remove-section", "change-surface", ...(image ? (["change-image"] as const) : [])],
      targets: ["end-date", "support", "closing", ...(image ? (["main-image"] as const) : [])],
      values: ["default", "clair", "jaune", "vert", "sombre", ...(image ? (["alternative", ...promotionVisualIntents] as const) : [])],
    }
  }
  if (!image) return undefined
  return { operations: ["change-image"], targets: ["main-image"], values: ["alternative", ...(familyIntents(family) as CompositionValue[])] }
}

/** Vue de la mise en page pour Claude : des rôles et leur état, jamais une lame ni une couleur. */
export function describeLayout(family: EmailEditFamily, config: EmailConfig) {
  const surfaceName = (block: RawBlock | undefined) => (Object.entries(compositionSurfaceVariants).find(([, surface]) => surface === (block?.surface ?? "page"))?.[0] ?? "clair")
  const byId = (id: string) => config.blocks.map(raw).find((block) => block.id === id)
  const image = mainImageIndex(config)
  const imageId = image >= 0 ? emailBankImageIdFromSrc(String(raw(config.blocks[image]!).slots[imageSlotName(raw(config.blocks[image]!))]!.src)) : undefined
  return {
    ...(family === "promotion"
      ? {
          sections: [
            { role: "end-date", present: byId("date-block") !== undefined, surface: surfaceName(byId("date-block")) },
            { role: "support", present: byId("support") !== undefined, surface: surfaceName(byId("support")) },
            { role: "closing", present: byId("closing") !== undefined, surface: surfaceName(byId("closing")) },
          ],
        }
      : {}),
    ...(imageId ? { mainImage: { intent: emailBank[imageId].intent } } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

export type CompositionContext = {
  family: EmailEditFamily
  /** Promotion Facts de la demande (R4) : la seule source de la date de fin. */
  promotion?: Pick<PromotionFacts, "endDate">
}

export type CompositionResult = { ok: true; config: EmailConfig } | { ok: false; message: string; index: number }

const refuse = (index: number, message: string): CompositionResult => ({ ok: false, index, message })

/** Autre image de la banque : la suivante, dans l'ordre du catalogue, parmi celles que la lame accepte et que l'email n'emploie pas. */
function nextImage(family: EmailEditFamily, working: EmailConfig, blockIndex: number, value: CompositionValue): EmailBankImageId | string {
  const block = raw(working.blocks[blockIndex]!)
  const intents = familyIntents(family)
  const wanted = value === "alternative" ? intents : intents.filter((intent) => intent === value)
  if (wanted.length === 0) return "Cette intention visuelle n'est pas disponible pour cet email."
  const slot = block.slots[imageSlotName(block)]!
  const current = emailBankImageIdFromSrc(String(slot.src))!
  const used = new Set(working.blocks.flatMap((candidate) => Object.values(raw(candidate).slots).flatMap((entry) => (typeof entry.src === "string" ? [emailBankImageIdFromSrc(entry.src)] : []))))
  const candidates = [...new Set(wanted.flatMap((intent) => emailImagesForIntent(intent, block.type)))].filter((id) => id !== current && !used.has(id)).sort((a, b) => emailBankImageIds.indexOf(a) - emailBankImageIds.indexOf(b))
  if (candidates.length === 0) return "Aucune autre image n'est disponible pour cet emplacement."
  return candidates.find((id) => emailBankImageIds.indexOf(id) > emailBankImageIds.indexOf(current)) ?? candidates[0]!
}

/**
 * Pré-composition → email visible. Rejoue les opérations dans l'ordre sur une
 * copie ; la première opération impossible interrompt et dit pourquoi, sans rien
 * appliquer. `base` n'est jamais muté. Le résultat passe `safeParseEmailConfig`.
 */
export function applyEmailComposition(base: EmailConfig, composition: EmailComposition, context: CompositionContext): CompositionResult {
  const capabilities = compositionCapabilities(context.family, base)
  const originals = new Map(base.blocks.map((block) => [raw(block).id, structuredClone(block)]))
  let blocks = structuredClone(base.blocks) as EmailBlock[]

  for (const [index, operation] of composition.operations.entries()) {
    if (!capabilities || !capabilities.operations.includes(operation.op) || !capabilities.targets.includes(operation.target) || !capabilities.values.includes(operation.value)) {
      return refuse(index, "Cette modification n'est pas disponible pour cet email.")
    }
    const find = (id: string) => blocks.findIndex((block) => raw(block).id === id)
    const working = (): EmailConfig => ({ ...base, blocks })

    if (operation.op === "add-section" || operation.op === "remove-section") {
      if (operation.value !== "default" || operation.target === "closing" || operation.target === "main-image") return refuse(index, "Cette section ne peut pas être ajoutée ou retirée.")
      const id = roleBlockIds[operation.target]
      const at = find(id)
      if (operation.op === "remove-section") {
        if (at < 0) return refuse(index, operation.target === "end-date" ? "Le bloc de fin d'offre n'est pas dans l'email." : "Le bloc d'appuis n'est pas dans l'email.")
        blocks = blocks.filter((block) => raw(block).id !== id)
        continue
      }
      if (at >= 0) return refuse(index, operation.target === "end-date" ? "Le bloc de fin d'offre est déjà dans l'email." : "Le bloc d'appuis est déjà dans l'email.")
      if (operation.target === "end-date") {
        const offer = find("offer")
        if (!context.promotion?.endDate || offer < 0) return refuse(index, "Sans date de fin contrôlée, le bloc de fin d'offre ne peut pas être ajouté.")
        blocks = [...blocks.slice(0, offer + 1), buildEndDateBlock(context.promotion), ...blocks.slice(offer + 1)]
      } else {
        // Les appuis reviennent à leur place d'origine, tels que le resolver les a composés : avant la conclusion.
        const original = originals.get(id)
        const before = find("closing")
        if (!original || before < 0) return refuse(index, "Le bloc d'appuis ne peut pas être rétabli.")
        blocks = [...blocks.slice(0, before), structuredClone(original), ...blocks.slice(before)]
      }
      continue
    }

    if (operation.op === "change-surface") {
      if (operation.target === "main-image" || !(operation.value in compositionSurfaceVariants)) return refuse(index, "Cette variante de couleur n'existe pas.")
      const id = roleBlockIds[operation.target]
      const at = find(id)
      if (at < 0) return refuse(index, "Ce bloc n'est pas dans l'email.")
      const surface = compositionSurfaceVariants[operation.value as CompositionSurfaceVariant]
      // Une seule zone colorée : la nouvelle remplace l'ancienne.
      blocks = blocks.map((block, position) => {
        const copy = { ...raw(block) } as RawBlock
        if (position === at) {
          if (surface === "page") delete copy.surface
          else copy.surface = surface
        } else if (surface !== "page") delete copy.surface
        return asBlock(copy)
      })
      continue
    }

    // change-image
    if (operation.target !== "main-image" || !(operation.value === "alternative" || (emailVisualIntents as readonly string[]).includes(operation.value))) return refuse(index, "Cette image ne peut pas être changée ainsi.")
    const at = mainImageIndex(working())
    if (at < 0) return refuse(index, "Cet email n'a pas d'image remplaçable.")
    const chosen = nextImage(context.family, working(), at, operation.value)
    if (!(chosen in emailBank)) return refuse(index, chosen)
    const block = raw(blocks[at]!)
    const name = imageSlotName(block)
    blocks = blocks.map((candidate, position) => (position === at ? asBlock({ ...block, slots: { ...block.slots, [name]: resolveEmailBankImage(chosen, block.type) } }) : candidate))
  }

  const parsed = safeParseEmailConfig({ ...base, blocks })
  if (!parsed.success) return refuse(composition.operations.length - 1, "La composition obtenue n'est pas valide.")
  return { ok: true, config: parsed.data }
}

/* -------------------------------------------------------------------------- */
/* Comparaison avant / après                                                  */
/* -------------------------------------------------------------------------- */

export type CompositionViolation = { path: string; message: string }

/**
 * Entre deux emails visibles (avant et après de NOUVELLES opérations) : seuls les
 * changements autorisés ont eu lieu. Tout bloc conservé est identique (textes,
 * liens, valeurs, légal, preuves), à l'exception de la surface d'un bloc ciblé par
 * une opération de surface et de l'image d'un bloc ciblé par une opération
 * d'image ; tout bloc ajouté est le bloc de fin d'offre calculé par le système ou
 * un bloc rétabli tel que le resolver l'avait composé ; tout bloc retiré est un
 * bloc que les opérations pouvaient retirer ; l'ordre des blocs conservés ne
 * change pas.
 */
export function compositionViolations(before: EmailConfig, after: EmailConfig, operations: readonly CompositionOperation[], context: CompositionContext, restorable: ReadonlyMap<string, EmailBlock>): CompositionViolation[] {
  const issues: CompositionViolation[] = []
  const issue = (path: string, message: string) => issues.push({ path, message })
  const ids = (config: EmailConfig) => config.blocks.map((block) => raw(block).id)
  const beforeIds = ids(before)
  const afterIds = ids(after)
  const added = afterIds.filter((id) => !beforeIds.includes(id))
  const removed = beforeIds.filter((id) => !afterIds.includes(id))
  const touched = (op: CompositionOperationName, target: CompositionTarget) => operations.some((operation) => operation.op === op && operation.target === target)

  for (const key of ["id", "name", "version", "subject", "preheader"] as const) if (before[key] !== after[key]) issue(key, "Un champ de l'email a changé.")
  for (const id of added) {
    const block = after.blocks.find((candidate) => raw(candidate).id === id)!
    const expected = id === roleBlockIds["end-date"] && context.promotion ? buildEndDateBlock(context.promotion) : id === roleBlockIds.support ? restorable.get(id) : undefined
    const allowed = (id === roleBlockIds["end-date"] && touched("add-section", "end-date")) || (id === roleBlockIds.support && touched("add-section", "support"))
    if (!allowed || !expected || JSON.stringify({ ...raw(block), surface: undefined }) !== JSON.stringify({ ...raw(expected), surface: undefined })) issue(`blocks.${id}`, "Un bloc ajouté n'est pas celui que le système compose.")
  }
  for (const id of removed) {
    if (!((id === roleBlockIds["end-date"] && touched("remove-section", "end-date")) || (id === roleBlockIds.support && touched("remove-section", "support")))) issue(`blocks.${id}`, "Un bloc ne peut pas être retiré.")
  }
  const keptBefore = beforeIds.filter((id) => afterIds.includes(id))
  const keptAfter = afterIds.filter((id) => beforeIds.includes(id))
  if (JSON.stringify(keptBefore) !== JSON.stringify(keptAfter)) issue("blocks", "L'ordre des blocs a changé.")
  if (added.includes(roleBlockIds["end-date"]) && afterIds[afterIds.indexOf(roleBlockIds["end-date"]) - 1] !== "offer") issue("blocks.date-block", "Le bloc de fin d'offre se place sous l'offre.")

  const imageBlock = mainImageIndex(before) >= 0 ? raw(before.blocks[mainImageIndex(before)]!).id : undefined
  for (const id of keptBefore) {
    const x = raw(before.blocks.find((block) => raw(block).id === id)!)
    const y = raw(after.blocks.find((block) => raw(block).id === id)!)
    const path = `blocks.${id}`
    if (x.type !== y.type) issue(path, "Une lame a changé.")
    const surfaceTarget = (Object.entries(roleBlockIds) as [Exclude<CompositionTarget, "main-image">, string][]).some(([target, blockId]) => blockId === id && touched("change-surface", target))
    // Un bloc non ciblé ne peut que redevenir clair, parce qu'une autre zone est devenue colorée (une seule zone colorée).
    if (x.surface !== y.surface && !surfaceTarget && !(y.surface === undefined && operations.some((operation) => operation.op === "change-surface"))) issue(`${path}.surface`, "La surface d'un bloc non ciblé a changé.")
    for (const name of new Set([...Object.keys(x.slots), ...Object.keys(y.slots)])) {
      const a = x.slots[name]
      const b = y.slots[name]
      if (JSON.stringify(a) === JSON.stringify(b)) continue
      const isImage = !!a && !!b && typeof a.src === "string" && typeof b.src === "string" && emailBankImageIdFromSrc(a.src) !== undefined && emailBankImageIdFromSrc(b.src) !== undefined
      if (!(isImage && id === imageBlock && touched("change-image", "main-image"))) issue(`${path}.slots.${name}`, "Un contenu protégé a changé (texte, lien, valeur, légal ou preuve).")
    }
  }
  return issues
}
