"use client"

import { useReducer, useRef, useState } from "react"

import type { GeneratorBrief } from "@/lib/landing/brief"
import { requestLandingGeneration } from "@/lib/landing/generate-client"
import { canGenerate, generatorReducer, initialGeneratorState } from "@/lib/landing/generator-state"

import { GeneratorPanel } from "./generator-panel"
import { LandingPreview } from "./landing-preview"

type GeneratorWorkspaceProps = {
  initialBrief: GeneratorBrief
  objectives: readonly { value: string; label: string }[]
}

/**
 * Partie client du générateur : le brief, UN appel à `POST /api/generate` par
 * clic, et la dernière configuration valide, affichée par le vrai renderer.
 * Aucune génération au chargement, aucune relance automatique, aucune
 * génération déclenchée par l'aperçu (changer de viewport ne fait aucune
 * requête). Le secret Anthropic reste côté serveur : ce composant ne connaît
 * que la route.
 */
export function GeneratorWorkspace({ initialBrief, objectives }: GeneratorWorkspaceProps) {
  const [brief, setBrief] = useState(initialBrief)
  const [state, dispatch] = useReducer(generatorReducer, initialGeneratorState)
  // Garde contre une double soumission avant que l'état « loading » ne soit rendu.
  const inFlight = useRef(false)
  const pending = state.status === "loading"

  async function generate() {
    if (inFlight.current || !canGenerate(brief)) return
    inFlight.current = true
    dispatch({ type: "start" })
    try {
      const outcome = await requestLandingGeneration(brief)
      dispatch(outcome.status === "success" ? { type: "success", config: outcome.config } : { type: "failure", error: outcome.error })
    } finally {
      inFlight.current = false
    }
  }

  return (
    <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside
        aria-label="Brief de la landing page"
        className="border-b p-4 lg:w-90 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <GeneratorPanel
          brief={brief}
          objectives={objectives}
          error={state.error}
          pending={pending}
          canGenerate={canGenerate(brief)}
          onBriefChange={setBrief}
          onGenerate={generate}
        />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <LandingPreview config={state.config} loading={pending} />
      </div>
    </div>
  )
}
