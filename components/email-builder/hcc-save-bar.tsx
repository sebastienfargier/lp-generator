"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

import type { EmailDocument } from "@/lib/email-builder/document"
import { AUTOSAVE_DELAY_MS, saveKey, savePhaseLabels, shouldAutosave, type HccSaved, type SavePhase } from "@/lib/email-builder/hcc-save"
import type { DocumentStatus } from "@/lib/email-builder/versions"
import type { SaveResponseBody } from "@/lib/hcc/document-handlers"

type HccSaveBarProps = {
  assetId: string
  assetName: string
  /** Ce que le HCC contient (révision, empreinte) : tenu par le shell, survit à « Recommencer ». */
  saved: HccSaved
  onSaved: (saved: HccSaved) => void
  document: EmailDocument
  status: DocumentStatus
  empty: boolean
}

type Failure = { kind: "error" | "conflict"; message: string; revision: number | null }

/**
 * Enregistrement du document de travail dans le HCC : automatique après une pause, ou à la demande. Le navigateur
 * n'envoie que le document et la révision connue ; le serveur du Builder ajoute le jeton et la signature.
 */
export function HccSaveBar({ assetId, assetName, saved, onSaved, document, status, empty }: HccSaveBarProps) {
  const key = saveKey(document, status)
  const dirty = key !== saved.key
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  // Une seule écriture à la fois, même si deux déclencheurs arrivent dans le même instant.
  const inFlight = useRef(false)
  const phase: SavePhase = busy ? "saving" : failure ? failure.kind : dirty ? "dirty" : "saved"

  async function save(baseRevision = saved.revision) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const sentKey = key
    try {
      const response = await fetch("/api/email-builder/hcc/document", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, baseRevision, statutEditorial: status, document }),
      })
      const result = (await response.json()) as SaveResponseBody
      if (result.status === "saved") {
        setFailure(null)
        onSaved({ revision: result.revision, key: sentKey })
      } else if (result.status === "conflict") {
        setFailure({ kind: "conflict", message: result.message, revision: result.revision })
      } else {
        setFailure({ kind: "error", message: result.message, revision: null })
      }
    } catch {
      setFailure({ kind: "error", message: "Le HCC ne répond pas : réessaie dans un instant.", revision: null })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // Enregistrement automatique après une pause (jamais un email vide, jamais après une erreur ou un conflit).
  useEffect(() => {
    if (!shouldAutosave({ dirty, phase, empty, inFlight: busy })) return
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // `save` lit le travail courant : le minuteur repart à chaque modification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dirty, phase, empty, busy])

  // Quitter la page avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, busy])

  const tone = failure ? "text-destructive" : phase === "saved" ? "text-muted-foreground" : "text-foreground"
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-1.5 text-caption">
      <p className="min-w-0 truncate text-muted-foreground">
        Création HCC : <span className="font-semibold text-foreground">{assetName || assetId}</span>
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <p role="status" aria-live="polite" className={tone}>
          {savePhaseLabels[phase]}
          {failure ? ` — ${failure.message}` : ""}
        </p>
        {failure?.kind === "conflict" ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => window.confirm("Recharger le document du HCC ? Tes modifications non enregistrées seront perdues.") && window.location.reload()}>
              Recharger depuis le HCC
            </Button>
            <Button type="button" size="sm" disabled={busy || failure.revision === null} onClick={() => failure.revision !== null && void save(failure.revision)}>
              Garder mes modifications
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant={failure ? "default" : "outline"} disabled={busy || (!dirty && !failure)} onClick={() => void save()}>
            {failure ? "Réessayer" : "Enregistrer dans le HCC"}
          </Button>
        )}
      </div>
    </div>
  )
}
