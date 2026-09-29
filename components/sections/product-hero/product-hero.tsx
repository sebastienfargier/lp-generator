import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import { ProductPartner } from "@/components/product/product-partner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ProductHeroVisual } from "./product-hero-visual"
import { ProductPricingCard } from "./product-pricing-card"
import type { ProductHeroAction, ProductHeroProps } from "./types"

function HeroAction({
  action,
  variant,
}: {
  action: ProductHeroAction
  variant: "default" | "outline"
}) {
  const Icon = action.icon === undefined ? ArrowRightIcon : action.icon

  return (
    <Button
      variant={variant}
      size="xl"
      nativeButton={false}
      render={<Link href={action.href} />}
      className="w-full sm:w-auto"
    >
      {action.label}
      {Icon && <Icon data-icon="inline-end" aria-hidden />}
    </Button>
  )
}

export function ProductHero({
  badges,
  title,
  description,
  pricing,
  primaryAction,
  secondaryAction,
  partner,
  visual,
  highlight,
  className,
}: ProductHeroProps) {
  return (
    <section
      className={cn("bg-surface py-8 text-surface-foreground md:py-12", className)}
    >
      <PageContainer>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-center">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6 lg:gap-8">
              <div className="flex flex-col gap-4 lg:gap-6">
                {badges && badges.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {badges.map((badge) => (
                      <Badge
                        key={badge.label}
                        variant={badge.variant ?? "secondary"}
                        size="lg"
                      >
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                )}

                <h1 className="text-h1 sm:text-display">{title}</h1>

                {description && (
                  <p className="max-w-xl text-body text-pretty text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>

              {pricing && <ProductPricingCard {...pricing} />}
            </div>

            {(primaryAction || secondaryAction) && (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                {primaryAction && (
                  <HeroAction action={primaryAction} variant="default" />
                )}
                {secondaryAction && (
                  <HeroAction action={secondaryAction} variant="outline" />
                )}
              </div>
            )}

            {partner && <ProductPartner {...partner} />}
          </div>

          <ProductHeroVisual
            image={visual}
            highlight={highlight}
          />
        </div>
      </PageContainer>
    </section>
  )
}
