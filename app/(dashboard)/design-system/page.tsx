import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/page-header"
import { BadgeShowcase } from "@/components/design-system/badges"
import { ButtonShowcase } from "@/components/design-system/buttons"
import { ColorGroups } from "@/components/design-system/colors"
import { RadiusSamples } from "@/components/design-system/radius"
import { TypographySamples } from "@/components/design-system/typography"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { groupColorTokens, readLandingCss } from "@/lib/design-system/landing-css"

export const metadata: Metadata = { title: "Design System" }

const sections = [
  { id: "couleurs", title: "Couleurs" },
  { id: "typographie", title: "Typographie" },
  { id: "boutons", title: "Boutons" },
  { id: "badges", title: "Badges" },
  { id: "rayons", title: "Rayons" },
] as const

function Block({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-8 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="text-body font-medium">
          {title}
        </h3>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-8">{children}</CardContent>
      </Card>
    </section>
  )
}

export default function DesignSystemPage() {
  // Lu dans app/globals.css au rendu : aucune valeur n'est recopiée ici.
  const css = readLandingCss()
  const colorGroups = groupColorTokens(css.root)
  const baseRadius = css.root.find((variable) => variable.name === "radius")

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Design System"
        description="Les styles réellement utilisés par les landing pages, rendus avec les vrais composants et lus dans leurs sources."
      />

      <div className="flex flex-col gap-12">
        <section aria-labelledby="landing-title" className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h2 id="landing-title" className="text-h2">
              Landing Pages
            </h2>
            <nav aria-label="Sections du design system Landing" className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <Button key={section.id} variant="outline" size="sm" nativeButton={false} render={<a href={`#${section.id}`} />}>
                  {section.title}
                </Button>
              ))}
            </nav>
          </div>

          <Block id="couleurs" title="Couleurs" description="Tokens de app/globals.css : la pastille est peinte avec var(--token), la valeur est celle du fichier.">
            <ColorGroups groups={colorGroups} />
          </Block>

          <Block id="typographie" title="Typographie" description="Cinq styles. Chaque ligne est un vrai élément ; la taille, l'interligne et la graisse sont mesurés par le navigateur.">
            <TypographySamples />
          </Block>

          <Block id="boutons" title="Boutons" description="Le vrai composant Button, avec les variants et les tailles de sa configuration.">
            <ButtonShowcase />
          </Block>

          <Block id="badges" title="Badges" description="Le vrai composant Badge, avec les variants et les tailles de sa configuration.">
            <BadgeShowcase />
          </Block>

          <Block
            id="rayons"
            title="Rayons"
            description={`Vraies classes rounded-* ; le rayon affiché est le rayon calculé.${baseRadius ? ` Base : --radius ${baseRadius.value}.` : ""}`}
          >
            <RadiusSamples />
          </Block>
        </section>

        <section aria-labelledby="emails-title" className="flex flex-col gap-4">
          <h2 id="emails-title" className="text-h2">
            Emails
          </h2>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle>Design System Email</CardTitle>
                <Badge variant="secondary">Bientôt</Badge>
              </div>
              <CardDescription>Le domaine Email a ses propres sources ; il sera présenté séparément.</CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </div>
  )
}
