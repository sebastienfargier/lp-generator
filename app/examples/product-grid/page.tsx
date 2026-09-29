import type { ProductCardProps } from "@/components/product"
import { ProductGrid } from "@/components/sections/product-grid"

const product: ProductCardProps = {
  title: "MBA Manager stratégique RH",
  href: "/formations/mba-manager-strategique-rh",
  image: {
    src: "/images/hero-apprenante.jpg",
    alt: "Apprenante souriante assise sur un canapé",
  },
  badge: { label: "Populaire", variant: "accent-1" },
  partner: { label: "Partenaire académique", name: "ESGRH" },
  pricing: { discount: "-20%", originalPrice: "1 250 €", price: "990 €" },
}

export default function ProductGridExamplePage() {
  return (
    <main>
      <ProductGrid label="Nos formations" products={[product, product, product]} />
    </main>
  )
}
