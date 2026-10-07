"use client"

import Link from "next/link"
import { ArrowLeftIcon, FilePlusIcon, ImageIcon, LayoutTemplateIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BuilderTemplate } from "@/lib/email-builder/templates"

type EntryScreenProps = {
  /** `entry` : « Comment veux-tu commencer ? » ; `templates` : le choix d'un modèle. Aucun email n'est encore ouvert dans les deux cas. */
  mode: "entry" | "templates"
  templates: readonly BuilderTemplate[]
  onBlank: () => void
  onTemplates: () => void
  onTemplate: (template: BuilderTemplate) => void
  onBack: () => void
}

const card = "flex w-full flex-col items-start gap-3 rounded-lg border bg-card p-6 text-left transition-colors"
const interactive = "cursor-pointer outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * La porte d'entrée du Builder : aucun email n'est ouvert. Trois chemins vers LE
 * MÊME Builder : partir de zéro, partir d'un modèle, (bientôt) partir d'une
 * référence. Choisir ne crée aucune opération : cela ouvre le travail. Pas de
 * wizard, pas de formulaire : un choix, puis le Builder.
 */
export function EntryScreen({ mode, templates, onBlank, onTemplates, onTemplate, onBack }: EntryScreenProps) {
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        {mode === "templates" ? (
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" aria-hidden />
            Retour
          </Button>
        ) : (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />} className="-ml-2">
            <ArrowLeftIcon data-icon="inline-start" aria-hidden />
            Dashboard
          </Button>
        )}
      </header>

      <main aria-label={mode === "templates" ? "Choisir un modèle" : "Créer un email"} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12">
          {mode === "entry" ? (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="text-h1">Créer un email</h1>
                <p className="text-body text-muted-foreground">Comment veux-tu commencer ?</p>
              </div>
              <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <li className="flex">
                  <button type="button" onClick={onBlank} className={`${card} ${interactive}`}>
                    <FilePlusIcon className="size-6" aria-hidden />
                    <span className="flex flex-col gap-1">
                      <span className="text-h2">Partir de zéro</span>
                      <span className="text-body text-muted-foreground">Construire mon email lame par lame</span>
                    </span>
                  </button>
                </li>
                <li className="flex">
                  <button type="button" onClick={onTemplates} className={`${card} ${interactive}`}>
                    <LayoutTemplateIcon className="size-6" aria-hidden />
                    <span className="flex flex-col gap-1">
                      <span className="text-h2">Partir d&apos;un modèle</span>
                      <span className="text-body text-muted-foreground">Utiliser une base Studi existante</span>
                    </span>
                  </button>
                </li>
                <li className="flex">
                  <button type="button" disabled aria-describedby="reference-soon" className={`${card} cursor-not-allowed opacity-60`}>
                    <ImageIcon className="size-6" aria-hidden />
                    <span className="flex flex-col gap-1">
                      <span className="text-h2">Depuis une référence</span>
                      <span className="text-body text-muted-foreground">Créer à partir d&apos;une inspiration</span>
                    </span>
                    <Badge id="reference-soon" variant="outline">
                      Bientôt disponible
                    </Badge>
                  </button>
                </li>
              </ul>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="text-h1">Choisir un modèle</h1>
                <p className="text-body text-muted-foreground">Une base Studi à modifier librement : tu pourras tout changer, ajouter ou retirer des lames.</p>
              </div>
              <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {templates.map((template) => (
                  <li key={template.id} className="flex">
                    <button type="button" onClick={() => onTemplate(template)} className={`${card} ${interactive}`}>
                      <span className="flex flex-col gap-1">
                        <span className="text-h2">{template.title}</span>
                        <span className="text-body text-muted-foreground">{template.description}</span>
                      </span>
                      <span className="text-caption text-muted-foreground">{template.blockCount} lames</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
