"use client"

import { useReducer, useRef, useState } from "react"

import type { EmailGenerationSuccess } from "@/lib/email/generation"
import type { EmailPublicError } from "@/lib/email/generate-handler"
import {
  canGenerateEmail,
  emptyEmailGeneratorForm,
  toEmailRequestBody,
  type EmailGeneratorExample,
  type EmailGeneratorIntent,
  type EmailGeneratorTarget,
} from "@/lib/email/generator-form"
import { postEmailEdit } from "@/lib/email/edit-client"
import {
  canEditEmail,
  currentVersion,
  emailEditorReducer,
  initialEmailEditorState,
} from "@/lib/email/editor-state"
import { toEmailEditBody } from "@/lib/email/editor-state"
import {
  describeGeneratedEmail,
  emailGeneratorReducer,
  emailSubmitLabel,
  initialEmailGeneratorState,
  type EmailGeneratorError,
} from "@/lib/email/generator-state"

import { EmailBriefPanel } from "./email-brief-panel"
import { EmailEditPanel } from "./email-edit-panel"
import { EmailPreview } from "./email-preview"

type EmailWorkspaceProps = {
  intents: readonly { value: EmailGeneratorIntent; label: string; hint: string }[]
  targets: readonly { value: EmailGeneratorTarget; label: string }[]
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
export function EmailWorkspace({ intents, targets, examples }: EmailWorkspaceProps) {
  const [form, setForm] = useState(emptyEmailGeneratorForm)
  const [state, dispatch] = useReducer(emailGeneratorReducer, initialEmailGeneratorState)
  // Garde contre une double soumission avant que l'état « loading » ne soit rendu.
  const inFlight = useRef(false)
  const [awaitingPreview, setAwaitingPreview] = useState(false)
  // Édition conversationnelle : historique local des versions (V1 = la génération), sans persistance.
  const [editor, editorDispatch] = useReducer(emailEditorReducer, initialEmailEditorState)
  const pending = state.status === "loading"
  const editing = editor.status === "editing"
  // La version affichée : une modification ou un retour en arrière change l'aperçu, jamais le formulaire.
  const shown = currentVersion(editor)
  const shownEmail = shown?.email ?? state.email

  async function generate() {
    if (inFlight.current || !canGenerateEmail(form)) return
    inFlight.current = true
    dispatch({ type: "start" })
    // Le corps de cette génération : il redonne au serveur les valeurs protégées à chaque modification.
    const body = toEmailRequestBody(form)
    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = readResult(await response.json())
      if ("status" in result) {
        if (result.previewHtml !== shownEmail?.previewHtml) setAwaitingPreview(true)
        dispatch({ type: "success", email: result })
        editorDispatch({ type: "generated", email: result, generation: body })
      } else {
        dispatch({ type: "failure", error: result })
      }
    } catch {
      dispatch({ type: "failure", error: networkError })
    } finally {
      inFlight.current = false
    }
  }

  /** Une instruction d'édition : un appel, jamais de relance ; une erreur laisse la version affichée telle quelle. */
  async function edit(instruction: string) {
    if (inFlight.current || !canEditEmail(editor)) return false
    inFlight.current = true
    editorDispatch({ type: "edit-start" })
    try {
      const result = await postEmailEdit(toEmailEditBody(editor, instruction))
      if ("email" in result) {
        editorDispatch({ type: "edit-success", email: result.email, instruction: instruction.trim(), summary: result.summary })
        return true
      }
      editorDispatch({ type: "edit-failure", error: result })
      return false
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
        {canEditEmail(editor) && (
          <div className="mb-4">
            <EmailEditPanel
              state={editor}
              generating={pending}
              onEdit={edit}
              onUndo={() => editorDispatch({ type: "undo" })}
              onRedo={() => editorDispatch({ type: "redo" })}
            />
          </div>
        )}
        <EmailBriefPanel
          form={form}
          intents={intents}
          targets={targets}
          examples={examples}
          error={state.error}
          pending={pending}
          canGenerate={canGenerateEmail(form) && !editing}
          submitLabel={emailSubmitLabel(state)}
          onFormChange={setForm}
          onGenerate={generate}
        />
      </aside>

      <div className="flex h-dvh min-w-0 flex-col bg-muted p-4 lg:h-auto lg:flex-1">
        <EmailPreview
          html={shownEmail?.previewHtml ?? null}
          subject={shownEmail?.subject ?? null}
          preheader={shownEmail?.preheader ?? null}
          legend={shownEmail ? `${describeGeneratedEmail(shownEmail)}${shown && editor.versions.length > 1 ? ` · V${shown.number}` : ""}` : null}
          loading={pending || awaitingPreview}
          editing={editing}
          onLoad={() => setAwaitingPreview(false)}
        />
      </div>
    </div>
  )
}
