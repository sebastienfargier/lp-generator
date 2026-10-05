"use client"

import { useReducer, useRef, useState } from "react"

import type { EmailGenerationSuccess } from "@/lib/email/generation"
import type { EmailPublicError } from "@/lib/email/generate-handler"
import {
  canGenerateEmail,
  emptyEmailGeneratorForm,
  toEmailRequestBody,
  type EmailGeneratorExample,
  type EmailGeneratorForm,
} from "@/lib/email/generator-form"
import {
  describeGeneratedEmail,
  emailGeneratorReducer,
  emailSubmitLabel,
  initialEmailGeneratorState,
  type EmailGeneratorError,
} from "@/lib/email/generator-state"

import { EmailBriefPanel } from "./email-brief-panel"
import { EmailPreview } from "./email-preview"

type EmailWorkspaceProps = {
  objectives: readonly { value: EmailGeneratorForm["objective"]; label: string }[]
  examples: readonly EmailGeneratorExample[]
}

const networkError: EmailGeneratorError = { code: "network", issues: [] }

/** Réponse de /api/generate-email : un email rendu, ou une erreur publique avec son code. */
function readResult(value: unknown): EmailGenerationSuccess | EmailGeneratorError {
  if (typeof value === "object" && value !== null && "status" in value) {
    if (value.status === "success") return value as EmailGenerationSuccess
    if (value.status === "error") {
      const { code, issues } = value as Partial<EmailPublicError>
      return { code: code ?? "internal", issues: Array.isArray(issues) ? issues : [] }
    }
  }
  return networkError
}

/**
 * Seule partie client du générateur d'emails : le formulaire, UN appel à
 * `POST /api/generate-email` par clic, et le dernier email valide, affiché par
 * l'aperçu. Aucune génération au chargement, aucune relance automatique, aucun
 * exemple qui génère : choisir un exemple ou changer de largeur ne fait aucune
 * requête. Le secret Anthropic reste côté serveur : ce composant ne connaît
 * que la route.
 */
export function EmailWorkspace({ objectives, examples }: EmailWorkspaceProps) {
  const [form, setForm] = useState(emptyEmailGeneratorForm)
  const [state, dispatch] = useReducer(emailGeneratorReducer, initialEmailGeneratorState)
  // Garde contre une double soumission avant que l'état « loading » ne soit rendu.
  const inFlight = useRef(false)
  const [awaitingPreview, setAwaitingPreview] = useState(false)
  const pending = state.status === "loading"

  async function generate() {
    if (inFlight.current || !canGenerateEmail(form)) return
    inFlight.current = true
    dispatch({ type: "start" })
    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toEmailRequestBody(form)),
      })
      const result = readResult(await response.json())
      if ("status" in result) {
        if (result.previewHtml !== state.email?.previewHtml) setAwaitingPreview(true)
        dispatch({ type: "success", email: result })
      } else {
        dispatch({ type: "failure", error: result })
      }
    } catch {
      dispatch({ type: "failure", error: networkError })
    } finally {
      inFlight.current = false
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-row">
      <aside
        aria-label="Brief de l'email"
        className="border-b p-4 lg:w-90 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <EmailBriefPanel
          form={form}
          objectives={objectives}
          examples={examples}
          error={state.error}
          pending={pending}
          canGenerate={canGenerateEmail(form)}
          submitLabel={emailSubmitLabel(state)}
          onFormChange={setForm}
          onGenerate={generate}
        />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <EmailPreview
          html={state.email?.previewHtml ?? null}
          subject={state.email?.subject ?? null}
          preheader={state.email?.preheader ?? null}
          legend={state.email ? describeGeneratedEmail(state.email) : null}
          loading={pending || awaitingPreview}
          onLoad={() => setAwaitingPreview(false)}
        />
      </div>
    </div>
  )
}
