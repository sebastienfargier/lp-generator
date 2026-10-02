import { useId } from "react"

import { PageContainer } from "@/components/layout/page-container"
import { cn } from "@/lib/utils"

export type StepSequenceItem = {
  title: string
  description: string
}

export type StepSequenceProps = {
  title: string
  description?: string
  /** Trois ou quatre étapes ; l'ordre du tableau est l'ordre de la progression. */
  items: StepSequenceItem[]
  className?: string
}

/**
 * Progression éditoriale ordonnée, sans carte : chaque étape est un marqueur
 * numéroté, un titre et une phrase, posés sur le fond.
 *
 * Le `<ol>` porte l'ordre ; les numéros (calculés ici) et les traits qui relient
 * les marqueurs sont décoratifs. Le trait est le pseudo-élément `before` de
 * chaque étape sauf la dernière : vertical sous `lg` (de la fin d'un marqueur au
 * suivant), horizontal à partir de `lg` (les colonnes se touchent, le texte
 * garde sa marge à droite). Aucune hauteur fixe, aucune mesure en JS.
 */
const stepClassName = [
  "relative flex gap-4 pb-8",
  // Trait vertical : sous le marqueur de 40 px, il s'arrête avant le suivant.
  "before:absolute before:top-12 before:bottom-2 before:left-5 before:w-px before:bg-neutral-300",
  "last:pb-0 last:before:hidden",
  // Rangée : le marqueur passe au-dessus du texte et le trait devient horizontal.
  "lg:flex-col lg:gap-6 lg:pr-8 lg:pb-0",
  "lg:before:top-5 lg:before:right-2 lg:before:bottom-auto lg:before:left-12 lg:before:h-px lg:before:w-auto",
].join(" ")

export function StepSequence({
  title,
  description,
  items,
  className,
}: StepSequenceProps) {
  const titleId = useId()
  const columns = items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"

  return (
    <section
      aria-labelledby={titleId}
      className={cn("bg-background py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        <div className="flex flex-col gap-12">
          <header className="flex flex-col gap-4">
            <h2 id={titleId} className="max-w-2xl text-h1 text-balance">
              {title}
            </h2>
            {description && (
              <p className="max-w-2xl text-body text-pretty text-muted-foreground">
                {description}
              </p>
            )}
          </header>

          <ol
            role="list"
            className={cn("grid max-w-xl lg:max-w-none", columns)}
          >
            {items.map((item, index) => (
              <li key={index} className={stepClassName}>
                {/* Décoratif : l'ordre est porté par la liste <ol>. */}
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-body font-semibold text-background"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-col gap-2 pt-2 lg:pt-0">
                  <h3 className="text-h2 leading-tight">{item.title}</h3>
                  <p className="text-body text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </PageContainer>
    </section>
  )
}
