import { useId } from "react"
import Image from "next/image"

import { PageContainer } from "@/components/layout/page-container"
import type { ProductImage } from "@/components/product/types"
import { cn } from "@/lib/utils"

export type NarrativeSplitProps = {
  eyebrow?: string
  title: string
  description: string
  visual: ProductImage
  /** Côté de l'image dès `lg` ; `left` par défaut. Décidé par l'application, jamais par l'IA. */
  visualSide?: "left" | "right"
  className?: string
}

/**
 * Une idée développée : une image d'un côté, surtitre, titre et paragraphe de
 * l'autre. Sous `lg`, une seule colonne, plafonnée à `max-w-3xl` et centrée
 * (image et texte restent alignés) : sans plafond, l'image atteindrait presque
 * 1000 px de large juste avant `lg`. Le plafond est levé dès `lg`, où les deux
 * colonnes ne changent pas. L'ordre des enfants dans le DOM est
 * toujours l'ordre visuel (aucun `order` CSS) : `left` rend l'image puis le
 * texte, `right` le texte puis l'image.
 */
export function NarrativeSplit({
  eyebrow,
  title,
  description,
  visual,
  visualSide = "left",
  className,
}: NarrativeSplitProps) {
  const titleId = useId()

  const image = (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-muted sm:aspect-3/2 lg:aspect-4/3">
      <Image
        src={visual.src}
        alt={visual.alt}
        fill
        sizes="(min-width: 1024px) 568px, 100vw"
        className="object-cover"
      />
    </div>
  )

  const text = (
    <div className="flex flex-col gap-4">
      {eyebrow && (
        <p className="text-caption tracking-wider text-muted-foreground uppercase">
          {eyebrow}
        </p>
      )}
      <h2 id={titleId} className="text-h1 text-balance">
        {title}
      </h2>
      <p className="max-w-xl text-body text-pretty text-muted-foreground">
        {description}
      </p>
    </div>
  )

  return (
    <section
      aria-labelledby={titleId}
      className={cn("bg-background py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        <div className="mx-auto grid max-w-3xl items-center gap-8 lg:max-w-none lg:grid-cols-2 lg:gap-12">
          {visualSide === "right" ? (
            <>
              {text}
              {image}
            </>
          ) : (
            <>
              {image}
              {text}
            </>
          )}
        </div>
      </PageContainer>
    </section>
  )
}
