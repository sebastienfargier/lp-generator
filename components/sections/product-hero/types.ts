import type { LucideIcon } from "lucide-react"

import type {
  ProductBadge,
  ProductImage,
  ProductPartner,
  ProductPricing,
} from "@/components/product/types"

export type ProductHeroAction = {
  label: string
  href: string
  /** Icône affichée après le libellé. `null` pour la masquer. */
  icon?: LucideIcon | null
}

export type ProductHighlight = {
  title: string
  items: string[]
  icon?: LucideIcon
}

export type ProductHeroProps = {
  title: string
  description?: string
  badges?: ProductBadge[]
  pricing?: ProductPricing
  primaryAction?: ProductHeroAction
  secondaryAction?: ProductHeroAction
  partner?: ProductPartner
  visual: ProductImage
  highlight?: ProductHighlight
  className?: string
}
