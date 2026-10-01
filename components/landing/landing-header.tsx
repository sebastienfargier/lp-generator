import Image from "next/image"

import { PageContainer } from "@/components/layout/page-container"
import { Button } from "@/components/ui/button"

/**
 * Header global des landing pages : shell du renderer, pas une section.
 * Rendu automatiquement en haut de chaque page par `LandingPageRenderer`,
 * hors de `sections[]` : ni le contrat, ni le Draft, ni le catalogue de
 * composition IA ne le connaissent, et Claude n'en contrôle rien.
 *
 * Même axe horizontal que les lames (`PageContainer`) : logo à gauche, CTA à
 * droite, sur fond de page, sans filet ni ombre. Composant serveur.
 *
 * Le CTA est un placeholder visuel (« CTA », comme la référence) : un bouton
 * qui ne navigue pas. Son rôle métier et sa destination ne sont pas encore
 * définis ; quand ils le seront, il deviendra un lien vers une destination
 * contrôlée (`landingDestinationUrl`), sans rien changer au contrat.
 */
export function LandingHeader() {
  return (
    <header className="bg-background py-4">
      <PageContainer className="flex items-center justify-between gap-4">
        <Image
          src="/logos/logo_studi_sombre_highres.png"
          alt="Studi"
          width={1007}
          height={338}
          className="h-8 w-auto shrink-0 sm:h-10"
        />
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="border-foreground shadow-none"
        >
          CTA
        </Button>
      </PageContainer>
    </header>
  )
}
