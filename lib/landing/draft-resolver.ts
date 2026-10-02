import type { LandingGenerationContext } from "./generation-context"
import type { LandingGenerationDraft } from "./generation-draft"
import type { LandingGenerationRequest } from "./generation-request"
import type { LandingImageSubject } from "./image-catalog"
import type { LandingPageConfig, LandingPageSection } from "./types"

/**
 * LandingGenerationDraft → LandingPageConfig. Fonction PURE et DÉTERMINISTE :
 * mêmes `request`, `draft` et `context`, même LandingPageConfig. Ni hasard, ni
 * horloge, ni ordre de système de fichiers. Le résultat n'est pas une garantie
 * de validité : `LandingPageSchema` et `validateGeneratedLanding` s'appliquent
 * ensuite, sans changement.
 *
 * Ce que le résolveur ajoute, et que Claude n'écrit jamais :
 * - `version: 1` ;
 * - `id` de page : slug du nom du projet (`landing` s'il est vide, préfixe
 *   `landing-` s'il ne commence pas par une lettre) ;
 * - `title` de page : le nom du projet, espaces normalisés ;
 * - `id` de section : le type de la lame, puis `-2`, `-3`… à chaque répétition ;
 * - image : `{ src, alt }` du catalogue, `alt` du catalogue compris ;
 * - CTA : `{ label, href }`, avec l'URL exacte de la destination, sans icône
 *   (celle de la section s'applique) ;
 * - `visual.position` d'un `immersive-hero`, selon `landingImagePositions` ;
 * - `id` d'audience : slug du titre (`audience-N` s'il est vide, préfixe
 *   `audience-` s'il ne commence pas par une lettre), suffixé en cas de
 *   doublon, et `defaultValue` : la première audience.
 *
 * Il ne produit jamais de logo, de badge ni d'icône.
 */

/**
 * `subject` d'une image du catalogue → `visual.position` d'un `immersive-hero`.
 * L'image est rognée en `cover` : ancrer le cadrage du côté du sujet le garde
 * visible. Décision de présentation de l'application, pas de Claude.
 */
export const landingImagePositions = {
  left: "left",
  center: "center",
  right: "right",
} as const satisfies Record<LandingImageSubject, "left" | "center" | "right">

/** Valeur inattendue de `subject` : cadrage centré. */
export const fallbackLandingImagePosition = "center"

export type LandingDraftIssue = { path: string; message: string }

export type LandingDraftResolution =
  | { status: "resolved"; config: LandingPageConfig }
  | { status: "unresolvable"; issues: LandingDraftIssue[] }

/** Minuscules sans accents, chiffres et lettres séparés par des tirets. */
function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Identifiant valide (`^[a-z][a-z0-9-]*$`) dérivé d'un texte : son slug ;
 * préfixé s'il ne commence pas par une lettre ; `empty` s'il est vide.
 */
function identifier(value: string, prefix: string, empty = prefix) {
  const base = slug(value)
  if (base === "") return empty
  return /^[a-z]/.test(base) ? base : `${prefix}-${base}`
}

function positionFor(subject: unknown) {
  return typeof subject === "string" && Object.hasOwn(landingImagePositions, subject)
    ? landingImagePositions[subject as LandingImageSubject]
    : fallbackLandingImagePosition
}

export function resolveLandingDraft(
  request: LandingGenerationRequest,
  draft: LandingGenerationDraft,
  context: LandingGenerationContext
): LandingDraftResolution {
  const issues: LandingDraftIssue[] = []
  const images = new Map<string, LandingGenerationContext["images"][number]>(context.images.map((image) => [image.id, image]))
  const destinations = new Map(context.destinations.map((destination) => [destination.id, destination]))
  const candidates = new Set(context.sections.map((section) => section.type))

  /** Entrée du catalogue pour un ImageId ; absente du contexte : erreur, jamais une valeur inventée. */
  const pick = (id: string, path: string) => {
    const image = images.get(id)
    if (!image) issues.push({ path, message: `Image "${id}" absente des images de cette génération.` })
    return image
  }
  const picture = (id: string, path: string) => {
    const image = pick(id, path)
    return { src: image?.src ?? "", alt: image?.alt ?? "" }
  }
  const action = (cta: { label: string; destination: string }, path: string) => {
    const destination = destinations.get(cta.destination)
    if (!destination) issues.push({ path, message: `Destination "${cta.destination}" absente des destinations de cette génération.` })
    return { label: cta.label, href: destination?.url ?? "" }
  }

  const seen = new Map<string, number>()
  const sectionId = (type: string) => {
    const count = (seen.get(type) ?? 0) + 1
    seen.set(type, count)
    return count === 1 ? type : `${type}-${count}`
  }

  const sections = draft.sections.map((section, index): LandingPageSection => {
    const at = `sections.${index}`
    if (!candidates.has(section.section)) {
      issues.push({ path: `${at}.section`, message: `Section "${section.section}" hors des sections candidates de cette génération.` })
    }
    const id = sectionId(section.section)

    switch (section.section) {
      case "editorial-hero":
        return {
          id,
          type: "editorial-hero",
          props: {
            title: section.title,
            visual: picture(section.image, `${at}.image`),
            primaryAction: action(section.cta, `${at}.cta.destination`),
            supportingText: section.supportingText,
          },
        }
      case "immersive-hero": {
        const image = pick(section.image, `${at}.image`)
        return {
          id,
          type: "immersive-hero",
          props: {
            headline: section.headline,
            visual: { src: image?.src ?? "", alt: image?.alt ?? "", position: positionFor(image?.subject) },
            description: section.description,
            primaryAction: action(section.cta, `${at}.cta.destination`),
          },
        }
      }
      case "value-props":
        return { id, type: "value-props", props: { label: section.label, items: section.items } }
      case "pillars":
        return {
          id,
          type: "pillars",
          props: { eyebrow: section.eyebrow, title: section.title, description: section.description, items: section.items },
        }
      case "content-carousel":
        return {
          id,
          type: "content-carousel",
          props: {
            label: section.label,
            items: section.items.map((item, position) => ({
              eyebrow: item.eyebrow,
              title: item.title,
              image: picture(item.image, `${at}.items.${position}.image`),
            })),
          },
        }
      case "audience-switcher": {
        const used = new Set<string>()
        const items = section.items.map((item, position) => {
          const base = identifier(item.title, "audience", `audience-${position + 1}`)
          let audienceId = base
          for (let suffix = 2; used.has(audienceId); suffix += 1) audienceId = `${base}-${suffix}`
          used.add(audienceId)
          return {
            id: audienceId,
            eyebrow: item.eyebrow,
            title: item.title,
            description: item.description,
            image: picture(item.image, `${at}.items.${position}.image`),
          }
        })
        return { id, type: "audience-switcher", props: { label: section.label, defaultValue: items[0]!.id, items } }
      }
      case "final-cta":
        return {
          id,
          type: "final-cta",
          props: { title: section.title, description: section.description, primaryAction: action(section.cta, `${at}.cta.destination`) },
        }
      default: {
        const unhandled: never = section
        return unhandled
      }
    }
  })

  if (issues.length > 0) return { status: "unresolvable", issues }
  return {
    status: "resolved",
    config: {
      version: 1,
      id: identifier(request.projectName, "landing"),
      title: request.projectName.trim().replace(/\s+/g, " "),
      sections,
    },
  }
}
