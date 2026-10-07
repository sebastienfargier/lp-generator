"use client"

import { useState } from "react"
import { CheckIcon, ChevronDownIcon, HistoryIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { nextVersionPrefix, relativeTime, statusLabels, versionLabel, type EmailVersion } from "@/lib/email-builder/versions"

type VersionsMenuProps = {
  versions: readonly EmailVersion[]
  /** La version dont part le travail (pour le libellé du bouton). */
  baseId: string | null
  /** La version consultée, s'il y en a une. */
  viewingId: string | null
  /** Le travail diffère de sa version de départ. */
  changed: boolean
  /** Aucune lame : un email vide ne s'enregistre pas en version. */
  empty?: boolean
  onView: (id: string) => void
  onExitView: () => void
  /** Enregistre une version du travail actuel ; le nom peut être vide. */
  onSave: (name: string) => void
}

/**
 * Les versions nommées : un menu pour les retrouver, une petite fenêtre pour en
 * enregistrer une. Une version est un instantané VOLONTAIRE du travail ; ce n'est ni
 * l'historique annuler / rétablir, ni le statut. Le numéro est attribué par le
 * système : on ne saisit que le nom.
 */
export function VersionsMenu({ versions, baseId, viewingId, changed, empty = false, onView, onExitView, onSave }: VersionsMenuProps) {
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const base = versions.find((version) => version.id === baseId)
  const newestFirst = [...versions].reverse()
  const viewing = viewingId !== null

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onSave(name)
    setName("")
    setSaving(false)
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && setNow(Date.now())}>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" aria-label={`Versions${base ? ` : version actuelle ${versionLabel(base)}` : ""}${changed ? ", modifications non enregistrées dans une version" : ""}`} />}>
          <HistoryIcon data-icon="inline-start" aria-hidden />
          <span className="hidden max-w-40 truncate lg:inline">{base ? versionLabel(base) : "Versions"}</span>
          {changed && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand-green" />}
          <ChevronDownIcon data-icon="inline-end" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-80" align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Versions</DropdownMenuLabel>
            <DropdownMenuItem onClick={onExitView}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">Travail actuel</span>
                <span className="text-caption text-muted-foreground">{changed ? "Modifications non enregistrées dans une version" : base ? `Identique à ${versionLabel(base)}` : "Pas encore de version"}</span>
              </span>
              {!viewing && <CheckIcon aria-hidden />}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {newestFirst.length === 0 && <p className="px-2 py-1.5 text-caption text-muted-foreground">Aucune version enregistrée.</p>}
            {newestFirst.map((version) => (
              <DropdownMenuItem key={version.id} onClick={() => onView(version.id)}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{versionLabel(version)}</span>
                  <span className="text-caption text-muted-foreground">
                    {statusLabels[version.status]} · {relativeTime(version.createdAt, now)}
                  </span>
                </span>
                {version.id === viewingId && <CheckIcon aria-hidden />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={viewing || empty} onClick={() => setSaving(true)}>
            <PlusIcon aria-hidden />
            Enregistrer une nouvelle version
          </DropdownMenuItem>
          {empty && <p className="px-2 py-1.5 text-caption text-muted-foreground">Ajoute une première lame pour enregistrer une version.</p>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-6">
            <DialogHeader>
              <DialogTitle>Enregistrer une nouvelle version</DialogTitle>
              <DialogDescription>Un instantané du travail actuel, pour pouvoir y revenir. Annuler et rétablir ne changent pas.</DialogDescription>
            </DialogHeader>
            <label className="flex flex-col gap-2 text-body">
              Nom de la version
              <span className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-3 focus-within:ring-ring/50">
                <span className="shrink-0 text-muted-foreground">{nextVersionPrefix(versions)}</span>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  maxLength={60}
                  placeholder="Plus directe"
                  onChange={(event) => setName(event.target.value)}
                  className="h-9 min-w-0 flex-1 bg-transparent outline-none"
                />
              </span>
              <span className="text-caption text-muted-foreground">Facultatif : sans nom, la version s&apos;appelle simplement {nextVersionPrefix(versions).replace(" –", "")}.</span>
            </label>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
              <Button type="submit">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
