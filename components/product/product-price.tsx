import { cn } from "@/lib/utils"

import type { ProductPricing } from "./types"

type ProductPriceProps = Omit<ProductPricing, "financing"> & {
  /** `lg` pour une page produit, `md` pour une carte. */
  size?: "md" | "lg"
  className?: string
}

export function ProductPrice({
  price,
  originalPrice,
  discount,
  installment,
  size = "lg",
  className,
}: ProductPriceProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {(discount || originalPrice) && (
        <p className="flex items-baseline gap-2 text-caption">
          {discount && <span className="text-brand-green">{discount}</span>}
          {originalPrice && (
            <del className="text-muted-foreground">
              <span className="sr-only">Prix initial : </span>
              {originalPrice}
            </del>
          )}
        </p>
      )}
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "text-foreground",
            size === "lg" ? "text-h1" : "text-h2"
          )}
        >
          {price}
        </span>
        {installment && (
          <span className="text-body text-muted-foreground">{installment}</span>
        )}
      </p>
    </div>
  )
}
