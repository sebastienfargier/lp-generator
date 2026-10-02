import { AudienceSwitcher } from "@/components/sections/audience-switcher"
import { ContentCarousel } from "@/components/sections/content-carousel"
import { EditorialHero } from "@/components/sections/editorial-hero"
import { FinalCta } from "@/components/sections/final-cta"
import { ImmersiveHero } from "@/components/sections/immersive-hero"
import { NarrativeSplit } from "@/components/sections/narrative-split"
import { PillarsSection } from "@/components/sections/pillars"
import { ProductGrid } from "@/components/sections/product-grid"
import {
  ProductHero,
  type ProductHeroAction,
  type ProductHighlight,
} from "@/components/sections/product-hero"
import { ValueProps } from "@/components/sections/value-props"
import type {
  LandingAction,
  LandingHighlight,
  LandingPageSection,
} from "@/lib/landing/types"

import { resolveLandingIcon } from "./icon-resolver"

/**
 * Adapte une action sérialisable vers les Props React :
 * - `icon` absent → reste absent (icône par défaut de la section) ;
 * - `icon: null` → aucune icône ;
 * - nom d'icône → composant Lucide.
 */
function toHeroAction(action: LandingAction): ProductHeroAction {
  const { icon, ...rest } = action
  if (icon === undefined) return rest
  return { ...rest, icon: icon === null ? null : resolveLandingIcon(icon) }
}

/** Sans `icon`, ProductHighlightCard conserve son icône par défaut (check). */
function toHighlight(highlight: LandingHighlight): ProductHighlight {
  const { icon, ...rest } = highlight
  return icon === undefined ? rest : { ...rest, icon: resolveLandingIcon(icon) }
}

/** Échoue à la compilation si un type de section n'est pas traité. */
function assertNever(section: never): never {
  throw new Error(
    `Type de section non pris en charge : ${JSON.stringify(section)}`
  )
}

function renderSection(section: LandingPageSection) {
  switch (section.type) {
    case "product-hero": {
      const { primaryAction, secondaryAction, highlight, ...props } =
        section.props
      return (
        <ProductHero
          {...props}
          primaryAction={primaryAction && toHeroAction(primaryAction)}
          secondaryAction={secondaryAction && toHeroAction(secondaryAction)}
          highlight={highlight && toHighlight(highlight)}
        />
      )
    }
    case "editorial-hero": {
      const { primaryAction, ...props } = section.props
      return (
        <EditorialHero
          {...props}
          primaryAction={primaryAction && toHeroAction(primaryAction)}
        />
      )
    }
    case "immersive-hero": {
      const { primaryAction, ...props } = section.props
      return (
        <ImmersiveHero
          {...props}
          primaryAction={primaryAction && toHeroAction(primaryAction)}
        />
      )
    }
    case "product-grid":
      return <ProductGrid {...section.props} />
    case "value-props":
      return <ValueProps {...section.props} />
    case "pillars":
      return <PillarsSection {...section.props} />
    case "content-carousel":
      return <ContentCarousel {...section.props} />
    case "audience-switcher":
      return <AudienceSwitcher {...section.props} />
    case "narrative-split":
      return <NarrativeSplit {...section.props} />
    case "final-cta": {
      const { primaryAction, ...props } = section.props
      return <FinalCta {...props} primaryAction={toHeroAction(primaryAction)} />
    }
    default:
      return assertNever(section)
  }
}

/**
 * Rend une section de la config. Les composants de section n'acceptant pas
 * d'`id`, l'ancre est portée par un wrapper neutre (pas de <section> imbriquée).
 */
export function SectionRenderer({ section }: { section: LandingPageSection }) {
  return <div id={section.id}>{renderSection(section)}</div>
}
