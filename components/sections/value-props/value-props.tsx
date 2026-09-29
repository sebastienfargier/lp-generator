import { PageContainer } from "@/components/layout/page-container"
import { cn } from "@/lib/utils"

export type ValuePropItem = {
  title: string
  description: string
}

type ValuePropsProps = {
  items: ValuePropItem[]
  /** Nom accessible de la section (ex. "Pourquoi nous choisir"). */
  label?: string
  className?: string
}

export function ValueProps({ items, label, className }: ValuePropsProps) {
  return (
    <section
      aria-label={label}
      className={cn("bg-background py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        {/*
          Mobile : 1 colonne, séparateurs horizontaux entre les items.
          Tablette : 2 colonnes, séparateur vertical devant chaque item pair.
          Desktop : une seule ligne de colonnes égales (quel que soit le nombre
          d'items), séparateur vertical devant chaque item sauf le premier.
        */}
        <ul
          role="list"
          className="grid gap-6 sm:grid-cols-2 sm:gap-x-0 sm:gap-y-8 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none"
        >
          {items.map((item, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 not-first:border-t not-first:pt-6 sm:pr-8 sm:not-first:border-t-0 sm:not-first:pt-0 sm:nth-[2n]:border-l sm:nth-[2n]:pl-8 lg:not-first:border-l lg:not-first:pl-12"
            >
              <h3 className="text-h2 leading-tight">{item.title}</h3>
              <p className="text-body text-muted-foreground">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </PageContainer>
    </section>
  )
}
