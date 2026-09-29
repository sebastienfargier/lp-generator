import { PageContainer } from "@/components/layout/page-container"
import { ProductCard, type ProductCardProps } from "@/components/product"
import { cn } from "@/lib/utils"

type ProductGridProps = {
  products: ProductCardProps[]
  /** Nom accessible de la section (ex. "Nos formations"). */
  label?: string
  className?: string
}

export function ProductGrid({ products, label, className }: ProductGridProps) {
  return (
    <section
      aria-label={label}
      className={cn("bg-neutral-100 py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        <ul role="list" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {products.map((product, index) => (
            <li key={`${index}-${product.href}`}>
              <ProductCard {...product} />
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  )
}
