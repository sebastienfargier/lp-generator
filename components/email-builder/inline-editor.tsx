"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { normalizeTextDraft, type SlotDraft } from "@/lib/email-builder/inline-edit"

/** Apparence typographique relevée sur l'élément d'origine, pour que le champ épouse le contenu qu'il remplace. */
export type FieldStyle = {
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing: string
  textAlign: string
  textTransform: string
  color: string
  background: string
}

export type FieldRect = { left: number; top: number; width: number; height: number }

/** Relève l'apparence d'un élément du document de l'iframe (lecture seule : le document n'est jamais modifié). */
export function captureFieldStyle(element: Element): FieldStyle {
  const win = element.ownerDocument.defaultView!
  const style = win.getComputedStyle(element)
  // Fond effectif : le premier ancêtre non transparent (le champ doit masquer le texte d'origine).
  let background = "#ffffff"
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = win.getComputedStyle(node).backgroundColor
    if (color && color !== "transparent" && !/,\s*0\)$/.test(color)) {
      background = color
      break
    }
  }
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textAlign: style.textAlign,
    textTransform: style.textTransform,
    color: style.color,
    background,
  }
}

type InlineEditorProps = {
  editor: "short" | "long" | "cta"
  rect: FieldRect
  style: FieldStyle
  initial: SlotDraft
  /** Nom accessible du champ. */
  label: string
  /** Largeur du canvas : borne le panneau de lien. */
  canvasWidth: number
  onCommit: (draft: SlotDraft) => void
  onCancel: () => void
}

const fieldClass = "absolute z-40 m-0 resize-none overflow-hidden border-0 p-0 outline-2 outline-offset-2 outline-brand-green"

/**
 * Champ d'édition posé à l'emplacement exact de l'élément cliqué : il reprend sa
 * position, sa largeur et sa typographie, et masque le texte d'origine. Il garde
 * un BROUILLON local pendant la frappe (aucun rendu, aucune opération) ; il
 * valide UNE fois : Entrée, ou la perte du focus. Échap annule : le document
 * n'a jamais été modifié. Texte brut seulement ; un retour à la ligne devient un
 * espace (le contrat d'un slot texte n'a pas de saut de ligne).
 *
 * Un bouton se modifie par son libellé (ce champ) et sa destination (un petit
 * panneau « Lien » dessous, appliqué avec le libellé en une seule validation).
 */
export function InlineEditor({ editor, rect, style, initial, label, canvasWidth, onCommit, onCancel }: InlineEditorProps) {
  const [draft, setDraft] = useState<SlotDraft>(initial)
  const done = useRef(false)
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const text = "text" in draft ? draft.text : draft.label
  const href = "href" in draft ? draft.href : ""

  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [])
  // Zone de texte : elle grandit avec son contenu, jamais en dessous de la hauteur d'origine.
  useEffect(() => {
    const area = field.current
    if (editor === "long" && area) {
      area.style.height = "0px"
      area.style.height = `${Math.max(rect.height, area.scrollHeight)}px`
    }
  }, [editor, text, rect.height])

  const finish = (action: () => void) => {
    if (done.current) return
    done.current = true
    action()
  }
  const commit = () => finish(() => onCommit(draft))
  const cancel = () => finish(onCancel)

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    } else if (event.key === "Enter") {
      event.preventDefault()
      commit()
    }
  }
  const setText = (value: string) => setDraft((current) => ("text" in current ? { text: value } : { ...current, label: value }))

  const typography: CSSProperties = {
    left: rect.left,
    top: rect.top,
    width: editor === "long" ? rect.width : Math.max(rect.width + 24, 96),
    height: rect.height,
    background: style.background,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textAlign: style.textAlign as CSSProperties["textAlign"],
    textTransform: style.textTransform as CSSProperties["textTransform"],
  }

  if (editor === "long") {
    return <textarea ref={field} aria-label={label} className={fieldClass} style={typography} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} onBlur={commit} onPaste={(event) => {
      // Un collage multi-lignes tient sur une ligne.
      event.preventDefault()
      const target = event.currentTarget
      const pasted = normalizeTextDraft(event.clipboardData.getData("text"))
      const next = text.slice(0, target.selectionStart) + pasted + text.slice(target.selectionEnd)
      setText(next)
    }} />
  }

  if (editor === "short") {
    return <input ref={field} type="text" aria-label={label} className={fieldClass} style={typography} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} onBlur={commit} />
  }

  // Bouton : libellé + destination, validés ensemble quand le focus quitte l'ensemble.
  const panelLeft = Math.max(0, Math.min(rect.left, canvasWidth - 296))
  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit()
      }}
    >
      <input ref={field} type="text" aria-label={label} className={fieldClass} style={typography} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} />
      <div role="group" aria-label="Lien du bouton" className="absolute z-40 flex w-72 flex-col gap-2 rounded-lg border bg-background p-3 shadow-lg" style={{ left: panelLeft, top: rect.top + rect.height + 10 }}>
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">
          Lien
          <input
            type="text"
            inputMode="url"
            placeholder="https://…"
            aria-label="Lien du bouton"
            className="h-8 rounded-md border bg-background px-2 text-body text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={href}
            onChange={(event) => setDraft((current) => ({ ...(current as { label: string; href: string }), href: event.target.value }))}
            onKeyDown={onKeyDown}
          />
        </label>
        <div className="flex justify-end">
          <Button type="button" size="xs" onClick={commit}>
            Appliquer
          </Button>
        </div>
      </div>
    </div>
  )
}
