"use client"

import { useEffect, useRef, useState } from "react"
import { MonitorIcon, SmartphoneIcon, TabletIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { describeGeneratedPage } from "@/lib/landing/generator-state"
import type { LandingPageConfig } from "@/lib/landing/types"

import { PreviewFrame } from "./preview-frame"

/** Viewports simulés : réglages de l'outil, jamais des données de la page. */
const viewports = [
  { value: "desktop", label: "Desktop", width: 1440, icon: MonitorIcon },
  { value: "tablet", label: "Tablet", width: 768, icon: TabletIcon },
  { value: "mobile", label: "Mobile", width: 390, icon: SmartphoneIcon },
] as const

type Viewport = (typeof viewports)[number]["value"]

type LandingPreviewProps = {
  /** Dernière configuration valide ; `null` avant la première génération réussie. */
  config: LandingPageConfig | null
  /** Une génération est en cours : l'aperçu précédent, s'il existe, reste dessous. */
  loading: boolean
}

/**
 * La landing page est rendue, par le vrai `LandingPageRenderer`, dans une
 * iframe à la largeur du viewport cible (ses breakpoints réagissent à
 * 1440 / 768 / 390 px), puis réduite visuellement pour tenir dans la surface :
 * scale = min(1, disponible / cible). Sa hauteur logique est recalculée pour
 * remplir la surface ; elle défile dans son propre document, indépendamment de
 * l'interface du générateur.
 *
 * Changer de viewport ne modifie que la largeur : aucune requête, aucune
 * nouvelle génération. Cette zone ne génère rien et ne fait aucun appel.
 */
export function LandingPreview({ config, loading }: LandingPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [surface, setSurface] = useState<{ width: number; height: number }>()

  useEffect(() => {
    const element = surfaceRef.current
    if (!element) return
    // Mesure initiale synchrone : l'observateur peut tarder (onglet masqué).
    const style = getComputedStyle(element)
    setSurface({
      width: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    })
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
      aria-busy={loading}
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
          {config && !loading && (
            <Badge variant="brand-soft" aria-live="polite">
              {describeGeneratedPage(config)}
            </Badge>
          )}
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
        </div>
      </div>

      {/* Surface neutre ; son padding forme la marge autour de la page. */}
      <div
        ref={surfaceRef}
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden rounded-lg bg-neutral-200 p-4 sm:p-6"
      >
        {config && surface && scale > 0 ? (
          <div
            className="relative shrink-0 overflow-hidden border bg-background"
            style={{ width: target.width * scale, height: surface.height }}
          >
            <PreviewFrame
              config={config}
              width={target.width}
              height={surface.height / scale}
              scale={scale}
            />
          </div>
        ) : (
          !config &&
          !loading && (
            <p className="self-center text-center text-body text-muted-foreground">
              Votre landing page apparaîtra ici après génération.
            </p>
          )
        )}

        {loading && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-body text-muted-foreground"
          >
            <Spinner aria-hidden />
            Génération de la landing page…
          </div>
        )}
      </div>
    </section>
  )
}
