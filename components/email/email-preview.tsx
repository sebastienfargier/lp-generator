"use client"

import { useEffect, useRef, useState } from "react"
import { MonitorIcon, SmartphoneIcon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/**
 * Largeurs simulées. Desktop dépasse 640 px : la media query mobile du socle
 * (`max-width:640px`) ne doit pas s'appliquer à la vue bureau.
 */
const viewports = [
  { value: "desktop", label: "Desktop", width: 720, icon: MonitorIcon },
  { value: "mobile", label: "Mobile", width: 390, icon: SmartphoneIcon },
] as const

type Viewport = (typeof viewports)[number]["value"]

type EmailPreviewProps = {
  /** HTML d'aperçu (toPreviewHtml du HTML canonique) ; `null` si aucune génération valide. */
  html: string | null
  subject: string | null
  preheader: string | null
  loading: boolean
  onLoad: () => void
}

/**
 * Le HTML d'aperçu est chargé dans une iframe isolée (`srcDoc`, sandbox sans
 * script ni popup ; ses liens sont déjà inertes) à la largeur du viewport cible, puis réduit
 * visuellement si la surface est plus étroite : scale = min(1, disponible /
 * cible). L'email défile dans son propre document.
 */
export function EmailPreview({ html, subject, preheader, loading, onLoad }: EmailPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [surface, setSurface] = useState<{ width: number; height: number }>()

  useEffect(() => {
    const element = surfaceRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSurface({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const target = viewports.find((item) => item.value === viewport) ?? viewports[0]
  const scale = surface ? Math.min(1, surface.width / target.width) : 0
  const zoom = Math.round(scale * 100)

  return (
    <section aria-labelledby="email-preview-title" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="email-preview-title" className="text-body font-semibold">
            Aperçu
          </h2>
          <p className="text-caption text-muted-foreground" aria-live="polite">
            {target.width} px{scale > 0 && scale < 1 ? ` · ${zoom} %` : ""}
          </p>
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Largeur de l'aperçu"
          value={[viewport]}
          onValueChange={(values: string[]) => {
            const next = viewports.find((item) => item.value === values[0])
            if (next) setViewport(next.value)
          }}
        >
          {viewports.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground"
            >
              <item.icon aria-hidden />
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {subject && preheader && (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border bg-background px-4 py-3 text-body">
          <dt className="text-muted-foreground">Objet</dt>
          <dd className="truncate font-semibold" title={subject}>
            {subject}
          </dd>
          <dt className="text-muted-foreground">Préheader</dt>
          <dd className="truncate text-muted-foreground" title={preheader}>
            {preheader}
          </dd>
        </dl>
      )}

      <div
        ref={surfaceRef}
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden rounded-lg bg-neutral-200 p-4 sm:p-6"
      >
        {html && surface && scale > 0 ? (
          <div
            className="relative shrink-0 overflow-hidden border bg-background"
            style={{ width: target.width * scale, height: surface.height }}
          >
            {/* Sans allow-scripts, allow-same-origin ne donne aucun pouvoir au
                document : l'aperçu est rendu dans le processus de la page,
                inspectable (tests, outils), et résout /logos et /icones sur
                l'origine de l'application. Aucun lien n'est actif (href
                retirés par toPreviewHtml), ni popup ni navigation parente. */}
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              title="Aperçu de l'email généré"
              onLoad={onLoad}
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{
                width: target.width,
                height: surface.height / scale,
                transform: `scale(${scale})`,
              }}
            />
          </div>
        ) : (
          !html && (
            <p className="self-center text-center text-body text-muted-foreground">
              Aucun aperçu : la dernière génération est invalide.
            </p>
          )
        )}

        {loading && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-body text-muted-foreground"
          >
            <Spinner aria-hidden />
            Génération de l&apos;email…
          </div>
        )}
      </div>

      <p className="text-caption text-muted-foreground">
        Aperçu : logo et pictos locaux, réseaux sociaux masqués, liens inactifs. Le HTML
        exportable conserve ses jetons système et ses vrais liens.
      </p>
    </section>
  )
}
