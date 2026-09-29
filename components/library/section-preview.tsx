"use client"

import { useEffect, useRef, useState } from "react"
import { MonitorIcon, SmartphoneIcon, TabletIcon } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const viewports = [
  { value: "mobile", label: "Mobile", width: 375, icon: SmartphoneIcon },
  { value: "tablet", label: "Tablette", width: 768, icon: TabletIcon },
  { value: "desktop", label: "Desktop", width: undefined, icon: MonitorIcon },
] as const

type Viewport = (typeof viewports)[number]["value"]

type SectionPreviewProps = {
  src: string
  title: string
}

/**
 * Aperçu interactif d'une lame dans une iframe (les media queries réagissent
 * à sa largeur). La hauteur suit celle du contenu de la page de démo.
 */
export function SectionPreview({ src, title }: SectionPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let observer: ResizeObserver | undefined

    const observeContent = () => {
      const frameWindow = iframe.contentWindow as
        | (Window & typeof globalThis)
        | null
      const doc = iframe.contentDocument
      const target = doc?.querySelector("main") ?? doc?.body
      if (!frameWindow || !target) return
      const update = () =>
        setHeight(Math.ceil(target.getBoundingClientRect().height))
      observer?.disconnect()
      observer = new frameWindow.ResizeObserver(update)
      observer.observe(target)
      update()
    }

    iframe.addEventListener("load", observeContent)
    observeContent()
    return () => {
      iframe.removeEventListener("load", observeContent)
      observer?.disconnect()
    }
  }, [src])

  const width = viewports.find((item) => item.value === viewport)?.width

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        variant="outline"
        aria-label="Largeur de l'aperçu"
        value={[viewport]}
        onValueChange={(values: string[]) => {
          if (values[0]) setViewport(values[0] as Viewport)
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

      <div className="overflow-hidden rounded-xl bg-neutral-200 p-2 sm:p-4">
        <iframe
          ref={iframeRef}
          src={src}
          title={`Aperçu de ${title}`}
          className="mx-auto block max-w-full rounded-lg border-0 bg-background transition-[width] motion-reduce:transition-none"
          style={{ width: width ?? "100%", height }}
        />
      </div>
    </div>
  )
}
