/**
 * Resolver de recettes Email V2, hors ligne : une composition sémantique
 * (`EmailRecipeComposition`) → un `EmailConfig` existant. C'est une couche
 * ADDITIVE : `draft-resolver.ts` (V1) n'est ni remplacé ni appelé.
 *
 * La composition ne contient que des décisions sémantiques : la recette, la
 * disposition du hero, l'intention visuelle, des textes, des identifiants de
 * destination, d'icône, de claim et de frise. Le resolver décide seul de tout
 * le reste : lames, identifiants techniques, surface de la zone colorée,
 * images (identifiant → URL canonique et alt contrôlé de la banque), liens
 * (identifiant → URL contrôlée), shell (header, footer), mentions légales
 * (déduites des claims), valeur et libellé d'un bandeau de preuve. Il ne
 * reformule rien : les textes vont tels quels dans les slots, et une claim
 * est recopiée au caractère près depuis `lib/brand/claims.ts`.
 *
 * `EmailConfig` et `schemas.ts` restent l'autorité : le résultat est validé
 * par `safeParseEmailConfig`, puis par `validateEmailRecipeConfig`. Les
 * diagnostics de terminologie sont fournis, jamais appliqués.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { getApprovedClaim, getClaimDisplay, type ApprovedClaimId, type BrandClaim } from "../brand/claims"
import { emailDestinations, emailDestinationUrl, type EmailDestinationId } from "./destinations"
import { emailDisclaimers, type EmailDisclaimerId } from "./disclaimers"
import {
  emailImagesForIntent,
  emailPortraitStrips,
  isEmailPortraitStripId,
  isEmailVisualIntent,
  pickEmailBankImage,
  resolveEmailBankImage,
  resolveEmailPortraitStrip,
  type EmailBankImageId,
  type EmailPortraitStripId,
  type EmailVisualIntent,
} from "./image-bank"
import { safeParseEmailConfig } from "./schemas"
import {
  lintEmailRecipeContent,
  validateEmailRecipeConfig,
  type EmailRecipeDiagnostic,
  type EmailRecipeValidationOptions,
  type EmailRecipeIssue,
} from "./recipe-validation"
import {
  emailRecipeHeroLames,
  emailRecipeIcons,
  emailRecipePreheaderLame,
  emailRecipeSectionLames,
  emailRecipeSectionRoles,
  emailRecipes,
  type EmailHeroLayout,
  type EmailRecipe,
  type EmailRecipeIcon,
  type EmailRecipeId,
  type EmailRecipeRole,
} from "./recipes"
import type { EmailBlock, EmailBlockType, EmailConfig } from "./types"

/* -------------------------------------------------------------------------- */
/* Composition (ce que l'IA décidera plus tard)                               */
/* -------------------------------------------------------------------------- */

export type EmailRecipeCta = { label: string; destination: EmailDestinationId }
type Item = { title: string; text: string }

export type EmailRecipeSection =
  | { kind: "steps"; eyebrow: string; items: readonly [Item, Item, Item] }
  | { kind: "grid"; eyebrow: string; title: string; items: readonly [Item, Item, Item, Item] }
  | { kind: "benefits"; title: string; items: readonly [Item & { icon: EmailRecipeIcon }, Item & { icon: EmailRecipeIcon }, Item & { icon: EmailRecipeIcon }] }
  | { kind: "text"; title: string; text: string }
  | { kind: "feature"; title: string; text: string; cardTitle: string; cardText: string; cta: EmailRecipeCta }
  | { kind: "illustrated"; title: string; text: string; cta: EmailRecipeCta }
  | { kind: "closing"; title: string; text: string; cta: EmailRecipeCta }
  /** Trois claims en liste numérotée : le titre de chaque élément est la formulation exacte de la claim. */
  | { kind: "claim-list"; eyebrow: string; claims: readonly [ApprovedClaimId, ApprovedClaimId, ApprovedClaimId]; texts: readonly [string, string, string] }
  /** Une claim chiffrée en bandeau : valeur et libellé sont les deux moitiés de la formulation exacte. */
  | { kind: "claim-highlight"; claim: ApprovedClaimId }
  /** Une claim comme titre d'un texte : la formulation exacte, puis un texte d'appui sans chiffre. */
  | { kind: "claim-text"; claim: ApprovedClaimId; text: string }

export type EmailRecipeComposition = {
  recipe: EmailRecipeId
  campaignName: string
  subject: string
  preheader: string
  heroLayout: EmailHeroLayout
  /** Intention de l'image du hero (et de la section illustrée) ; défaut : la première de la recette. Sans objet pour la frise. */
  visualIntent?: EmailVisualIntent
  /** Frise de portraits du hero `portrait-strip`. */
  stripId?: EmailPortraitStripId
  /** `empathy` : surface douce, seulement si la recette l'autorise (situation difficile). */
  surfaceIntent?: "default" | "empathy"
  /** Graine du choix d'image ; défaut : le nom de campagne. */
  seed?: string
  hero: { eyebrow?: string; title: string; text: string; cta: EmailRecipeCta }
  sections: readonly EmailRecipeSection[]
  /** Lien texte secondaire, porté par le bandeau preheader (recettes qui l'autorisent). */
  secondaryLink?: { intro: string; label: string; destination: EmailDestinationId }
}

export type EmailRecipeClaimUse = {
  id: string
  /** Formulation exacte du corpus. */
  statement: string
  /** Document source et son statut, pour la validation et le débogage internes. */
  documentId: string
  status: string
  disclaimerId?: string
}

export type EmailRecipeResolution =
  | { status: "resolved"; config: EmailConfig; claims: EmailRecipeClaimUse[]; diagnostics: EmailRecipeDiagnostic[] }
  | { status: "invalid-composition" | "invalid-config" | "invalid-recipe"; issues: EmailRecipeIssue[] }

/* -------------------------------------------------------------------------- */
/* Claims                                                                     */
/* -------------------------------------------------------------------------- */

/** Une claim utilisable : approuvée par construction (`approvedClaims` ne contient que des documents approuvés). */
export function resolveRecipeClaim(id: string): BrandClaim | undefined {
  const claim = getApprovedClaim(id)
  return claim && claim.provenance.status === "approved" ? claim : undefined
}

/** Disclaimers qu'appellent des claims (ordre d'apparition, sans doublon) ; lève si un identifiant n'est pas au catalogue. */
export function emailRecipeDisclaimers(claims: readonly Pick<BrandClaim, "disclaimerId">[]): EmailDisclaimerId[] {
  const ids = [...new Set(claims.flatMap((claim) => (claim.disclaimerId ? [claim.disclaimerId] : [])))]
  for (const id of ids) {
    if (!Object.hasOwn(emailDisclaimers, id)) throw new Error(`Disclaimer inconnu du catalogue : ${id}.`)
  }
  return ids as EmailDisclaimerId[]
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

/** Footer : les trois liens éditoriaux du template (mêmes destinations que le Draft V1). */
const footerDestinations = ["catalogue-formations", "alternance", "trajectoire-magazine"] as const satisfies readonly EmailDestinationId[]

function toId(campaignName: string) {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return /^[a-z]/.test(slug) ? slug : `email-${slug || "email"}`
}

/** Indice déterministe dans `[0, length)` pour une graine (FNV-1a), comme le choix d'image de la banque. */
export function stableIndex(seed: string, length: number) {
  let hash = 0x811c9dc5
  for (const char of seed) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0
  return hash % length
}

const text = (value: string) => ({ text: value })
const link = (label: string, destination: EmailDestinationId) => ({ label, href: emailDestinationUrl(destination) })
const cta = (value: EmailRecipeCta) => link(value.label, value.destination)

function numbered(items: readonly Item[]) {
  return Object.fromEntries(
    items.flatMap((entry, index) => [
      [`item-${index + 1}-titre`, text(entry.title)],
      [`texte-descriptif-${index + 1}`, text(entry.text)],
    ])
  )
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

type Context = { recipe: EmailRecipe; issues: EmailRecipeIssue[]; claims: BrandClaim[]; used: Set<EmailBankImageId> }

const asBlock = (block: unknown) => block as EmailBlock

function claimFor(id: string, ctx: Context, path: string) {
  const claim = resolveRecipeClaim(id)
  if (!claim) {
    ctx.issues.push({ code: "claim", path, message: `Claim « ${id} » inconnue ou non approuvée.` })
    return undefined
  }
  if (!ctx.claims.some((candidate) => candidate.id === claim.id)) ctx.claims.push(claim)
  return claim
}

function destinationFor(destination: EmailDestinationId, ctx: Context, path: string) {
  if (!(ctx.recipe.destinations as readonly string[]).includes(destination)) {
    ctx.issues.push({ code: "destination", path, message: `Destination « ${destination} » non autorisée pour la recette « ${ctx.recipe.id} ».` })
  }
}

function heroBlock(input: EmailRecipeComposition, ctx: Context): EmailBlock | undefined {
  const { recipe } = ctx
  if (!(recipe.heroLayouts as readonly string[]).includes(input.heroLayout)) {
    ctx.issues.push({ code: "hero", path: "heroLayout", message: `Disposition « ${input.heroLayout} » non autorisée pour la recette « ${recipe.id} ».` })
    return undefined
  }
  const type = emailRecipeHeroLames[input.heroLayout]
  const { hero } = input
  destinationFor(hero.cta.destination, ctx, "hero.cta")
  const base = { "titre-principal": text(hero.title), "cta-1": cta(hero.cta) }
  const eyebrow = hero.eyebrow
  if (input.heroLayout === "medium") {
    if (eyebrow !== undefined) ctx.issues.push({ code: "hero", path: "hero.eyebrow", message: "Cette disposition n'a pas de surtitre." })
  } else if (!eyebrow) {
    ctx.issues.push({ code: "hero", path: "hero.eyebrow", message: "Cette disposition exige un surtitre." })
  }

  if (input.heroLayout === "portrait-strip") {
    if (!input.stripId || !isEmailPortraitStripId(input.stripId) || !(recipe.images.strips as readonly string[]).includes(input.stripId)) {
      ctx.issues.push({ code: "image", path: "stripId", message: "Une frise prédéfinie autorisée par la recette est requise." })
      return undefined
    }
    const strip = resolveEmailPortraitStrip(input.stripId)
    for (const id of emailPortraitStrips[input.stripId].images) ctx.used.add(id)
    return asBlock({
      id: "hero",
      type,
      slots: {
        "sur-titre": text(eyebrow ?? ""),
        ...base,
        "texte-descriptif-1": text(hero.text),
        ...Object.fromEntries(strip.map((image, index) => [`image-${index + 1}`, image])),
      },
    })
  }

  const intent = input.visualIntent ?? recipe.images.intents[0]!
  if (!isEmailVisualIntent(intent) || !(recipe.images.intents as readonly string[]).includes(intent)) {
    ctx.issues.push({ code: "image", path: "visualIntent", message: `Intention visuelle « ${intent} » non autorisée pour la recette « ${recipe.id} ».` })
    return undefined
  }
  if (emailImagesForIntent(intent, type).length === 0) {
    ctx.issues.push({ code: "image", path: "visualIntent", message: `Aucune image « ${intent} » pour cette disposition de hero.` })
    return undefined
  }
  const imageId = pickEmailBankImage(intent, type, `${input.seed ?? input.campaignName}|hero`)
  ctx.used.add(imageId)
  const image = resolveEmailBankImage(imageId, type)
  const textSlot = input.heroLayout === "banner" ? "texte-descriptif-1" : "texte-descriptif"
  const eyebrowSlot = input.heroLayout === "banner" ? "sur-titre" : "sous-titre"
  return asBlock({
    id: "hero",
    type,
    slots: { ...(input.heroLayout === "medium" ? {} : { [eyebrowSlot]: text(eyebrow ?? "") }), ...base, [textSlot]: text(hero.text), "image-1": image },
  })
}

function sectionBlock(section: EmailRecipeSection, index: number, input: EmailRecipeComposition, ctx: Context): EmailBlock | undefined {
  const path = `sections.${index}`
  const id = `section-${index + 1}`
  const type: EmailBlockType = emailRecipeSectionLames[section.kind]
  switch (section.kind) {
    case "steps":
      return asBlock({ id, type, slots: { "sous-titre": text(section.eyebrow), ...numbered(section.items) } })
    case "grid":
      return asBlock({ id, type, slots: { "sous-titre": text(section.eyebrow), "titre-principal": text(section.title), ...numbered(section.items) } })
    case "benefits": {
      const icons = section.items.map((entry) => entry.icon)
      for (const icon of icons) {
        if (!(emailRecipeIcons as readonly string[]).includes(icon)) ctx.issues.push({ code: "icon", path, message: `Icône « ${icon} » hors de la liste des recettes.` })
      }
      return asBlock({
        id,
        type,
        slots: { "titre-section": text(section.title), ...Object.fromEntries(icons.map((icon, i) => [`icone-${i + 1}`, { icon }])), ...numbered(section.items) },
      })
    }
    case "text":
      return asBlock({ id, type, slots: { "titre-section": text(section.title), "texte-descriptif": text(section.text) } })
    case "feature":
      destinationFor(section.cta.destination, ctx, `${path}.cta`)
      return asBlock({
        id,
        type,
        slots: {
          "titre-section": text(section.title),
          "texte-descriptif-1": text(section.text),
          "titre-principal": text(section.cardTitle),
          "texte-descriptif-2": text(section.cardText),
          "cta-1": cta(section.cta),
        },
      })
    case "illustrated": {
      destinationFor(section.cta.destination, ctx, `${path}.cta`)
      const intent = input.visualIntent ?? ctx.recipe.images.intents[0]!
      const candidates = emailImagesForIntent(intent, type).filter((candidate) => !ctx.used.has(candidate))
      if (candidates.length === 0) {
        ctx.issues.push({ code: "image", path, message: `Aucune image « ${intent} » encore inutilisée pour cette section.` })
        return undefined
      }
      const imageId = candidates[stableIndex(`${input.seed ?? input.campaignName}|${id}`, candidates.length)]!
      ctx.used.add(imageId)
      return asBlock({
        id,
        type,
        slots: { "titre-section": text(section.title), "image-1": resolveEmailBankImage(imageId, type), "texte-descriptif": text(section.text), "cta-1": cta(section.cta) },
      })
    }
    case "closing":
      destinationFor(section.cta.destination, ctx, `${path}.cta`)
      return asBlock({ id, type, slots: { "titre-section": text(section.title), "texte-descriptif": text(section.text), "cta-1": cta(section.cta) } })
    case "claim-list": {
      const claims = section.claims.map((claimId, i) => claimFor(claimId, ctx, `${path}.claims.${i}`))
      if (claims.some((claim) => !claim)) return undefined
      return asBlock({
        id,
        type,
        slots: { "sous-titre": text(section.eyebrow), ...numbered(claims.map((claim, i) => ({ title: claim!.statement, text: section.texts[i]! }))) },
      })
    }
    case "claim-highlight": {
      const claim = claimFor(section.claim, ctx, `${path}.claim`)
      if (!claim) return undefined
      // Valeur et libellé viennent de la projection CONTRÔLÉE de Brand (jamais d'un texte du modèle) ;
      // la recette n'accepte en bandeau que les claims dont la projection tient proprement dans le gabarit.
      const display = getClaimDisplay(claim.id)
      if (!display || `${display.value} ${display.label}` !== claim.statement || !(ctx.recipe.claims.headline as readonly string[] | undefined)?.includes(claim.id)) {
        ctx.issues.push({ code: "claim", path, message: `La claim « ${claim.id} » ne s'affiche pas en chiffre clé : projection absente, altérée ou hors du bandeau de la recette.` })
        return undefined
      }
      // Espaces insécables dans la valeur : présentation seulement (le nombre ne se coupe jamais en deux lignes) ; le sens et les caractères restent ceux de la claim.
      return asBlock({ id, type, slots: { "valeur-cle": text(display.value.replace(/ /g, "\u00A0")), label: text(display.label) } })
    }
    case "claim-text": {
      const claim = claimFor(section.claim, ctx, `${path}.claim`)
      if (!claim) return undefined
      return asBlock({ id, type, slots: { "titre-section": text(claim.statement), "texte-descriptif": text(section.text) } })
    }
  }
}

/** Surface de la zone colorée : celle de la recette, ou sa surface douce si l'intention le demande et si la recette l'autorise. */
function zoneSurface(input: EmailRecipeComposition, ctx: Context) {
  const { surface } = ctx.recipe
  if (input.surfaceIntent !== "empathy") return surface.default
  if ((surface.allowed as readonly string[]).includes("accent-2-soft")) return "accent-2-soft" as const
  ctx.issues.push({ code: "surface", path: "surfaceIntent", message: `La recette « ${ctx.recipe.id} » n'a pas de surface d'empathie.` })
  return surface.default
}

/**
 * Composition → EmailConfig validé. Chaque étape produit des diagnostics
 * plutôt qu'un contenu de remplacement ; rien n'est deviné.
 */
export function composeEmailRecipe(input: EmailRecipeComposition, options: EmailRecipeValidationOptions = {}): EmailRecipeResolution {
  if (!Object.hasOwn(emailRecipes, input.recipe)) {
    return { status: "invalid-composition", issues: [{ code: "recipe", path: "recipe", message: `Recette inconnue : « ${input.recipe} ».` }] }
  }
  const recipe: EmailRecipe = emailRecipes[input.recipe]
  const ctx: Context = { recipe, issues: [], claims: [], used: new Set() }

  /* Sections : rôles autorisés, requis, sans répétition */
  const roles: EmailRecipeRole[] = ["hero", ...input.sections.map((section) => emailRecipeSectionRoles[section.kind])]
  const allowed = new Set<EmailRecipeRole>([...recipe.roles.required, ...recipe.roles.optional])
  roles.forEach((role, index) => {
    if (!allowed.has(role)) ctx.issues.push({ code: "role", path: `sections.${index - 1}`, message: `Le rôle « ${role} » n'est pas autorisé par la recette « ${recipe.id} ».` })
  })
  for (const required of recipe.roles.required) {
    if (!roles.includes(required)) ctx.issues.push({ code: "role", path: "sections", message: `Rôle requis absent : « ${required} ».` })
  }
  if (input.secondaryLink && recipe.cta.secondaryLinks === 0) ctx.issues.push({ code: "secondary-link", path: "secondaryLink", message: "Cette recette n'a pas de lien secondaire." })
  if (input.secondaryLink) destinationFor(input.secondaryLink.destination, ctx, "secondaryLink")

  const hero = heroBlock(input, ctx)
  const body = input.sections.map((section, index) => sectionBlock(section, index, input, ctx))
  if (ctx.issues.length > 0 || !hero || body.some((block) => block === undefined)) return { status: "invalid-composition", issues: ctx.issues }

  /* Surface : une seule zone colorée, selon la recette */
  const surface = zoneSurface(input, ctx)
  if (ctx.issues.length > 0) return { status: "invalid-composition", issues: ctx.issues }
  const content = [hero, ...(body as EmailBlock[])]
  const kinds = ["hero", ...input.sections.map((section) => section.kind)]
  // Zone « proof » : la liste de claims (ou, à défaut, la première claim en titre) prend la surface ; un bandeau de preuve est déjà sombre par construction.
  const proofTarget = kinds.indexOf("claim-list") >= 0 ? kinds.indexOf("claim-list") : kinds.includes("claim-highlight") ? -1 : kinds.indexOf("claim-text")
  const target = recipe.surface.zone === "hero" ? 0 : proofTarget
  const colored = content.map((block, index) => (index === target ? asBlock({ ...block, surface }) : block))

  /* Mentions légales : seulement celles qu'appellent les claims utilisées */
  let disclaimers: EmailDisclaimerId[]
  try {
    disclaimers = emailRecipeDisclaimers(ctx.claims)
  } catch (error) {
    return { status: "invalid-composition", issues: [{ code: "disclaimer", path: "claims", message: (error as Error).message }] }
  }
  if (disclaimers.length > 2) return { status: "invalid-composition", issues: [{ code: "disclaimer", path: "claims", message: "Plus de deux disclaimers distincts : la lame de mentions légales en porte deux au plus." }] }
  const needsDate = disclaimers.filter((id) => "parameter" in emailDisclaimers[id])
  if (needsDate.length > 0) return { status: "invalid-composition", issues: [{ code: "disclaimer", path: "claims", message: `Le disclaimer « ${needsDate[0]} » exige une date de fin, que les recettes ne fournissent pas.` }] }

  const [firstFooter, secondFooter, thirdFooter] = footerDestinations
  const shellStart: EmailBlock[] = [
    ...(input.secondaryLink
      ? [asBlock({ id: "preheader", type: emailRecipePreheaderLame, slots: { label: text(input.secondaryLink.intro), "lien-1": link(input.secondaryLink.label, input.secondaryLink.destination) } })]
      : []),
    asBlock({ id: "header", type: "email-module-header-newsletter", slots: {} }),
  ]
  const legal: EmailBlock[] =
    disclaimers.length > 0
      ? [
          asBlock({
            id: "mentions-legales",
            type: "email-module-legal-disclaimer",
            slots: { "disclaimer-1": { disclaimer: disclaimers[0] }, ...(disclaimers[1] ? { "disclaimer-2": { disclaimer: disclaimers[1] } } : {}) },
          }),
        ]
      : []
  const footer = asBlock({
    id: "footer",
    type: "email-module-footer-compact-legal",
    slots: {
      "lien-1": link(emailDestinations[firstFooter].label, firstFooter),
      "lien-2": link(emailDestinations[secondFooter].label, secondFooter),
      "lien-3": link(emailDestinations[thirdFooter].label, thirdFooter),
    },
  })

  const parsed = safeParseEmailConfig({
    version: 1,
    id: toId(input.campaignName),
    name: input.campaignName,
    subject: input.subject,
    preheader: input.preheader,
    blocks: [...shellStart, ...colored, ...legal, footer],
  })
  if (!parsed.success) {
    return { status: "invalid-config", issues: parsed.error.issues.map((entry) => ({ code: "config", path: entry.path.join(".") || "config", message: entry.message })) }
  }
  const config = parsed.data
  const violations = validateEmailRecipeConfig(recipe.id, config, options)
  if (violations.length > 0) return { status: "invalid-recipe", issues: violations }

  return {
    status: "resolved",
    config,
    claims: ctx.claims.map((claim) => ({
      id: claim.id,
      statement: claim.statement,
      documentId: claim.provenance.documentId,
      status: claim.provenance.status,
      ...(claim.disclaimerId ? { disclaimerId: claim.disclaimerId } : {}),
    })),
    diagnostics: lintEmailRecipeContent(config),
  }
}
