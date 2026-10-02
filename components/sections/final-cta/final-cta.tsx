import { useId } from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import type { ProductHeroAction } from "@/components/sections/product-hero/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FinalCtaProps = {
  title: string
  description?: string
  primaryAction: ProductHeroAction
  className?: string
}

/**
 * Lame de clôture : termine la page par une action claire. Volontairement
 * compacte et sans image, centrée, sur un aplat de marque : elle ne se lit pas
 * comme un hero sans photo.
 */
export function FinalCta({
  title,
  description,
  primaryAction,
  className,
}: FinalCtaProps) {
  const titleId = useId()
  const Icon =
    primaryAction.icon === undefined ? ArrowRightIcon : primaryAction.icon

  return (
    <section
      aria-labelledby={titleId}
      className={cn("bg-brand-green py-12 text-neutral-0", className)}
    >
      <PageContainer>
        <div className="flex flex-col items-center gap-6 text-center">
          <h2 id={titleId} className="max-w-3xl text-h1 text-balance">
            {title}
          </h2>
          {description && (
            <p className="max-w-xl text-body text-pretty text-neutral-300">
              {description}
            </p>
          )}
          <Button
            variant="inverse"
            size="xl"
            nativeButton={false}
            render={<Link href={primaryAction.href} />}
            className="w-full sm:w-auto"
          >
            {primaryAction.label}
            {Icon && <Icon data-icon="inline-end" aria-hidden />}
          </Button>
        </div>
      </PageContainer>
    </section>
  )
}
