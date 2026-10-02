import { useId } from "react"
import Image from "next/image"
import Link from "next/link"

import { PageContainer } from "@/components/layout/page-container"
import { landingFooterNavigationGroups, landingLegalLinks } from "@/lib/landing/footer-links"

/**
 * Footer global des landing pages : shell du renderer, pas une section.
 * Rendu automatiquement en bas de chaque page par `LandingPageRenderer`, hors
 * de `sections[]` : ni le contrat, ni le Draft, ni le catalogue de composition
 * IA ne le connaissent, et Claude n'en contrôle rien. Contenu entièrement fixe
 * (`lib/landing/footer-links.ts`). Composant serveur.
 *
 * Fond `neutral-950` : distinct du vert de FinalCta qui peut le précéder.
 * Le ring global (`brand-green`) étant invisible sur ce fond, les liens portent
 * leur propre contour de focus en `neutral-0`.
 */
const linkClassName =
  "rounded-sm underline-offset-4 transition-colors hover:text-neutral-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-0 motion-reduce:transition-none"

export function LandingFooter() {
  const id = useId()

  return (
    <footer className="bg-neutral-950 py-12">
      <PageContainer className="flex flex-col gap-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <Image
            src="/logos/logo_studi_clair_highres.png"
            alt="Studi"
            width={1007}
            height={338}
            className="h-8 w-auto shrink-0 self-start"
          />
          <nav aria-label="Studi" className="grid gap-8 md:grid-cols-2">
            {landingFooterNavigationGroups.map((group, index) => (
              <div key={group.label} className="flex flex-col gap-3">
                <p id={`${id}-${index}`} className="text-body font-semibold text-neutral-0">
                  {group.label}
                </p>
                <ul role="list" aria-labelledby={`${id}-${index}`} className="flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link.destination}>
                      <Link href={link.href} className={`text-body text-neutral-300 ${linkClassName}`}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-800 pt-6 text-caption text-neutral-400">
          <p>© Studi</p>
          <nav aria-label="Informations légales">
            <ul role="list" className="flex flex-wrap gap-x-6 gap-y-2">
              {landingLegalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClassName}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </PageContainer>
    </footer>
  )
}
