"use client"

import { ChevronDownIcon, ChevronUpIcon, EllipsisIcon, PaletteIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { emailSurfaceRecipes, emailSurfaces, type EmailSurface } from "@/lib/email/surfaces"

/** Noms humains des sept surfaces fermées (la couleur affichée est celle de la table de substitution). */
export const surfaceLabels: Record<EmailSurface, string> = {
  page: "Page",
  bloc: "Bloc",
  "accent-1": "Accent 1 (jaune)",
  "accent-2-soft": "Accent 2 doux",
  "accent-2": "Accent 2",
  marque: "Marque",
  encre: "Encre",
}

type BlockToolbarProps = {
  /** Nom de la lame, pour les libellés accessibles. */
  name: string
  /** Mention discrète de l'origine de la lame (« Générée »). */
  badge?: string | undefined
  canMoveUp: boolean
  canMoveDown: boolean
  /** Surface actuelle ; `null` : la lame garde ses couleurs (aucun choix de surface). */
  surface: EmailSurface | null
  onMove: (delta: -1 | 1) => void
  onSurface: (surface: EmailSurface) => void
  onRemove: () => void
}

/**
 * Actions de la lame sélectionnée, au niveau LAME seulement : déplacer, surface,
 * supprimer. Chaque action est un bouton nommé, utilisable au clavier ; rien
 * n'est réservé au survol. Aucune confirmation : annuler est le filet de sécurité.
 */
export function BlockToolbar({ name, badge, canMoveUp, canMoveDown, surface, onMove, onSurface, onRemove }: BlockToolbarProps) {
  return (
    <div role="toolbar" aria-label={`Actions de la lame ${name}`} className="flex items-center gap-1 rounded-full border bg-background p-1 shadow-md">
      {badge && <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">{badge}</span>}
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Monter la lame" title="Monter la lame" disabled={!canMoveUp} onClick={() => onMove(-1)}>
        <ChevronUpIcon aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Descendre la lame" title="Descendre la lame" disabled={!canMoveDown} onClick={() => onMove(1)}>
        <ChevronDownIcon aria-hidden />
      </Button>
      {surface !== null && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="xs" aria-label="Changer la surface de la lame" />}>
            <PaletteIcon aria-hidden />
            Surface
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-52" align="end">
            <DropdownMenuRadioGroup value={surface} onValueChange={(value) => onSurface(value as EmailSurface)}>
              {emailSurfaces.map((option) => (
                <DropdownMenuRadioItem key={option} value={option} closeOnClick>
                  <span aria-hidden className="size-4 shrink-0 rounded-full border" style={{ background: emailSurfaceRecipes[option].fond }} />
                  {surfaceLabels[option]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Plus d'actions sur la lame" />}>
          <EllipsisIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-48" align="end">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2Icon aria-hidden />
            Supprimer la lame
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
