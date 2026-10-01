import type { Metadata } from "next"

import { GeneratorWorkspace } from "@/components/generator/generator-workspace"
import { emptyGeneratorBrief, generatorObjectives } from "@/lib/landing/brief"

export const metadata: Metadata = {
  title: "Landing Page Generator",
}

export default function GeneratorPage() {
  // Aucune génération au chargement : formulaire vide, aperçu vide.
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-body font-semibold">Landing Page Generator</h1>
      </header>
      <GeneratorWorkspace
        initialBrief={emptyGeneratorBrief}
        objectives={generatorObjectives}
      />
    </div>
  )
}
