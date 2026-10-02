import type { LandingPageConfig } from "@/lib/landing/types"

import { LandingFooter } from "./landing-footer"
import { LandingHeader } from "./landing-header"
import { SectionRenderer } from "./section-renderer"

/**
 * Rend une landing page complète à partir de sa configuration : le shell
 * global (header, puis footer en bas), autour des sections de la config. Le shell est
 * automatique et ne fait pas partie de `sections[]`. Les sections s'enchaînent
 * sans largeur, fond ni espacement imposés : chacune gère son propre layout.
 * `config.title` est une métadonnée interne, non affichée.
 */
export function LandingPageRenderer({ config }: { config: LandingPageConfig }) {
  return (
    // Colonne au moins aussi haute que le viewport : `main` absorbe l'espace libre,
    // le footer reste donc en bas d'une page courte, et suit le contenu d'une page longue.
    <div className="flex min-h-dvh flex-col">
      <LandingHeader />
      <main className="flex-1">
        {config.sections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
      </main>
      <LandingFooter />
    </div>
  )
}
