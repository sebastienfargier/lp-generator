/**
 * Contexte compact pour une génération : brief → sélection déterministe de
 * lames candidates et de destinations → objet JSON pour le futur modèle.
 *
 * Il réduit l'espace de choix, il ne compose pas l'email : le modèle choisit
 * et ordonne les lames parmi les candidates. Tout est dérivé des sources
 * internes — manifeste (slots), catalogue métier (section-catalog),
 * surfaces, icônes, disclaimers, destinations — sans liste concurrente.
 * Aucun HTML, style, texte juridique ni appel à un modèle.
 */
import type { EmailBrief } from "./demo-generator"
import { emailObjectives } from "./demo-generator"
import {
  emailDestinations,
  emailDestinationUrl,
  type EmailDestinationId,
  filiereUsage,
} from "./destinations"
import { ImageAssetSlotSchema } from "./schemas"
import {
  emailEditorialGuidance,
  emailStructuralRules,
  getEmailSectionCatalogForPrompt,
  type EmailPromptSection,
} from "./section-catalog"
import type { EmailSurface } from "./surfaces"

/** Types d'email des sources (`experience-generation.md` §4). */
export const emailTypes = [
  "promo",
  "lifecycle-debut",
  "lifecycle-fin",
  "newsletter",
  "transactionnel",
] as const

export type EmailType = (typeof emailTypes)[number]

export type EmailGenerationContextOptions = {
  /** Type d'email s'il est connu ; sinon email éditorial générique. */
  emailType?: EmailType
  /** Visuels fournis par le brief : seules les URLs HTTPS envoyables comptent. */
  visuals?: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* Lecture du brief                                                           */
/* -------------------------------------------------------------------------- */

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function mentions(text: string, keywords: readonly string[]) {
  const normalized = normalize(text)
  return keywords.some((keyword) => normalized.includes(normalize(keyword)))
}

/** Cas qui appellent un disclaimer (bibliothèque, lame legal-disclaimer). */
const disclaimerCues = ["financ", "cpf", "100 %", "100%", "bourse", "rembours", "salaire", "audirep", "remise", "promo"]
const empathyCues = ["demandeur", "sans emploi", "chomage", "recherche d'emploi"]
const diagnosticCues = ["quiz", "test", "diagnostic", "niveau", "bilan"]
const partnerCues = ["partenaire", "ecole partenaire"]
const codeCues = ["code"]
const deadlineCues = ["date de fin", "jusqu'au", "echeance", "prend fin", "jours", "compte a rebours"]
const choiceCues = ["choix", "choisir", "options", "au choix"]

/** Visuels réellement envoyables : le contrat ImageAssetSlot (HTTPS). */
export function sendableVisuals(visuals: readonly string[] = []) {
  return visuals.filter((src) => ImageAssetSlotSchema.safeParse({ src, alt: "" }).success)
}

/* -------------------------------------------------------------------------- */
/* Sélection des lames                                                        */
/* -------------------------------------------------------------------------- */

type Reading = {
  text: string
  emailType: EmailType | undefined
  /** Nombre de visuels HTTPS envoyables fournis. */
  visualCount: number
}

const hasSlot = (section: EmailPromptSection, test: (name: string, kind: string) => boolean) =>
  section.slots.some((slot) => {
    const [name = "", kind = ""] = slot.replace("?", "").split(": ")
    return test(name, kind)
  })

/**
 * Raison d'écarter une lame pour ce brief, ou `null` si elle est candidate.
 * Les critères viennent des slots du manifeste et des limites du catalogue.
 */
function exclusionReason(section: EmailPromptSection, reading: Reading): string | null {
  const promo = reading.emailType === "promo"
  const type = section.type

  if (type === "email-module-legal-disclaimer") {
    return promo || mentions(reading.text, disclaimerCues) ? null : "aucun cas de disclaimer dans le brief"
  }
  if (type === "email-module-icons-grid") return "contraste des icônes non résolu"
  const visualSlots = section.slots.filter((slot) => slot.endsWith(": asset:visuel")).length
  if (visualSlots > reading.visualCount) {
    return `${visualSlots} visuel(s) HTTPS requis, ${reading.visualCount} fourni(s)`
  }
  if (hasSlot(section, (name) => name.startsWith("temoignage"))) return "témoignage validé requis"
  if (hasSlot(section, (name) => /^produit-\d+-titre$/.test(name))) return "intitulés de formation exacts requis"
  if (hasSlot(section, (name) => name === "partenaire") && !mentions(reading.text, partnerCues)) {
    return "aucun partenaire dans le brief"
  }
  const needsCode = hasSlot(section, (name) => name.startsWith("code-promo"))
  const needsDeadline = hasSlot(section, (name) => name.startsWith("compteur"))
  const needsFigure = hasSlot(section, (name) => name === "valeur-cle")
  if (!promo && (needsCode || needsDeadline || needsFigure || section.onlySurfaces)) {
    return "réservée à un email promo"
  }
  // La lame exige une donnée que seul le brief peut fournir.
  if (needsCode && !mentions(reading.text, codeCues)) return "aucun code promo dans le brief"
  if (needsDeadline && !mentions(reading.text, deadlineCues)) return "aucune échéance dans le brief"
  if (needsFigure && !/\d/.test(reading.text)) return "aucune valeur chiffrée dans le brief"
  if (section.family === "Divider" && !mentions(reading.text, choiceCues)) return "aucun choix entre deux options"
  // Catalogue : le header newsletter s'évite quand la campagne a un libellé.
  if (type === "email-module-header-newsletter" && promo) return "promo : header de campagne"
  if (
    (type === "email-module-diagnostic-progress-list" || type === "email-module-hero-diagnostic-quiz") &&
    promo &&
    !mentions(reading.text, diagnosticCues)
  ) {
    return "promo sans quiz ni diagnostic"
  }
  if (type === "email-module-diagnostic-progress-list" && !mentions(reading.text, diagnosticCues)) {
    return "aucun quiz ou diagnostic dans le brief"
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Sélection des destinations                                                 */
/* -------------------------------------------------------------------------- */

/** Liens du footer (libellés du template) : toujours proposés. */
const footerDestinations: EmailDestinationId[] = ["catalogue-formations", "alternance", "trajectoire-magazine"]

const objectiveDestinations: Record<EmailBrief["objective"], EmailDestinationId[]> = {
  "decouverte-formations": ["metiers", "diplomes", "parcours-decouverte"],
  accompagnement: ["accompagnement", "methode", "coaching-carriere"],
  "evolution-carriere": ["coaching-carriere", "competences-360", "certificats"],
}

/** Le blog ne va qu'en newsletter et en début de lifecycle (`copy-email.md` §4). */
function allowsBlog(emailType: EmailType | undefined) {
  return emailType === undefined || emailType === "newsletter" || emailType === "lifecycle-debut"
}

/** Mots trop génériques pour désigner une filière (vocabulaire des briefs). */
const genericSegments = new Set(["accompagnement", "formation", "insertion"])

/**
 * Filière citée par le brief : un segment complet de son intitulé (séparé
 * par « - ») figure dans le texte, hors segments génériques.
 */
function citedFilieres(text: string): EmailDestinationId[] {
  const normalized = ` ${normalize(text).replace(/[^a-z0-9]+/g, " ")} `
  return (Object.keys(emailDestinations) as EmailDestinationId[]).filter((id) => {
    const destination = emailDestinations[id]
    if (destination.group !== "filiere") return false
    return normalize(destination.label)
      .split(" - ")
      .map((segment) => segment.replace(/[^a-z0-9]+/g, " ").trim())
      .some((segment) => !genericSegments.has(segment) && normalized.includes(` ${segment} `))
  })
}

function selectDestinations(brief: EmailBrief, reading: Reading): EmailDestinationId[] {
  const ids: EmailDestinationId[] = [...footerDestinations, ...objectiveDestinations[brief.objective]]
  if (mentions(reading.text, ["financ", "cpf"]) || mentions(brief.audience, empathyCues)) ids.push("financement")
  if (mentions(reading.text, ["cpf"])) ids.push("cpf-formations-eligibles")
  if (allowsBlog(reading.emailType)) {
    ids.push(mentions(reading.text, ["reconversion"]) ? "blog-reconversion-professionnelle" : "blog-les-temoignages")
  }
  ids.push(...citedFilieres(`${brief.brief} ${brief.audience}`))
  return [...new Set(ids)]
}

/* -------------------------------------------------------------------------- */
/* Contexte                                                                   */
/* -------------------------------------------------------------------------- */

/** Surface de la zone colorée selon le type (`recettes-couleur.md` §5). */
function recommendedSurface(emailType: EmailType | undefined, audience: string): EmailSurface {
  if (mentions(audience, empathyCues)) return "accent-2-soft"
  if (emailType === "promo") return "accent-1"
  if (emailType === "transactionnel") return "bloc"
  return "marque"
}

export type EmailGenerationContext = ReturnType<typeof buildEmailGenerationContext>

/**
 * Contexte minimal et sérialisable d'une génération. Déterministe : mêmes
 * entrées, même contexte. Les listes de vocabulaire (icônes, disclaimers,
 * types de slots) n'apparaissent que si une lame candidate en a besoin.
 */
export function buildEmailGenerationContext(
  brief: EmailBrief,
  { emailType, visuals }: EmailGenerationContextOptions = {}
) {
  const catalog = getEmailSectionCatalogForPrompt()
  const visualUrls = sendableVisuals(visuals)
  const reading: Reading = {
    text: `${brief.campaignName} ${brief.subject} ${brief.brief} ${brief.audience}`,
    emailType,
    visualCount: visualUrls.length,
  }

  const sections = catalog.sections.filter((section) => exclusionReason(section, reading) === null)
  const kinds = new Set(sections.flatMap((section) => section.slots.map((slot) => slot.split(": ")[1]!)))
  const needsDisclaimers = kinds.has("disclaimer")

  return {
    brief: {
      campaignName: brief.campaignName,
      subject: brief.subject,
      brief: brief.brief,
      audience: brief.audience,
      objective: emailObjectives.find((objective) => objective.value === brief.objective)!.label,
      ...(emailType ? { emailType } : {}),
    },
    rules: { structural: emailStructuralRules, editorial: emailEditorialGuidance },
    surfaces: {
      allowed: catalog.surfaces,
      neutral: catalog.neutralSurface,
      recommended: recommendedSurface(emailType, brief.audience),
    },
    slotKinds: Object.fromEntries(
      Object.entries(catalog.slotKinds).filter(([kind]) => kinds.has(kind))
    ),
    sections,
    links: selectDestinations(brief, reading).map((id) => {
      const destination = emailDestinations[id]
      return {
        id,
        label: destination.label,
        url: emailDestinationUrl(id),
        usage: destination.usage ?? filiereUsage,
      }
    }),
    ...(kinds.has("asset:visuel") ? { visuals: visualUrls } : {}),
    ...(kinds.has("asset:icone") ? { iconNames: catalog.iconNames } : {}),
    ...(needsDisclaimers ? { disclaimers: catalog.disclaimers } : {}),
  }
}

/** Raisons d'exclusion, pour le diagnostic et les tests (pas pour le prompt). */
export function explainEmailSectionSelection(
  brief: EmailBrief,
  { emailType, visuals }: EmailGenerationContextOptions = {}
) {
  const reading: Reading = {
    text: `${brief.campaignName} ${brief.subject} ${brief.brief} ${brief.audience}`,
    emailType,
    visualCount: sendableVisuals(visuals).length,
  }
  return Object.fromEntries(
    getEmailSectionCatalogForPrompt().sections.map((section) => [
      section.type,
      exclusionReason(section, reading) ?? "candidate",
    ])
  )
}
