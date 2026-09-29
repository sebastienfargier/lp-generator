import type { Metadata } from "next"

import { LandingPageRenderer } from "@/components/landing"
import { simulateLandingPageGeneration } from "@/lib/generator/generate"
import { safeParseLandingPage } from "@/lib/landing/schemas"

export const metadata: Metadata = {
  title: "Aperçu · Landing Page Generator",
  robots: { index: false },
}

/**
 * Document isolé chargé dans l'iframe du générateur : la landing page y est
 * rendue côté serveur, avec sa propre largeur de viewport.
 */
export default function GeneratorPreviewPage() {
  const result = safeParseLandingPage(simulateLandingPageGeneration())

  if (!result.success) {
    return (
      <main className="p-6 text-body text-muted-foreground">
        Aucun aperçu disponible : la configuration générée est invalide.
      </main>
    )
  }

  return <LandingPageRenderer config={result.data} />
}
