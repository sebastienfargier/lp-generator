"use client"

import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { BuilderTemplate } from "@/lib/email-builder/templates"

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
}

const content = "mx-auto w-full max-w-6xl px-4 pb-12 lg:px-6"

/**
 * La porte d'entrée du Builder : aucun email n'est ouvert. Trois chemins vers LE MÊME Builder, de
 * même poids : partir de zéro, d'un modèle, d'une référence. Chacun montre une scène faite de vrais
 * emails rendus par le renderer. Choisir ne crée aucune opération : cela ouvre le travail. Pas de
 * wizard, pas de formulaire : un choix, puis le Builder.
 */
export function EntryScreen({ mode, templates, onBlank, onTemplates, onReference, onTemplate, onBack }: EntryScreenProps) {
  if (mode === "templates") {
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
            {templates.map((template) => (
              <li key={template.id} className="flex">
                <div className="w-full">
                  <CreationPathCard
                    id={`template-${template.id}`}
                    title={template.title}
                    description={template.description}
                    cta="Utiliser ce modèle"
                    meta={`${template.blockCount} lames`}
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
    <EntryFrame
      label="Créer un email"
      back={
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />} className="-ml-2">
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          Dashboard
        </Button>
      }
    >
      <div className={`${content} flex flex-col gap-8 pt-4 sm:gap-10 sm:pt-10`}>
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-h1 text-balance sm:text-display">Créons ton prochain email.</h1>
          <p className="text-h2 font-normal text-muted-foreground">Pars d&apos;une page blanche, d&apos;un modèle Studi ou d&apos;une inspiration.</p>
        </div>
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
