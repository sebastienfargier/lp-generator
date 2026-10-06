"use client"

import { useState } from "react"
import { XIcon } from "lucide-react"

import { EmailLameFrame } from "@/components/email/email-lame-frame"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { BuilderLame } from "@/lib/email-builder/catalog"

type LameLibraryPanelProps = {
  lames: readonly BuilderLame[]
  /** Où la lame sera insérée, en une phrase. */
  where: string
  onPick: (lame: BuilderLame) => void
  onClose: () => void
}

/**
 * Bibliothèque de lames, CONTEXTUELLE : elle s'ouvre quand on ajoute une lame et
 * se ferme dès qu'une lame est choisie (ou sur demande). Les aperçus sont ceux
 * de la bibliothèque existante (vrai renderer, contenu de démonstration). Le
 * contenu inséré est un contenu PROVISOIRE de démonstration, à remplacer.
 */
export function LameLibraryPanel({ lames, where, onPick, onClose }: LameLibraryPanelProps) {
  const families = [...new Set(lames.map((lame) => lame.family))]
  const [family, setFamily] = useState<string>("all")
  const visible = lames.filter((lame) => family === "all" || lame.family === family)

  return (
    <aside
      aria-label="Bibliothèque de lames"
      className="absolute inset-y-0 left-0 z-30 flex w-[min(20rem,100%)] shrink-0 flex-col border-r bg-background shadow-xl lg:static lg:z-auto lg:shadow-none"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-body font-semibold">Ajouter une lame</h2>
          <p className="text-caption text-muted-foreground">{where}. Le contenu ajouté est un exemple provisoire.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Fermer la bibliothèque" onClick={onClose}>
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="shrink-0 border-b px-4 py-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Famille"
          className="flex-wrap"
          value={[family]}
          onValueChange={(values: string[]) => setFamily(values[0] ?? "all")}
        >
          <ToggleGroupItem value="all" className="aria-pressed:bg-accent aria-pressed:text-accent-foreground">
            Toutes
          </ToggleGroupItem>
          {families.map((name) => (
            <ToggleGroupItem key={name} value={name} className="aria-pressed:bg-accent aria-pressed:text-accent-foreground">
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <ul role="list" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {visible.map((lame) => (
          <li key={lame.type}>
            {lame.starter ? (
              <button
                type="button"
                onClick={() => onPick(lame)}
                className="flex w-full flex-col gap-2 rounded-lg border bg-card p-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <EmailLameFrame src={`/email-library/preview/${lame.type}`} title={`Aperçu : ${lame.name}`} />
                <span className="flex flex-col px-1 pb-1">
                  <span className="text-body font-medium">{lame.name}</span>
                  <span className="text-caption text-muted-foreground">{lame.family} · {lame.role}</span>
                </span>
              </button>
            ) : (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed p-3 text-muted-foreground">
                <span className="text-body font-medium">{lame.name}</span>
                <span className="text-caption">{lame.unavailable}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
