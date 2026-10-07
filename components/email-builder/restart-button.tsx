"use client"

import { RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

type RestartButtonProps = {
  /** Il y a du travail à perdre (une lame ou une version) : on demande confirmation. Sinon on recommence aussitôt. */
  confirm: boolean
  onRestart: () => void
}

/**
 * « Recommencer » : revient au choix « Comment veux-tu commencer ? » et abandonne le
 * travail local de la session (rien n'est enregistré, aucun Undo ne traverse ce
 * geste). Une confirmation simple quand il y a quelque chose à perdre.
 */
export function RestartButton({ confirm, onRestart }: RestartButtonProps) {
  const trigger = (
    <Button type="button" variant="ghost" size="sm" aria-label="Recommencer" title="Recommencer" onClick={confirm ? undefined : onRestart}>
      <RotateCcwIcon data-icon="inline-start" aria-hidden />
      <span className="hidden lg:inline">Recommencer</span>
    </Button>
  )
  if (!confirm) return trigger
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommencer cet email ?</DialogTitle>
          <DialogDescription>Le travail non persisté de cette session sera perdu.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
          <DialogClose render={<Button type="button" onClick={onRestart} />}>Recommencer</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
