"use client"

import { useState } from "react"

import type { EmailBrief } from "@/lib/email/demo-generator"
import type {
  EmailGenerationError,
  EmailGenerationResult,
  EmailGenerationSuccess,
} from "@/lib/email/generation"

import { EmailBriefPanel } from "./email-brief-panel"
import { EmailPreview } from "./email-preview"

type EmailWorkspaceProps = {
  initialBrief: EmailBrief
  initialResult: EmailGenerationResult
  objectives: readonly { value: EmailBrief["objective"]; label: string }[]
  presets: readonly { id: string; label: string; brief: EmailBrief }[]
}

const networkError: EmailGenerationError = {
  status: "error",
  title: "Génération impossible",
  issues: [{ path: "réseau", message: "Le service de génération n'a pas répondu. Réessayez." }],
}

/** Réponse de /api/generate-email (objet produit par `runEmailGeneration`). */
function isGenerationResult(value: unknown): value is EmailGenerationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value.status === "success" || value.status === "error")
  )
}

/**
 * Seule partie client du générateur d'emails : état du brief, appel de
 * POST /api/generate-email, et aperçu du HTML rendu côté serveur.
 */
export function EmailWorkspace({ initialBrief, initialResult, objectives, presets }: EmailWorkspaceProps) {
  const [brief, setBrief] = useState(initialBrief)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<EmailGenerationError | null>(
    initialResult.status === "error" ? initialResult : null
  )
  // Dernier email valide : conservé si une génération échoue.
  const [email, setEmail] = useState<EmailGenerationSuccess | null>(
    initialResult.status === "success" ? initialResult : null
  )
  const [awaitingPreview, setAwaitingPreview] = useState(false)

  async function generate() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      })
      const result: unknown = await response.json()
      if (!isGenerationResult(result)) {
        setError(networkError)
      } else if (result.status === "success") {
        if (result.previewHtml !== email?.previewHtml) setAwaitingPreview(true)
        setEmail(result)
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
    <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside
        aria-label="Brief de l'email"
        className="border-b p-4 lg:w-90 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <EmailBriefPanel
          brief={brief}
          objectives={objectives}
          presets={presets}
          error={error}
          pending={pending}
          onBriefChange={setBrief}
          onGenerate={generate}
        />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <EmailPreview
          html={email?.previewHtml ?? null}
          subject={email?.subject ?? null}
          preheader={email?.preheader ?? null}
          loading={pending || awaitingPreview}
          onLoad={() => setAwaitingPreview(false)}
        />
      </div>
    </div>
  )
}
