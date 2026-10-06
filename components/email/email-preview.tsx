"use client"

import { useEffect, useRef, useState } from "react"
import { DownloadIcon, MonitorIcon, SmartphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

/**
 * Largeurs simulées. Desktop = largeur canonique de l'email (600 px) : la
 * media query mobile du socle (`max-width:599px`) ne s'y applique pas.
 */
const viewports = [
  { value: "desktop", label: "Desktop", width: 600, icon: MonitorIcon },
  { value: "mobile", label: "Mobile", width: 390, icon: SmartphoneIcon },
] as const

type Viewport = (typeof viewports)[number]["value"]

type EmailPreviewProps = {
  /** HTML d'aperçu (toPreviewHtml du HTML canonique) ; `null` si aucune génération valide. */
  html: string | null
  subject: string | null
  preheader: string | null
  /** « Email généré · N lames » : dérivée de l'email réellement généré ; `null` avant toute génération. */
  legend: string | null
  loading: boolean
  /** Modification en cours : l'aperçu reste affiché, un indicateur discret remplace le voile de génération. */
  editing?: boolean
  /** Export HTML de l'email affiché ; absent tant qu'aucun email n'est exportable. */
  exportAction?: { label: string; onExport: () => void; disabled: boolean; exporting: boolean }
  /** Résultat du dernier export de la version affichée : une ligne par note. */
  exportNotice?: { tone: "success" | "error"; lines: string[] } | null
  onLoad: () => void
}

/**
 * Le HTML d'aperçu est chargé dans une iframe isolée (`srcDoc`, sandbox sans
 * script ni popup ; ses liens sont déjà inertes) à la largeur du viewport
 * cible, puis réduit visuellement si la surface est plus étroite : scale =
 * min(1, disponible / cible).
 *
 * L'iframe prend la hauteur de son document : pas de barre de défilement
 * interne, qui réduirait la largeur utile sous 600 px et déclencherait la
 * vue mobile. C'est la surface d'aperçu qui défile.
 */
export function EmailPreview({ html, subject, preheader, legend, loading, editing = false, exportAction, exportNotice, onLoad }: EmailPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [surface, setSurface] = useState<{ width: number; height: number }>()
  // Hauteur du document mesurée au chargement, pour ce HTML et ce viewport.
  const [measured, setMeasured] = useState<{ html: string; viewport: Viewport; height: number }>()

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
  const documentHeight =
    measured && measured.html === html && measured.viewport === viewport ? measured.height : undefined
  const frameHeight = documentHeight ?? (surface && scale > 0 ? surface.height / scale : 0)

  return (
    <section aria-labelledby="email-preview-title" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="email-preview-title" className="text-body font-semibold">
            Aperçu
          </h2>
          <p className="text-caption text-muted-foreground">
            {target.width} px{scale > 0 && scale < 1 ? ` · ${zoom} %` : ""}
          </p>
          {legend && (
            <p className="text-caption font-medium text-muted-foreground" aria-live="polite">
              · {legend}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exportAction && (
            <Button type="button" size="sm" variant="outline" disabled={exportAction.disabled} aria-busy={exportAction.exporting} onClick={exportAction.onExport}>
              {exportAction.exporting ? <Spinner data-icon="inline-start" aria-hidden /> : <DownloadIcon data-icon="inline-start" aria-hidden />}
              {exportAction.exporting ? "Export…" : exportAction.label}
            </Button>
          )}
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
      </div>

      {exportNotice && (
        <div role={exportNotice.tone === "error" ? "alert" : "status"} className={`flex flex-col gap-0.5 rounded-lg border px-4 py-2 text-caption ${exportNotice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {exportNotice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

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
        className="relative flex min-h-0 flex-1 items-start justify-center overflow-x-hidden overflow-y-auto rounded-lg bg-neutral-200 p-4 sm:p-6"
      >
        {html && surface && scale > 0 ? (
          <div
            className="relative shrink-0 overflow-hidden border bg-background"
            style={{ width: target.width * scale, height: frameHeight * scale }}
          >
            {/* Sans allow-scripts, allow-same-origin ne donne aucun pouvoir au
                document : l'aperçu est rendu dans le processus de la page,
                inspectable (tests, outils), et résout /logos et /icones sur
                l'origine de l'application. Aucun lien n'est actif (href
                retirés par toPreviewHtml), ni popup ni navigation parente. */}
            <iframe
              key={viewport}
              srcDoc={html}
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              title="Aperçu de l'email généré"
              onLoad={(event) => {
                const height = event.currentTarget.contentDocument?.documentElement.scrollHeight
                if (height) setMeasured({ html, viewport, height })
                onLoad()
              }}
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{
                width: target.width,
                height: frameHeight,
                transform: `scale(${scale})`,
              }}
            />
          </div>
        ) : (
          !html &&
          !loading && (
            <div className="flex flex-col gap-1 self-center text-center">
              <p className="text-body font-medium">Votre email apparaîtra ici après génération.</p>
              <p className="text-body text-muted-foreground">Décrivez votre email, puis lancez la génération.</p>
            </div>
          )
        )}

        {editing && (
          <div
            role="status"
            className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-caption text-muted-foreground shadow-sm"
          >
            <Spinner aria-hidden />
            Modification en cours…
          </div>
        )}

        {loading && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-body text-muted-foreground"
          >
            <Spinner aria-hidden />
            <span className="flex flex-col gap-0.5">
              <span>Génération de l&apos;email…</span>
              <span className="text-caption">La génération peut prendre une quinzaine de secondes.</span>
            </span>
          </div>
        )}
      </div>

      {html && (
        <p className="text-caption text-muted-foreground">
          Aperçu : logo et pictos locaux, réseaux sociaux masqués, liens inactifs. Le HTML
          exportable conserve ses jetons système et ses vrais liens. Les mentions légales ne
          sont pas ajoutées automatiquement : vérifiez l&apos;email avant utilisation.
        </p>
      )}
    </section>
  )
}
