import Image from "next/image"

import { cn } from "@/lib/utils"

import { ProductHighlightCard } from "./product-highlight-card"
import type { ProductImage } from "@/components/product/types"

import type { ProductHighlight } from "./types"

type ProductHeroVisualProps = {
  image: ProductImage
  highlight?: ProductHighlight
  className?: string
}

export function ProductHeroVisual({
  image,
  highlight,
  className,
}: ProductHeroVisualProps) {
  return (
    <div className={cn("relative flex flex-col", className)}>
      {/* Sur desktop, la marge droite laisse la card déborder de l'image. */}
      <div
        className={cn(
          "relative aspect-4/3 overflow-hidden rounded-xl bg-muted lg:aspect-15/16",
          highlight && "lg:mr-8 xl:mr-12"
        )}
      >
        <Image
          src={image.src}
          alt={image.alt}
          fill
          preload
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />
      </div>

      {highlight && (
        <ProductHighlightCard
          {...highlight}
          className="relative mx-4 -mt-12 sm:mx-8 lg:absolute lg:right-0 lg:bottom-1/6 lg:mx-0 lg:mt-0 lg:w-2/3 lg:min-w-80"
        />
      )}
    </div>
  )
}
