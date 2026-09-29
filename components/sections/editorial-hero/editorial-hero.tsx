import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import type { ProductImage } from "@/components/product/types"
import type { ProductHeroAction } from "@/components/sections/product-hero/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EditorialHeroProps = {
  title: string
  visual: ProductImage
  primaryAction?: ProductHeroAction
  supportingText?: string
  className?: string
}

export function EditorialHero({
  title,
  visual,
  primaryAction,
  supportingText,
  className,
}: EditorialHeroProps) {
  const Icon =
    primaryAction?.icon === undefined ? ArrowRightIcon : primaryAction.icon

  return (
    <section
      className={cn("bg-surface py-8 text-surface-foreground md:py-12", className)}
    >
      <PageContainer>
        <div className="flex flex-col items-center gap-8 text-center md:gap-12">
          <h1 className="max-w-5xl text-h1 text-balance lg:text-display">
            {title}
          </h1>

          {/* Titre → image : 48 px · image → CTA : 32 px · CTA → texte : 16 px */}
          <div className="flex w-full flex-col items-center gap-6 md:gap-8">
            <div className="relative aspect-4/3 w-full max-w-4xl overflow-hidden rounded-xl bg-muted sm:aspect-video">
              <Image
                src={visual.src}
                alt={visual.alt}
                fill
                preload
                sizes="(min-width: 1024px) 896px, 100vw"
                className="object-cover"
              />
            </div>

            {(primaryAction || supportingText) && (
              <div className="flex w-full flex-col items-center gap-4">
                {primaryAction && (
                  <Button
                    size="xl"
                    nativeButton={false}
                    render={<Link href={primaryAction.href} />}
                    className="w-full sm:w-auto"
                  >
                    {primaryAction.label}
                    {Icon && <Icon data-icon="inline-end" aria-hidden />}
                  </Button>
                )}
                {supportingText && (
                  <p className="max-w-xl text-body text-pretty text-muted-foreground">
                    {supportingText}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </section>
  )
}
