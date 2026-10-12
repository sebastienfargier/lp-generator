"use client"

import { ChevronDownIcon } from "lucide-react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { documentStatuses, statusLabels, type DocumentStatus } from "@/lib/email-builder/versions"

type StatusMenuProps = {
  status: DocumentStatus
  /** Consultation d'une version : son statut est un fait historique, il ne se change pas. */
  readOnly: boolean
  /** Aucune lame : il n'y a encore rien à valider ni à envoyer, le statut reste Brouillon. */
  empty?: boolean
  onChange: (status: DocumentStatus) => void
  /** Précision affichée au survol et lue par les lecteurs d'écran (mode HCC : statut de rédaction). */
  hint?: string
}

/**
 * Le statut éditorial du travail : libre, immédiat, sans confirmation ni
 * transition imposée. « Prêt à envoyer » dit que l'équipe juge l'email prêt ; le
 * Builder ne le garantit pas, et aucune recommandation ne le bloque.
 */
export function StatusMenu({ status, readOnly, empty = false, onChange, hint }: StatusMenuProps) {
  const chip = "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption"
  if (readOnly) {
    return (
      <span className={`${chip} text-muted-foreground`} title={hint ?? "Statut enregistré avec cette version"}>
        {statusLabels[status]}
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${hint ? "Statut de rédaction" : "Statut"} : ${statusLabels[status]}`} title={hint} className={`${chip} outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 ${status === "ready" ? "bg-accent-1 text-neutral-900" : "text-muted-foreground"}`}>
        {statusLabels[status]}
        <ChevronDownIcon className="size-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44" align="start">
        <DropdownMenuRadioGroup value={status} onValueChange={(value) => onChange(value as DocumentStatus)}>
          {documentStatuses.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} disabled={empty && option !== "draft"} closeOnClick>
              {statusLabels[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {empty && <p className="px-2 py-1.5 text-caption text-muted-foreground">Ajoute une première lame pour changer le statut.</p>}
        {hint && <p className="max-w-56 px-2 py-1.5 text-caption text-muted-foreground">{hint}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
