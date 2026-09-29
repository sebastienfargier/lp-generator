import { Fragment } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import type { ProductBadge, ProductImage } from "@/components/product/types"
import type { ProductHeroAction } from "@/components/sections/product-hero/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ImmersiveHeroVisual = ProductImage & {
  /** Cadrage de l'image de fond. `alt=""` si l'image est purement décorative. */
  position?: "center" | "left" | "right"
}

export type ImmersiveHeroProps = {
  /** Chaque entrée est une ligne du titre : le découpage fait partie de la DA. */
  headline: string[]
  visual: ImmersiveHeroVisual
  logo?: ProductImage & { width: number; height: number }
  badge?: ProductBadge
  description?: string
  primaryAction?: ProductHeroAction
  className?: string
}

const objectPosition = {
  center: "object-center",
  left: "object-left",
  right: "object-right",
} as const

export function ImmersiveHero({
  headline,
  visual,
  logo,
  badge,
  description,
  primaryAction,
  className,
}: ImmersiveHeroProps) {
  const Icon =
    primaryAction?.icon === undefined ? ArrowRightIcon : primaryAction.icon

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-neutral-950 text-neutral-0",
        className
      )}
    >
      <Image
        src={visual.src}
        alt={visual.alt}
        fill
        preload
        sizes="100vw"
        className={cn(
          "-z-20 object-cover",
          objectPosition[visual.position ?? "center"]
        )}
      />
      {/* Overlay plus dense côté texte pour garantir la lisibilité sur toute image. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-r from-neutral-950/80 via-neutral-950/60 to-neutral-950/40"
      />

      <PageContainer>
        <div className="flex min-h-144 flex-col gap-12 py-12 lg:min-h-180">
          {logo && (
            <Image
              src={logo.src}
              alt={logo.alt}
              width={logo.width}
              height={logo.height}
              className="h-8 w-auto self-start sm:h-10"
            />
          )}

          <div className="flex flex-1 flex-col justify-center gap-6 sm:gap-8">
            <div className="flex flex-col items-start gap-6">
              {badge && (
                <Badge variant={badge.variant ?? "accent-1"} size="lg">
                  {badge.label}
                </Badge>
              )}

              <h1 className="flex flex-col items-start gap-1 text-h1 lg:text-display">
                {headline.map((line, index) => (
                  <Fragment key={index}>
                    {/* Espace invisible entre items flex : garde les mots séparés
                        pour les technologies d'assistance. */}
                    {index > 0 && " "}
                    <span className="max-w-full rounded-sm bg-brand-green px-3 py-1 leading-tight sm:px-4 sm:py-2">
                      {line}
                    </span>
                  </Fragment>
                ))}
              </h1>

              {description && (
                <p className="max-w-xl text-h2 text-pretty">{description}</p>
              )}
            </div>

            {primaryAction && (
              <Button
                variant="inverse"
                size="xl"
                nativeButton={false}
                render={<Link href={primaryAction.href} />}
                className="w-full sm:w-auto sm:self-start"
              >
                {primaryAction.label}
                {Icon && <Icon data-icon="inline-end" aria-hidden />}
              </Button>
            )}
          </div>
        </div>
      </PageContainer>
    </section>
  )
}
