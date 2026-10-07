"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, ImageIcon, Trash2Icon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { EmailDocument } from "@/lib/email-builder/document"
import type { ReferenceResponseBody } from "@/lib/email-builder/reference-handler"
import { referenceReportMessage } from "@/lib/email-builder/reference-report"
import { referenceLimits } from "@/lib/email-builder/reference-file"

import { prepareReferenceImage, type PreparedReference } from "./reference-image"

type ReferenceScreenProps = {
  onBack: () => void
  /** Le document créé et le compte rendu (premier message du nouveau workspace). */
  onCreated: (document: EmailDocument, intro: string) => void
}

type Chosen = { image: PreparedReference; previewUrl: string }

/**
 * « Depuis une référence » : déposer ou choisir UNE capture (PNG, JPEG, WebP), la
 * voir, puis « Analyser et créer ». Pas d'étape intermédiaire : l'email créé arrive
 * directement dans le Builder, qui est le lieu des corrections. L'image reste en
 * mémoire le temps de la requête : rien n'est stocké.
 *
 * Développement : `?reference=mock` demande une analyse simulée (aucun appel
 * Anthropic) ; le serveur l'ignore en production.
 */
export function ReferenceScreen({ onBack, onCreated }: ReferenceScreenProps) {
  const input = useRef<HTMLInputElement>(null)
  // Verrou SYNCHRONE contre la double soumission : l'état React ne se met à jour qu'après le geste ; ce verrou, lui, vaut dès le premier appel.
  const busy = useRef(false)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [dragging, setDragging] = useState(false)

  // L'aperçu est une URL locale (jamais envoyée) : libérée dès qu'elle ne sert plus.
  useEffect(() => () => (chosen ? URL.revokeObjectURL(chosen.previewUrl) : undefined), [chosen])

  async function choose(file: File | undefined) {
    if (!file || analyzing || busy.current) return
    setError(null)
    setDetails([])
    const prepared = await prepareReferenceImage(file)
    if (!prepared.ok) {
      setChosen(null)
      setError(prepared.message)
      return
    }
    setChosen({ image: prepared.image, previewUrl: URL.createObjectURL(file) })
  }

  async function analyze() {
    if (!chosen || analyzing || busy.current) return
    busy.current = true
    setAnalyzing(true)
    setError(null)
    setDetails([])
    const body = new FormData()
    body.append("image", chosen.image.blob, chosen.image.name)
    if (new URLSearchParams(window.location.search).get("reference") === "mock") body.append("devMock", "true")
    try {
      const response = await fetch("/api/email-builder/reference", { method: "POST", body })
      const result = (await response.json()) as ReferenceResponseBody
      if (result.status === "success") {
        // Le Builder prend la place de cet écran : le verrou se libère dans `finally`, rien ne repart.
        onCreated(result.document, referenceReportMessage(result.report))
        return
      }
      setError(result.message)
      setDetails(result.report?.lines.map((line) => line.text) ?? [])
    } catch {
      setError("L'analyse n'a pas répondu. Réessaie dans un instant.")
    } finally {
      busy.current = false
    }
    setAnalyzing(false)
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" disabled={analyzing} onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          Retour
        </Button>
      </header>

      <main aria-label="Créer depuis une référence" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-h1">Depuis une référence</h1>
            <p className="text-body text-muted-foreground">Dépose la capture d&apos;un email qui t&apos;inspire. Je reproduis sa structure avec les lames Studi, avec des textes provisoires à relire. L&apos;image n&apos;est pas conservée.</p>
          </div>

          {chosen ? (
            <div className="flex flex-col gap-4 rounded-lg border p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) de l'image choisie */}
              <img src={chosen.previewUrl} alt="Aperçu de la référence" className="max-h-96 w-full rounded-md border bg-muted object-contain object-top" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-caption text-muted-foreground">
                  {chosen.image.name} · {chosen.image.width} × {chosen.image.height} px
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={analyzing} onClick={() => input.current?.click()}>
                    <UploadIcon data-icon="inline-start" aria-hidden />
                    Remplacer
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={analyzing} onClick={() => (setChosen(null), setError(null), setDetails([]))}>
                    <Trash2Icon data-icon="inline-start" aria-hidden />
                    Supprimer
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(event) => (event.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void choose(event.dataTransfer.files[0])
              }}
              className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors ${dragging ? "bg-muted" : ""}`}
            >
              <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-body">Glisse une capture ici</p>
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
                <UploadIcon data-icon="inline-start" aria-hidden />
                Choisir un fichier
              </Button>
              <p className="text-caption text-muted-foreground">PNG, JPEG ou WebP · {referenceLimits.maxBytes / 1024 / 1024} Mo au plus</p>
            </div>
          )}

          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choisir une image de référence" className="hidden" onChange={(event) => (void choose(event.target.files?.[0]), (event.target.value = ""))} />

          {error && (
            <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/40 px-4 py-3 text-body text-destructive">
              <p>{error}</p>
              {details.map((line) => (
                <p key={line} className="text-caption">
                  ? {line}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {analyzing && (
              <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
                <Spinner aria-hidden />
                Analyse de la référence…
              </p>
            )}
            <Button type="button" disabled={!chosen || analyzing} onClick={() => void analyze()}>
              Analyser et créer
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
