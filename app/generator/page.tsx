import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { GeneratorWorkspace } from "@/components/generator/generator-workspace"
import { emptyGeneratorBrief, generatorObjectives } from "@/lib/landing/brief"
import { landingSupportedObjectives } from "@/lib/landing/generation-request"

export const metadata: Metadata = {
  title: "Landing Page Generator",
}

/** Objectifs que le moteur IA sait servir ; les autres restent dans le contrat historique du formulaire. */
const objectives = generatorObjectives.filter((objective) =>
  (landingSupportedObjectives as readonly string[]).includes(objective.value)
)

export default function GeneratorPage() {
  // Aucune génération au chargement : formulaire prêt, aperçu vide.
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />} className="-ml-2">
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          Dashboard
        </Button>
        <h1 className="text-body font-semibold">Landing Page Generator</h1>
      </header>
      <GeneratorWorkspace
        initialBrief={{ ...emptyGeneratorBrief, objective: landingSupportedObjectives[0], facts: "" }}
        objectives={objectives}
      />
    </div>
  )
}
