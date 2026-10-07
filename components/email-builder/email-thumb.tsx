"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"

/** Largeur canonique d'un email : le document n'est jamais étiré, seulement réduit. */
const EMAIL_WIDTH = 600

type EmailThumbProps = {
  /** Route d'aperçu du document (`/email-builder/preview/[id]`) : le HTML rendu par le vrai renderer. */
  src: string
  /** Hauteur de l'email visible, en px d'email (600 px de large) : le cadre garde ce rapport, donc aucun saut de mise en page. */
  crop: number
  /** Décalage vertical dans l'email, en px d'email : montrer une autre partie du document. */
  offset?: number
  /** Charger à l'approche de l'écran (cartes sous le pli). */
  lazy?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * Une miniature d'email : le HTML réel, dans une iframe isolée (même motif que `EmailLameFrame`),
 * à 600 px de large puis réduite à la largeur de son cadre. Purement décorative : hors de
 * l'arbre d'accessibilité, inerte, sans capture de clic ni de focus. L'iframe n'est montée
 * qu'une fois la largeur mesurée ; le cadre, lui, réserve sa place dès le premier rendu.
 */
export function EmailThumb({ src, crop, offset = 0, lazy = false, className = "", style }: EmailThumbProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    // Mesure immédiate (l'iframe se monte dès l'hydratation), puis à chaque changement de largeur du cadre.
    const measure = () => setScale(element.getBoundingClientRect().width / EMAIL_WIDTH)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frame} aria-hidden inert className={`relative overflow-hidden bg-neutral-0 ${className}`} style={{ aspectRatio: `${EMAIL_WIDTH} / ${crop}`, ...style }}>
      {scale > 0 && (
        <iframe
          src={src}
          title=""
          tabIndex={-1}
          loading={lazy ? "lazy" : "eager"}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          scrolling="no"
          className="pointer-events-none absolute top-0 left-0 block origin-top-left border-0"
          style={{ width: EMAIL_WIDTH, height: crop + offset, transform: `translateY(${-offset * scale}px) scale(${scale})` }}
        />
      )}
    </div>
  )
}
