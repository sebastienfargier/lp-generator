import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import { formatLameCount, resourceLibraries, type ResourceLibrary } from "./dashboard-data"

function EntryContent({ library }: { library: ResourceLibrary }) {
  const Icon = library.icon

  return (
    <>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-medium">{library.title}</span>
        <span className="text-body text-muted-foreground">{library.description}</span>
      </div>
      {library.lames !== null ? (
        <span className="shrink-0 text-body text-muted-foreground">{formatLameCount(library.lames)}</span>
      ) : (
        <span className="shrink-0 text-body text-muted-foreground">Bientôt</span>
      )}
    </>
  )
}

function ResourceEntry({ library }: { library: ResourceLibrary }) {
  // Une bibliothèque qui n'existe pas encore n'est pas un lien : aucune page n'est inventée.
  if (library.href === null) {
    return (
      <div className="flex items-center gap-4 p-6">
        <EntryContent library={library} />
      </div>
    )
  }

  return (
    <Link
      href={library.href}
      className="group/entry flex items-center gap-4 p-6 outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <EntryContent library={library} />
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/entry:translate-x-1"
        aria-hidden
      />
    </Link>
  )
}

export function ResourcesCard() {
  return (
    <Card className="gap-0 py-0">
      {resourceLibraries.map((library, index) => (
        <div key={library.title}>
          {index > 0 ? <Separator /> : null}
          <ResourceEntry library={library} />
        </div>
      ))}
    </Card>
  )
}
