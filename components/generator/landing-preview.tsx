"use client"

import { useEffect, useRef, useState } from "react"
import {
  ExternalLinkIcon,
  MonitorIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/** Viewports simulés : réglages de l'outil, jamais des données de la page. */
const viewports = [
  { value: "desktop", label: "Desktop", width: 1440, icon: MonitorIcon },
  { value: "tablet", label: "Tablet", width: 768, icon: TabletIcon },
  { value: "mobile", label: "Mobile", width: 390, icon: SmartphoneIcon },
] as const

type Viewport = (typeof viewports)[number]["value"]

type LandingPreviewProps = {
  /** URL du document d'aperçu ; `null` si aucune génération valide. */
  src: string | null
  /** Page seule, ouverte dans un nouvel onglet. */
  fullscreenHref: string
  loading: boolean
  onLoad: () => void
}

/**
 * La landing page est rendue dans une iframe à la largeur du viewport cible
 * (ses breakpoints réagissent à 1440 / 768 / 390 px), puis réduite
 * visuellement pour tenir dans la surface : scale = min(1, disponible / cible).
 * Sa hauteur logique est recalculée pour remplir la surface ; elle défile
 * dans son propre document, indépendamment de l'interface du générateur.
 */
export function LandingPreview({
  src,
  fullscreenHref,
  loading,
  onLoad,
}: LandingPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [surface, setSurface] = useState<{ width: number; height: number }>()

  useEffect(() => {
    const element = surfaceRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSurface({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const target =
    viewports.find((item) => item.value === viewport) ?? viewports[0]
  const scale = surface ? Math.min(1, surface.width / target.width) : 0
  const zoom = Math.round(scale * 100)

  return (
    <section
      aria-labelledby="preview-title"
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="preview-title" className="text-body font-semibold">
            Aperçu
          </h2>
          <p className="text-caption text-muted-foreground" aria-live="polite">
            {target.width} px{scale > 0 && scale < 1 ? ` · ${zoom} %` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="Viewport de l'aperçu"
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
          {src && (
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={
                <a
                  href={fullscreenHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              aria-label="Ouvrir la landing page seule dans un nouvel onglet"
            >
              <ExternalLinkIcon aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {/* Surface neutre ; son padding forme la marge autour de la page. */}
      <div
        ref={surfaceRef}
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden rounded-lg bg-neutral-200 p-4 sm:p-6"
      >
        {src && surface && scale > 0 ? (
          <div
            className="relative shrink-0 overflow-hidden border bg-background"
            style={{ width: target.width * scale, height: surface.height }}
          >
            <iframe
              key={src}
              src={src}
              title="Aperçu de la landing page générée"
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
          !src && (
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
            Génération de l&apos;aperçu…
          </div>
        )}
      </div>
    </section>
  )
}
