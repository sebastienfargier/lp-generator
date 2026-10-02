import { useId } from "react"
import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { PageContainer } from "@/components/layout/page-container"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DestinationCardItem = {
  title: string
  description: string
  href: string
}

export type DestinationCardsProps = {
  title: string
  description?: string
  /** Deux ou trois suites, chacune vers une destination différente. */
  items: DestinationCardItem[]
  className?: string
}

/**
 * Plusieurs suites pour poursuivre l'exploration, sans image. Toute la carte
 * est cliquable par un lien étiré porté par le titre (même pattern que
 * `ProductCard`) : un seul lien par carte, au nom accessible court.
 */
function DestinationCard({ title, description, href }: DestinationCardItem) {
  return (
    <Card className="relative h-full gap-4 rounded-xl ring-0 transition-shadow hover:shadow-lg hover:shadow-foreground/5 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 motion-reduce:transition-none">
      <CardHeader className="gap-3">
        <CardTitle role="heading" aria-level={3}>
          <Link
            href={href}
            className="outline-none after:absolute after:inset-0"
          >
            {title}
          </Link>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {/* `mt-auto` aligne les flèches en bas quand les textes n'ont pas la même longueur. */}
      <CardContent className="mt-auto">
        <ArrowRightIcon
          aria-hidden
          className="size-5 shrink-0 text-foreground transition-transform group-hover/card:translate-x-1 motion-reduce:transition-none"
        />
      </CardContent>
    </Card>
  )
}

export function DestinationCards({
  title,
  description,
  items,
  className,
}: DestinationCardsProps) {
  const titleId = useId()
  // Deux cartes : deux colonnes aussi à `lg`, pas de troisième colonne vide.
  const columns = items.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"

  return (
    <section
      aria-labelledby={titleId}
      className={cn("bg-neutral-100 py-8 text-foreground md:py-12", className)}
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

          <ul role="list" className={cn("grid gap-6 sm:grid-cols-2", columns)}>
            {items.map((item) => (
              <li key={item.href}>
                <DestinationCard {...item} />
              </li>
            ))}
          </ul>
        </div>
      </PageContainer>
    </section>
  )
}
