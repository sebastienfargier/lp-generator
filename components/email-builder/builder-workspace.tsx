"use client"

import { useEffect, useMemo, useReducer, useState } from "react"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { BuilderLame } from "@/lib/email-builder/catalog"
import type { BuilderState } from "@/lib/email-builder/builder-state"
import { builderCanRedo, builderCanUndo, builderDocument, builderHasWork, builderIsEmpty, builderReadOnly, builderReducer, builderViewing, createBuilderState, hasChangesSinceVersion, shownDocument } from "@/lib/email-builder/builder-state"
import { statusLabels, versionLabel } from "@/lib/email-builder/versions"
import { isEmptyDocument, type EmailDocument } from "@/lib/email-builder/document"
import { toApiHistory } from "@/lib/email-builder/assistant-chat"
import { compositionCatalog } from "@/lib/email-builder/composition"
import type { AssistantResponseBody } from "@/lib/email-builder/assistant-handler"
import type { BuilderRenderResponse } from "@/lib/email-builder/render-handler"

import { AssistantPanel } from "./assistant-panel"
import { BuilderCanvas, type CanvasViewport } from "./builder-canvas"
import { BuilderTopbar } from "./builder-topbar"
import { EmptyCanvas } from "./empty-canvas"
import { ImagePickerPanel } from "./image-picker-panel"
import { LameLibraryPanel } from "./lame-library-panel"

type BuilderWorkspaceProps = {
  /** Le document de départ : un email vide (partir de zéro) ou celui d'un modèle. Le choisir n'est pas une opération. */
  initialDocument: EmailDocument
  lames: readonly BuilderLame[]
  /** Un premier message de l'assistant : le compte rendu d'une création depuis une référence. */
  initialMessage?: string
  /** Abandonne ce travail et revient au choix de départ (le shell remplace alors le workspace). */
  onRestart: () => void
}

/** La sélection du canvas, telle que l'assistant la reçoit : un indice (lame, éventuellement champ), ou rien. */
const selectionHint = (selection: BuilderState["selection"]) => (selection.kind === "none" ? null : selection.kind === "block" ? { blockId: selection.blockId } : { blockId: selection.blockId, slot: selection.slot })

/**
 * Le Builder : un seul état, l'historique d'EmailDocument. Chaque geste de la
 * personne devient UNE opération (`builderReducer` → `applyDocumentOperation`) ;
 * l'interface ne touche jamais aux lames directement. Le canvas affiche le HTML
 * que le serveur rend pour le document courant (vrai renderer) ; annuler et
 * rétablir retrouvent les rendus déjà vus sans nouvel appel.
 *
 * Un email peut être vide : le canvas affiche alors son état vide (aucun rendu,
 * aucune iframe). Rien n'est persisté, rien n'est généré : aucun appel de modèle,
 * un rendu serveur par nouveau document non vide seulement.
 */
export function BuilderWorkspace({ initialDocument, initialMessage, lames, onRestart }: BuilderWorkspaceProps) {
  const [state, dispatch] = useReducer(builderReducer, { document: initialDocument, message: initialMessage }, ({ document: start, message }) => createBuilderState(start, message))
  const [viewport, setViewport] = useState<CanvasViewport>("desktop")
  const [assistantOpen, setAssistantOpen] = useState(true)
  // `document` : le TRAVAIL (opérations, bibliothèque, banque d'images). `shown` : ce que le canvas affiche, le même en travail, le snapshot d'une version en consultation.
  const document = builderDocument(state)
  const shown = shownDocument(state)
  const viewing = builderViewing(state)
  const readOnly = builderReadOnly(state)
  const empty = builderIsEmpty(state)
  const shownEmpty = isEmptyDocument(shown)
  const key = JSON.stringify(shown)

  // HTML déjà rendu, par document. `shownKey` : le dernier rendu reçu (affiché en attendant le suivant).
  const [renders, setRenders] = useState<Record<string, string>>({})
  const [shownKey, setShownKey] = useState<string | null>(null)
  const [renderFailure, setRenderError] = useState<string | null>(null)
  const renderError = shownEmpty ? null : renderFailure
  const current = renders[key]
  const html = current ?? (shownKey === null ? undefined : renders[shownKey])

  useEffect(() => {
    // Un email vide n'a pas de rendu : le renderer n'est jamais appelé.
    if (shownEmpty || renders[key] !== undefined) return
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
  }, [key, renders, shownEmpty])

  // Retour discret : disparaît seul, ou à la demande ; ne bloque rien.
  const { notice, noticeKey } = state
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => dispatch({ type: "dismiss-notice" }), notice.tone === "error" ? 7000 : 9000)
    return () => clearTimeout(timer)
  }, [notice, noticeKey])

  const catalog = useMemo(() => compositionCatalog(lames), [lames])
  const lamesByType = Object.fromEntries(lames.map((lame) => [lame.type, { name: lame.name, surfaceMode: lame.surfaceMode }]))
  const panel = state.panel
  const libraryIndex = panel?.kind === "library" ? panel.index : undefined
  const imageBlock = panel?.kind === "images" ? document.config.blocks.find((block) => block.id === panel.blockId) : undefined

  /**
   * Un message à l'assistant : le SEUL déclencheur d'un appel. Le document envoyé est le
   * travail COURANT au moment de l'envoi (jamais celui d'un message précédent). La réponse
   * arrive comme message, avec une éventuelle proposition : rien n'est appliqué ici.
   */
  async function sendToAssistant(text: string) {
    if (state.assistant.pending || readOnly || empty || text.trim() === "") return
    const history = toApiHistory(state.assistant)
    // Développement : `?assistant=mock` simule l'assistant (aucun appel Anthropic) ; le serveur l'ignore en production.
    const devMock = new URLSearchParams(window.location.search).get("assistant") === "mock"
    dispatch({ type: "assistant-send", text })
    try {
      const response = await fetch("/api/email-builder/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, history, message: text.trim(), selection: selectionHint(state.selection), ...(devMock ? { devMock: true } : {}) }) })
      const result = (await response.json()) as AssistantResponseBody
      if (result.status === "success") dispatch({ type: "assistant-reply", message: result.message, ...(result.proposal ? { proposal: result.proposal } : {}) })
      else dispatch({ type: "assistant-fail", message: result.message })
    } catch {
      dispatch({ type: "assistant-fail", message: "L'assistant n'a pas répondu. Réessaie dans un instant." })
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.closest("input, textarea, select")) return
    if (event.key === "Escape") {
      dispatch({ type: "escape" })
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault()
      dispatch({ type: event.shiftKey ? "redo" : "undo" })
    }
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background" onKeyDown={onKeyDown}>
      <BuilderTopbar
        name={shown.config.name}
        status={viewing ? viewing.status : state.status}
        readOnly={readOnly}
        versions={state.versions}
        baseId={state.baseId}
        viewingId={state.viewingId}
        changedSinceVersion={hasChangesSinceVersion(state)}
        empty={empty}
        confirmRestart={builderHasWork(state)}
        onRestart={onRestart}
        onStatus={(status) => dispatch({ type: "set-status", status })}
        onViewVersion={(id) => dispatch({ type: "view-version", id })}
        onExitView={() => dispatch({ type: "exit-view" })}
        onSaveVersion={(name) => dispatch({ type: "save-version", name, at: new Date().toISOString() })}
        canUndo={!readOnly && builderCanUndo(state)}
        canRedo={!readOnly && builderCanRedo(state)}
        viewport={viewport}
        assistantOpen={assistantOpen}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onAddBlock={() => dispatch({ type: "open-library" })}
        onViewport={setViewport}
        onToggleAssistant={() => setAssistantOpen((open) => !open)}
      />

      <div className="relative flex min-h-0 flex-1">
        {panel?.kind === "library" && (
          <LameLibraryPanel
            lames={lames}
            where={empty ? "Ce sera la première lame de l'email" : libraryIndex === undefined ? "Avant les mentions légales et le footer" : `En position ${libraryIndex + 1}`}
            onPick={(lame) => lame.starter && dispatch({ type: "operation", operation: { type: "add-block", blockType: lame.type, slots: lame.starter, ...(libraryIndex === undefined ? {} : { index: libraryIndex }) } })}
            onClose={() => dispatch({ type: "close-panel" })}
          />
        )}
        {panel?.kind === "images" && imageBlock && (
          <ImagePickerPanel
            blockType={imageBlock.type}
            currentSrc={(imageBlock as unknown as { slots: Record<string, { src?: string }> }).slots[panel.slot]?.src}
            onPick={(imageId) => dispatch({ type: "operation", operation: { type: "set-image", blockId: panel.blockId, slot: panel.slot, imageId } })}
            onClose={() => dispatch({ type: "close-panel" })}
          />
        )}

        <main aria-label="Canvas de l'email" className="relative flex min-w-0 flex-1 flex-col bg-muted">
          {viewing && (
            <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-accent-1 px-4 py-2 text-body text-neutral-900">
              <p className="min-w-0">
                <span className="font-semibold">Vous consultez {versionLabel(viewing)}</span>
                <span className="text-caption"> · enregistrée en {statusLabels[viewing.status]} · lecture seule</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "exit-view" })}>
                  Travail actuel
                </Button>
                <Button type="button" size="sm" onClick={() => dispatch({ type: "restart-from", id: viewing.id })}>
                  Repartir de cette version
                </Button>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-4 pt-8 pb-28">
            {shownEmpty ? (
              <EmptyCanvas onAddFirst={() => dispatch({ type: "open-library" })} />
            ) : html === undefined ? (
              <p role="status" className="mx-auto max-w-sm py-12 text-center text-body text-muted-foreground">
                Préparation de l&apos;aperçu…
              </p>
            ) : (
              <BuilderCanvas
                html={html}
                document={shown}
                lames={lamesByType}
                selection={state.selection}
                viewport={viewport}
                interactive={!renderError}
                readOnly={readOnly}
                onSelectBlock={(blockId) => dispatch({ type: "select-block", blockId })}
                onSelectElement={(blockId, slot) => dispatch({ type: "select-element", blockId, slot })}
                onStartEdit={(blockId, slot) => dispatch({ type: "start-edit", blockId, slot })}
                onCommitEdit={(blockId, slot, draft) => dispatch({ type: "commit-edit", blockId, slot, draft })}
                onCancelEdit={() => dispatch({ type: "escape" })}
                onReplaceImage={(blockId, slot) => dispatch({ type: "open-images", blockId, slot })}
                onInsert={(index) => dispatch({ type: "open-library", index })}
                onMove={(blockId, toIndex) => dispatch({ type: "operation", operation: { type: "move-block", blockId, toIndex } })}
                onSurface={(blockId, surface) => dispatch({ type: "operation", operation: { type: "set-surface", blockId, surface } })}
                onRemove={(blockId) => dispatch({ type: "operation", operation: { type: "remove-block", blockId } })}
              />
            )}
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

        {assistantOpen && (
          <AssistantPanel
            messages={state.assistant.messages}
            pending={state.assistant.pending}
            readOnly={readOnly}
            empty={empty}
            document={document}
            blockName={(type) => lamesByType[type]?.name ?? type}
            onSend={sendToAssistant}
            onApply={(id) => dispatch({ type: "apply-proposal", id, catalog })}
            catalog={catalog}
            onIgnore={(id) => dispatch({ type: "ignore-proposal", id })}
            onClose={() => setAssistantOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
