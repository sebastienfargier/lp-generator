import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BuilderShell } from "@/components/email-builder/builder-shell"
import { builderLames } from "@/lib/email-builder/catalog"
import { builderTemplates } from "@/lib/email-builder/templates"
import { loadPageEditor } from "@/lib/hcc/page-session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Email Builder",
  robots: { index: false },
}

/**
 * Entrée PROTÉGÉE de l'Email Builder : une session issue d'un lancement HCC, liée à CET asset. Sans session, session
 * expirée ou autre asset : jamais l'éditeur. Le document enregistré dans le HCC est lu côté serveur : asset neuf →
 * écran de départ ; document existant → éditeur ouvert dessus. Le jeton HCC n'est jamais transmis au client.
 */
export default async function EmailBuilderAssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params
  const load = await loadPageEditor(assetId)
  if (load.status === "redirect") redirect(load.to)
  return (
    <BuilderShell
      lames={builderLames()}
      templates={builderTemplates()}
      hcc={{ assetId, assetName: load.session.assetName, revision: load.revision, document: load.document, editorialStatus: load.editorialStatus }}
    />
  )
}
