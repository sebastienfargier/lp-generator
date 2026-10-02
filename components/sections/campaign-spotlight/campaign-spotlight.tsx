import { useId } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import type { ProductImage } from "@/components/product/types"
import type { ProductHeroAction } from "@/components/sections/product-hero/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type CampaignSpotlightProps = {
  /** Début du titre. */
  title: string
  /** Fin du titre, mise en valeur ; les deux fragments se lisent comme une seule phrase. */
  accent?: string
  description?: string
  visual: ProductImage
  primaryAction: ProductHeroAction
  className?: string
}

/**
 * Une communication précise mise à l'affiche : un grand panneau arrondi, le
 * visuel bord à bord, un message fort et une action unique (toujours présente :
 * sans elle, la lame ne se distinguerait plus de NarrativeSplit).
 *
 * Sous `lg`, le visuel passe au-dessus du texte (3:2, puis 16:9 dès `sm`) et le
 * panneau est plafonné à `max-w-3xl` pour ne pas devenir immense à 768-1023 px.
 * Dès `lg`, grille de 12 colonnes : visuel sur 5 (environ 42 %), texte sur 7.
 * Le visuel est toujours à gauche et remplit la hauteur de sa colonne
 * (`fill`) : la hauteur du panneau vient du texte, jamais d'une valeur fixe.
 */
export function CampaignSpotlight({
  title,
  accent,
  description,
  visual,
  primaryAction,
  className,
}: CampaignSpotlightProps) {
  const titleId = useId()
  const Icon =
    primaryAction.icon === undefined ? ArrowRightIcon : primaryAction.icon

  return (
    <section
      aria-labelledby={titleId}
      className={cn("bg-neutral-100 py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        <div className="mx-auto grid max-w-3xl overflow-hidden rounded-xl bg-background lg:max-w-none lg:grid-cols-12">
          <div className="relative aspect-3/2 bg-muted sm:aspect-video lg:col-span-5 lg:aspect-auto">
            <Image
              src={visual.src}
              alt={visual.alt}
              fill
              sizes="(min-width: 1024px) 500px, 100vw"
              className="object-cover object-center"
            />
          </div>

          <div className="flex flex-col justify-center gap-6 p-6 sm:p-8 lg:col-span-7 lg:p-12">
            <div className="flex flex-col gap-4">
              <h2 id={titleId} className="text-h1 text-balance">
                {title}
                {accent && (
                  <>
                    {" "}
                    <span className="text-brand-green">{accent}</span>
                  </>
                )}
              </h2>
              {description && (
                <p className="max-w-xl text-body text-pretty text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            <Button
              size="xl"
              nativeButton={false}
              render={<Link href={primaryAction.href} />}
              className="w-full sm:w-auto sm:self-start"
            >
              {primaryAction.label}
              {Icon && <Icon data-icon="inline-end" aria-hidden />}
            </Button>
          </div>
        </div>
      </PageContainer>
    </section>
  )
}
