import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { EmailWorkspace } from "@/components/email/email-workspace"
import { Button } from "@/components/ui/button"
import { emailObjectives } from "@/lib/email/demo-generator"
import { buildEmailGeneratorExamples } from "@/lib/email/generator-examples"

export const metadata: Metadata = {
  title: "Email Generator",
}

export default function EmailGeneratorPage() {
  // Aucune génération au chargement : formulaire prêt, aperçu vide.
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />} className="-ml-2">
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          Dashboard
        </Button>
        <h1 className="text-body font-semibold">Email Generator</h1>
        <p className="hidden truncate text-caption text-muted-foreground sm:block">L&apos;IA compose l&apos;email à partir de lames contrôlées.</p>
      </header>
      <EmailWorkspace objectives={emailObjectives} examples={buildEmailGeneratorExamples()} />
    </div>
  )
}
