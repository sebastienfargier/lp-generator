import { SparklesIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Place réservée à l'assistant global (niveau EMAIL). Aucun appel, aucun chat :
 * ce panneau pose seulement l'équilibre spatial du Builder, et se replie pour
 * rendre toute la place au canvas.
 */
export function AssistantPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside aria-label="Assistant Studi" className="hidden w-72 shrink-0 flex-col border-l bg-background xl:flex">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h2 className="flex items-center gap-2 text-body font-semibold">
          <SparklesIcon className="size-4 text-muted-foreground" aria-hidden />
          Assistant Studi
        </h2>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Replier l'assistant" onClick={onClose}>
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-body font-medium">Bientôt disponible</p>
        <p className="text-caption text-muted-foreground">L&apos;assistant proposera, vérifiera et recommandera. Vous gardez la main sur l&apos;email.</p>
      </div>
    </aside>
  )
}
