import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { ProductPartner } from "./product-partner"
import { ProductPrice } from "./product-price"
import type {
  ProductBadge,
  ProductImage,
  ProductPartner as ProductPartnerData,
  ProductPricing,
} from "./types"

export type ProductCardProps = {
  title: string
  href: string
  image: ProductImage
  badge?: ProductBadge
  partner?: ProductPartnerData
  pricing?: ProductPricing
  className?: string
}

export function ProductCard({
  title,
  href,
  image,
  badge,
  partner,
  pricing,
  className,
}: ProductCardProps) {
  return (
    <Card
      className={cn(
        // Toute la carte est cliquable via le lien du titre (overlay `after:`),
        // ce qui garde un nom accessible court : le titre.
        "relative h-full gap-4 rounded-xl pt-0 ring-0 transition-shadow hover:shadow-lg hover:shadow-foreground/5 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 motion-reduce:transition-none",
        className
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 1280px) 400px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
        {badge && (
          <Badge
            variant={badge.variant ?? "secondary"}
            size="lg"
            className="absolute top-4 right-4"
          >
            {badge.label}
          </Badge>
        )}
      </div>

      {/* Padding de 24 px autour du contenu, rythme interne de 16 px. */}
      <CardHeader className="pt-2">
        <CardTitle role="heading" aria-level={3} className="leading-tight">
          <Link
            href={href}
            className="outline-none after:absolute after:inset-0"
          >
            {title}
          </Link>
        </CardTitle>
      </CardHeader>

      {(partner || pricing) && (
        // `mt-auto` aligne partenaire et prix en bas des cartes d'une même ligne.
        <CardContent className="mt-auto gap-4">
          {partner && (
            <>
              <Separator />
              <ProductPartner {...partner} className="gap-x-3" />
            </>
          )}
          {pricing && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <ProductPrice {...pricing} size="lg" />
                <ArrowRightIcon
                  aria-hidden
                  className="size-5 shrink-0 text-foreground transition-transform group-hover/card:translate-x-1 motion-reduce:transition-none"
                />
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
