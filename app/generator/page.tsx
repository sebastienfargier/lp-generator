import type { Metadata } from "next"

import { GeneratorWorkspace } from "@/components/generator/generator-workspace"
import { Badge } from "@/components/ui/badge"
import {
  defaultGeneratorBrief,
  generatorObjectives,
  runGeneration,
} from "@/lib/generator/generate"

export const metadata: Metadata = {
  title: "Landing Page Generator",
}

export default function GeneratorPage() {
  // L'aperçu initial emprunte le même chemin que les générations suivantes.
  const initialResult = runGeneration(defaultGeneratorBrief)

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-body font-semibold">Landing Page Generator</h1>
        <Badge variant="secondary">Local</Badge>
      </header>
      <GeneratorWorkspace
        initialBrief={defaultGeneratorBrief}
        initialResult={initialResult}
        objectives={generatorObjectives}
      />
    </div>
  )
}
