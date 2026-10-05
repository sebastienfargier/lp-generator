"use client"

import { useEffect, useRef, useState } from "react"

/** Largeur canonique d'un email (et de chaque lame) : le document n'est jamais étiré. */
const EMAIL_WIDTH = 600
/** Hauteur provisoire avant la mesure du document. */
const FALLBACK_HEIGHT = 320

type EmailLameFrameProps = {
  /** Route d'aperçu de la lame (HTML complet rendu par le renderer Email). */
  src: string
  title: string
}

/**
 * Aperçu réel d'une lame : le HTML du renderer dans une iframe isolée, à la
 * largeur canonique de 600 px, réduite (jamais agrandie) à la largeur
 * disponible. L'iframe prend la hauteur de son document, sans barre de
 * défilement interne : ce n'est donc pas un nouveau rendu de la lame, seulement
 * son document affiché à l'échelle.
 */
export function EmailLameFrame({ src, title }: EmailLameFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(FALLBACK_HEIGHT)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const scale = Math.min(1, width / EMAIL_WIDTH)

  return (
    <div className="rounded-lg bg-neutral-200 p-3 sm:p-4">
      <div ref={containerRef} className="w-full">
        {scale > 0 && (
          <div className="mx-auto overflow-hidden border bg-background" style={{ width: EMAIL_WIDTH * scale, height: height * scale }}>
            {/* Sans allow-scripts, allow-same-origin ne donne aucun pouvoir au document :
                il résout /logos, /icones et /images sur l'origine de l'application et reste
                mesurable. Les liens du HTML d'aperçu sont déjà inertes. */}
            <iframe
              src={src}
              title={title}
              loading="lazy"
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              tabIndex={-1}
              onLoad={(event) => {
                // Hauteur du corps (et non du document, jamais plus court que l'iframe).
                const body = event.currentTarget.contentDocument?.body
                const measured = body ? Math.ceil(body.getBoundingClientRect().height) : 0
                if (measured) setHeight(measured)
              }}
              className="block origin-top-left border-0"
              style={{ width: EMAIL_WIDTH, height, transform: `scale(${scale})` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
