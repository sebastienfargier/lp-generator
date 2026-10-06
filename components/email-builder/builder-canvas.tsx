"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { PlusIcon } from "lucide-react"

import type { EmailDocument } from "@/lib/email-builder/document"
import type { EmailSurface } from "@/lib/email/surfaces"

import { BlockToolbar } from "./block-toolbar"

/** Largeur de l'email dans le canvas : celle de l'email (600 px) ou celle d'un téléphone. */
export const canvasWidths = { desktop: 600, mobile: 390 } as const
export type CanvasViewport = keyof typeof canvasWidths

type BlockZone = { id: string; top: number; height: number }

export type CanvasLameInfo = { name: string; surfaceMode: "configurable" | "fixed" }

type BuilderCanvasProps = {
  /** HTML de l'aperçu repéré (`renderCanvasHtml`) : jamais construit côté navigateur. */
  html: string
  document: EmailDocument
  lames: Readonly<Record<string, CanvasLameInfo>>
  selectedId: string | null
  viewport: CanvasViewport
  /** Faux pendant qu'un nouveau rendu est attendu : les contrôles ne visent pas un HTML périmé. */
  interactive: boolean
  onSelect: (blockId: string | null) => void
  onInsert: (index: number) => void
  onMove: (blockId: string, toIndex: number) => void
  onSurface: (blockId: string, surface: EmailSurface) => void
  onRemove: (blockId: string) => void
}

/**
 * Mesure les zones des lames dans le document de l'iframe : chaque lame est
 * encadrée par deux commentaires (`<!--builder-block:ID-->` … `<!--/builder-block-->`)
 * posés par le serveur. La zone d'une lame est l'union de ses éléments voisins
 * entre les deux commentaires.
 */
function measureZones(doc: Document): { zones: BlockZone[]; height: number } {
  const zones: BlockZone[] = []
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const id = /^builder-block:(.+)$/.exec(node.nodeValue ?? "")?.[1]
    if (!id) continue
    let top = Infinity
    let bottom = -Infinity
    for (let sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
      if (sibling.nodeType === Node.COMMENT_NODE && sibling.nodeValue === "/builder-block") break
      if (sibling.nodeType !== Node.ELEMENT_NODE) continue
      const rect = (sibling as Element).getBoundingClientRect()
      if (rect.height === 0) continue
      top = Math.min(top, rect.top)
      bottom = Math.max(bottom, rect.bottom)
    }
    if (bottom > top) zones.push({ id, top: Math.round(top), height: Math.round(bottom - top) })
  }
  return { zones, height: Math.ceil(doc.documentElement.scrollHeight) }
}

/**
 * Le canvas : l'email réel (le HTML du renderer, dans une iframe isolée), et par
 * dessus lui, une couche de contrôles posée sur la zone mesurée de chaque lame.
 * « Tu agis là où tu regardes » : survol = contour discret et nom ; clic =
 * sélection et actions ; entre deux lames, un « + » pour en ajouter une.
 *
 * Aucun HTML n'est recréé en React : la couche ne contient que des contrôles. Le
 * document de l'iframe n'est jamais modifié : on lit seulement ses repères.
 */
export function BuilderCanvas({ html, document: emailDocument, lames, selectedId, viewport, interactive, onSelect, onInsert, onMove, onSurface, onRemove }: BuilderCanvasProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [layout, setLayout] = useState<{ zones: BlockZone[]; height: number }>({ zones: [], height: 640 })
  const width = canvasWidths[viewport]

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (doc?.body) setLayout(measureZones(doc))
  }, [])

  // Mesure au chargement, puis à chaque changement de taille du document (images, polices, largeur).
  const attach = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    observerRef.current?.disconnect()
    if (!doc?.body) return
    measure()
    observerRef.current = new ResizeObserver(measure)
    observerRef.current.observe(doc.documentElement)
    observerRef.current.observe(doc.body)
  }, [measure])

  useEffect(() => () => observerRef.current?.disconnect(), [])
  // Un autre viewport change la mise en page de l'email : on remesure.
  useEffect(() => {
    measure()
  }, [viewport, measure])

  const byId = new Map(emailDocument.config.blocks.map((block, index) => [block.id, { block, index }]))
  const zones = layout.zones.filter((zone) => byId.has(zone.id))
  const count = emailDocument.config.blocks.length

  return (
    <div className="relative mx-auto shrink-0" style={{ width, height: layout.height }}>
      {/* Sans allow-scripts, allow-same-origin ne donne aucun pouvoir au document : il résout
          /logos, /icones et /images sur l'origine de l'application et reste mesurable. Les
          liens du HTML d'aperçu sont déjà inertes. */}
      <iframe
        ref={frameRef}
        srcDoc={html}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        title="Email en cours de composition"
        tabIndex={-1}
        onLoad={attach}
        className="absolute top-0 left-0 block border-0 bg-background shadow-sm"
        style={{ width, height: layout.height }}
      />

      <div className={interactive ? "absolute inset-0" : "pointer-events-none absolute inset-0 opacity-70"} onClick={(event) => event.target === event.currentTarget && onSelect(null)}>
        {zones.map((zone, order) => {
          const { block, index } = byId.get(zone.id)!
          const info = lames[block.type]
          const name = info?.name ?? block.type
          const selected = zone.id === selectedId
          const provisional = emailDocument.blockMeta[block.id]?.origin === "builder"
          const surface = info?.surfaceMode === "configurable" ? (((block as unknown as { surface?: EmailSurface }).surface ?? "page") as EmailSurface) : null
          return (
            <div key={zone.id} className="group/block absolute inset-x-0" style={{ top: zone.top, height: zone.height }}>
              <button
                type="button"
                aria-label={`Lame ${order + 1} sur ${zones.length} : ${name}${provisional ? " (contenu provisoire)" : ""}`}
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : zone.id)}
                className={
                  selected
                    ? "absolute inset-0 cursor-pointer outline-2 -outline-offset-2 outline-brand-green shadow-[0_0_0_4px_var(--accent-1)] focus-visible:outline-offset-2"
                    : "absolute inset-0 cursor-pointer outline-0 transition-colors hover:bg-brand-green/[0.04] hover:outline-2 hover:-outline-offset-2 hover:outline-brand-green/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-green"
                }
              />
              <span
                className={`pointer-events-none absolute top-2 left-2 max-w-[60%] truncate rounded-full bg-neutral-0 px-2.5 py-1 text-caption text-neutral-900 shadow-sm ring-1 ring-neutral-900/25 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover/block:opacity-100 group-focus-within/block:opacity-100"}`}
              >
                {name}
                {provisional ? " · contenu provisoire" : ""}
              </span>
              {selected && (
                <div className="absolute top-2 right-2 z-30">
                  <BlockToolbar
                    name={name}
                    canMoveUp={index > 0}
                    canMoveDown={index < count - 1}
                    surface={surface}
                    onMove={(delta) => onMove(zone.id, index + delta)}
                    onSurface={(next) => onSurface(zone.id, next)}
                    onRemove={() => onRemove(zone.id)}
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Entre deux lames : un « + » au survol ou au focus, avec le même effet au clavier. */}
        {interactive &&
          zones.length > 0 &&
          [...zones.map((zone) => zone.top), zones[zones.length - 1]!.top + zones[zones.length - 1]!.height].map((y, position) => (
            <div key={position} className="group/insert absolute inset-x-0 z-20 h-8 -translate-y-1/2" style={{ top: y }}>
              <button
                type="button"
                aria-label={position === 0 ? "Ajouter une lame au début de l'email" : position === zones.length ? "Ajouter une lame à la fin de l'email" : `Ajouter une lame entre la lame ${position} et la lame ${position + 1}`}
                onClick={() => onInsert(byId.get(zones[position]?.id ?? zones[position - 1]!.id)!.index + (position === zones.length ? 1 : 0))}
                className="absolute inset-0 flex cursor-pointer items-center justify-center outline-none"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-brand-green opacity-0 transition-opacity group-hover/insert:opacity-100 group-focus-within/insert:opacity-100" />
                <span className="relative flex items-center gap-1 rounded-full bg-brand-green px-3 py-1 text-caption text-neutral-0 opacity-0 shadow-md transition-opacity group-hover/insert:opacity-100 group-focus-within/insert:opacity-100">
                  <PlusIcon className="size-3.5" aria-hidden />
                  Ajouter une lame
                </span>
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}
