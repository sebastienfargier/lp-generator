"use client"

import { useState } from "react"

import type { GeneratorBrief } from "@/lib/landing/brief"

import { GeneratorPanel } from "./generator-panel"
import { LandingPreview } from "./landing-preview"

type GeneratorWorkspaceProps = {
  initialBrief: GeneratorBrief
  objectives: readonly { value: string; label: string }[]
}

/**
 * Partie client du générateur : état du brief et zone d'aperçu. Aucune
 * génération n'est branchée pour l'instant : le moteur Claude arrive au
 * checkpoint suivant, l'aperçu reste vide.
 */
export function GeneratorWorkspace({ initialBrief, objectives }: GeneratorWorkspaceProps) {
  const [brief, setBrief] = useState(initialBrief)

  return (
    <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside
        aria-label="Brief de la landing page"
        className="border-b p-4 lg:w-90 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <GeneratorPanel brief={brief} objectives={objectives} onBriefChange={setBrief} />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <LandingPreview src={null} fullscreenHref={null} loading={false} onLoad={() => {}} />
      </div>
    </div>
  )
}
