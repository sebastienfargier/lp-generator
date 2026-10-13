"use client"

import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { TemplateRecommendation } from "@/lib/email-builder/brief-templates"
import type { BuilderTemplate } from "@/lib/email-builder/templates"

import { BriefRecommendation } from "./brief-recommendation"
import { CreationPathCard } from "./creation-path-card"
import { EntryFrame } from "./entry-frame"
import { BlankStage, ReferenceStage, TemplateFan, TemplateStage } from "./entry-scenes"

type EntryScreenProps = {
  /** `entry` : « Créons ton prochain email. » ; `templates` : le choix d'un modèle. Aucun email n'est encore ouvert dans les deux cas. */
  mode: "entry" | "templates"
  templates: readonly BuilderTemplate[]
  onBlank: () => void
  onTemplates: () => void
  onReference: () => void
  onTemplate: (template: BuilderTemplate) => void
  onBack: () => void
  /** Brief HCC valide : modèles recommandés d'après son intention (la personne garde le choix de tout autre modèle). */
  recommendation?: TemplateRecommendation | null
  /** Brief HCC obsolète ou indisponible : message affiché à la place de la recommandation. */
  briefNotice?: string | null
  /** Ouverture d'un modèle recommandé depuis l'écran d'entrée. */
  onRecommendedTemplate?: (template: BuilderTemplate) => void
}

const content = "mx-auto w-full max-w-6xl px-4 pb-12 lg:px-6"

/**
 * Section « Modèles recommandés pour ce brief » (et le message « brief indisponible » qui la remplace) : masquée pour
 * l'instant. `true` la réaffiche telle quelle ; la recommandation reste calculée (ordre et mention « Recommandé » du
 * choix d'un modèle). Masquée, aucun aperçu de modèle n'est monté.
 */
const SHOW_BRIEF_RECOMMENDATION: boolean = false

/**
 * La porte d'entrée du Builder : aucun email n'est ouvert. Trois chemins vers LE MÊME Builder, de
 * même poids : partir de zéro, d'un modèle, d'une référence. Chacun montre une scène faite de vrais
 * emails rendus par le renderer. Choisir ne crée aucune opération : cela ouvre le travail. Pas de
 * wizard, pas de formulaire : un choix, puis le Builder.
 */
export function EntryScreen({ mode, templates, onBlank, onTemplates, onReference, onTemplate, onBack, recommendation, briefNotice, onRecommendedTemplate }: EntryScreenProps) {
  if (mode === "templates") {
    // Les modèles recommandés d'abord (avec leur raison), puis tous les autres : aucun n'est retiré.
    const reasons = new Map((recommendation?.templates ?? []).map(({ template, reason }) => [template.id, reason]))
    const ordered = [...templates].sort((a, b) => Number(reasons.has(b.id)) - Number(reasons.has(a.id)))
    return (
      <EntryFrame
        label="Choisir un modèle"
        back={
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" aria-hidden />
            Retour
          </Button>
        }
      >
        <div className={`${content} flex flex-col gap-8 pt-6 sm:pt-10`}>
          <div className="flex flex-col gap-2">
            <h1 className="text-h1">Choisir un modèle</h1>
            <p className="text-body text-muted-foreground">Une base Studi à modifier librement : tu pourras tout changer, ajouter ou retirer des lames.</p>
          </div>
          <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((template) => (
              <li key={template.id} className="flex">
                <div className="w-full">
                  <CreationPathCard
                    id={`template-${template.id}`}
                    title={template.title}
                    description={reasons.has(template.id) ? `${template.description}. ${reasons.get(template.id)}` : template.description}
                    cta="Utiliser ce modèle"
                    meta={reasons.has(template.id) ? `Recommandé pour ce brief · ${template.blockCount} lames` : `${template.blockCount} lames`}
                    stage={<TemplateStage id={template.id} />}
                    stageClass="bg-neutral-100"
                    stageHeight="h-64 sm:h-72"
                    onSelect={() => onTemplate(template)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </EntryFrame>
    )
  }

  return (
    <EntryFrame label="Créer un email">
      <div className={`${content} flex flex-col gap-8 pt-12 sm:gap-12 sm:pt-16`}>
        <header className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h1 className="text-h1 text-balance">Créons ton prochain email.</h1>
          <p className="text-body text-pretty text-muted-foreground">Pars d&apos;une page blanche, d&apos;un modèle Studi ou d&apos;une inspiration.</p>
        </header>
        {SHOW_BRIEF_RECOMMENDATION && recommendation && recommendation.templates.length > 0 && <BriefRecommendation recommendation={recommendation} onTemplate={onRecommendedTemplate ?? onTemplate} onTemplates={onTemplates} />}
        {SHOW_BRIEF_RECOMMENDATION && briefNotice && (
          <p role="status" className="rounded-lg border px-4 py-3 text-body text-muted-foreground">
            {briefNotice}
          </p>
        )}
        <ul role="list" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <li className="flex">
            <div className="w-full">
              <CreationPathCard id="blank" title="Partir de zéro" description="Assemble ton email lame par lame." cta="Commencer" stage={<BlankStage />} stageClass="bg-neutral-100" onSelect={onBlank} />
            </div>
          </li>
          <li className="flex">
            <div className="w-full">
              <CreationPathCard id="templates" title="Partir d'un modèle" description="Une base Studi que tu modifies librement." cta="Voir les modèles" stage={<TemplateFan />} stageClass="bg-brand-green-soft" onSelect={onTemplates} />
            </div>
          </li>
          <li className="flex md:col-span-2 lg:col-span-1">
            <div className="w-full md:mx-auto md:max-w-[calc(50%-0.75rem)] lg:max-w-none">
              <CreationPathCard id="reference" title="Créer depuis une référence" description="Importe une inspiration, nous l'adaptons à Studi." cta="Importer une capture" stage={<ReferenceStage />} stageClass="bg-accent-2-soft/50" onSelect={onReference} />
            </div>
          </li>
        </ul>
      </div>
    </EntryFrame>
  )
}
