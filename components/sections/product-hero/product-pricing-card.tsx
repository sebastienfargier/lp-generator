import { ProductPrice } from "@/components/product/product-price"
import type { ProductPricing } from "@/components/product/types"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type ProductPricingCardProps = ProductPricing & {
  className?: string
}

export function ProductPricingCard({
  price,
  originalPrice,
  discount,
  installment,
  financing,
  className,
}: ProductPricingCardProps) {
  return (
    <Card className={cn("@container shadow-none", className)}>
      <CardContent className="flex flex-col gap-4 @lg:flex-row @lg:items-center @lg:gap-8">
        <ProductPrice
          price={price}
          originalPrice={originalPrice}
          discount={discount}
          installment={installment}
          className="shrink-0"
        />

        {financing && (
          <>
            <Separator className="@lg:hidden" />
            <Separator orientation="vertical" className="hidden @lg:block" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardTitle>{financing.title}</CardTitle>
              {financing.description && (
                <CardDescription>{financing.description}</CardDescription>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
