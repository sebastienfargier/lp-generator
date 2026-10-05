/**
 * Vérification d'un EmailConfig contre une recette (`recipes.ts`), et
 * diagnostic de terminologie. Aucune réécriture : on constate, on ne corrige
 * jamais.
 *
 * - `validateEmailRecipeConfig` : séquence de lames, rôles, nombre de
 *   sections, budget de boutons, destinations, images, zone colorée, claims,
 *   chiffres, mentions légales, longueur. Une violation est une erreur de
 *   recette ; `schemas.ts` reste l'autorité sur la structure de l'EmailConfig.
 * - `lintEmailRecipeContent` : `lintBrandText` sur tous les textes de
 *   l'email. Le résultat est un DIAGNOSTIC structuré, jamais un blocage ni une
 *   correction : les règles viennent de documents en revue ou en brouillon.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { approvedClaims, type BrandClaim } from "../brand/claims"
import { lintBrandText } from "../brand/terminology"
import type { BrandStatus } from "../brand/types"
import { emailDestinationUrl, type EmailDestinationId } from "./destinations"
import { emailDisclaimers } from "./disclaimers"
import { emailBankImageIdFromSrc, emailBank, resolveEmailPortraitStrip } from "./image-bank"
import { emailBlockManifest } from "./manifest"
import {
  emailIntrinsicDarkLames,
  emailRecipeHeroLames,
  emailRecipeLames,
  emailRecipePreheaderLame,
  emailRecipeSectionLames,
  emailRecipeSectionRoles,
  emailRecipes,
  type EmailRecipe,
  type EmailRecipeId,
  type EmailRecipeRole,
} from "./recipes"
import type { EmailBlock, EmailBlockType, EmailConfig } from "./types"

export type EmailRecipeIssue = { code: string; path: string; message: string }

/* -------------------------------------------------------------------------- */
/* Lecture d'un EmailConfig                                                   */
/* -------------------------------------------------------------------------- */

type RawBlock = { id: string; type: EmailBlockType; surface?: string; slots: Record<string, unknown> }

const raw = (block: EmailBlock) => block as unknown as RawBlock

/** Valeurs de slots d'un type donné (`texte`, `cta`, `lien`, `asset:visuel`), avec leur chemin. */
function slotsOfKind(block: EmailBlock, kinds: readonly string[]) {
  const manifest = emailBlockManifest[block.type].slots as Readonly<Record<string, string>>
  return Object.entries(raw(block).slots)
    .filter(([name]) => kinds.includes(manifest[name]!))
    .map(([name, value]) => ({ name, path: `blocks.${block.id}.slots.${name}`, value: value as Record<string, string> }))
}

const buttons = (block: EmailBlock) => slotsOfKind(block, ["cta", "cta:fleche"])
const links = (block: EmailBlock) => slotsOfKind(block, ["lien"])
const images = (block: EmailBlock) => slotsOfKind(block, ["asset:visuel"])

/** Textes éditoriaux d'une lame (texte, libellés de bouton et de lien), avec leur chemin. */
export function emailRecipeTexts(block: EmailBlock) {
  return [
    ...slotsOfKind(block, ["texte"]).map((slot) => ({ path: slot.path, name: slot.name, text: slot.value.text! })),
    ...[...buttons(block), ...links(block)].map((slot) => ({ path: `${slot.path}.label`, name: slot.name, text: slot.value.label! })),
  ]
}

const isShell = (type: EmailBlockType) =>
  type === emailRecipePreheaderLame ||
  type === "email-module-header-newsletter" ||
  type === "email-module-header-seasonal-campaign" ||
  type === "email-module-legal-disclaimer" ||
  type === "email-module-footer-compact-legal"

const isColored = (block: EmailBlock) => {
  const surface = raw(block).surface
  return (surface !== undefined && surface !== "page") || (emailIntrinsicDarkLames as readonly string[]).includes(block.type)
}

const isStrong = (block: EmailBlock) => {
  const surface = raw(block).surface
  return (surface !== undefined && surface !== "page" && surface !== "bloc") || (emailIntrinsicDarkLames as readonly string[]).includes(block.type)
}

/* -------------------------------------------------------------------------- */
/* Claims                                                                     */
/* -------------------------------------------------------------------------- */

/** Formulations exactes (la claim entière) qu'un texte contient, par claim. */
function claimsIn(texts: readonly string[]): BrandClaim[] {
  return approvedClaims.filter((claim) => texts.some((text) => text.includes(claim.statement)))
}

/** Textes d'un bloc de preuve en bandeau : la valeur et le libellé forment ensemble la formulation exacte. */
function highlightText(block: EmailBlock) {
  if (block.type !== "email-module-benefits-compact-highlights") return undefined
  const slots = raw(block).slots as Record<string, { text: string }>
  return `${slots["valeur-cle"]!.text} ${slots["label"]!.text}`
}

/** Tous les textes de contenu (hors shell), le bandeau de preuve étant lu comme une seule formulation. */
function contentTexts(blocks: readonly EmailBlock[]) {
  return blocks.flatMap((block) => {
    const joined = highlightText(block)
    return joined ? [{ path: `blocks.${block.id}`, text: joined }] : emailRecipeTexts(block).map(({ path, text }) => ({ path, text }))
  })
}

/* -------------------------------------------------------------------------- */
/* Description                                                                */
/* -------------------------------------------------------------------------- */

export type EmailRecipeDescription = {
  /** Types de lames dans l'ordre. */
  sequence: EmailBlockType[]
  /** Lames de contenu (entre header et mentions/footer), hero compris. */
  content: EmailBlock[]
  buttons: number
  buttonDestinations: string[]
  links: number
  claimIds: string[]
  /** Mentions légales sélectionnées. */
  disclaimers: string[]
  strongZones: string[]
  words: number
  /** Identifiants d'images de la banque, dans l'ordre d'apparition. */
  imageIds: string[]
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

export function describeEmailRecipeConfig(config: EmailConfig): EmailRecipeDescription {
  const content = config.blocks.filter((block) => !isShell(block.type))
  const ctas = content.flatMap(buttons)
  const legal = config.blocks.find((block) => block.type === "email-module-legal-disclaimer")
  const used = claimsIn(contentTexts(content).map(({ text }) => text))
  const highlightClaims = content.flatMap((block) => {
    const joined = highlightText(block)
    return joined ? approvedClaims.filter((claim) => claim.statement === joined) : []
  })
  const claimIds = [...new Set([...used, ...highlightClaims].map((claim) => claim.id))]
  return {
    sequence: config.blocks.map((block) => block.type),
    content,
    buttons: ctas.length,
    buttonDestinations: [...new Set(ctas.map((slot) => slot.value.href!))],
    links: config.blocks.filter((block) => block.type === emailRecipePreheaderLame || !isShell(block.type)).flatMap(links).length,
    claimIds,
    disclaimers: legal ? Object.values(raw(legal).slots).map((slot) => (slot as { disclaimer: string }).disclaimer) : [],
    strongZones: content.filter(isStrong).map((block) => block.id),
    words: content.flatMap(emailRecipeTexts).reduce((sum, { text }) => sum + wordCount(text), 0),
    imageIds: content.flatMap(images).flatMap((slot) => {
      const id = emailBankImageIdFromSrc(slot.value.src!)
      return id ? [id] : []
    }),
  }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const placeholder = /lorem|ipsum|\bTODO\b|\[[^\]]*(?:À|A) (?:CONFIRMER|VALIDER|DÉFINIR)[^\]]*\]/i

/** Rôle d'une lame dans la recette : une lame de preuve est reconnue à la claim qu'elle porte. */
function roleOf(block: EmailBlock, claimed: boolean): EmailRecipeRole | undefined {
  if (block.type === "email-module-benefits-compact-highlights") return "proof"
  if (block.type === "email-module-numbered-list") return claimed ? "proof" : "steps"
  if (block.type === "email-module-text-only") return claimed ? "proof" : "text"
  if ((Object.values(emailRecipeHeroLames) as string[]).includes(block.type)) return "hero"
  const kind = (Object.keys(emailRecipeSectionLames) as (keyof typeof emailRecipeSectionLames)[]).find((candidate) => emailRecipeSectionLames[candidate] === block.type)
  return kind ? emailRecipeSectionRoles[kind] : undefined
}

export type EmailRecipeValidationOptions = {
  /** Faits de la demande : un nombre qu'ils contiennent, recopié tel quel, n'est pas un chiffre inventé. */
  facts?: readonly string[]
}

export function validateEmailRecipeConfig(recipeId: EmailRecipeId, config: EmailConfig, options: EmailRecipeValidationOptions = {}): EmailRecipeIssue[] {
  const recipe: EmailRecipe = emailRecipes[recipeId]
  const issues: EmailRecipeIssue[] = []
  const issue = (code: string, path: string, message: string) => issues.push({ code, path, message })
  const blocks = config.blocks
  const description = describeEmailRecipeConfig(config)
  const content = description.content

  /* Shell */
  const first = blocks[0]
  const second = blocks[1]
  const header = first?.type === emailRecipePreheaderLame ? second : first
  if (header?.type !== "email-module-header-newsletter") issue("shell", "blocks.0", "Le shell commence par le header newsletter (précédé du bandeau preheader seulement s'il porte le lien secondaire).")
  if (blocks.at(-1)?.type !== "email-module-footer-compact-legal") issue("shell", "blocks", "Le dernier bloc est le footer.")
  if (first?.type === emailRecipePreheaderLame && recipe.cta.secondaryLinks === 0) issue("secondary-link", first.id, "Cette recette n'a pas de lien secondaire.")

  /* Sections et rôles */
  const allowedLames = new Set<EmailBlockType>(emailRecipeLames(recipeId))
  if (content.length < recipe.contentSections.min || content.length > recipe.contentSections.max) {
    issue("sections", "blocks", `${content.length} sections de contenu : ${recipe.contentSections.min} à ${recipe.contentSections.max} attendues.`)
  }
  const heroLames = new Set<string>(recipe.heroLayouts.map((layout) => emailRecipeHeroLames[layout]))
  if (!content[0] || !heroLames.has(content[0].type)) issue("hero", content[0]?.id ?? "blocks", "La première section est un hero autorisé par la recette.")
  for (const block of content) {
    if (!allowedLames.has(block.type)) issue("forbidden-lame", block.id, `La lame « ${block.type} » n'est pas autorisée par cette recette.`)
  }
  const claimedBlocks = new Set(content.filter((block) => claimsIn(emailRecipeTexts(block).map(({ text }) => text)).length > 0).map((block) => block.id))
  const roles = content.map((block) => roleOf(block, claimedBlocks.has(block.id)))
  const allowedRoles = new Set<EmailRecipeRole>([...recipe.roles.required, ...recipe.roles.optional])
  roles.forEach((role, index) => {
    if (role && !allowedRoles.has(role)) issue("role", content[index]!.id, `Le rôle « ${role} » n'est pas autorisé par cette recette.`)
  })
  for (const role of recipe.roles.required) {
    if (!roles.includes(role)) issue("role", "blocks", `Rôle requis absent : « ${role} ».`)
  }
  for (const role of new Set(roles)) {
    if (role && role !== "proof" && roles.filter((candidate) => candidate === role).length > 1) issue("role", "blocks", `Le rôle « ${role} » est répété.`)
  }

  /* Boutons, liens, destinations */
  if (description.buttons < 1) issue("cta", "blocks", "Un bouton principal est requis (dans le hero).")
  if (description.buttons > recipe.cta.buttons) issue("cta", "blocks", `${description.buttons} boutons : ${recipe.cta.buttons} au maximum.`)
  if (description.buttonDestinations.length > 1) issue("cta", "blocks", "Tous les boutons mènent à la même destination (un seul CTA principal).")
  if (description.links > recipe.cta.secondaryLinks) issue("secondary-link", "blocks", `${description.links} lien(s) texte secondaire(s) : ${recipe.cta.secondaryLinks} au maximum.`)
  const allowedHrefs = new Set<string>(recipe.destinations.map((id: EmailDestinationId) => emailDestinationUrl(id)))
  for (const block of [first, ...content].filter((candidate): candidate is EmailBlock => candidate !== undefined && (candidate.type === emailRecipePreheaderLame || !isShell(candidate.type)))) {
    for (const slot of [...buttons(block), ...links(block)]) {
      if (!allowedHrefs.has(slot.value.href!)) issue("destination", slot.path, "Destination non autorisée pour cette recette (liste fermée de destinations contrôlées).")
    }
  }

  /* Zone colorée */
  if (description.strongZones.length !== 1) issue("surface", "blocks", `${description.strongZones.length} zones colorées fortes : exactement une attendue.`)
  blocks.forEach((block, index) => {
    const surface = raw(block).surface
    if (surface && surface !== "page" && !(recipe.surface.allowed as readonly string[]).includes(surface)) issue("surface", block.id, `Surface « ${surface} » non autorisée par cette recette.`)
    const next = blocks[index + 1]
    if (next && isColored(block) && isColored(next)) issue("surface", block.id, `Deux zones colorées consécutives (« ${block.id} » puis « ${next.id} »).`)
  })
  const zone = content.find(isStrong)
  if (zone && recipe.surface.zone === "hero" && zone !== content[0]) issue("surface", zone.id, "La zone colorée se pose sur le hero.")
  if (zone && recipe.surface.zone === "proof" && roleOf(zone, claimedBlocks.has(zone.id)) !== "proof") issue("surface", zone.id, "La zone colorée se pose sur la preuve.")

  /* Images */
  const seen = new Set<string>()
  for (const block of content) {
    const visuals = images(block)
    if (block.type === "email-hero-newsletter-variant-01") {
      const sources = visuals.map((slot) => slot.value.src!)
      const matched = recipe.images.strips.find((stripId) => {
        const strip = resolveEmailPortraitStrip(stripId)
        return strip.every((image, index) => image.src === sources[index] && image.alt === (visuals[index]!.value.alt ?? ""))
      })
      if (!matched) issue("image", block.id, "La frise de portraits n'est pas l'une des frises prédéfinies autorisées.")
      continue
    }
    for (const slot of visuals) {
      const id = emailBankImageIdFromSrc(slot.value.src!)
      if (!id) {
        issue("image", slot.path, "Image hors de la banque contrôlée.")
        continue
      }
      if (!(recipe.images.intents as readonly string[]).includes(emailBank[id].intent)) issue("image", slot.path, `Intention visuelle « ${emailBank[id].intent} » non autorisée par cette recette.`)
      if (slot.value.alt !== emailBank[id].alt) issue("image", slot.path, "L'alt n'est pas celui du catalogue.")
      if (seen.has(id)) issue("image", slot.path, `L'image « ${id} » apparaît deux fois.`)
      seen.add(id)
    }
  }

  /* Claims, chiffres, mentions légales */
  const texts = contentTexts(content)
  const claimCount = description.claimIds.length
  if (claimCount < recipe.claims.min || claimCount > recipe.claims.max) issue("claims", "blocks", `${claimCount} claim(s) approuvée(s) : ${recipe.claims.min} à ${recipe.claims.max} attendues.`)
  for (const id of description.claimIds) {
    if (!(recipe.claims.allowed as readonly string[]).includes(id)) issue("claims", "blocks", `La claim « ${id} » n'est pas acceptée par cette recette.`)
  }
  // Un nombre n'est admis que s'il appartient à une claim approuvée (R3) ou à un fait de la demande, recopié tel quel.
  const facts = [...(options.facts ?? [])].sort((a, b) => b.length - a.length)
  const claimStatements = recipe.figures === "claims-only" ? approvedClaims.map((claim) => claim.statement).sort((a, b) => b.length - a.length) : []
  const stripKnown = (text: string) => [...claimStatements, ...facts].reduce((rest, known) => rest.split(known).join(" "), text)
  const figureTexts = [
    { path: "subject", text: config.subject },
    { path: "preheader", text: config.preheader },
    ...texts,
  ]
  for (const { path, text } of figureTexts) {
    if (/\d/.test(stripKnown(text))) issue("figure", path, recipe.figures === "none" ? "Aucun chiffre dans cette recette, sauf ceux des faits de la demande." : "Un chiffre ne vient que d'une claim approuvée ou d'un fait de la demande, copiés tels quels.")
  }
  for (const { path, text } of figureTexts) if (placeholder.test(text)) issue("placeholder", path, "Texte de remplissage ou marqueur à confirmer.")

  const wanted = [
    ...new Set(
      description.claimIds.flatMap((id) => {
        const disclaimerId = (approvedClaims as readonly BrandClaim[]).find((claim) => claim.id === id)?.disclaimerId
        return disclaimerId ? [disclaimerId] : []
      })
    ),
  ].sort()
  const present = [...description.disclaimers].sort()
  if (JSON.stringify(wanted) !== JSON.stringify(present)) issue("disclaimer", "blocks", `Mentions légales attendues : [${wanted.join(", ")}] ; présentes : [${present.join(", ")}].`)
  for (const id of present) if (!(id in emailDisclaimers)) issue("disclaimer", "blocks", `Disclaimer inconnu : ${id}.`)

  /* Longueur */
  if (description.words < recipe.density.min || description.words > recipe.density.max) issue("density", "blocks", `${description.words} mots : ${recipe.density.min} à ${recipe.density.max} attendus.`)

  return issues
}

/* -------------------------------------------------------------------------- */
/* Diagnostic de terminologie                                                 */
/* -------------------------------------------------------------------------- */

export type EmailRecipeDiagnosticLevel = "error" | "warning" | "known-conflict"

export type EmailRecipeDiagnostic = {
  level: EmailRecipeDiagnosticLevel
  ruleId: string
  path: string
  match: string
  label: string
  alternative?: string
  /** Statut du document dont vient la règle : une règle en revue ou en brouillon n'est pas un verdict. */
  sourceStatus: BrandStatus
  sourceDocumentId: string
  conflictId?: string
}

/**
 * `lintBrandText` sur l'objet, le préheader et tous les textes de l'email.
 * Un terme interdit qui appartient à une expression en conflit connu est
 * rangé à part (`known-conflict`) : rien n'est tranché. La fonction ne
 * modifie rien et ne lève jamais.
 */
export function lintEmailRecipeContent(config: EmailConfig): EmailRecipeDiagnostic[] {
  const entries = [
    { path: "subject", text: config.subject },
    { path: "preheader", text: config.preheader },
    ...config.blocks.flatMap((block) => emailRecipeTexts(block).map(({ path, text }) => ({ path, text }))),
  ]
  return entries.flatMap(({ path, text }) =>
    lintBrandText(text).map((finding): EmailRecipeDiagnostic => ({
      level: finding.conflictId ? "known-conflict" : finding.severity,
      ruleId: finding.ruleId,
      path,
      match: finding.match,
      label: finding.label,
      ...(finding.alternative ? { alternative: finding.alternative } : {}),
      sourceStatus: finding.provenance.status,
      sourceDocumentId: finding.provenance.documentId,
      ...(finding.conflictId ? { conflictId: finding.conflictId } : {}),
    }))
  )
}

/* -------------------------------------------------------------------------- */
/* Politique de diagnostic                                                    */
/* -------------------------------------------------------------------------- */

export type EmailRecipeDiagnosticPolicy = {
  /**
   * Diagnostics qui rendraient la génération invalide (à corriger sous
   * contrôle, jamais automatiquement) : une règle en `error` issue d'un
   * document APPROUVÉ. Aucune des règles actuelles ne l'est : tant que le
   * corpus n'a pas approuvé ses règles de lexique, la liste reste vide.
   */
  blocking: EmailRecipeDiagnostic[]
  /** À relire par une personne : conflits connus entre documents, erreurs de règles encore en revue. */
  humanReview: EmailRecipeDiagnostic[]
  /** Information : avertissements, et toute règle issue d'un brouillon. */
  advisory: EmailRecipeDiagnostic[]
}

/**
 * Politique PROPOSÉE (aucun effet : le pipeline ne bloque rien et ne corrige
 * rien, il range seulement). Ordre de priorité :
 * 1. conflit connu → relecture humaine (rien n'est tranché) ;
 * 2. règle d'un brouillon → information, jamais bloquante ;
 * 3. erreur d'une règle approuvée → bloquante ;
 * 4. erreur d'une règle en revue → relecture humaine ;
 * 5. avertissement → information.
 */
export function classifyEmailRecipeDiagnostics(diagnostics: readonly EmailRecipeDiagnostic[]): EmailRecipeDiagnosticPolicy {
  const policy: EmailRecipeDiagnosticPolicy = { blocking: [], humanReview: [], advisory: [] }
  for (const diagnostic of diagnostics) {
    if (diagnostic.level === "known-conflict") policy.humanReview.push(diagnostic)
    else if (diagnostic.sourceStatus === "draft") policy.advisory.push(diagnostic)
    else if (diagnostic.level === "error" && diagnostic.sourceStatus === "approved") policy.blocking.push(diagnostic)
    else if (diagnostic.level === "error") policy.humanReview.push(diagnostic)
    else policy.advisory.push(diagnostic)
  }
  return policy
}
