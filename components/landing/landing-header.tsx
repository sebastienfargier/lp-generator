import Image from "next/image"

import { PageContainer } from "@/components/layout/page-container"

/**
 * Header global des landing pages : shell du renderer, pas une section.
 * Rendu automatiquement en haut de chaque page par `LandingPageRenderer`,
 * hors de `sections[]` : ni le contrat, ni le Draft, ni le catalogue de
 * composition IA ne le connaissent, et Claude n'en contrôle rien.
 *
 * Même axe horizontal que les lames (`PageContainer`) : le logo Studi seul, à
 * gauche, sur fond de page, sans filet ni ombre. Aucun contrôle interactif :
 * le header n'a pas de CTA tant qu'aucune destination métier ne le justifie.
 * Composant serveur.
 */
export function LandingHeader() {
  return (
    <header className="bg-background py-4">
      <PageContainer className="flex items-center">
        <Image
          src="/logos/logo_studi_sombre_highres.png"
          alt="Studi"
          width={1007}
          height={338}
          className="h-8 w-auto shrink-0 sm:h-10"
        />
      </PageContainer>
    </header>
  )
}
