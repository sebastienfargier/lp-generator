/**
 * Recommandations : tout ce que le système SAIT de l'email sans l'IMPOSER. Le
 * Builder conseille, l'utilisateur décide : rien ici ne refuse une opération,
 * ne modifie le document ou ne bloque un export du Builder.
 *
 * Sources, toutes réutilisées du domaine Email (aucune règle recopiée) :
 * - terminologie de marque (`lintEmailRecipeContent`), rangée par la politique
 *   existante ;
 * - conformité à la recette d'origine (`validateEmailRecipeConfig`,
 *   `validatePromotionConfig`) : séquence, densité, copie, valeurs de
 *   référence. Les écarts aux FAITS (valeur, code, date, légal, périmètre,
 *   destination, claims) montent en « alert » : ce sont les seuls cas où le
 *   système prévient que l'email dit autre chose que sa source de vérité ;
 * - les règles de produit du contrat EmailConfig que le Builder n'impose pas
 *   (footer unique en dernier, mentions légales avant lui, zones colorées non
 *   consécutives) : l'email reste techniquement valide sans elles ;
 * - les liens que l'export refuserait ;
 * - l'âge du registre de lames du document.
 *
 * Niveaux : `alert` (l'email s'écarte d'une valeur de référence ou d'une
 * règle approuvée), `warning` (à relire), `info` (conseil).
 *
 * Fonction pure : ne modifie rien, ne lève jamais.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { exportLinkHosts } from "../email/export-html"
import { validatePromotionConfig } from "../email/promotion-resolver"
import { classifyEmailRecipeDiagnostics, describeEmailRecipeConfig, lintEmailRecipeContent, lintEmailTexts, validateEmailRecipeConfig } from "../email/recipe-validation"
import { emailConfigPolicyIssues, type EmailConfigPolicyRule } from "../email/schemas"
import { emailHrefPlaceholders } from "../email/system"
import type { EmailBlock } from "../email/types"
import { currentEmailRegistry, type EmailDocument } from "./document"
import { isGeneratedBlock, officialConfigOf } from "./generated-block"

export type RecommendationLevel = "info" | "warning" | "alert"

export type DocumentRecommendation = {
  code: string
  level: RecommendationLevel
  message: string
  /** La lame (et le chemin) concernés, quand on peut les désigner. */
  target?: { blockId?: string; path?: string }
}

const levelOrder: Record<RecommendationLevel, number> = { alert: 0, warning: 1, info: 2 }

/** Codes d'écart aux valeurs de référence d'une promotion, d'une preuve ou d'une mention. */
const promotionFactCodes = new Set(["offer-value", "promo-code", "deadline", "legal", "scope", "destination"])
const recipeFactCodes = new Set(["claims", "figure", "disclaimer"])

/**
 * Règles de produit → conseil. Un email sans footer n'a plus de lien de
 * désabonnement ni de préférences : c'est une alerte forte. Deux zones colorées
 * à la suite sont un choix visuel : un simple conseil.
 */
const policyRecommendation: Record<EmailConfigPolicyRule, { level: RecommendationLevel; consequence?: string }> = {
  "footer-missing": { level: "alert", consequence: " Sans footer, l'email n'a plus de lien de désabonnement ni de lien de préférences." },
  "footer-duplicate": { level: "warning" },
  "footer-not-last": { level: "warning" },
  "disclaimer-duplicate": { level: "info" },
  "disclaimer-not-before-footer": { level: "warning" },
  "consecutive-colored": { level: "info" },
}

const blockOfPath = (document: EmailDocument, path: string): string | undefined => {
  const ids = new Set(document.config.blocks.map((block) => block.id))
  const candidate = /^blocks\.([^.]+)/.exec(path)?.[1] ?? path
  return ids.has(candidate) ? candidate : undefined
}

const target = (document: EmailDocument, path: string): DocumentRecommendation["target"] => {
  const blockId = blockOfPath(document, path)
  return { path, ...(blockId ? { blockId } : {}) }
}

type RawSlots = Record<string, Record<string, unknown>>

/** Conseils sur le document ; triés par niveau puis dans l'ordre de découverte. */
export function getDocumentRecommendations(document: EmailDocument): DocumentRecommendation[] {
  const found: DocumentRecommendation[] = []
  const { config, facts, provenance } = document
  // Les validateurs de recette, de promotion et de claims sont ceux du contrat officiel : ils lisent les lames du manifeste. Les règles de produit
  // (footer, zones colorées) et la terminologie lisent TOUTES les lames, générées comprises.
  const official = officialConfigOf(config)

  // 1. Terminologie de marque : aucune règle ne bloque ici, même approuvée.
  const generatedTexts = config.blocks.filter(isGeneratedBlock).flatMap((block) =>
    Object.entries(block.slots).flatMap(([slot, value]) => {
      const path = `blocks.${block.id}.slots.${slot}`
      return "text" in value ? [{ path, text: value.text }] : "label" in value ? [{ path: `${path}.label`, text: value.label }] : []
    })
  )
  const policy = classifyEmailRecipeDiagnostics([...lintEmailRecipeContent(official), ...lintEmailTexts(generatedTexts)])
  const brand = (level: RecommendationLevel) => (diagnostic: (typeof policy)["advisory"][number]) =>
    found.push({
      code: `brand-${diagnostic.ruleId}`,
      level,
      message: `${diagnostic.label} (« ${diagnostic.match} »)${diagnostic.alternative ? ` — plutôt : ${diagnostic.alternative}` : ""}`,
      target: target(document, diagnostic.path),
    })
  policy.blocking.forEach(brand("alert"))
  policy.humanReview.forEach(brand("warning"))
  policy.advisory.forEach(brand("info"))

  // 2. Règles de produit du contrat EmailConfig : jamais un refus dans le Builder.
  for (const issue of emailConfigPolicyIssues(config)) {
    const { level, consequence = "" } = policyRecommendation[issue.rule]
    // Le contrat désigne une lame par sa position ; le Builder, par son identifiant.
    const blockId = typeof issue.path[1] === "number" ? config.blocks[issue.path[1]]?.id : undefined
    found.push({ code: `layout-${issue.rule}`, level, message: `${issue.message}${consequence}`, target: blockId ? { blockId, path: `blocks.${blockId}.${issue.path.slice(2).join(".")}` } : { path: issue.path.join(".") } })
  }

  // 3. Conformité à la recette d'origine : des conseils, jamais des refus.
  if (provenance.recipe === "promotion" && facts.promotion) {
    for (const issue of validatePromotionConfig(official, { campaignName: config.name, subject: config.subject, promotion: facts.promotion })) {
      const level: RecommendationLevel = promotionFactCodes.has(issue.code) ? "alert" : issue.code.startsWith("copy-") ? "warning" : "info"
      found.push({ code: `promotion-${issue.code}`, level, message: issue.message, target: target(document, issue.path) })
    }
  } else if (provenance.recipe && provenance.recipe !== "promotion") {
    for (const issue of validateEmailRecipeConfig(provenance.recipe, official)) {
      found.push({ code: `recipe-${issue.code}`, level: recipeFactCodes.has(issue.code) ? "alert" : "info", message: issue.message, target: target(document, issue.path) })
    }
  }

  // 4. Claims : ce que l'email affirme face aux claims de référence du document.
  if (facts.claimIds) {
    const present = describeEmailRecipeConfig(official).claimIds as string[]
    for (const id of present.filter((claim) => !facts.claimIds!.includes(claim))) {
      found.push({ code: "claim-not-in-facts", level: "warning", message: `La claim « ${id} » figure dans l'email mais pas dans les faits de référence du document.`, target: { path: "facts.claimIds" } })
    }
    for (const id of facts.claimIds.filter((claim) => !present.includes(claim))) {
      found.push({ code: "claim-absent", level: "info", message: `La claim de référence « ${id} » n'apparaît plus dans l'email.`, target: { path: "facts.claimIds" } })
    }
  }

  // 5. Liens : ce que l'export refuserait ou laisserait à confirmer.
  for (const block of official.blocks as EmailBlock[]) {
    for (const [name, slot] of Object.entries((block as unknown as { slots: RawSlots }).slots)) {
      const href = slot.href
      if (typeof href !== "string") continue
      const path = `blocks.${block.id}.slots.${name}`
      if (href === emailHrefPlaceholders.urlToConfirm) {
        found.push({ code: "link-to-confirm", level: "warning", message: "Ce lien est encore « à confirmer » : l'export HTML le refusera.", target: { blockId: block.id, path } })
      } else if (href.startsWith("https://") && !(exportLinkHosts as readonly string[]).includes(new URL(href).hostname)) {
        found.push({ code: "link-host", level: "warning", message: `L'hôte « ${new URL(href).hostname} » n'est pas dans la liste des destinations exportables : l'export HTML refusera ce lien.`, target: { blockId: block.id, path } })
      }
    }
  }

  // 6. Registre de lames plus ancien que le code courant.
  if (document.registry.manifestVersion !== currentEmailRegistry().manifestVersion) {
    found.push({ code: "registry-outdated", level: "info", message: `Document écrit avec le registre ${document.registry.manifestVersion} ; le registre courant est ${currentEmailRegistry().manifestVersion}.`, target: { path: "registry" } })
  }

  return found.map((entry, order) => ({ entry, order })).sort((a, b) => levelOrder[a.entry.level] - levelOrder[b.entry.level] || a.order - b.order).map(({ entry }) => entry)
}
