import type { Metadata } from "next"

import { BuilderWorkspace } from "@/components/email-builder/builder-workspace"
import { renderCanvasHtml } from "@/lib/email-builder/canvas"
import { builderLames } from "@/lib/email-builder/catalog"
import { buildDemoDocument } from "@/lib/email-builder/demo-document"

export const metadata: Metadata = {
  title: "Email Builder",
}

/**
 * Email Builder V2 : un vrai email Studi du POC (promotion « R4-B », valeurs de
 * démonstration) ouvert dans un canvas manipulable. Le document, son rendu et le
 * catalogue de lames sont préparés côté serveur ; aucun appel de modèle, aucune
 * persistance (un rechargement revient à ce document).
 */
export default function EmailBuilderPage() {
  const initialDocument = buildDemoDocument()
  return <BuilderWorkspace initialDocument={initialDocument} initialHtml={renderCanvasHtml(initialDocument)} lames={builderLames()} />
}
