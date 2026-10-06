/**
 * Resolver et validation de R4 (promotion), hors ligne : un Draft validé et les
 * Promotion Facts → un EmailConfig existant, puis sa vérification. ADDITIF : les
 * resolvers R1, R2 et R3 (`recipe-resolver.ts`) ne sont ni modifiés ni appelés
 * pour cette recette.
 *
 * Principe : Claude écrit, la CAMPAIGN décide. Le resolver pose lui-même,
 * depuis les Promotion Facts et jamais depuis le Draft :
 * - la valeur de l'offre (« -20 %* », « -500 €* ») ;
 * - le code, à l'identique, ou aucune lame qui le porte ;
 * - la date de fin (étiquette de l'en-tête de campagne, et mention légale) ;
 * - le périmètre (phrase « Offre valable sur … » ajoutée à l'accroche) ;
 * - la destination de tous les boutons, et le lien secondaire fixe ;
 * - la mention légale : celle du catalogue (`offre-promotionnelle`), avec la
 *   date de fin ; jamais un texte de Claude ;
 * - la composition (lames), l'image (banque, déterministe), le shell.
 *
 * Trois compositions déterministes, choisies par les faits (code présent ou non)
 * et par le nom de campagne, jamais par Claude :
 * - `offer-hero` (avec code) : le hero d'offre de la référence : photo, panneau
 *   sombre, grande valeur, code, bouton et lien ; appuis ; clôture ;
 * - `code-banner` (avec code) : bandeau d'offre sombre sans photo, appuis,
 *   clôture illustrée ;
 * - `banner` (sans code) : grand bandeau sombre, valeur, accroche et périmètre ;
 *   appuis ; clôture illustrée.
 * Toutes : header de campagne (date de fin) → offre → appuis → clôture →
 * mention légale → footer. Une seule zone colorée forte : l'offre.
 *
 * Aucune correction automatique : une violation est une erreur de validation.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailDestinations, emailDestinationUrl } from "./destinations"
import {
  emailBank,
  emailBankImageIdFromSrc,
  emailImagesForIntent,
  isEmailVisualIntent,
  pickEmailBankImage,
  resolveEmailBankImage,
  type EmailBankImageId,
} from "./image-bank"
import { lintPromotionCopy, type PromotionCopyField } from "./promotion-copy"
import { promotionVisualIntents, safeParsePromotionDraft, type PromotionDraft } from "./promotion-draft"
import {
  promotionDeadlineLabel,
  promotionScopeSentence,
  promotionSecondaryLink,
  promotionValueSlot,
  type EmailPromotionRequest,
  type PromotionFacts,
} from "./promotion-facts"
import { classifyEmailRecipeDiagnostics, emailRecipeTexts, lintEmailRecipeContent, type EmailRecipeDiagnostic, type EmailRecipeIssue } from "./recipe-validation"
import { footerDestinations, stableIndex } from "./recipe-resolver"
import { safeParseEmailConfig } from "./schemas"
import type { EmailBlock, EmailBlockType, EmailConfig } from "./types"

/* -------------------------------------------------------------------------- */
/* Compositions                                                               */
/* -------------------------------------------------------------------------- */

export const promotionVariants = ["offer-hero", "code-banner", "banner"] as const
export type PromotionVariant = (typeof promotionVariants)[number]

const seasonalHeader = "email-module-header-seasonal-campaign" as const
const legalLame = "email-module-legal-disclaimer" as const
const footerLame = "email-module-footer-compact-legal" as const

/** Lame d'offre de chaque composition. */
export const promotionOfferLames = {
  "offer-hero": "email-module-hero-offer-image-top",
  "code-banner": "email-module-discount-banner-full",
  banner: "email-module-banner-full",
} as const satisfies Record<PromotionVariant, EmailBlockType>

const supportLame = "email-module-icons-list" as const satisfies EmailBlockType
const closingLames = {
  "offer-hero": "email-module-text-and-cta-variant-01",
  "code-banner": "email-module-text-and-cta-variant-02",
  banner: "email-module-text-and-cta-variant-02",
} as const satisfies Record<PromotionVariant, EmailBlockType>

/** Séquence complète de lames d'une composition. */
export const promotionSequences = Object.fromEntries(
  promotionVariants.map((variant) => [variant, [seasonalHeader, promotionOfferLames[variant], supportLame, closingLames[variant], legalLame, footerLame]])
) as unknown as Record<PromotionVariant, readonly EmailBlockType[]>

/** Composition d'après les faits : sans code, le bandeau ; avec code, l'un des deux hero d'offre, stable pour un nom de campagne. */
export function promotionVariantFor(facts: Pick<PromotionFacts, "code">, campaignName: string): PromotionVariant {
  if (!facts.code) return "banner"
  return stableIndex(`${campaignName}|promotion-variant`, 2) === 0 ? "offer-hero" : "code-banner"
}

/** Destinations du lien secondaire et du footer : celles du système. */
export const promotionAllowedDestinations = (facts: Pick<PromotionFacts, "destination">) => new Set<string>([emailDestinationUrl(facts.destination), emailDestinationUrl(promotionSecondaryLink.destination)])

/* -------------------------------------------------------------------------- */
/* Composition → EmailConfig                                                  */
/* -------------------------------------------------------------------------- */

const asBlock = (block: unknown) => block as EmailBlock
const text = (value: string) => ({ text: value })
const link = (label: string, destination: Parameters<typeof emailDestinationUrl>[0]) => ({ label, href: emailDestinationUrl(destination) })

/** Texte d'accroche d'un panneau d'offre : le texte de Claude, puis la phrase de périmètre ajoutée par le système. */
const withScope = (copy: string, facts: PromotionFacts) => `${copy.trim()} ${promotionScopeSentence(facts)}`

function offerBlock(variant: PromotionVariant, draft: PromotionDraft, facts: PromotionFacts, imageId: EmailBankImageId | undefined): EmailBlock {
  const common = {
    "sous-titre": text(draft.offer.eyebrow),
    "valeur-cle": text(promotionValueSlot(facts)),
    "cta-1": link(draft.offer.ctaLabel, facts.destination),
  }
  switch (variant) {
    case "offer-hero":
      return asBlock({
        id: "offer",
        type: promotionOfferLames[variant],
        slots: {
          "image-1": resolveEmailBankImage(imageId!, promotionOfferLames[variant]),
          ...common,
          "texte-descriptif": text(withScope(draft.offer.text, facts)),
          "code-promo-1": text(facts.code!),
          "lien-1": link(promotionSecondaryLink.label, promotionSecondaryLink.destination),
        },
      })
    case "code-banner":
      return asBlock({
        id: "offer",
        type: promotionOfferLames[variant],
        slots: { ...common, "texte-descriptif": text(withScope(draft.offer.text, facts)), "code-promo-1": text(facts.code!), "lien-1": link(promotionSecondaryLink.label, promotionSecondaryLink.destination) },
      })
    case "banner":
      return asBlock({
        id: "offer",
        type: promotionOfferLames[variant],
        slots: { ...common, "texte-descriptif-1": text(draft.offer.text), "texte-descriptif-2": text(promotionScopeSentence(facts)) },
      })
  }
}

export type PromotionResolution =
  | { status: "resolved"; config: EmailConfig; variant: PromotionVariant; diagnostics: EmailRecipeDiagnostic[]; policy: ReturnType<typeof classifyEmailRecipeDiagnostics> }
  | { status: "invalid-composition" | "invalid-config" | "invalid-recipe"; issues: EmailRecipeIssue[] }

function toId(campaignName: string) {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return /^[a-z]/.test(slug) ? slug : `email-${slug || "email"}`
}

/**
 * Draft validé + requête → EmailConfig validé. Chaque étape produit des
 * diagnostics plutôt qu'un contenu de remplacement ; rien n'est deviné. Les
 * valeurs commerciales ne viennent QUE de `request.promotion`.
 */
export function composePromotion(request: EmailPromotionRequest, draft: PromotionDraft): PromotionResolution {
  const { promotion: facts } = request
  const variant = promotionVariantFor(facts, request.campaignName)
  const issues: EmailRecipeIssue[] = []

  const intent = draft.visualIntent
  if (!isEmailVisualIntent(intent) || !(promotionVisualIntents as readonly string[]).includes(intent)) {
    return { status: "invalid-composition", issues: [{ code: "image", path: "visualIntent", message: `Intention visuelle « ${intent} » non autorisée pour la promotion.` }] }
  }

  let heroImage: EmailBankImageId | undefined
  if (variant === "offer-hero") {
    if (emailImagesForIntent(intent, promotionOfferLames[variant]).length === 0) issues.push({ code: "image", path: "visualIntent", message: `Aucune image « ${intent} » pour le hero d'offre.` })
    else heroImage = pickEmailBankImage(intent, promotionOfferLames[variant], `${request.campaignName}|offer`)
  }
  let closingImage: EmailBankImageId | undefined
  if (closingLames[variant] === "email-module-text-and-cta-variant-02") {
    const candidates = emailImagesForIntent(intent, closingLames[variant])
    if (candidates.length === 0) issues.push({ code: "image", path: "visualIntent", message: `Aucune image « ${intent} » pour la clôture illustrée.` })
    else closingImage = candidates[stableIndex(`${request.campaignName}|closing`, candidates.length)]
  }
  if (issues.length > 0) return { status: "invalid-composition", issues }

  const support = asBlock({
    id: "support",
    type: supportLame,
    slots: {
      "titre-section": text(draft.support.title),
      ...Object.fromEntries(
        draft.support.items.flatMap((item, index) => [
          [`icone-${index + 1}`, { icon: item.icon }],
          [`item-${index + 1}-titre`, text(item.title)],
          [`texte-descriptif-${index + 1}`, text(item.text)],
        ])
      ),
    },
  })
  const closingType = closingLames[variant]
  const closing = asBlock({
    id: "closing",
    type: closingType,
    slots: {
      "titre-section": text(draft.closing.title),
      ...(closingImage ? { "image-1": resolveEmailBankImage(closingImage, closingType) } : {}),
      "texte-descriptif": text(draft.closing.text),
      "cta-1": link(draft.closing.ctaLabel, facts.destination),
    },
  })

  const [firstFooter, secondFooter, thirdFooter] = footerDestinations
  const parsed = safeParseEmailConfig({
    version: 1,
    id: toId(request.campaignName),
    name: request.campaignName,
    subject: request.subject ?? draft.subject,
    preheader: draft.preheader,
    blocks: [
      asBlock({ id: "header", type: seasonalHeader, slots: { label: text(promotionDeadlineLabel(facts)) } }),
      offerBlock(variant, draft, facts, heroImage),
      support,
      closing,
      asBlock({ id: "mentions-legales", type: legalLame, slots: { "disclaimer-1": { disclaimer: "offre-promotionnelle", endDate: facts.endDate } } }),
      asBlock({
        id: "footer",
        type: footerLame,
        slots: {
          "lien-1": link(emailDestinations[firstFooter].label, firstFooter),
          "lien-2": link(emailDestinations[secondFooter].label, secondFooter),
          "lien-3": link(emailDestinations[thirdFooter].label, thirdFooter),
        },
      }),
    ],
  })
  if (!parsed.success) {
    return { status: "invalid-config", issues: parsed.error.issues.map((entry) => ({ code: "config", path: entry.path.join(".") || "config", message: entry.message })) }
  }
  const violations = validatePromotionConfig(parsed.data, request)
  if (violations.length > 0) return { status: "invalid-recipe", issues: violations }
  const diagnostics = lintEmailRecipeContent(parsed.data)
  return { status: "resolved", config: parsed.data, variant, diagnostics, policy: classifyEmailRecipeDiagnostics(diagnostics) }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

type RawBlock = { id: string; type: EmailBlockType; slots: Record<string, Record<string, string>> }
const raw = (block: EmailBlock) => block as unknown as RawBlock

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length
/** Longueur du texte de contenu, en mots : une promotion est brève. */
export const promotionDensity = { min: 60, max: 240 } as const

/**
 * Vérifie un EmailConfig R4 contre les Promotion Facts : les valeurs critiques
 * (valeur, code, date, destination, mention légale) sont comparées à celles que
 * le système aurait posées ; la copie de Claude passe le lint de promotion.
 * Ne corrige rien, ne lève jamais.
 */
export function validatePromotionConfig(config: EmailConfig, request: Pick<EmailPromotionRequest, "campaignName" | "subject" | "promotion">): EmailRecipeIssue[] {
  const { promotion: facts } = request
  const issues: EmailRecipeIssue[] = []
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message })
  const blocks = config.blocks.map(raw)
  const variant = promotionVariantFor(facts, request.campaignName)

  /* Séquence de lames */
  const sequence = blocks.map((block) => block.type)
  if (JSON.stringify(sequence) !== JSON.stringify(promotionSequences[variant])) issue("sequence", "blocks", `Séquence de lames inattendue pour la composition « ${variant} » : ${sequence.join(" → ")}.`)

  const header = blocks.find((block) => block.type === seasonalHeader)
  const offer = blocks.find((block) => block.id === "offer")
  const legal = blocks.find((block) => block.type === legalLame)
  const dest = emailDestinationUrl(facts.destination)

  /* Date : étiquette de l'en-tête et mention légale */
  if (header?.slots.label?.text !== promotionDeadlineLabel(facts)) issue("deadline", "blocks.header.slots.label", "L'étiquette de date de fin n'est pas celle des Promotion Facts.")
  const legalSlots = legal ? Object.entries(legal.slots) : []
  if (!legal || legalSlots.length !== 1 || JSON.stringify(legal.slots["disclaimer-1"]) !== JSON.stringify({ disclaimer: "offre-promotionnelle", endDate: facts.endDate })) {
    issue("legal", "blocks.mentions-legales", "La mention légale est exactement celle du catalogue « offre-promotionnelle », avec la date de fin des Promotion Facts.")
  }

  /* Valeur, code, périmètre */
  const offerSlots = offer?.slots ?? {}
  if (offerSlots["valeur-cle"]?.text !== promotionValueSlot(facts)) issue("offer-value", "blocks.offer.slots.valeur-cle", "La valeur de l'offre n'est pas celle des Promotion Facts.")
  const codeSlots = blocks.flatMap((block) => Object.entries(block.slots).filter(([name]) => name === "code-promo-1").map(([, value]) => ({ block: block.id, value: value.text })))
  if (facts.code) {
    if (codeSlots.length !== 1 || codeSlots[0]!.block !== "offer" || codeSlots[0]!.value !== facts.code) issue("promo-code", "blocks.offer.slots.code-promo-1", "Le code n'est pas celui des Promotion Facts, à l'identique.")
  } else if (codeSlots.length > 0) {
    issue("promo-code", "blocks", "Aucun code dans les Promotion Facts : aucun slot de code.")
  }
  const sentence = promotionScopeSentence(facts)
  const scopeSlot = variant === "banner" ? offerSlots["texte-descriptif-2"]?.text : offerSlots["texte-descriptif"]?.text
  const scopeOk = variant === "banner" ? scopeSlot === sentence : scopeSlot?.endsWith(` ${sentence}`)
  if (!scopeOk) issue("scope", "blocks.offer", "La phrase de périmètre n'est pas celle des Promotion Facts.")

  /* Boutons et liens : destination contrôlée */
  const secondary = emailDestinationUrl(promotionSecondaryLink.destination)
  for (const block of blocks.filter((candidate) => candidate.type !== footerLame)) {
    for (const [name, value] of Object.entries(block.slots)) {
      if (!("href" in value)) continue
      const path = `blocks.${block.id}.slots.${name}`
      if (name.startsWith("cta-")) {
        if (value.href !== dest) issue("destination", path, "Un bouton mène à la destination des Promotion Facts, et à elle seule.")
      } else if (name === "lien-1" && block.id === "offer") {
        if (value.href !== secondary || value.label !== promotionSecondaryLink.label) issue("destination", path, "Le lien secondaire est celui du système.")
      } else {
        issue("destination", path, "Lien non prévu par la promotion.")
      }
    }
  }

  /* Images : banque, intention de la promotion, alt contrôlé, sans doublon */
  const seen = new Set<string>()
  for (const block of blocks) {
    for (const [name, value] of Object.entries(block.slots)) {
      if (!("src" in value)) continue
      const path = `blocks.${block.id}.slots.${name}`
      const id = emailBankImageIdFromSrc(value.src!)
      if (!id) {
        issue("image", path, "Image hors de la banque contrôlée.")
        continue
      }
      if (!(promotionVisualIntents as readonly string[]).includes(emailBank[id].intent)) issue("image", path, `Intention visuelle « ${emailBank[id].intent} » non autorisée pour la promotion.`)
      if (value.alt !== emailBank[id].alt) issue("image", path, "L'alt n'est pas celui du catalogue.")
      if (seen.has(id)) issue("image", path, `L'image « ${id} » apparaît deux fois.`)
      seen.add(id)
    }
  }

  /* Zone colorée : l'offre, seule lame sombre de la séquence (la séquence est vérifiée plus haut) */
  if (!offer) issue("sections", "blocks", "Bloc d'offre absent.")

  /* Copie de Claude : tout le texte, sauf ce que le système a posé */
  const claudeTexts: { path: string; text: string; field: PromotionCopyField }[] = [
    { path: "subject", text: config.subject, field: "subject" },
    { path: "preheader", text: config.preheader, field: "preheader" },
  ]
  const systemSlots = new Set(["header.label", "offer.valeur-cle", "offer.code-promo-1", "offer.lien-1", "offer.texte-descriptif-2"])
  for (const block of config.blocks) {
    if (block.type === footerLame || block.type === legalLame || block.type === seasonalHeader) continue
    for (const entry of emailRecipeTexts(block)) {
      const key = `${block.id}.${entry.name}`
      if (systemSlots.has(key)) continue
      // Accroche des hero d'offre : le périmètre du système termine le texte de Claude.
      const copy = block.id === "offer" && entry.name === "texte-descriptif" && variant !== "banner" ? entry.text.replace(new RegExp(` ${sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : entry.text
      claudeTexts.push({ path: entry.path, text: copy, field: "body" })
    }
  }
  for (const entry of claudeTexts) {
    for (const found of lintPromotionCopy(entry.text, entry.field, facts)) issue(`copy-${found.rule}`, entry.path, `${found.message} (« ${found.match} »)`)
  }

  /* Longueur */
  const words = config.blocks.filter((block) => block.type !== footerLame && block.type !== legalLame && block.type !== seasonalHeader).flatMap(emailRecipeTexts).reduce((sum, entry) => sum + wordCount(entry.text), 0)
  if (words < promotionDensity.min || words > promotionDensity.max) issue("density", "blocks", `${words} mots : ${promotionDensity.min} à ${promotionDensity.max} attendus.`)
  return issues
}

/* -------------------------------------------------------------------------- */
/* Pipeline hors ligne                                                        */
/* -------------------------------------------------------------------------- */

export type PromotionDraftResolution = Extract<PromotionResolution, { status: "resolved" }> | { status: "invalid-draft"; issues: { path: string; message: string }[] } | Exclude<PromotionResolution, { status: "resolved" }>

/**
 * Draft inconnu → validation du Draft → composition → EmailConfig (schéma,
 * valeurs contrôlées, copie, terminologie). Aucun appel de modèle, aucune
 * correction, aucune relance : un Draft qui ne passe pas est une erreur.
 */
export function resolvePromotionDraft(request: EmailPromotionRequest, input: unknown): PromotionDraftResolution {
  const draft = safeParsePromotionDraft(input)
  if (!draft.success) return { status: "invalid-draft", issues: draft.error.issues.map((issue) => ({ path: issue.path.join(".") || "draft", message: issue.message })) }
  return composePromotion(request, draft.data)
}
