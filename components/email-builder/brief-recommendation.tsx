"use client"

import { Button } from "@/components/ui/button"
import type { TemplateRecommendation } from "@/lib/email-builder/brief-templates"
import type { BuilderTemplate } from "@/lib/email-builder/templates"

import { CreationPathCard } from "./creation-path-card"
import { TemplateStage } from "./entry-scenes"

/**
 * Création ouverte depuis un brief HCC valide (option B, L1) : les deux modèles recommandés d'après l'intention du brief,
 * avec la raison du choix. Placé AU-DESSUS des trois chemins d'entrée, qui gardent tous le même poids ; la personne peut
 * choisir n'importe quel autre modèle (« Voir tous les modèles »). Sans brief, rien n'est affiché.
 */
export function BriefRecommendation({ recommendation, onTemplate, onTemplates }: { recommendation: TemplateRecommendation; onTemplate: (template: BuilderTemplate) => void; onTemplates: () => void }) {
  return (
    <section aria-labelledby="brief-recommandation" className="flex flex-col gap-4 rounded-xl border bg-background p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-caption font-semibold text-muted-foreground">Brief HCC · {recommendation.label}</p>
        <h2 id="brief-recommandation" className="text-h2">Modèles recommandés pour ce brief</h2>
        <p className="text-body text-muted-foreground">{recommendation.justification} Tu peux choisir n&apos;importe quel autre modèle.</p>
      </div>
      <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {recommendation.templates.map(({ template, reason }) => (
          <li key={template.id} className="flex">
            <div className="w-full">
              <CreationPathCard
                id={`recommande-${template.id}`}
                title={`${template.title} · ${template.description}`}
                description={reason}
                cta="Utiliser ce modèle"
                meta={`Recommandé · ${template.blockCount} lames`}
                stage={<TemplateStage id={template.id} />}
                stageClass="bg-neutral-100"
                stageHeight="h-64 sm:h-72"
                onSelect={() => onTemplate(template)}
              />
            </div>
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onTemplates}>
          Voir tous les modèles
        </Button>
      </div>
    </section>
  )
}
