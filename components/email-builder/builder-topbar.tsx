"use client"

import Link from "next/link"
import { ArrowLeftIcon, MonitorIcon, PlusIcon, Redo2Icon, SmartphoneIcon, SparklesIcon, Undo2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import type { CanvasViewport } from "./builder-canvas"

const viewports = [
  { value: "desktop", label: "Desktop", icon: MonitorIcon },
  { value: "mobile", label: "Mobile", icon: SmartphoneIcon },
] as const

type BuilderTopbarProps = {
  name: string
  canUndo: boolean
  canRedo: boolean
  viewport: CanvasViewport
  assistantOpen: boolean
  onUndo: () => void
  onRedo: () => void
  onAddBlock: () => void
  onViewport: (viewport: CanvasViewport) => void
  onToggleAssistant: () => void
}

/**
 * Barre du Builder : l'email (nom, statut), l'historique de travail, la largeur
 * d'aperçu et l'accès à la bibliothèque. Pas de sauvegarde, d'export ni de
 * gestion de statut dans ce checkpoint : le statut est seulement affiché.
 */
export function BuilderTopbar({ name, canUndo, canRedo, viewport, assistantOpen, onUndo, onRedo, onAddBlock, onViewport, onToggleAssistant }: BuilderTopbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />} className="-ml-2">
        <ArrowLeftIcon data-icon="inline-start" aria-hidden />
        Dashboard
      </Button>
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-body font-semibold" title={name}>
          {name}
        </h1>
        <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-caption text-muted-foreground">Brouillon</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Annuler" title="Annuler (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={onUndo}>
            <Undo2Icon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Rétablir" title="Rétablir (Ctrl/Cmd+Maj+Z)" disabled={!canRedo} onClick={onRedo}>
            <Redo2Icon aria-hidden />
          </Button>
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Largeur d'aperçu"
          className="hidden sm:flex"
          value={[viewport]}
          onValueChange={(values: string[]) => {
            const next = viewports.find((item) => item.value === values[0])
            if (next) onViewport(next.value)
          }}
        >
          {viewports.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value} className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground">
              <item.icon aria-hidden />
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" variant="outline" size="sm" onClick={onAddBlock}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          Ajouter une lame
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" className="hidden xl:inline-flex" aria-label={assistantOpen ? "Replier l'assistant" : "Ouvrir l'assistant"} aria-pressed={assistantOpen} onClick={onToggleAssistant}>
          <SparklesIcon aria-hidden />
        </Button>
      </div>
    </header>
  )
}
