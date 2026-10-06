/**
 * Comparaison avant / après d'un email édité : TOUT ce qui n'est pas un texte
 * éditorial doit être strictement identique. Indépendante de la façon dont
 * l'email a été recomposé : elle compare deux EmailConfig, feuille à feuille,
 * et ne dépend ni du patch ni du resolver.
 *
 * Seule une feuille `text` ou `label` d'un slot de TEXTE éditorial peut
 * changer. Sont donc immuables :
 * - la séquence de lames, leurs identifiants, leurs surfaces ;
 * - tout `href`, `src`, `alt`, `icon`, `disclaimer`, `endDate` ;
 * - les blocs système : header, mention légale, footer, bandeau preheader,
 *   bandeaux de chiffres clés ;
 * - les slots que le système remplit dans une lame d'offre (valeur, code, lien
 *   secondaire) ;
 * - tout texte égal à une valeur protégée : formulation exacte d'une claim,
 *   phrase de périmètre.
 *
 * Aucune correction : une différence interdite est un rejet de l'édition.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailBlock, EmailConfig } from "./types"

export type ProtectedChange = { path: string; message: string }

const lockedTypes = new Set<string>([
  "email-module-header-newsletter",
  "email-module-header-seasonal-campaign",
  "email-module-preheader",
  "email-module-legal-disclaimer",
  "email-module-footer-compact-legal",
  "email-module-benefits-compact-highlights",
])

/** Slots d'une lame d'offre remplis par le système (jamais par Claude). */
const lockedOfferSlots = new Set(["valeur-cle", "code-promo-1", "lien-1"])

type RawBlock = { id: string; type: string; surface?: string; slots: Record<string, Record<string, unknown>> }
const raw = (block: EmailBlock) => block as unknown as RawBlock

export type ProtectedContext = {
  /** Textes protégés, à l'identique (formulation d'une claim, phrase de périmètre, valeur affichée…). */
  protectedTexts: readonly string[]
}

const normalize = (value: string) => value.replace(/ /g, " ").trim()

/** Différences interdites entre deux EmailConfig ; liste vide : seuls des textes éditoriaux ont changé. */
export function protectedChanges(before: EmailConfig, after: EmailConfig, context: ProtectedContext): ProtectedChange[] {
  const changes: ProtectedChange[] = []
  const change = (path: string, message: string) => changes.push({ path, message })
  const protectedTexts = new Set(context.protectedTexts.map(normalize))

  for (const key of ["id", "name", "version"] as const) {
    if (before[key] !== after[key]) change(key, "Un identifiant de l'email a changé.")
  }
  if (before.blocks.length !== after.blocks.length) {
    change("blocks", "Le nombre de lames a changé.")
    return changes
  }

  before.blocks.forEach((previous, index) => {
    const next = after.blocks[index]!
    const a = raw(previous)
    const b = raw(next)
    const where = `blocks.${a.id}`
    if (a.id !== b.id || a.type !== b.type) return change(where, "La lame ou son identifiant a changé.")
    if (a.surface !== b.surface) change(`${where}.surface`, "La surface de couleur a changé.")
    const names = new Set([...Object.keys(a.slots), ...Object.keys(b.slots)])
    for (const name of names) {
      const x = a.slots[name]
      const y = b.slots[name]
      const path = `${where}.slots.${name}`
      if (!x || !y) {
        change(path, "Un slot a été ajouté ou retiré.")
        continue
      }
      for (const leaf of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const was = x[leaf]
        const now = y[leaf]
        if (JSON.stringify(was) === JSON.stringify(now)) continue
        const editable =
          (leaf === "text" || leaf === "label") &&
          typeof was === "string" &&
          typeof now === "string" &&
          !lockedTypes.has(a.type) &&
          !(a.id === "offer" && lockedOfferSlots.has(name)) &&
          !protectedTexts.has(normalize(was))
        if (!editable) change(`${path}.${leaf}`, "Un élément protégé a changé (valeur, code, date, lien, image, mention légale ou preuve).")
      }
    }
  })

  return changes
}

/** Champs de texte dont la valeur a changé (chemins `blocks.<id>.slots.<slot>.<feuille>`, objet et préheader inclus). */
export function changedTexts(before: EmailConfig, after: EmailConfig): string[] {
  const paths: string[] = []
  if (before.subject !== after.subject) paths.push("subject")
  if (before.preheader !== after.preheader) paths.push("preheader")
  before.blocks.forEach((previous, index) => {
    const a = raw(previous)
    const b = raw(after.blocks[index]!)
    for (const [name, value] of Object.entries(a.slots)) {
      for (const leaf of ["text", "label"]) {
        if (typeof value[leaf] === "string" && value[leaf] !== b.slots[name]?.[leaf]) paths.push(`blocks.${a.id}.slots.${name}.${leaf}`)
      }
    }
  })
  return paths
}
