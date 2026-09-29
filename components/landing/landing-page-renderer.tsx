import type { LandingPageConfig } from "@/lib/landing/types"

import { SectionRenderer } from "./section-renderer"

/**
 * Rend une landing page complète à partir de sa configuration. Les sections
 * s'enchaînent sans largeur, fond ni espacement imposés : chacune gère son
 * propre layout. `config.title` est une métadonnée interne, non affichée.
 */
export function LandingPageRenderer({ config }: { config: LandingPageConfig }) {
  return (
    <main>
      {config.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </main>
  )
}
