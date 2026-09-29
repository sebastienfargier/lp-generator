import type { Metadata } from "next"

import { EmailWorkspace } from "@/components/email/email-workspace"
import { Badge } from "@/components/ui/badge"
import { defaultEmailBrief, emailDemoPresets, emailObjectives } from "@/lib/email/demo-generator"
import { runEmailGeneration } from "@/lib/email/generation"

export const metadata: Metadata = {
  title: "Email Generator",
}

export default function EmailGeneratorPage() {
  // Aperçu initial : même chemin (brief → démo → Zod → renderEmail) que
  // POST /api/generate-email, exécuté côté serveur.
  const initialResult = runEmailGeneration(defaultEmailBrief)

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-body font-semibold">Email Generator</h1>
        <Badge variant="secondary">Demo</Badge>
      </header>
      <EmailWorkspace
        initialBrief={defaultEmailBrief}
        initialResult={initialResult}
        objectives={emailObjectives}
        presets={emailDemoPresets}
      />
    </div>
  )
}
