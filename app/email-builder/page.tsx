import type { Metadata } from "next"

import { BuilderShell } from "@/components/email-builder/builder-shell"
import { builderLames } from "@/lib/email-builder/catalog"
import { builderTemplates } from "@/lib/email-builder/templates"

export const metadata: Metadata = {
  title: "Email Builder",
}

/**
 * Email Builder : la porte d'entrée. AUCUN email n'est ouvert à l'arrivée : la
 * personne choisit de partir de zéro ou d'un modèle (la référence viendra plus
 * tard). Les modèles et le catalogue de lames sont préparés côté serveur ; aucun
 * appel de modèle, aucune persistance. Le document de démonstration reste une
 * fixture de développement et de test (`demo-document.ts`), jamais injecté ici.
 */
export default function EmailBuilderPage() {
  return <BuilderShell lames={builderLames()} templates={builderTemplates()} />
}
