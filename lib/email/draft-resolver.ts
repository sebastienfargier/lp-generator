/**
 * Resolver déterministe : `EmailGenerationDraft` + requête → `EmailConfig`.
 *
 * Il n'invente aucun contenu éditorial et ne reformule rien : les textes du
 * Draft vont tels quels dans les slots. Il ajoute le shell (header, footer,
 * mentions légales), les identifiants techniques, les liens (identifiant de
 * destination → URL contrôlée), l'image du hero (identifiant → `src` et alt du
 * catalogue) et l'unique surface colorée. Même Draft, même requête : même
 * `EmailConfig`. `EmailConfig` et `schemas.ts` restent l'autorité finale :
 * `resolveEmailDraftToConfig` enchaîne la validation du Draft, le resolver et
 * `safeParseEmailConfig`.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailDisclaimers, type EmailDisclaimerId } from "./disclaimers"
import { emailDestinations, emailDestinationUrl, type EmailDestinationId } from "./destinations"
import { recommendedSurface } from "./generation-context"
import {
  emailDraftHeroBlocks,
  safeParseEmailGenerationDraft,
  type EmailDraftBlock,
  type EmailDraftCta,
  type EmailGenerationDraft,
} from "./generation-draft"
import type { EmailGenerationRequest } from "./generation-request"
import { EmailImageError, emailImageBlocks, resolveEmailImage } from "./image-catalog"
import { emailBlockManifest } from "./manifest"
import { safeParseEmailConfig } from "./schemas"
import { emailSectionCatalog } from "./section-catalog"
import type { EmailSurface } from "./surfaces"
import type { EmailBlock, EmailConfig } from "./types"

export type EmailDraftIssue = { path: string; message: string }

export type EmailDraftResolution =
  | { status: "resolved"; config: EmailConfig }
  | { status: "invalid-draft" | "unresolvable" | "invalid-config"; issues: EmailDraftIssue[] }

/* -------------------------------------------------------------------------- */
/* Règles du shell                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Footer : les trois liens éditoriaux du template, ceux que proposent déjà le
 * contexte de génération et la démo (libellés des destinations).
 */
const footerDestinations = ["catalogue-formations", "alternance", "trajectoire-magazine"] as const satisfies readonly EmailDestinationId[]

/** Identifiant technique stable dérivé du nom de campagne (même règle que la démo). */
function toId(campaignName: string) {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return /^[a-z]/.test(slug) ? slug : `email-${slug || "email"}`
}

const text = (value: string) => ({ text: value })
const link = (label: string, destination: EmailDestinationId) => ({ label, href: emailDestinationUrl(destination) })
const cta = (value: EmailDraftCta) => link(value.label, value.destination)

/** `{ "item-1-titre": …, "texte-descriptif-1": … }` pour des éléments titre + texte. */
function numberedItems(items: readonly { title: string; text: string }[]) {
  return Object.fromEntries(
    items.flatMap((entry, index) => [
      [`item-${index + 1}-titre`, text(entry.title)],
      [`texte-descriptif-${index + 1}`, text(entry.text)],
    ])
  )
}

/* -------------------------------------------------------------------------- */
/* Blocs                                                                      */
/* -------------------------------------------------------------------------- */

function resolveBlock(block: EmailDraftBlock, issues: EmailDraftIssue[], path: string): EmailBlock | undefined {
  switch (block.type) {
    case "hero": {
      const lame = emailImageBlocks(block.image)[0]
      if (!lame || !(emailDraftHeroBlocks as readonly string[]).includes(lame)) {
        issues.push({ path: `${path}.image`, message: `L'image « ${block.image} » ne correspond à aucun hero V1.` })
        return undefined
      }
      let image
      try {
        image = resolveEmailImage(block.image, lame)
      } catch (error) {
        if (!(error instanceof EmailImageError)) throw error
        issues.push({ path: `${path}.image`, message: error.message })
        return undefined
      }
      // Le hero moyen n'a pas de sous-titre : le surtitre du Draft est alors sans objet.
      const eyebrow = lame === "email-module-hero-promotional-image-medium" ? {} : { "sous-titre": text(block.eyebrow) }
      return {
        id: "hero",
        type: lame,
        slots: { ...eyebrow, "titre-principal": text(block.title), "texte-descriptif": text(block.text), "cta-1": cta(block.cta), "image-1": image },
      } as EmailBlock
    }
    case "steps":
      return { id: "etapes", type: "email-module-numbered-list", slots: { "sous-titre": text(block.eyebrow), ...numberedItems(block.items) } } as EmailBlock
    case "grid":
      return {
        id: "grille",
        type: "email-module-numbererd-grid",
        slots: { "sous-titre": text(block.eyebrow), "titre-principal": text(block.title), ...numberedItems(block.items) },
      } as EmailBlock
    case "icons":
      return {
        id: "appuis",
        type: "email-module-icons-list",
        slots: {
          "titre-section": text(block.title),
          ...Object.fromEntries(block.items.map((entry, index) => [`icone-${index + 1}`, { icon: entry.icon }])),
          ...numberedItems(block.items),
        },
      } as EmailBlock
    case "text":
      return { id: "texte", type: "email-module-text-only", slots: { "titre-section": text(block.title), "texte-descriptif": text(block.text) } } as EmailBlock
    case "feature":
      return {
        id: "encart",
        type: "email-module-text-and-feature-card",
        slots: {
          "titre-section": text(block.title),
          "texte-descriptif-1": text(block.text),
          "titre-principal": text(block.cardTitle),
          "texte-descriptif-2": text(block.cardText),
          "cta-1": cta(block.cta),
        },
      } as EmailBlock
    case "cta":
      return {
        id: "action",
        type: "email-module-text-and-cta-variant-01",
        slots: { "titre-section": text(block.title), "texte-descriptif": text(block.text), "cta-1": cta(block.cta) },
      } as EmailBlock
  }
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Header : le header newsletter (logo et signature de marque), sauf pour un
 * email promo, où le catalogue demande le header de campagne et son étiquette
 * (le nom de campagne de la requête, recopié). Aucun bandeau preheader : il
 * porte un lien texte secondaire et n'est pas requis.
 */
function resolveHeader(request: EmailGenerationRequest): EmailBlock {
  return request.emailType === "promo"
    ? { id: "header", type: "email-module-header-seasonal-campaign", slots: { label: text(request.campaignName) } }
    : { id: "header", type: "email-module-header-newsletter", slots: {} }
}

function resolveFooter(): EmailBlock {
  const [first, second, third] = footerDestinations
  return {
    id: "footer",
    type: "email-module-footer-compact-legal",
    slots: {
      "lien-1": link(emailDestinations[first].label, first),
      "lien-2": link(emailDestinations[second].label, second),
      "lien-3": link(emailDestinations[third].label, third),
    },
  }
}

/**
 * Mentions légales : seulement quand la requête porte des faits qui appellent
 * un disclaimer (`facts[].disclaimer`), dans l'ordre de la requête, sans
 * doublon, deux au plus (slots de la lame). Un disclaimer qui exige une date
 * de fin la prend dans `request.offer.endDate`. Rien d'autre ne l'ajoute.
 */
function resolveLegal(request: EmailGenerationRequest, issues: EmailDraftIssue[]): EmailBlock | undefined {
  const ids = [...new Set((request.facts ?? []).flatMap((fact) => (fact.disclaimer ? [fact.disclaimer] : [])))]
  if (ids.length === 0) return undefined
  if (ids.length > 2) {
    issues.push({ path: "request.facts", message: `${ids.length} disclaimers distincts : la lame de mentions légales en porte deux au plus.` })
    return undefined
  }
  const slot = (id: EmailDisclaimerId) => {
    const entry = emailDisclaimers[id]
    if ("parameter" in entry && entry.parameter === "endDate") {
      if (!request.offer?.endDate) {
        issues.push({ path: "request.offer.endDate", message: `Le disclaimer « ${id} » exige la date de fin de l'offre.` })
        return { disclaimer: id }
      }
      return { disclaimer: id, endDate: request.offer.endDate }
    }
    return { disclaimer: id }
  }
  const [first, second] = ids as [EmailDisclaimerId, EmailDisclaimerId?]
  return {
    id: "mentions-legales",
    type: "email-module-legal-disclaimer",
    slots: { "disclaimer-1": slot(first), ...(second ? { "disclaimer-2": slot(second) } : {}) },
  } as EmailBlock
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Une seule zone colorée par email, donc jamais deux à la suite : la surface
 * recommandée par la requête (`recommendedSurface` : Marque par défaut,
 * Accent 2 doux pour l'empathie, Accent 1 pour une promo, Bloc pour un
 * transactionnel) va sur le premier bloc qui l'accepte, le hero d'abord. Une
 * lame `fixed` n'a pas de surface ; `onlySurfaces` du catalogue est respecté.
 */
function assignSurface(blocks: EmailBlock[], surface: EmailSurface): EmailBlock[] {
  const target = blocks.findIndex((block) => {
    if (emailBlockManifest[block.type].surfaceMode !== "configurable") return false
    const only = (emailSectionCatalog[block.type] as { onlySurfaces?: readonly EmailSurface[] }).onlySurfaces
    return !only || only.includes(surface)
  })
  return blocks.map((block, index) => (index === target ? ({ ...block, surface } as EmailBlock) : block))
}

/* -------------------------------------------------------------------------- */
/* Resolver                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Draft validé + requête → `EmailConfig` (non validé par `schemas.ts` : voir
 * `resolveEmailDraftToConfig`). Un Draft qui ne se résout pas donne des
 * diagnostics, jamais un contenu de remplacement.
 */
export function resolveEmailGenerationDraft(request: EmailGenerationRequest, draft: EmailGenerationDraft): EmailDraftResolution {
  const issues: EmailDraftIssue[] = []
  const body = draft.blocks.map((block, index) => resolveBlock(block, issues, `blocks.${index}`))
  const legal = resolveLegal(request, issues)
  if (issues.length > 0 || body.some((block) => block === undefined)) return { status: "unresolvable", issues }

  const blocks = [
    resolveHeader(request),
    ...assignSurface(body as EmailBlock[], recommendedSurface(request.emailType, request.audience)),
    ...(legal ? [legal] : []),
    resolveFooter(),
  ]
  return {
    status: "resolved",
    config: {
      version: 1,
      id: toId(request.campaignName),
      name: request.campaignName,
      // L'objet imposé par la requête l'emporte sur celui du Draft.
      subject: request.subject ?? draft.subject,
      preheader: draft.preheader,
      blocks,
    },
  }
}

/**
 * Pipeline hors ligne : Draft inconnu → validation du Draft → resolver →
 * `safeParseEmailConfig` (l'autorité). Ne contourne aucune validation ; le
 * rendu (`renderEmail`) se fait ensuite, comme pour tout EmailConfig.
 */
export function resolveEmailDraftToConfig(request: EmailGenerationRequest, input: unknown): EmailDraftResolution {
  const draft = safeParseEmailGenerationDraft(input)
  if (!draft.success) {
    return {
      status: "invalid-draft",
      issues: draft.error.issues.map((issue) => ({ path: issue.path.join(".") || "draft", message: issue.message })),
    }
  }
  const resolution = resolveEmailGenerationDraft(request, draft.data)
  if (resolution.status !== "resolved") return resolution
  const config = safeParseEmailConfig(resolution.config)
  if (!config.success) {
    return {
      status: "invalid-config",
      issues: config.error.issues.map((issue) => ({ path: issue.path.join(".") || "config", message: issue.message })),
    }
  }
  return { status: "resolved", config: config.data }
}
