"use client"

import { useCallback, useState } from "react"

import { radiusSteps } from "./styles"

/** Une forme portant la vraie classe `rounded-*` ; le rayon affiché est le rayon calculé. */
function RadiusSample({ className }: (typeof radiusSteps)[number]) {
  const [radius, setRadius] = useState<string | null>(null)
  const measure = useCallback((element: HTMLElement | null) => {
    if (!element) return
    const pixels = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
    // `rounded-full` est un rayon démesuré (calc(infinity * 1px)) : pilule.
    setRadius(pixels > 9999 ? "pilule" : `${pixels} px`)
  }, [])

  return (
    <li className="flex min-w-0 flex-col gap-3">
      <div ref={measure} aria-hidden className={`${className} h-20 border border-border bg-muted`} />
      <div className="flex flex-col gap-1">
        <code className="text-caption">{className}</code>
        <span className="text-caption text-muted-foreground" aria-live="polite">
          {radius ?? "mesure…"}
        </span>
      </div>
    </li>
  )
}

export function RadiusSamples() {
  return (
    <ul role="list" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {radiusSteps.map((step) => (
        <RadiusSample key={step.token} {...step} />
      ))}
    </ul>
  )
}
