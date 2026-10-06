"use client"

import { useCallback, useState } from "react"
import { Redo2Icon, Undo2Icon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  canRedo,
  canSendEditInstruction,
  canUndo,
  describeEmailEditError,
  emailEditInstructionMaxLength,
  emailEditPlaceholder,
  emailQuickAdjustments,
  versionLabel,
  type EmailEditorState,
} from "@/lib/email/editor-state"

type EmailEditPanelProps = {
  state: EmailEditorState
  /** Une génération est en cours : les commandes d'édition attendent. */
  generating: boolean
  /** Envoie une instruction ; renvoie `true` si l'email a été modifié (le champ se vide alors). */
  onEdit: (instruction: string) => Promise<boolean>
  onUndo: () => void
  onRedo: () => void
}

/**
 * « Modifier l'email » : ajustements rapides, instruction libre, historique
 * local. Ce n'est pas un chatbot : un champ d'instruction qui modifie les TEXTES
 * de l'email courant. Valeurs de l'offre, chiffres, liens, images et mentions
 * légales ne se modifient pas ici. Pendant une modification, l'aperçu reste
 * affiché et les commandes sont désactivées ; une erreur n'ajoute aucune version.
 */
export function EmailEditPanel({ state, generating, onEdit, onUndo, onRedo }: EmailEditPanelProps) {
  const [instruction, setInstruction] = useState("")
  const editing = state.status === "editing"
  const busy = editing || generating
  const error = state.error ? describeEmailEditError(state.error) : null
  // À l'apparition du panneau (première génération réussie), la colonne revient à lui : le formulaire, plus bas, a le focus de l'utilisateur.
  const reveal = useCallback((node: HTMLElement | null) => node?.scrollIntoView({ block: "start" }), [])

  async function send(text: string) {
    if (busy || !canSendEditInstruction(text)) return
    if (await onEdit(text)) setInstruction("")
  }

  return (
    <section ref={reveal} aria-labelledby="email-edit-title" className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
      <header className="flex flex-col gap-1">
        <h2 id="email-edit-title" className="text-body font-semibold">
          Modifier l&apos;email
        </h2>
        <p className="text-caption text-muted-foreground">
          Demandez un changement de texte. L&apos;offre, les chiffres, les liens, les visuels et les mentions légales restent ceux de l&apos;email.
        </p>
      </header>

      <div role="group" aria-label="Ajustements rapides" className="flex flex-wrap gap-2">
        {emailQuickAdjustments.map((adjustment) => (
          <Button key={adjustment.id} type="button" size="xs" variant="outline" disabled={busy} onClick={() => send(adjustment.instruction)}>
            {adjustment.label}
          </Button>
        ))}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send(instruction)
        }}
      >
        <Field>
          <FieldLabel htmlFor="email-edit-instruction">Votre instruction</FieldLabel>
          <Textarea
            id="email-edit-instruction"
            rows={3}
            className="min-h-20"
            maxLength={emailEditInstructionMaxLength}
            placeholder={emailEditPlaceholder}
            disabled={busy}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </Field>
        <Button type="submit" size="sm" disabled={busy || !canSendEditInstruction(instruction)} aria-busy={editing}>
          {editing && <Spinner data-icon="inline-start" aria-label="Modification en cours" />}
          {editing ? "Modification…" : "Envoyer"}
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-2">
        {editing && <p className="text-caption text-muted-foreground">Modification en cours : l&apos;aperçu actuel reste affiché.</p>}
        {state.notice && !editing && (
          <p className="text-caption font-medium">
            {state.notice}
            {state.versions[state.index]?.summary ? ` : ${state.versions[state.index]!.summary}` : ""}
          </p>
        )}
        {error && !editing && (
          <Alert variant="destructive">
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Historique</h3>
          <div className="flex gap-1">
            <Button type="button" size="xs" variant="outline" disabled={!canUndo(state) || generating} onClick={onUndo}>
              <Undo2Icon data-icon="inline-start" aria-hidden />
              Annuler
            </Button>
            <Button type="button" size="xs" variant="outline" disabled={!canRedo(state) || generating} onClick={onRedo}>
              <Redo2Icon data-icon="inline-start" aria-hidden />
              Rétablir
            </Button>
          </div>
        </div>
        <ol aria-label="Versions de l'email" className="flex flex-col gap-1 text-caption">
          {state.versions.map((version, index) => (
            <li
              key={version.number}
              aria-current={index === state.index ? "true" : undefined}
              className={index === state.index ? "font-semibold" : index > state.index ? "text-muted-foreground/60" : "text-muted-foreground"}
            >
              {versionLabel(version)}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
