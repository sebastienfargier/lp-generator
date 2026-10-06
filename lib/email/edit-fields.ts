/**
 * Champs éditables d'un email : la vue éditoriale que Claude reçoit, et le seul
 * endroit où une modification peut se poser. Module pur, hors ligne.
 *
 * Modèle : l'email courant est un DRAFT de sa famille (R1 à R4), recomposé en
 * EmailConfig par le resolver existant. Une modification est un PATCH de champs
 * de texte nommés (`hero.title`, `support.items.1.text`…), jamais un nouvel
 * EmailConfig, jamais du HTML. La liste des champs est fermée et décidée par le
 * code, AVANT l'appel : un champ qui n'y figure pas ne peut pas être modifié.
 *
 * Verrouillé (jamais dans la liste) : destination des boutons, icônes,
 * intention visuelle, édition de newsletter, identifiants de claims, et tout ce
 * que le resolver pose lui-même : valeur, code, date, périmètre, mention légale,
 * images, liens, footer, composition. Ces valeurs ne sont pas dans le Draft
 * (R4, R3) ou ne sont pas des textes (le reste) : elles viennent de la demande.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailConfig } from "./types"

export const emailEditFamilies = ["discovery-reassurance", "editorial-newsletter", "brand-proof", "promotion"] as const
export type EmailEditFamily = (typeof emailEditFamilies)[number]

export type EmailEditField = { path: string; label: string }

const heroMedium = "email-module-hero-promotional-image-medium"

const field = (path: string, label: string): EmailEditField => ({ path, label })
const indexed = (base: string, count: number, parts: readonly (readonly [string, string])[], noun: string) =>
  Array.from({ length: count }, (_, index) => parts.map(([key, label]) => field(`${base}.${index}.${key}`, `${noun} ${index + 1} : ${label}`))).flat()

/** Le hero « medium » n'a pas de surtitre : son champ n'est pas rendu, donc pas éditable. */
const hasEyebrow = (config: EmailConfig) => !config.blocks.some((block) => block.type === heroMedium)

const hero = (config: EmailConfig) => [
  ...(hasEyebrow(config) ? [field("hero.eyebrow", "surtitre du hero")] : []),
  field("hero.title", "titre du hero"),
  field("hero.text", "accroche du hero"),
  field("hero.cta.label", "libellé du bouton du hero"),
]

/**
 * Champs de texte éditables, dans l'ordre de l'email. Dépend de la famille, du
 * Draft courant (nombre d'appuis d'une preuve) et de l'EmailConfig courant
 * (un champ non rendu n'est pas éditable).
 */
export function editableFields(family: EmailEditFamily, draft: unknown, config: EmailConfig): EmailEditField[] {
  const head = [field("subject", "objet"), field("preheader", "préheader")]
  switch (family) {
    case "discovery-reassurance":
      return [
        ...head,
        ...hero(config),
        field("steps.eyebrow", "surtitre des étapes"),
        ...indexed("steps.items", 3, [["title", "titre"], ["text", "texte"]], "étape"),
        field("benefits.title", "titre des appuis"),
        ...indexed("benefits.items", 3, [["title", "titre"], ["text", "texte"]], "appui"),
        field("closing.title", "titre de la conclusion"),
        field("closing.text", "texte de la conclusion"),
        field("closing.ctaLabel", "libellé du bouton de la conclusion"),
      ]
    case "editorial-newsletter":
      return [
        ...head,
        ...hero(config),
        field("intro.title", "titre de l'introduction"),
        field("intro.text", "texte de l'introduction"),
        field("rubriques.eyebrow", "surtitre des rubriques"),
        field("rubriques.title", "titre des rubriques"),
        ...indexed("rubriques.items", 4, [["title", "titre"], ["text", "texte"]], "rubrique"),
        field("closing.title", "titre de la conclusion"),
        field("closing.text", "texte de la conclusion"),
        field("closing.ctaLabel", "libellé du bouton de la conclusion"),
      ]
    case "brand-proof": {
      const claims = (draft as { claims?: unknown[] } | undefined)?.claims
      const count = Array.isArray(claims) ? claims.length : 0
      return [
        ...head,
        ...hero(config),
        ...Array.from({ length: count }, (_, index) => field(`support.${index}`, `texte d'appui de la preuve ${index + 1}`)),
        field("closing.title", "titre de la conclusion"),
        field("closing.text", "texte de la conclusion"),
      ]
    }
    case "promotion":
      return [
        ...head,
        field("offer.eyebrow", "surtitre de l'offre"),
        field("offer.text", "accroche de l'offre"),
        field("offer.ctaLabel", "libellé du bouton de l'offre"),
        field("support.title", "titre des appuis"),
        ...indexed("support.items", 3, [["title", "titre"], ["text", "texte"]], "appui"),
        field("closing.title", "titre de la conclusion"),
        field("closing.text", "texte de la conclusion"),
        field("closing.ctaLabel", "libellé du bouton de la conclusion"),
      ]
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture et écriture par chemin                                             */
/* -------------------------------------------------------------------------- */

type Json = Record<string, unknown> | unknown[]

/** Texte d'un champ du Draft, ou `undefined` si le chemin n'existe pas ou n'est pas un texte. */
export function getDraftText(draft: unknown, path: string): string | undefined {
  let current: unknown = draft
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === "string" ? current : undefined
}

/** Copie du Draft dont les champs nommés ont un nouveau texte. Ne crée jamais un chemin : un chemin inconnu lève. */
export function setDraftTexts(draft: unknown, edits: readonly { path: string; text: string }[]): unknown {
  const copy = structuredClone(draft) as Json
  for (const { path, text } of edits) {
    const keys = path.split(".")
    let current: unknown = copy
    for (const key of keys.slice(0, -1)) {
      if (current === null || typeof current !== "object" || !(key in (current as object))) throw new Error(`Chemin inconnu : ${path}.`)
      current = (current as Record<string, unknown>)[key]
    }
    const last = keys.at(-1)!
    if (current === null || typeof current !== "object" || typeof (current as Record<string, unknown>)[last] !== "string") throw new Error(`Chemin inconnu : ${path}.`)
    ;(current as Record<string, unknown>)[last] = text
  }
  return copy
}
