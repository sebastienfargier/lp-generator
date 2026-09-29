import type { VariantProps } from "class-variance-authority"

import type { badgeVariants } from "@/components/ui/badge"

/**
 * Modèle de données d'un produit / d'une formation, partagé par ProductCard
 * (listing) et ProductHero (page produit) : un même objet peut alimenter les deux.
 */

export type ProductImage = {
  src: string
  alt: string
}

export type ProductBadge = {
  label: string
  variant?: VariantProps<typeof badgeVariants>["variant"]
}

export type ProductPartner = {
  label: string
  name: string
  /** Logo optionnel ; à défaut, `name` est affiché en texte. */
  logo?: ProductImage & { width: number; height: number }
}

export type ProductPricing = {
  /** Prix affiché en grand, déjà formaté (ex. "990 €"). */
  price: string
  /** Prix d'origine barré (ex. "1 250 €"). */
  originalPrice?: string
  /** Libellé de réduction (ex. "-20%"). */
  discount?: string
  /** Mensualité éventuelle (ex. "ou 82,50 €/mois"). */
  installment?: string
  /** Bloc financement, affiché uniquement par ProductHero. */
  financing?: {
    title: string
    description?: string
  }
}
