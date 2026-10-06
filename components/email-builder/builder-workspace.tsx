"use client"

import { useEffect, useReducer, useState } from "react"
import { XIcon } from "lucide-react"

import type { BuilderLame } from "@/lib/email-builder/catalog"
import { builderCanRedo, builderCanUndo, builderDocument, builderReducer, createBuilderState } from "@/lib/email-builder/builder-state"
import type { EmailDocument } from "@/lib/email-builder/document"
import type { BuilderRenderResponse } from "@/lib/email-builder/render-handler"

import { AssistantPanel } from "./assistant-panel"
import { BuilderCanvas, type CanvasViewport } from "./builder-canvas"
import { BuilderTopbar } from "./builder-topbar"
import { LameLibraryPanel } from "./lame-library-panel"

type BuilderWorkspaceProps = {
  /** Le document de départ (un vrai email du POC) et son HTML de canvas, rendus côté serveur. */
  initialDocument: EmailDocument
  initialHtml: string
  lames: readonly BuilderLame[]
}

/**
 * Le Builder : un seul état, l'historique d'EmailDocument. Chaque geste de la
 * personne devient UNE opération (`builderReducer` → `applyDocumentOperation`) ;
 * l'interface ne touche jamais aux lames directement. Le canvas affiche le HTML
 * que le serveur rend pour le document courant (vrai renderer) ; annuler et
 * rétablir retrouvent les rendus déjà vus sans nouvel appel.
 *
 * Rien n'est persisté, rien n'est généré : aucun appel de modèle, un rendu
 * serveur par nouveau document seulement.
 */
export function BuilderWorkspace({ initialDocument, initialHtml, lames }: BuilderWorkspaceProps) {
  const [state, dispatch] = useReducer(builderReducer, initialDocument, createBuilderState)
  const [viewport, setViewport] = useState<CanvasViewport>("desktop")
  const [assistantOpen, setAssistantOpen] = useState(true)
  const document = builderDocument(state)
  const key = JSON.stringify(document)

  // HTML déjà rendu, par document. `shownKey` : le dernier rendu reçu pour le document courant (affiché en attendant le suivant).
  const [renders, setRenders] = useState<Record<string, string>>({ [JSON.stringify(initialDocument)]: initialHtml })
  const [shownKey, setShownKey] = useState(JSON.stringify(initialDocument))
  const [renderError, setRenderError] = useState<string | null>(null)
  const current = renders[key]
  const html = current ?? renders[shownKey] ?? initialHtml

  useEffect(() => {
    if (renders[key] !== undefined) return
    const controller = new AbortController()
    fetch("/api/email-builder/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: JSON.parse(key) }), signal: controller.signal })
      .then((response) => response.json() as Promise<BuilderRenderResponse>)
      .then((result) => {
        if (result.status === "success") {
          setRenders((previous) => ({ ...previous, [key]: result.html }))
          setShownKey(key)
          setRenderError(null)
        } else {
          setRenderError(result.issues[0]?.message ?? "L'email n'a pas pu être rendu.")
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRenderError("Le rendu de l'email n'a pas répondu.")
      })
    return () => controller.abort()
  }, [key, renders])

  // Retour discret : disparaît seul, ou à la demande ; ne bloque rien.
  const { notice, noticeKey } = state
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => dispatch({ type: "dismiss-notice" }), notice.tone === "error" ? 7000 : 9000)
    return () => clearTimeout(timer)
  }, [notice, noticeKey])

  const lamesByType = Object.fromEntries(lames.map((lame) => [lame.type, { name: lame.name, surfaceMode: lame.surfaceMode }]))
  const libraryIndex = state.library?.index

  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select, [contenteditable=true]")) return
    if (event.key === "Escape") {
      if (state.library) dispatch({ type: "close-library" })
      else if (state.selectedId) dispatch({ type: "select", blockId: null })
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault()
      dispatch({ type: event.shiftKey ? "redo" : "undo" })
    }
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background" onKeyDown={onKeyDown}>
      <BuilderTopbar
        name={document.config.name}
        canUndo={builderCanUndo(state)}
        canRedo={builderCanRedo(state)}
        viewport={viewport}
        assistantOpen={assistantOpen}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onAddBlock={() => dispatch({ type: "open-library" })}
        onViewport={setViewport}
        onToggleAssistant={() => setAssistantOpen((open) => !open)}
      />

      <div className="relative flex min-h-0 flex-1">
        {state.library && (
          <LameLibraryPanel
            lames={lames}
            where={libraryIndex === undefined ? "Avant les mentions légales et le footer" : `En position ${libraryIndex + 1}`}
            onPick={(lame) => lame.starter && dispatch({ type: "operation", operation: { type: "add-block", blockType: lame.type, slots: lame.starter, ...(libraryIndex === undefined ? {} : { index: libraryIndex }) } })}
            onClose={() => dispatch({ type: "close-library" })}
          />
        )}

        <main aria-label="Canvas de l'email" className="relative flex min-w-0 flex-1 flex-col bg-muted">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-4 pt-8 pb-28">
            <BuilderCanvas
              html={html}
              document={document}
              lames={lamesByType}
              selectedId={state.selectedId}
              viewport={viewport}
              interactive={current !== undefined && !renderError}
              onSelect={(blockId) => dispatch({ type: "select", blockId })}
              onInsert={(index) => dispatch({ type: "open-library", index })}
              onMove={(blockId, toIndex) => dispatch({ type: "operation", operation: { type: "move-block", blockId, toIndex } })}
              onSurface={(blockId, surface) => dispatch({ type: "operation", operation: { type: "set-surface", blockId, surface } })}
              onRemove={(blockId) => dispatch({ type: "operation", operation: { type: "remove-block", blockId } })}
            />
          </div>

          {(notice || renderError) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
              <div
                role={renderError || notice?.tone === "error" ? "alert" : "status"}
                className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg border bg-background px-4 py-3 text-body shadow-lg ${renderError || notice?.tone === "error" ? "border-destructive/40" : ""}`}
              >
                <p className={renderError || notice?.tone === "error" ? "text-destructive" : ""}>{renderError ?? notice?.message}</p>
                {!renderError && (
                  <button type="button" aria-label="Fermer ce message" className="shrink-0 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => dispatch({ type: "dismiss-notice" })}>
                    <XIcon className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        {assistantOpen && <AssistantPanel onClose={() => setAssistantOpen(false)} />}
      </div>
    </div>
  )
}
