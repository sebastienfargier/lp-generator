"use client"

import { startTransition, useActionState, useState } from "react"

import { generateLandingPageAction } from "@/app/generator/actions"
import type {
  GenerationResult,
  GeneratorBrief,
} from "@/lib/generator/generate"

import { GeneratorPanel } from "./generator-panel"
import { LandingPreview } from "./landing-preview"

type GeneratorWorkspaceProps = {
  initialBrief: GeneratorBrief
  initialResult: GenerationResult
  objectives: readonly { value: GeneratorBrief["objective"]; label: string }[]
}

/**
 * Seule partie client du générateur : état du brief, appel de la Server
 * Function et pilotage de l'iframe d'aperçu. La landing page elle-même reste
 * rendue côté serveur, dans le document chargé par l'iframe.
 */
export function GeneratorWorkspace({
  initialBrief,
  initialResult,
  objectives,
}: GeneratorWorkspaceProps) {
  const [brief, setBrief] = useState(initialBrief)
  const [result, generate, pending] = useActionState(
    generateLandingPageAction,
    initialResult
  )
  // Vrai entre un clic sur Générer et le chargement du nouvel aperçu.
  const [awaitingPreview, setAwaitingPreview] = useState(false)

  const previewSrc =
    result.status === "success"
      ? `/generator/preview?revision=${result.revision}`
      : null

  return (
    <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside
        aria-label="Brief de la landing page"
        className="border-b p-4 lg:w-90 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <GeneratorPanel
          brief={brief}
          objectives={objectives}
          result={result}
          pending={pending}
          onBriefChange={setBrief}
          onGenerate={() => {
            setAwaitingPreview(true)
            startTransition(() => generate(brief))
          }}
        />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <LandingPreview
          src={previewSrc}
          fullscreenHref="/examples/generated-landing"
          loading={pending || (awaitingPreview && previewSrc !== null)}
          onLoad={() => setAwaitingPreview(false)}
        />
      </div>
    </div>
  )
}
