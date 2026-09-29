import { useId } from "react"

import { PageContainer } from "@/components/layout/page-container"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type PillarItem = {
  title: string
  description: string
}

type PillarsSectionProps = {
  eyebrow?: string
  title: string
  description?: string
  items: PillarItem[]
  className?: string
}

function PillarCard({ item, index }: { item: PillarItem; index: number }) {
  return (
    <Card size="lg" className="h-full gap-8 rounded-xl shadow-none">
      {/* Décoratif : la numérotation est déjà portée par la liste <ol>. */}
      <span
        aria-hidden
        className="px-(--card-spacing) text-display text-neutral-300"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <CardHeader className="gap-3">
        <CardTitle role="heading" aria-level={3} className="leading-tight">
          {item.title}
        </CardTitle>
        <CardDescription>{item.description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

export function PillarsSection({
  eyebrow,
  title,
  description,
  items,
  className,
}: PillarsSectionProps) {
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className={cn("bg-background py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        <div className="flex flex-col gap-12">
          <header className="flex flex-col gap-4">
            {eyebrow && (
              <p className="text-caption tracking-wider text-muted-foreground uppercase">
                {eyebrow}
              </p>
            )}
            <h2 id={titleId} className="max-w-4xl text-h1 sm:text-display">
              {title}
            </h2>
            {description && (
              <p className="max-w-2xl text-body text-pretty text-muted-foreground">
                {description}
              </p>
            )}
          </header>

          <ol role="list" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <li key={index}>
                <PillarCard item={item} index={index} />
              </li>
            ))}
          </ol>
        </div>
      </PageContainer>
    </section>
  )
}
