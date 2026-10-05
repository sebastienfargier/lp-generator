"use client"

import { useState } from "react"

import { EmailLameFrame } from "@/components/email/email-lame-frame"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { EmailLibraryEntry, EmailLibraryStatus } from "@/lib/email/library"
import type { EmailBlockFamily, EmailSlotKind } from "@/lib/email/manifest"

type EmailLibraryBrowserProps = {
  /** Lames, déjà groupées par famille dans l'ordre du manifeste. */
  entries: readonly EmailLibraryEntry[]
  families: readonly EmailBlockFamily[]
}

type StatusFilter = "all" | EmailLibraryStatus

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "ai-v1", label: "IA V1" },
  { value: "library-only", label: "Bibliothèque uniquement" },
]

const aiRoleNotes = {
  hero: "Hero : la lame est déterminée par l'image choisie par Claude.",
  body: "Bloc de corps que Claude peut choisir.",
  shell: "Posée automatiquement par le resolver, jamais choisie par Claude.",
} as const

const visualNotes = {
  photo: "Aperçu avec une photo du catalogue d'images.",
  empty: "Aperçu sans visuel : aucun asset au ratio de cette lame.",
} as const

const kindLabels: [kinds: EmailSlotKind[], one: string, many: string][] = [
  [["texte"], "texte", "textes"],
  [["cta", "cta:fleche"], "bouton", "boutons"],
  [["lien"], "lien", "liens"],
  [["asset:visuel"], "visuel", "visuels"],
  [["asset:icone"], "icône", "icônes"],
  [["disclaimer"], "mention légale", "mentions légales"],
]

function describeSlots({ slots }: EmailLibraryEntry) {
  if (slots.total === 0) return "Aucun slot : lame entièrement fixe."
  const parts = kindLabels.flatMap(([kinds, one, many]) => {
    const count = kinds.reduce((sum, kind) => sum + (slots.byKind[kind] ?? 0), 0)
    return count > 0 ? [`${count} ${count > 1 ? many : one}`] : []
  })
  const optional = slots.optional > 0 ? ` (dont ${slots.optional} optionnel${slots.optional > 1 ? "s" : ""})` : ""
  return `${slots.total} slot${slots.total > 1 ? "s" : ""}${optional} : ${parts.join(", ")}`
}

function LameCard({ entry }: { entry: EmailLibraryEntry }) {
  const ai = entry.status === "ai-v1"
  return (
    <Card className="h-full gap-4 pt-4">
      <div className="px-4">
        <EmailLameFrame src={`/email-library/preview/${entry.type}`} title={`Aperçu : ${entry.name}`} />
      </div>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle role="heading" aria-level={3}>
            {entry.name}
          </CardTitle>
          <Badge variant={ai ? "brand-soft" : "outline"}>{ai ? "IA V1" : "Bibliothèque uniquement"}</Badge>
        </div>
        <CardDescription>{entry.role}</CardDescription>
        <code className="w-fit max-w-full break-all rounded-sm bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">{entry.type}</code>
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
          <dt className="text-muted-foreground">Famille</dt>
          <dd>{entry.family}</dd>
          <dt className="text-muted-foreground">Slots</dt>
          <dd>{describeSlots(entry)}</dd>
          <dt className="text-muted-foreground">Surface</dt>
          <dd>{entry.surfaceMode === "configurable" ? "Configurable" : "Fixe"}</dd>
          {entry.visuals !== "none" && (
            <>
              <dt className="text-muted-foreground">Visuel</dt>
              <dd>{visualNotes[entry.visuals]}</dd>
            </>
          )}
          {entry.aiRole && (
            <>
              <dt className="text-muted-foreground">Rôle IA</dt>
              <dd>{aiRoleNotes[entry.aiRole]}</dd>
            </>
          )}
        </dl>
      </CardHeader>
    </Card>
  )
}

/** Exploration des lames Email : filtres simples (statut, famille) et cartes par famille. */
export function EmailLibraryBrowser({ entries, families }: EmailLibraryBrowserProps) {
  const [status, setStatus] = useState<StatusFilter>("all")
  const [family, setFamily] = useState<EmailBlockFamily | "all">("all")

  const visible = entries.filter((entry) => (status === "all" || entry.status === status) && (family === "all" || entry.family === family))
  const aiCount = entries.filter((entry) => entry.status === "ai-v1").length

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted-foreground" aria-live="polite">
          {entries.length} lames · {aiCount} IA V1 · {entries.length - aiCount} Bibliothèque uniquement
          {visible.length !== entries.length ? ` · ${visible.length} affichée${visible.length > 1 ? "s" : ""}` : ""}
        </p>
        <div className="flex flex-col gap-3">
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="Statut"
            className="flex-wrap"
            value={[status]}
            onValueChange={(values: string[]) => setStatus((statusFilters.find((item) => item.value === values[0])?.value ?? "all") as StatusFilter)}
          >
            {statusFilters.map((item) => (
              <ToggleGroupItem key={item.value} value={item.value} className="aria-pressed:bg-accent aria-pressed:text-accent-foreground">
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="Famille"
            className="flex-wrap"
            value={[family]}
            onValueChange={(values: string[]) => setFamily((families.find((item) => item === values[0]) ?? "all") as EmailBlockFamily | "all")}
          >
            <ToggleGroupItem value="all" className="aria-pressed:bg-accent aria-pressed:text-accent-foreground">
              Toutes les familles
            </ToggleGroupItem>
            {families.map((item) => (
              <ToggleGroupItem key={item} value={item} className="aria-pressed:bg-accent aria-pressed:text-accent-foreground">
                {item}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {visible.length === 0 && <p className="text-body text-muted-foreground">Aucune lame ne correspond à ces filtres.</p>}

      {families.map((name) => {
        const lames = visible.filter((entry) => entry.family === name)
        if (lames.length === 0) return null
        return (
          <section key={name} aria-labelledby={`family-${name}`} className="flex flex-col gap-4">
            <h2 id={`family-${name}`} className="text-h2">
              {name} <span className="text-body font-normal text-muted-foreground">· {lames.length}</span>
            </h2>
            <ul role="list" className="grid gap-6 lg:grid-cols-2">
              {lames.map((entry) => (
                <li key={entry.type} className="min-w-0">
                  <LameCard entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
