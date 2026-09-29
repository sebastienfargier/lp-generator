import type { Metadata } from "next"

import { LandingPageRenderer } from "@/components/landing"
import {
  GeneratorBriefSchema,
  generateValidatedPage,
} from "@/lib/generator/generate"

export const metadata: Metadata = {
  title: "Aperçu · Landing Page Generator",
  robots: { index: false },
}

function Message({ children }: { children: React.ReactNode }) {
  return <main className="p-6 text-body text-muted-foreground">{children}</main>
}

/**
 * Document isolé chargé dans l'iframe du générateur (ou ouvert seul). Le brief
 * est lu dans l'URL, régénéré par le moteur de démo déterministe, validé par
 * Zod puis rendu côté serveur.
 */
export default async function GeneratorPreviewPage(
  props: PageProps<"/generator/preview">
) {
  const { projectName, brief: text, audience, objective } =
    await props.searchParams
  const brief = GeneratorBriefSchema.safeParse({
    projectName,
    brief: text,
    audience,
    objective,
  })
  if (!brief.success) {
    return <Message>Aucun aperçu : le brief est incomplet.</Message>
  }

  const page = generateValidatedPage(brief.data)
  if (!page.success) {
    return (
      <Message>Aucun aperçu : la configuration générée est invalide.</Message>
    )
  }

  return <LandingPageRenderer config={page.config} />
}
