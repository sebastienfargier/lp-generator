"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import type { EmailDocument } from "@/lib/email-builder/document"
import { AUTOSAVE_DELAY_MS, hccLockMessages, lockOfFailure, saveKey, savePhaseLabels, shouldAutosave, unsavedAtLockMessage, type HccEditorLink, type SavePhase } from "@/lib/email-builder/hcc-save"
import type { DocumentStatus } from "@/lib/email-builder/versions"
import type { SaveResponseBody } from "@/lib/hcc/document-handlers"

type HccSaveBarProps = HccEditorLink & {
  document: EmailDocument
  status: DocumentStatus
  empty: boolean
}

type Failure = { kind: "error" | "conflict"; message: string; revision: number | null }

/**
 * Enregistrement du document de travail dans le HCC : automatique après une pause, ou à la demande. Le navigateur
 * n'envoie que le document et la révision connue ; le serveur du Builder ajoute le jeton et la signature.
 *
 * Production verrouillée ou session expirée : plus aucun enregistrement, l'éditeur passe en lecture seule (`onLock`),
 * et la barre dit clairement si des modifications n'ont pas pu être enregistrées. Conflit : remplacer la version du
 * HCC demande une confirmation explicite ; la sauvegarde confirmée reste conditionnée à la révision vue au moment du
 * conflit (le HCC refuse si elle a encore changé).
 */
export function HccSaveBar({ assetId, assetName, saved, onSaved, lock, onLock, hccHome, document, status, empty }: HccSaveBarProps) {
  const key = saveKey(document, status)
  const dirty = key !== saved.key
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [confirming, setConfirming] = useState(false)
  // Une seule écriture à la fois, même si deux déclencheurs arrivent dans le même instant.
  const inFlight = useRef(false)
  const phase: SavePhase = lock ?? (busy ? "saving" : failure ? failure.kind : dirty ? "dirty" : "saved")

  async function save(baseRevision = saved.revision) {
    if (inFlight.current || lock) return
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
        const locked = lockOfFailure(result.code)
        if (locked) {
          setFailure(null)
          onLock(locked)
        } else {
          setFailure({ kind: "error", message: result.message, revision: null })
        }
      }
    } catch {
      setFailure({ kind: "error", message: "Le HCC ne répond pas : réessaie dans un instant.", revision: null })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // Enregistrement automatique après une pause (jamais un email vide, jamais après une erreur, un conflit ou un verrou).
  useEffect(() => {
    if (lock || !shouldAutosave({ dirty, phase, empty, inFlight: busy })) return
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // `save` lit le travail courant : le minuteur repart à chaque modification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dirty, phase, empty, busy, lock])

  // Quitter la page avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, busy])

  if (lock) {
    const message = hccLockMessages[lock]
    return (
      <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-destructive/40 bg-background px-4 py-2 text-caption">
        <div className="min-w-0">
          <p className="font-semibold text-destructive">{message.title}</p>
          <p>{message.text}</p>
          {dirty && <p className="text-destructive">{unsavedAtLockMessage[lock]}</p>}
          <p className="text-muted-foreground">L&apos;email reste affiché en lecture seule.</p>
        </div>
        {hccHome && (
          <Button size="sm" nativeButton={false} render={<a href={hccHome} rel="noopener noreferrer" />}>
            {message.link}
          </Button>
        )}
      </div>
    )
  }

  const tone = failure ? "text-destructive" : phase === "saved" ? "text-muted-foreground" : "text-foreground"
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-1.5 text-caption">
      <p className="min-w-0 truncate text-muted-foreground">
        Création HCC : <span className="font-semibold text-foreground">{assetName || assetId}</span>
        <span className="hidden md:inline"> · le statut de la production et sa validation se gèrent dans le HCC</span>
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
            <Button type="button" size="sm" disabled={busy || failure.revision === null} onClick={() => setConfirming(true)}>
              Garder mes modifications
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant={failure ? "default" : "outline"} disabled={busy || (!dirty && !failure)} onClick={() => void save()}>
            {failure ? "Réessayer" : "Enregistrer dans le HCC"}
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remplacer la version enregistrée dans le HCC ?</DialogTitle>
            <DialogDescription>
              La version enregistrée dans le HCC a changé depuis ton dernier enregistrement. Continuer peut remplacer des modifications faites ailleurs. Si elle change encore d&apos;ici là, le HCC refusera
              l&apos;enregistrement et le conflit sera de nouveau signalé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirming(false)
                if (failure?.kind === "conflict" && failure.revision !== null) void save(failure.revision)
              }}
            >
              Confirmer le remplacement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
