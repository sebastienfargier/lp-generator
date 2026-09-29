"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/** Largeur de rendu de la miniature : la lame s'affiche comme sur un écran desktop. */
const VIEWPORT_WIDTH = 1440
const VIEWPORT_HEIGHT = 900

type SectionThumbnailProps = {
  src: string
  className?: string
}

/** Aperçu réel de la lame, rendu à 1440 px puis réduit à la largeur disponible. */
export function SectionThumbnail({ src, className }: SectionThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / VIEWPORT_WIDTH)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn("relative aspect-16/10 overflow-hidden bg-muted", className)}
    >
      {scale > 0 && (
        <iframe
          src={src}
          title=""
          loading="lazy"
          tabIndex={-1}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{
            width: VIEWPORT_WIDTH,
            height: VIEWPORT_HEIGHT,
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  )
}
