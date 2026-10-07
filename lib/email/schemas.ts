import { z } from "zod"

import { emailDisclaimers, type EmailDisclaimerId } from "./disclaimers"
import {
  emailBlockManifest,
  emailIconNames,
  type EmailSlotKind,
  type EmailSurfaceMode,
} from "./manifest"
import { emailSurfaceRules, emailSurfaces } from "./surfaces"
import { emailHrefPlaceholders, type EmailSystemElement } from "./system"
import type { EmailBlockType, EmailConfig } from "./types"

/**
 * Validation runtime d'EmailConfig : tout ce qui vient d'une source inconnue
 * (Claude, JSON, stockage, import) passe ici avant d'être un EmailConfig.
 *
 * Le contrat reste celui de `./types`, dérivé du manifeste : ce fichier n'en
 * définit pas un second. Les 36 schémas de lame sont construits en parcourant
 * `emailBlockManifest` ; les valeurs de slot, disclaimers, icônes et surfaces
 * viennent de leurs catalogues respectifs.
 *
 * Les objets sont stricts : une clé inconnue (`className`, `style`, `html`, un
 * élément système…) est une erreur, jamais supprimée silencieusement.
 *
 * Aucun effet global sur Zod : les messages intégrés passent en français par
 * appel de `parseEmailConfig` / `safeParseEmailConfig` (`frenchErrors`), les
 * messages métier sont écrits explicitement dans les schémas.
 * Seule la validité structurelle est contrôlée ici : qualité éditoriale,
 * longueurs recommandées et envoyabilité relèvent d'autres couches.
 */

/* -------------------------------------------------------------------------- */
/* Briques                                                                    */
/* -------------------------------------------------------------------------- */

/** Texte obligatoire : au moins un caractère non blanc. */
const visibleText = z.string().regex(/\S/, "Ne doit pas être vide.")

/**
 * Balisage HTML réel : balise ouvrante ou fermante nommée (`<strong>`,
 * `</a>`, `<a href="…">`, `<br/>`), commentaire ou doctype. Un `<` ou `>`
 * isolé (« Réponse en <5 min », « x > 5 ») n'en est pas.
 */
const htmlMarkup = /<(?:\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|!--|!doctype)/i

/**
 * Contenu de slot : texte brut, que le renderer échappera. Une balise serait
 * affichée telle quelle : elle est refusée. Liquid (`{{ … }}`) autorisé.
 */
const slotText = visibleText.refine(
  (value) => !htmlMarkup.test(value),
  "HTML interdit : texte brut uniquement (Liquid {{ … }} autorisé)."
)

/** Identifiant stable et sérialisable (même règle que les ids Landing). */
export const EmailIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "Identifiant invalide : minuscules, chiffres et tirets, commençant par une lettre (ex. rentree-2026)."
  )

/* -------------------------------------------------------------------------- */
/* Liens                                                                      */
/* -------------------------------------------------------------------------- */

const utmQuery = new RegExp(
  `[?&]${escapeRegExp(emailHrefPlaceholders.utm)}$`
)

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * URL absolue HTTPS avec un hôte, sans espace, guillemet, chevron, accolade
 * ni antislash.
 */
function isPlainHttpsUrl(value: string) {
  if (!value.startsWith("https://") || /[\s"'<>`{}\\]/.test(value)) {
    return false
  }
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname.length > 0
  } catch {
    return false
  }
}

/** Expression Liquid : une seule `{{ … }}` non vide, sans `"`, chevron ni accolade. */
const liquidExpression = "\\{\\{[^{}\"<>\\n]*\\S[^{}\"<>\\n]*\\}\\}"
const liquidHref = new RegExp(`^${liquidExpression}$`)
const liquidSegments = new RegExp(liquidExpression, "g")

/**
 * URL HTTPS pouvant interpoler du Liquid dans son chemin, sa query ou son
 * fragment (jamais dans l'hôte). Chaque `{{ … }}` bien formé est neutralisé,
 * puis le reste doit être une URL HTTPS valide : une accolade restante
 * signale un Liquid mal fermé. Liquid n'est jamais exécuté.
 */
function isHttpsUrlWithLiquid(value: string) {
  const authority = value.slice("https://".length).split(/[/?#]/, 1)[0] ?? ""
  if (authority.includes("{")) return false
  return isPlainHttpsUrl(value.replace(liquidSegments, "liquid"))
}

/** Politique `EmailHref` de `./types`, vérifiable hors Zod. */
export function isEmailHref(value: string) {
  if (value === emailHrefPlaceholders.urlToConfirm) return true
  if (liquidHref.test(value)) return true
  return isHttpsUrlWithLiquid(value.replace(utmQuery, ""))
}

const hrefMessage = `Lien invalide : URL https://… (Liquid {{ … }} admis hors hôte, query ?${emailHrefPlaceholders.utm} admise), expression Liquid {{ … }} ou ${emailHrefPlaceholders.urlToConfirm}.`

export const EmailHrefSchema = z.string().refine(isEmailHref, hrefMessage)

const EmailHttpsUrlSchema = z
  .string()
  .refine(isPlainHttpsUrl, "URL invalide : https://… absolue attendue.")

/* -------------------------------------------------------------------------- */
/* Valeurs de slots                                                           */
/* -------------------------------------------------------------------------- */

export const TextSlotSchema = z.strictObject({ text: slotText })

export const CtaSlotSchema = z.strictObject({
  label: slotText,
  href: EmailHrefSchema,
})

export const LinkSlotSchema = z.strictObject({
  label: slotText,
  href: EmailHrefSchema,
})

/** Dimensions et ratio appartiennent au template : seuls `src` et `alt`. */
export const ImageAssetSlotSchema = z.strictObject({
  src: EmailHttpsUrlSchema,
  /**
   * Chaîne vide autorisée (visuel décoratif). Choisir entre un alt
   * descriptif et un alt vide relève du moteur de génération et de
   * l'accessibilité, pas de la validation structurelle.
   */
  alt: z.string(),
})

export const IconAssetSlotSchema = z.strictObject({
  icon: z.enum(emailIconNames),
})

/** `AAAA-MM-JJ`, date calendaire réelle. */
const EmailDateSchema = z.iso.date("Date invalide : AAAA-MM-JJ attendu.")

const disclaimerIds = Object.keys(emailDisclaimers) as EmailDisclaimerId[]

/**
 * Un identifiant du catalogue, jamais un texte. `endDate` est obligatoire
 * pour les disclaimers qui déclarent ce paramètre, interdit pour les autres.
 */
export const DisclaimerSlotSchema = z.discriminatedUnion(
  "disclaimer",
  nonEmpty(
    disclaimerIds.map((id) => {
      const entry = emailDisclaimers[id]
      return "parameter" in entry && entry.parameter === "endDate"
        ? z.strictObject({ disclaimer: z.literal(id), endDate: EmailDateSchema })
        : z.strictObject({ disclaimer: z.literal(id) })
    })
  ),
  {
    error: `Disclaimer inconnu : choisir un identifiant du catalogue (${disclaimerIds.join(", ")}).`,
  }
)

/** Schéma de valeur par type de slot du manifeste (exhaustif). */
const slotSchemaByKind = {
  texte: TextSlotSchema,
  cta: CtaSlotSchema,
  "cta:fleche": CtaSlotSchema,
  lien: LinkSlotSchema,
  "asset:visuel": ImageAssetSlotSchema,
  "asset:icone": IconAssetSlotSchema,
  disclaimer: DisclaimerSlotSchema,
} satisfies { [Kind in EmailSlotKind]: z.ZodType }

/* -------------------------------------------------------------------------- */
/* Lames, dérivées du manifeste                                               */
/* -------------------------------------------------------------------------- */

type ManifestEntry = {
  family: string
  surfaceMode: EmailSurfaceMode
  slots: Readonly<Record<string, EmailSlotKind>>
  optional?: readonly string[]
  system?: readonly EmailSystemElement[]
}

function blockSchema(type: EmailBlockType, entry: ManifestEntry) {
  const optional = new Set(entry.optional ?? [])
  const system = new Set<string>(entry.system ?? [])
  const shape = Object.fromEntries(
    Object.entries(entry.slots).map(([slot, kind]) => {
      const schema = slotSchemaByKind[kind]
      return [slot, optional.has(slot) ? schema.optional() : schema]
    })
  )
  const allowed = Object.keys(entry.slots)

  const slots = z
    .strictObject(shape, {
      error: (issue) => {
        if (issue.code !== "unrecognized_keys") return undefined
        const systemKeys = issue.keys.filter((key) => system.has(key))
        const otherKeys = issue.keys.filter((key) => !system.has(key))
        return [
          systemKeys.length > 0 &&
            `Élément système non configurable : ${systemKeys.join(", ")}.`,
          otherKeys.length > 0 &&
            `Slot inconnu pour "${type}" : ${otherKeys.join(", ")}.`,
          `Slots autorisés : ${allowed.length > 0 ? allowed.join(", ") : "aucun"}.`,
        ]
          .filter(Boolean)
          .join(" ")
      },
    })
    .superRefine((value, ctx) => {
      // Deux disclaimers identiques dans la même lame sont interdits.
      const seen = new Map<string, string>()
      for (const [slot, kind] of Object.entries(entry.slots)) {
        if (kind !== "disclaimer") continue
        const slotValue: unknown = value[slot]
        if (
          typeof slotValue !== "object" ||
          slotValue === null ||
          !("disclaimer" in slotValue) ||
          typeof slotValue.disclaimer !== "string"
        ) {
          continue
        }
        const selected = slotValue.disclaimer
        const previous = seen.get(selected)
        if (previous) {
          ctx.addIssue({
            code: "custom",
            path: [slot, "disclaimer"],
            message: `Disclaimer "${selected}" déjà utilisé par ${previous} dans cette lame.`,
          })
        }
        seen.set(selected, slot)
      }
    })

  const base = { id: EmailIdSchema, type: z.literal(type), slots }

  // Lame `fixed` : pas de clé `surface`, que le renderer n'appliquerait pas.
  if (entry.surfaceMode === "fixed") {
    return z.strictObject(base, {
      error: (issue) =>
        issue.code === "unrecognized_keys" && issue.keys.includes("surface")
          ? `Surface non configurable : "${type}" garde ses couleurs (surface fixe).`
          : undefined,
    })
  }
  return z.strictObject({
    ...base,
    surface: z
      .enum(emailSurfaces, {
        error: `Surface inconnue : ${emailSurfaces.join(", ")}.`,
      })
      .optional(),
  })
}

const blockTypes = Object.keys(emailBlockManifest) as EmailBlockType[]

/**
 * Lames de footer : celles qui portent le lien de désabonnement (« un footer
 * avec son lien de désabonnement », `README-assets-projet.md`). La famille
 * Footer contient aussi le disclaimer, qui n'en est pas un.
 */
const footerTypes: ReadonlySet<string> = new Set(
  blockTypes.filter((type) => {
    const entry: ManifestEntry = emailBlockManifest[type]
    return entry.system?.includes("lien-desabonnement")
  })
)

/** Union discriminée par `type` : une option par lame du manifeste. */
export const EmailBlockSchema = z.discriminatedUnion(
  "type",
  nonEmpty(
    blockTypes.map((type) => blockSchema(type, emailBlockManifest[type]))
  ),
  { error: "Lame inconnue : le type doit être une lame du manifeste." }
)

/**
 * Lames de mentions légales : celles qui portent des slots `disclaimer`.
 * Optionnelles ; au plus une, placée « juste avant le footer »
 * (`instructions-projet.md` §6).
 */
const disclaimerTypes: ReadonlySet<string> = new Set(
  blockTypes.filter((type) => {
    const entry: ManifestEntry = emailBlockManifest[type]
    return Object.values(entry.slots).includes("disclaimer")
  })
)

/* -------------------------------------------------------------------------- */
/* Email                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Règles entre lames, séparées en deux familles :
 * - TECHNIQUES (`idIssues`) : un identifiant désigne une lame, sans quoi une
 *   lame ne peut être ni adressée ni retrouvée ;
 * - de PRODUIT (`shellIssues`, `colorIssues`) : footer unique en dernière
 *   position, mentions légales juste avant lui, jamais deux zones colorées à la
 *   suite. Le renderer et l'export savent produire un email HTML valide sans
 *   elles ; elles viennent des guides du projet (`instructions-projet.md`,
 *   `README-assets-projet.md`, `recettes-couleur.md`).
 *
 * Le contrat historique (`EmailConfigSchema`) les applique TOUTES, dans cet
 * ordre : footer, mentions légales, identifiants, couleurs. Le contrat
 * structurel (`EmailConfigStructureSchema`) n'applique que la technique ; les
 * règles de produit restent lisibles par `emailConfigPolicyIssues`, pour être
 * rapportées comme des recommandations plutôt que comme des refus.
 */
type RuleIssue = { rule: EmailConfigPolicyRule | "duplicate-id"; path: (string | number)[]; message: string }

function shellIssues(config: { blocks: { type: string }[] }): RuleIssue[] {
  const issues: RuleIssue[] = []
  // Exactement un footer, en dernière position (instructions-projet §5-6).
  const footers = config.blocks.flatMap((block, index) =>
    footerTypes.has(block.type) ? [index] : []
  )
  const footerNames = [...footerTypes].join(", ")
  if (footers.length === 0) {
    issues.push({
      rule: "footer-missing",
      path: ["blocks"],
      message: `Footer manquant : l'email doit se terminer par une lame footer (${footerNames}).`,
    })
  }
  footers.slice(1).forEach((index) => {
    issues.push({ rule: "footer-duplicate", path: ["blocks", index, "type"], message: "Footer en double : un email contient exactement un footer." })
  })
  const [firstFooter] = footers
  if (firstFooter !== undefined && footers.length === 1 && firstFooter !== config.blocks.length - 1) {
    issues.push({
      rule: "footer-not-last",
      path: ["blocks", firstFooter, "type"],
      message: `Le footer doit être la dernière lame (position actuelle : ${firstFooter + 1} sur ${config.blocks.length}).`,
    })
  }

  // Disclaimer optionnel : au plus un, immédiatement avant le footer.
  const disclaimers = config.blocks.flatMap((block, index) =>
    disclaimerTypes.has(block.type) ? [index] : []
  )
  disclaimers.slice(1).forEach((index) => {
    issues.push({ rule: "disclaimer-duplicate", path: ["blocks", index, "type"], message: "Disclaimer en double : un email contient au plus une lame de mentions légales." })
  })
  const [disclaimer] = disclaimers
  if (disclaimer !== undefined) {
    const next = config.blocks[disclaimer + 1]
    if (!next || !footerTypes.has(next.type)) {
      issues.push({ rule: "disclaimer-not-before-footer", path: ["blocks", disclaimer, "type"], message: "La lame de mentions légales doit être placée immédiatement avant le footer." })
    }
  }
  return issues
}

function idIssues(config: { blocks: { id: string }[] }): RuleIssue[] {
  const issues: RuleIssue[] = []
  const ids = new Set<string>()
  config.blocks.forEach((block, index) => {
    if (ids.has(block.id)) issues.push({ rule: "duplicate-id", path: ["blocks", index, "id"], message: `Identifiant de lame en double : "${block.id}".` })
    ids.add(block.id)
  })
  return issues
}

function colorIssues(config: { blocks: { id: string }[] }): RuleIssue[] {
  const issues: RuleIssue[] = []
  // Surfaces configurées : jamais deux lames colorées à la suite. Les
  // couleurs intrinsèques des templates ne comptent pas.
  if (!emailSurfaceRules.allowConsecutiveColoredZones) {
    // Seules les lames `configurable` portent une clé `surface`.
    const colored = (block: object | undefined) =>
      block !== undefined &&
      "surface" in block &&
      block.surface !== undefined &&
      block.surface !== emailSurfaceRules.neutral
    config.blocks.forEach((block, index) => {
      const previous = config.blocks[index - 1]
      if (previous && colored(previous) && colored(block)) {
        issues.push({ rule: "consecutive-colored", path: ["blocks", index, "surface"], message: `Deux surfaces colorées consécutives ("${previous.id}" puis "${block.id}").` })
      }
    })
  }
  return issues
}

const addAll = (ctx: z.RefinementCtx, issues: readonly RuleIssue[]) =>
  issues.forEach((issue) => ctx.addIssue({ code: "custom", path: issue.path, message: issue.message }))

const emailConfigObject = z.strictObject({
  version: z.literal(1),
  id: EmailIdSchema,
  name: visibleText,
  subject: visibleText,
  preheader: visibleText,
  blocks: z.array(EmailBlockSchema).min(1, "Au moins une lame est requise."),
})

/**
 * Schéma bas niveau. Son `parse` direct ne garantit pas les messages en
 * français (locale globale de Zod) : passer par `parseEmailConfig` ou
 * `safeParseEmailConfig`.
 */
export const EmailConfigSchema = emailConfigObject.superRefine((config, ctx) => {
  addAll(ctx, [...shellIssues(config), ...idIssues(config), ...colorIssues(config)])
})

/**
 * Contrat STRUCTUREL : lames et slots connus, valeurs des catalogues, texte
 * brut, identifiants uniques, au moins une lame. Rien de plus : c'est ce dont
 * le renderer a besoin pour produire un email HTML (il ne revalide pas les
 * règles de produit). Utilisé par l'Email Builder ; le POC garde le contrat
 * complet ci-dessus.
 */
export const EmailConfigStructureSchema = emailConfigObject.superRefine((config, ctx) => {
  addAll(ctx, idIssues(config))
})

/**
 * Contrat structurel du BUILDER : le même que `EmailConfigStructureSchema`, sauf
 * qu'un email en cours de création peut n'avoir encore AUCUNE lame. Ce n'est pas
 * un email exportable : le POC, le renderer et l'export gardent « au moins une
 * lame ».
 */
const EmailConfigBuilderSchema = emailConfigObject.extend({ blocks: z.array(EmailBlockSchema) }).superRefine((config, ctx) => {
  addAll(ctx, idIssues(config))
})

/** Règles de produit que le contrat structurel n'impose pas (voir plus haut). */
export const emailConfigPolicyRules = ["footer-missing", "footer-duplicate", "footer-not-last", "disclaimer-duplicate", "disclaimer-not-before-footer", "consecutive-colored"] as const
export type EmailConfigPolicyRule = (typeof emailConfigPolicyRules)[number]

export type EmailConfigPolicyIssue = { rule: EmailConfigPolicyRule; path: (string | number)[]; message: string }

/**
 * Écarts d'un EmailConfig aux règles de produit : footer unique en dernière
 * position, mentions légales avant le footer, pas de zones colorées
 * consécutives. Informatif : ne bloque rien, ne modifie rien.
 */
export function emailConfigPolicyIssues(config: EmailConfig): EmailConfigPolicyIssue[] {
  return [...shellIssues(config), ...colorIssues(config)] as EmailConfigPolicyIssue[]
}

/* -------------------------------------------------------------------------- */
/* API de validation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Seul point de conversion : le schéma, construit en parcourant le manifeste,
 * a un type de sortie générique (slots indexés par chaîne). La validation a
 * déjà imposé, lame par lame, exactement les slots et valeurs d'EmailConfig ;
 * on restaure ici la précision du type statique. La parité est vérifiée par
 * les tests de contrat (mêmes cas acceptés et refusés par TypeScript et Zod).
 */
function toEmailConfig(data: z.output<typeof EmailConfigSchema>) {
  return data as EmailConfig
}

/**
 * Messages intégrés de Zod en français, passés par appel : aucun effet sur la
 * configuration globale de Zod (Landing garde la sienne). Les messages
 * explicites des schémas restent prioritaires.
 */
const frenchErrors = { error: z.locales.fr().localeError }

/** Valide des données externes ; lève une `ZodError` si elles sont invalides. */
export function parseEmailConfig(input: unknown): EmailConfig {
  return toEmailConfig(EmailConfigSchema.parse(input, frenchErrors))
}

/**
 * Variante sans exception : renvoie les erreurs détaillées (chemin + message),
 * utiles pour demander une correction à un générateur.
 */
export function safeParseEmailConfig(input: unknown) {
  const result = EmailConfigSchema.safeParse(input, frenchErrors)
  return result.success
    ? { success: true as const, data: toEmailConfig(result.data) }
    : { success: false as const, error: result.error }
}

/** Comme `safeParseEmailConfig`, mais sur le contrat structurel (sans les règles de produit). */
export function safeParseEmailConfigStructure(input: unknown) {
  const result = EmailConfigStructureSchema.safeParse(input, frenchErrors)
  return result.success
    ? { success: true as const, data: toEmailConfig(result.data) }
    : { success: false as const, error: result.error }
}

/** Comme `safeParseEmailConfigStructure`, mais un email sans aucune lame est accepté (travail en cours du Builder). */
export function safeParseEmailConfigBuilder(input: unknown) {
  const result = EmailConfigBuilderSchema.safeParse(input, frenchErrors)
  return result.success
    ? { success: true as const, data: toEmailConfig(result.data as z.output<typeof EmailConfigSchema>) }
    : { success: false as const, error: result.error }
}

/* -------------------------------------------------------------------------- */
/* Utilitaire                                                                 */
/* -------------------------------------------------------------------------- */

/** Tableau non vide, exigé par `z.discriminatedUnion`. */
function nonEmpty<Item>(items: Item[]): [Item, ...Item[]] {
  const [first, ...rest] = items
  if (first === undefined) throw new Error("Catalogue vide.")
  return [first, ...rest]
}
