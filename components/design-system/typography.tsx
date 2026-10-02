"use client"

import { useCallback, useState } from "react"

import { typographyStyles } from "./styles"

type Metrics = { fontSize: string; lineHeight: string; fontWeight: string }

/**
 * Un vrai élément portant la vraie classe (`text-h1`…) ; ses métriques sont
 * celles que le navigateur calcule, relevées avec `getComputedStyle`. Rien du
 * CSS du style n'est recopié.
 */
function TypographySample({ token, className, sample }: (typeof typographyStyles)[number]) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const measure = useCallback((element: HTMLElement | null) => {
    if (!element) return
    const style = getComputedStyle(element)
    setMetrics({ fontSize: style.fontSize, lineHeight: style.lineHeight, fontWeight: style.fontWeight })
  }, [])

  return (
    <div className="flex flex-col gap-3 border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <code className="text-caption">{className}</code>
        <span className="text-caption text-muted-foreground" aria-live="polite">
          {metrics ? `${metrics.fontSize} / ${metrics.lineHeight} · graisse ${metrics.fontWeight}` : "mesure…"}
        </span>
      </div>
      <p ref={measure} data-token={token} className={className}>
        {sample}
      </p>
    </div>
  )
}

export function TypographySamples() {
  return (
    <div className="flex flex-col">
      {typographyStyles.map((style) => (
        <TypographySample key={style.token} {...style} />
      ))}
    </div>
  )
}
