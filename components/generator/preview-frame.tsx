"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { LandingPageRenderer } from "@/components/landing"
import type { LandingPageConfig } from "@/lib/landing/types"

/**
 * Document vide de l'iframe : la page y est rendue par un portail React, avec
 * le vrai `LandingPageRenderer`. Aucune route, aucune URL contenant le brief,
 * aucun message à la fenêtre parente : la configuration reste dans l'état du
 * générateur.
 *
 * Une iframe est nécessaire : les sections réagissent à la largeur du
 * VIEWPORT (`sm:`, `md:`, `lg:`), qui n'est celle de l'iframe que si la page
 * y est rendue. Le portail garde le contexte React (next/link, composants
 * clients des sections).
 */
const blankDocument =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'

/** Délai maximal d'attente des feuilles de style copiées, pour ne jamais bloquer l'aperçu. */
const stylesheetTimeout = 3000

/**
 * Les liens de la page sont inertes dans l'aperçu : on n'y navigue pas, et une
 * destination externe s'ouvre dans un nouvel onglet pour être vérifiée.
 */
function keepPreviewInert(event: MouseEvent) {
  const target = event.target as Element | null
  const anchor = target && typeof target.closest === "function" ? target.closest("a[href]") : null
  if (!anchor) return
  event.preventDefault()
  event.stopPropagation()
  const href = anchor.getAttribute("href") ?? ""
  if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer")
  else if (href.startsWith("#")) anchor.ownerDocument.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: "smooth" })
}

type PreviewFrameProps = {
  config: LandingPageConfig
  /** Largeur du viewport simulé, en px. */
  width: number
  /** Hauteur logique de l'iframe, en px. */
  height: number
  scale: number
}

export function PreviewFrame({ config, width, height, scale }: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)

  const prepare = useCallback(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc) return
    // Mêmes classes et mêmes feuilles de style que l'application : polices, thème, utilitaires.
    doc.documentElement.className = document.documentElement.className
    doc.documentElement.lang = document.documentElement.lang
    doc.body.className = document.body.className
    const loaded: Promise<unknown>[] = []
    for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
      const copy = node.cloneNode(true) as HTMLElement
      if (copy.tagName === "LINK") loaded.push(new Promise((resolve) => { copy.onload = copy.onerror = resolve }))
      doc.head.appendChild(copy)
    }
    doc.addEventListener("click", keepPreviewInert, true)
    // On rend la page une fois les styles chargés (sans flash non stylé), ou après le délai.
    void Promise.race([Promise.all(loaded), new Promise((resolve) => setTimeout(resolve, stylesheetTimeout))]).then(() => {
      if (frameRef.current?.contentDocument === doc) setBody(doc.body)
    })
  }, [])

  // Une nouvelle configuration repart du haut de la page.
  useEffect(() => {
    frameRef.current?.contentWindow?.scrollTo(0, 0)
  }, [config])

  return (
    <>
      <iframe
        ref={frameRef}
        srcDoc={blankDocument}
        title="Aperçu de la landing page générée"
        onLoad={prepare}
        className="absolute top-0 left-0 origin-top-left border-0"
        style={{ width, height, transform: `scale(${scale})` }}
      />
      {body && createPortal(<LandingPageRenderer config={config} />, body)}
    </>
  )
}
