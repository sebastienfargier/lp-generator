/**
 * Contexte compact pour une génération : requête structurée → sélection
 * déterministe de lames candidates et de destinations → objet JSON pour le
 * futur modèle.
 *
 * Il réduit l'espace de choix, il ne compose pas l'email : le modèle choisit
 * et ordonne les lames parmi les candidates. Une lame n'est candidate que si
 * la requête fournit les faits que ses slots exigent (code, compte à rebours,
 * valeur, témoignage, partenaire, visuels) : jamais de faits lus dans le
 * texte libre du brief. Tout est dérivé des sources internes — manifeste,
 * catalogue métier, surfaces, icônes, disclaimers, destinations.
 */
import {
  emailDestinations,
  emailDestinationUrl,
  type EmailDestinationId,
  filiereUsage,
} from "./destinations"
import type { EmailGenerationRequest, EmailType } from "./generation-request"
import {
  emailEditorialGuidance,
  emailStructuralRules,
  getEmailSectionCatalogForPrompt,
  type EmailPromptSection,
} from "./section-catalog"
import type { EmailSurface } from "./surfaces"

export { emailTypes, type EmailType } from "./generation-request"

/* -------------------------------------------------------------------------- */
/* Lecture de la requête                                                      */
/* -------------------------------------------------------------------------- */

function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

function mentions(text: string, keywords: readonly string[]) {
  const normalized = normalize(text)
  return keywords.some((keyword) => normalized.includes(normalize(keyword)))
}

/** Indices non factuels, lus dans le texte : intention, pas donnée. */
const empathyCues = ["demandeur", "sans emploi", "chomage", "recherche d'emploi"]
const diagnosticCues = ["quiz", "test", "diagnostic", "niveau", "bilan"]
const choiceCues = ["choix", "choisir", "options", "au choix"]

/** Faits disponibles, tous issus des champs structurés de la requête. */
type Available = {
  text: string
  emailType: EmailType | undefined
  visualCount: number
  code: boolean
  countdown: boolean
  figure: boolean
  offer: boolean
  testimonial: boolean
  partner: boolean
  disclaimer: boolean
}

function readRequest(request: EmailGenerationRequest): Available {
  const facts = request.facts ?? []
  return {
    text: `${request.campaignName} ${request.subject ?? ""} ${request.brief} ${request.audience}`,
    emailType: request.emailType,
    visualCount: request.visuals?.length ?? 0,
    code: Boolean(request.offer?.code),
    countdown: Boolean(request.offer?.countdown),
    figure: Boolean(request.offer?.value) || facts.length > 0,
    offer: Boolean(request.offer),
    testimonial: Boolean(request.testimonial),
    partner: Boolean(request.partner),
    disclaimer: Boolean(request.offer) || facts.some((fact) => fact.disclaimer),
  }
}

/* -------------------------------------------------------------------------- */
/* Sélection des lames                                                        */
/* -------------------------------------------------------------------------- */

const slotNames = (section: EmailPromptSection) =>
  section.slots.map((slot) => slot.replace("?", "").split(": ")[0] ?? "")

/**
 * Raison d'écarter une lame pour cette requête, ou `null` si elle est
 * candidate. Critères : données exigées par ses slots (manifeste), limites
 * du catalogue métier.
 */
function exclusionReason(section: EmailPromptSection, available: Available): string | null {
  const type = section.type
  const names = slotNames(section)
  const has = (test: (name: string) => boolean) => names.some(test)

  if (type === "email-module-legal-disclaimer") {
    return available.disclaimer ? null : "aucun fait ni offre n'appelle de disclaimer"
  }
  if (type === "email-module-icons-grid") return "contraste des icônes non résolu"

  const visualSlots = section.slots.filter((slot) => slot.endsWith(": asset:visuel")).length
  if (visualSlots > available.visualCount) {
    return `${visualSlots} visuel(s) HTTPS requis, ${available.visualCount} fourni(s)`
  }
  if (has((name) => name.startsWith("temoignage")) && !available.testimonial) return "témoignage validé requis"
  if (has((name) => /^produit-\d+-titre$/.test(name))) return "intitulés de formation exacts requis"
  if (has((name) => name === "partenaire") && !available.partner) return "partenaire requis"
  if (has((name) => name.startsWith("code-promo")) && !available.code) return "code promo requis"
  if (has((name) => name.startsWith("compteur")) && !available.countdown) return "compte à rebours requis"
  if (has((name) => name === "valeur-cle") && !available.figure) return "valeur ou fait validé requis"
  if (section.onlySurfaces && !available.offer) return "détail d'une offre requis"

  if (section.family === "Divider" && !mentions(available.text, choiceCues)) return "aucun choix entre deux options"
  const promo = available.emailType === "promo"
  // Catalogue : le header newsletter s'évite quand la campagne a un libellé.
  if (type === "email-module-header-newsletter" && promo) return "promo : header de campagne"
  const diagnostic = mentions(available.text, diagnosticCues)
  if (type === "email-module-diagnostic-progress-list" && !diagnostic) return "aucun quiz ou diagnostic"
  if (type === "email-module-hero-diagnostic-quiz" && promo && !diagnostic) return "promo sans quiz ni diagnostic"
  return null
}

/* -------------------------------------------------------------------------- */
/* Sélection des destinations                                                 */
/* -------------------------------------------------------------------------- */

/** Liens du footer (libellés du template) : toujours proposés. */
const footerDestinations: EmailDestinationId[] = ["catalogue-formations", "alternance", "trajectoire-magazine"]

const objectiveDestinations: Record<EmailGenerationRequest["objective"], EmailDestinationId[]> = {
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

function selectDestinations(request: EmailGenerationRequest, available: Available): EmailDestinationId[] {
  const ids: EmailDestinationId[] = [...footerDestinations, ...objectiveDestinations[request.objective]]
  if (mentions(available.text, ["financ", "cpf"]) || mentions(request.audience, empathyCues)) ids.push("financement")
  if (mentions(available.text, ["cpf"])) ids.push("cpf-formations-eligibles")
  if (allowsBlog(available.emailType)) {
    ids.push(mentions(available.text, ["reconversion"]) ? "blog-reconversion-professionnelle" : "blog-les-temoignages")
  }
  ids.push(...citedFilieres(`${request.brief} ${request.audience}`))
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
 * Contexte minimal et sérialisable d'une génération, sans les données de la
 * requête (transmises à part par le prompt). Déterministe : même requête,
 * même contexte. Icônes, disclaimers et types de slots n'apparaissent que si
 * une lame candidate les utilise.
 */
export function buildEmailGenerationContext(request: EmailGenerationRequest) {
  const catalog = getEmailSectionCatalogForPrompt()
  const available = readRequest(request)

  const sections = catalog.sections.filter((section) => exclusionReason(section, available) === null)
  const kinds = new Set(sections.flatMap((section) => section.slots.map((slot) => slot.split(": ")[1]!)))

  return {
    rules: { structural: emailStructuralRules, editorial: emailEditorialGuidance },
    surfaces: {
      allowed: catalog.surfaces,
      neutral: catalog.neutralSurface,
      recommended: recommendedSurface(request.emailType, request.audience),
    },
    slotKinds: Object.fromEntries(Object.entries(catalog.slotKinds).filter(([kind]) => kinds.has(kind))),
    sections,
    links: selectDestinations(request, available).map((id) => {
      const destination = emailDestinations[id]
      return { id, label: destination.label, url: emailDestinationUrl(id), usage: destination.usage ?? filiereUsage }
    }),
    ...(kinds.has("asset:icone") ? { iconNames: catalog.iconNames } : {}),
    ...(kinds.has("disclaimer") ? { disclaimers: catalog.disclaimers } : {}),
  }
}

/** Raisons d'exclusion, pour le diagnostic et les tests (pas pour le prompt). */
export function explainEmailSectionSelection(request: EmailGenerationRequest) {
  const available = readRequest(request)
  return Object.fromEntries(
    getEmailSectionCatalogForPrompt().sections.map((section) => [
      section.type,
      exclusionReason(section, available) ?? "candidate",
    ])
  )
}
