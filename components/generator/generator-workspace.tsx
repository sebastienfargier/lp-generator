"use client"

import { useState } from "react"

import type {
  GenerationError,
  GenerationResult,
  GeneratorBrief,
} from "@/lib/generator/generate"

import { GeneratorPanel } from "./generator-panel"
import { LandingPreview } from "./landing-preview"

type GeneratorWorkspaceProps = {
  initialBrief: GeneratorBrief
  initialResult: GenerationResult
  objectives: readonly { value: string; label: string }[]
}

const networkError: GenerationError = {
  status: "error",
  title: "Génération impossible",
  issues: [
    {
      path: "réseau",
      message: "Le service de génération n'a pas répondu. Réessayez.",
    },
  ],
}

/** Réponse de /api/generate (objet JSON produit par `runGeneration`). */
function isGenerationResult(value: unknown): value is GenerationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value.status === "success" || value.status === "error")
  )
}

/**
 * Seule partie client du générateur : état du brief, appel de POST
 * /api/generate et pilotage de l'iframe d'aperçu. La landing page reste rendue
 * côté serveur, dans le document chargé par l'iframe.
 */
export function GeneratorWorkspace({
  initialBrief,
  initialResult,
  objectives,
}: GeneratorWorkspaceProps) {
  const [brief, setBrief] = useState(initialBrief)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<GenerationError | null>(
    initialResult.status === "error" ? initialResult : null
  )
  // Dernier aperçu valide : conservé si une génération échoue.
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialResult.status === "success" ? initialResult.previewUrl : null
  )
  const [awaitingPreview, setAwaitingPreview] = useState(false)

  async function generate() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      })
      const result: unknown = await response.json()
      if (!isGenerationResult(result)) {
        setError(networkError)
      } else if (result.status === "success") {
        setAwaitingPreview(true)
        setPreviewUrl(result.previewUrl)
      } else {
        setError(result)
      }
    } catch {
      setError(networkError)
    } finally {
      setPending(false)
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
          error={error}
          pending={pending}
          onBriefChange={setBrief}
          onGenerate={generate}
        />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <LandingPreview
          src={previewUrl}
          fullscreenHref={previewUrl}
          loading={pending || (awaitingPreview && previewUrl !== null)}
          onLoad={() => setAwaitingPreview(false)}
        />
      </div>
    </div>
  )
}
