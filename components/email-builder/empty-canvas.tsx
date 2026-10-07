"use client"

import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type EmptyCanvasProps = {
  onAddFirst: () => void
}

/**
 * Le canvas d'un email sans lame : un état vide en React, jamais un rendu de
 * l'email (le renderer n'est pas appelé, il n'y a ni HTML ni iframe).
 */
export function EmptyCanvas({ onAddFirst }: EmptyCanvasProps) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-xl border border-dashed bg-background px-6 py-12 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2">Ton email est vide</h2>
        <p className="text-body text-muted-foreground">Commence par choisir une lame dans la bibliothèque.</p>
      </div>
      <Button type="button" onClick={onAddFirst}>
        <PlusIcon data-icon="inline-start" aria-hidden />
        Ajouter une première lame
      </Button>
    </div>
  )
}
