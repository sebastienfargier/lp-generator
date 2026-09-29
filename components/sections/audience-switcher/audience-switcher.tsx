import { PageContainer } from "@/components/layout/page-container"
import { cn } from "@/lib/utils"

import { AudienceTabs } from "./audience-tabs"
import type { AudienceItem } from "./types"

type AudienceSwitcherProps = {
  items: AudienceItem[]
  /** `id` de l'item sélectionné au chargement ; à défaut, le premier. */
  defaultValue?: string
  /** Nom accessible de la section. */
  label?: string
  className?: string
}

export function AudienceSwitcher({
  items,
  defaultValue,
  label,
  className,
}: AudienceSwitcherProps) {
  return (
    <section
      aria-label={label}
      className={cn("bg-neutral-100 py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        <AudienceTabs items={items} defaultValue={defaultValue} />
      </PageContainer>
    </section>
  )
}
