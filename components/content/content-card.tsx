import Image from "next/image"

import type { ProductImage } from "@/components/product/types"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type ContentItem = {
  eyebrow?: string
  title: string
  image: ProductImage
}

type ContentCardProps = ContentItem & {
  className?: string
}

export function ContentCard({
  eyebrow,
  title,
  image,
  className,
}: ContentCardProps) {
  return (
    <Card className={cn("h-full rounded-xl pb-0 shadow-none", className)}>
      <CardHeader className="gap-2">
        {eyebrow && (
          <p className="text-body text-muted-foreground">{eyebrow}</p>
        )}
        <CardTitle
          role="heading"
          aria-level={3}
          className="leading-tight sm:text-h1 sm:leading-tight"
        >
          {title}
        </CardTitle>
      </CardHeader>
      {/* `mt-auto` aligne les images en bas quand les titres n'ont pas la même longueur. */}
      <div className="relative mt-auto aspect-3/2 bg-muted">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 1024px) 480px, (min-width: 640px) 66vw, 92vw"
          className="object-cover"
        />
      </div>
    </Card>
  )
}
