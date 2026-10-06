"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { EmailDocument } from "@/lib/email-builder/document"
import { initialDraft, slotEditor, type SlotDraft, type SlotEditor } from "@/lib/email-builder/inline-edit"
import type { Selection } from "@/lib/email-builder/builder-state"
import type { EmailSurface } from "@/lib/email/surfaces"

import { BlockToolbar } from "./block-toolbar"
import { captureFieldStyle, InlineEditor, type FieldStyle } from "./inline-editor"

/** Largeur de l'email dans le canvas : celle de l'email (600 px) ou celle d'un téléphone. */
export const canvasWidths = { desktop: 600, mobile: 390 } as const
export type CanvasViewport = keyof typeof canvasWidths

type SlotZone = { name: string; top: number; left: number; width: number; height: number }
type BlockZone = { id: string; top: number; height: number; slots: SlotZone[] }

export type CanvasLameInfo = { name: string; surfaceMode: "configurable" | "fixed" }

type BuilderCanvasProps = {
  /** HTML de l'aperçu repéré (`renderCanvasHtml`) : jamais construit côté navigateur, jamais source de vérité. */
  html: string
  document: EmailDocument
  lames: Readonly<Record<string, CanvasLameInfo>>
  selection: Selection
  viewport: CanvasViewport
  /** Faux si le rendu a échoué : les contrôles ne visent pas un HTML invalide. */
  interactive: boolean
  onSelectBlock: (blockId: string | null) => void
  onSelectElement: (blockId: string, slot: string) => void
  onStartEdit: (blockId: string, slot: string) => void
  onCommitEdit: (blockId: string, slot: string, draft: SlotDraft) => void
  onCancelEdit: () => void
  onReplaceImage: (blockId: string, slot: string) => void
  onInsert: (index: number) => void
  onMove: (blockId: string, toIndex: number) => void
  onSurface: (blockId: string, surface: EmailSurface) => void
  onRemove: (blockId: string) => void
}

const slotKey = (blockId: string, slot: string) => `${blockId}|${slot}`

/**
 * Mesure, dans le document de l'iframe, la zone de chaque lame et de chacun de
 * ses éléments éditables. Chaque lame est encadrée par deux commentaires
 * (`<!--builder-block:ID-->` … `<!--/builder-block-->`) ; chaque élément porte le
 * `data-slot` de son template. Lame + slot sont donc LUS, jamais devinés d'après un
 * texte. Lecture seule : le document de l'iframe n'est jamais modifié.
 */
function measure(doc: Document): { zones: BlockZone[]; height: number; elements: Map<string, Element> } {
  const zones: BlockZone[] = []
  const elements = new Map<string, Element>()
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const id = /^builder-block:(.+)$/.exec(node.nodeValue ?? "")?.[1]
    if (!id) continue
    let top = Infinity
    let bottom = -Infinity
    const slots: SlotZone[] = []
    for (let sibling = node.nextSibling; sibling; sibling = sibling.nextSibling) {
      if (sibling.nodeType === Node.COMMENT_NODE && sibling.nodeValue === "/builder-block") break
      if (sibling.nodeType !== Node.ELEMENT_NODE) continue
      const element = sibling as Element
      const rect = element.getBoundingClientRect()
      if (rect.height > 0) {
        top = Math.min(top, rect.top)
        bottom = Math.max(bottom, rect.bottom)
      }
      for (const marked of [element, ...element.querySelectorAll("[data-slot]")]) {
        const name = marked.getAttribute("data-slot")
        const box = marked.getBoundingClientRect()
        if (!name || box.width === 0 || box.height === 0) continue
        slots.push({ name, top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height) })
        elements.set(slotKey(id, name), marked)
      }
    }
    if (bottom > top) zones.push({ id, top: Math.round(top), height: Math.round(bottom - top), slots })
  }
  return { zones, height: Math.ceil(doc.documentElement.scrollHeight), elements }
}

type EditSession = { key: string; style: FieldStyle }

/**
 * Le canvas : l'email réel (le HTML du renderer, dans une iframe isolée), et par
 * dessus lui, une couche de contrôles posée sur la zone mesurée de chaque lame et
 * de chaque contenu éditable. « Tu agis là où tu regardes » : un clic sur un titre,
 * un paragraphe ou un bouton l'édite à sa place ; un clic sur une image propose de
 * la remplacer ; un clic sur le fond d'une lame la sélectionne.
 *
 * L'élément a priorité sur la lame : ses contrôles sont posés au-dessus de ceux de la
 * lame. Aucun HTML n'est recréé en React et le document de l'iframe n'est jamais
 * modifié : la couche ne contient que des contrôles et le champ d'édition, qui vit
 * AU-DESSUS de l'iframe.
 */
export function BuilderCanvas({ html, document: emailDocument, lames, selection, viewport, interactive, onSelectBlock, onSelectElement, onStartEdit, onCommitEdit, onCancelEdit, onReplaceImage, onInsert, onMove, onSurface, onRemove }: BuilderCanvasProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const elementsRef = useRef<Map<string, Element>>(new Map())
  const [layout, setLayout] = useState<{ zones: BlockZone[]; height: number }>({ zones: [], height: 640 })
  const [session, setSession] = useState<EditSession | null>(null)
  const width = canvasWidths[viewport]

  const remeasure = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc?.body) return
    const { zones, height, elements } = measure(doc)
    elementsRef.current = elements
    setLayout({ zones, height })
  }, [])

  // Mesure au chargement, puis à chaque changement de taille du document (images, polices, largeur).
  const attach = useCallback(() => {
    const doc = frameRef.current?.contentDocument
    observerRef.current?.disconnect()
    if (!doc?.body) return
    remeasure()
    observerRef.current = new ResizeObserver(remeasure)
    observerRef.current.observe(doc.documentElement)
    observerRef.current.observe(doc.body)
  }, [remeasure])

  useEffect(() => () => observerRef.current?.disconnect(), [])
  // Un autre viewport change la mise en page de l'email : on remesure.
  useEffect(() => {
    remeasure()
  }, [viewport, remeasure])

  const byId = new Map(emailDocument.config.blocks.map((block, index) => [block.id, { block, index }]))
  const zones = layout.zones.filter((zone) => byId.has(zone.id))
  const count = emailDocument.config.blocks.length
  const slotValue = (blockId: string, slot: string) => (byId.get(blockId)?.block as unknown as { slots: Record<string, unknown> } | undefined)?.slots[slot]

  /** Un clic sur un contenu : l'éditeur de son slot, relevé dans la lame du document (jamais lu dans le HTML). */
  function activate(zone: BlockZone, slot: SlotZone, editor: SlotEditor) {
    if (editor === "image") return onSelectElement(zone.id, slot.name)
    const element = elementsRef.current.get(slotKey(zone.id, slot.name))
    if (element) setSession({ key: slotKey(zone.id, slot.name), style: captureFieldStyle(element) })
    onStartEdit(zone.id, slot.name)
  }

  const editing = selection.kind === "editing" ? selection : null
  const editingZone = editing ? zones.find((zone) => zone.id === editing.blockId) : undefined
  const editingSlot = editingZone?.slots.find((slot) => slot.name === editing?.slot)
  const editingBlock = editing ? byId.get(editing.blockId)?.block : undefined
  const editingEditor = editing && editingBlock ? slotEditor(editingBlock.type, editing.slot) : null

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

      <div className={interactive ? "absolute inset-0" : "pointer-events-none absolute inset-0"} onClick={(event) => event.target === event.currentTarget && onSelectBlock(null)}>
        {/* Niveau LAME : fond de lame, nom au survol, actions de structure. */}
        {zones.map((zone, order) => {
          const { block, index } = byId.get(zone.id)!
          const info = lames[block.type]
          const name = info?.name ?? block.type
          const selected = selection.kind === "block" && selection.blockId === zone.id
          const provisional = emailDocument.blockMeta[block.id]?.origin === "builder"
          const surface = info?.surfaceMode === "configurable" ? (((block as unknown as { surface?: EmailSurface }).surface ?? "page") as EmailSurface) : null
          return (
            <div key={zone.id} className="group/block absolute inset-x-0" style={{ top: zone.top, height: zone.height }}>
              <button
                type="button"
                aria-label={`Lame ${order + 1} sur ${zones.length} : ${name}${provisional ? " (contenu provisoire)" : ""}`}
                aria-pressed={selected}
                onClick={() => onSelectBlock(selected ? null : zone.id)}
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

        {/* Niveau ÉLÉMENT, au-dessus de la lame : un clic direct sur un contenu agit sur lui. */}
        {zones.flatMap((zone) => {
          const { block } = byId.get(zone.id)!
          const blockSelected = selection.kind !== "none" && selection.blockId === zone.id
          return zone.slots.flatMap((slot) => {
            const editor = slotEditor(block.type, slot.name)
            if (!editor) return []
            const value = slotValue(zone.id, slot.name) as { text?: string; label?: string; alt?: string } | undefined
            const content = value?.text ?? value?.label ?? value?.alt ?? slot.name
            const active = selection.kind !== "none" && selection.kind !== "block" && selection.blockId === zone.id && selection.slot === slot.name
            const isEditing = selection.kind === "editing" && active
            return [
              <button
                key={slotKey(zone.id, slot.name)}
                type="button"
                aria-label={`${editor === "image" ? "Image" : editor === "cta" ? "Bouton" : "Texte"} : ${content.slice(0, 60)}`}
                aria-pressed={active}
                tabIndex={blockSelected ? 0 : -1}
                onClick={() => activate(zone, slot, editor)}
                className={`absolute z-10 outline-offset-2 transition-colors outline-brand-green focus-visible:outline-2 ${editor === "image" ? "cursor-pointer" : "cursor-text"} ${active ? "outline-2" : "outline-0 hover:outline-1 hover:outline-dashed hover:outline-brand-green/70"} ${isEditing ? "pointer-events-none" : ""}`}
                style={{ left: slot.left, top: slot.top, width: slot.width, height: slot.height }}
              />,
              editor === "image" && active ? (
                <div key={`${slotKey(zone.id, slot.name)}|action`} className="absolute z-30" style={{ left: slot.left + slot.width - 8, top: slot.top + 8, transform: "translateX(-100%)" }}>
                  <Button type="button" size="xs" variant="outline" onClick={() => onReplaceImage(zone.id, slot.name)}>
                    Remplacer
                  </Button>
                </div>
              ) : null,
            ]
          })
        })}

        {/* Édition en cours : le champ vit au-dessus de l'iframe, à la place exacte de l'élément. */}
        {editing && editingSlot && editingEditor && editingEditor !== "image" && session?.key === slotKey(editing.blockId, editing.slot) && (
          <InlineEditor
            key={session.key}
            editor={editingEditor}
            rect={editingSlot}
            style={session.style}
            initial={initialDraft(editingEditor, slotValue(editing.blockId, editing.slot))}
            label={editingEditor === "cta" ? "Libellé du bouton" : "Texte de l'email"}
            canvasWidth={width}
            onCommit={(draft) => onCommitEdit(editing.blockId, editing.slot, draft)}
            onCancel={onCancelEdit}
          />
        )}

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
