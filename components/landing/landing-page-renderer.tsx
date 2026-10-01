import type { LandingPageConfig } from "@/lib/landing/types"

import { LandingHeader } from "./landing-header"
import { SectionRenderer } from "./section-renderer"

/**
 * Rend une landing page complète à partir de sa configuration : le shell
 * global (header, futur footer), puis les sections de la config. Le shell est
 * automatique et ne fait pas partie de `sections[]`. Les sections s'enchaînent
 * sans largeur, fond ni espacement imposés : chacune gère son propre layout.
 * `config.title` est une métadonnée interne, non affichée.
 */
export function LandingPageRenderer({ config }: { config: LandingPageConfig }) {
  return (
    <>
      <LandingHeader />
      <main>
        {config.sections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
      </main>
    </>
  )
}
