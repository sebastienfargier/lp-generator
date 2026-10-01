import type { LandingGenerationContext } from "./generation-context"
import { safeParseLandingPage } from "./schemas"
import type { LandingPageConfig } from "./types"

/**
 * Validation d'une réponse de modèle, sans réseau : `unknown` → Zod
 * (`LandingPageSchema`, le seul contrat) → contrôles liés au contexte →
 * `LandingPageConfig`.
 *
 * Zod garantit déjà : version 1, ids valides et uniques, objets stricts
 * (`className`, `style` ou toute propriété inconnue refusés), types de
 * section connus, au plus un hero et en tête, ancres des actions qui ciblent
 * une section, audiences uniques. Ici, seulement ce que Zod ne peut pas
 * savoir : ce que CETTE génération autorisait.
 *
 * `image.src` doit appartenir exactement au catalogue de la génération.
 * `image.alt` est libre : l'alt du catalogue est une suggestion, un alt
 * généré est accepté tant qu'il respecte le contrat texte (URL et balisage
 * refusés comme dans tout texte), et `""` reste permis.
 *
 * Limite acceptée : la véracité d'un texte libre n'est pas garantie
 * structurellement. Un prix, une remise, une durée, une statistique ou une
 * garantie inventés dans un titre ou un paragraphe ne sont pas détectés ;
 * seuls le prompt, les ressources fermées et l'exclusion des sections
 * commerciales les encadrent.
 */

export type LandingValidationIssue = { path: string; message: string }

export type LandingValidationResult =
  | { status: "valid"; config: LandingPageConfig }
  | { status: "invalid"; issues: LandingValidationIssue[] }

export type LandingHrefKind = "anchor" | "destination" | "forbidden"

/** Ancre interne, destination contrôlée, ou href interdit. */
export function classifyLandingHref(href: string, context: LandingGenerationContext): LandingHrefKind {
  if (href.startsWith("#")) return "anchor"
  return context.destinations.some((destination) => destination.url === href) ? "destination" : "forbidden"
}

const urlInText = /https?:\/\/|www\./i
const markupInText = /<\/?[a-z][^>]*>/i

type Collect = {
  context: LandingGenerationContext
  sectionIds: ReadonlySet<string>
  issues: LandingValidationIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Parcourt toute la page, sans supposer où une section range ses images et
 * ses liens : `src` et `href` sont contrôlés où qu'ils soient, y compris dans
 * les structures imbriquées (items, visuels, logos).
 */
function inspect(value: unknown, path: string, key: string | undefined, state: Collect) {
  const { context, sectionIds, issues } = state
  if (typeof value === "string") {
    if (key === "src") {
      if (!context.images.some((image) => image.src === value)) {
        issues.push({ path, message: `Image hors du catalogue de cette génération : "${value}".` })
      }
    } else if (key === "href") {
      const kind = classifyLandingHref(value, state.context)
      if (kind === "forbidden") {
        issues.push({ path, message: `Lien hors des destinations contrôlées : "${value}".` })
      } else if (kind === "anchor" && !sectionIds.has(value.slice(1))) {
        issues.push({ path, message: `L'ancre "${value}" ne correspond à aucune section.` })
      }
    } else {
      if (urlInText.test(value)) issues.push({ path, message: "URL dans un texte : un lien passe par un href contrôlé." })
      if (markupInText.test(value)) issues.push({ path, message: "HTML ou JSX dans un texte : texte brut uniquement." })
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}.${index}`, undefined, state))
    return
  }
  if (!isRecord(value)) return

  for (const [name, child] of Object.entries(value)) {
    if (name === "logo") {
      issues.push({ path: `${path}.${name}`, message: "Aucun logo n'est fourni dans le contexte." })
      continue
    }
    inspect(child, path ? `${path}.${name}` : name, name, state)
  }
}

export function validateGeneratedLanding(output: unknown, context: LandingGenerationContext): LandingValidationResult {
  const parsed = safeParseLandingPage(output)
  if (!parsed.success) {
    return {
      status: "invalid",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "page",
        message: issue.message,
      })),
    }
  }
  const page = parsed.data
  const issues: LandingValidationIssue[] = []

  const candidates = new Set(context.sections.map((section) => section.type))
  page.sections.forEach((section, index) => {
    if (!candidates.has(section.type)) {
      issues.push({ path: `sections.${index}.type`, message: `Section "${section.type}" hors des sections candidates de cette génération.` })
    }
  })

  inspect(page, "", undefined, {
    context,
    sectionIds: new Set(page.sections.map((section) => section.id)),
    issues,
  })

  return issues.length > 0 ? { status: "invalid", issues } : { status: "valid", config: page }
}
