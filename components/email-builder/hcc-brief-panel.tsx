"use client"

import { FileTextIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { intentionLabels } from "@/lib/email-builder/brief-templates"
import type { BriefItem, EditorialBrief, HccBriefState } from "@/lib/hcc/brief"

// Brief éditorial reçu du HCC (contrat V2), en LECTURE SEULE : le Builder ne le modifie jamais. Un seul statut est
// signalé, « À confirmer » : ce qui en dépend n'est jamais présenté comme établi.

function Ligne({ item }: { item: BriefItem }) {
  return (
    <li className="flex items-start justify-between gap-2">
      <span className="min-w-0 break-words">{item.texte}</span>
      {item.aConfirmer && (
        <Badge variant="accent-1" className="shrink-0">
          À confirmer
        </Badge>
      )}
    </li>
  )
}

function Rubrique({ titre, items }: { titre: string; items: readonly BriefItem[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-caption font-semibold text-muted-foreground">{titre}</h3>
      {items.length ? <ul className="flex flex-col gap-1.5 text-body">{items.map((item, index) => <Ligne key={index} item={item} />)}</ul> : <p className="text-caption text-muted-foreground">Aucun</p>}
    </section>
  )
}

/** Bandeau sous la barre d'enregistrement : état du brief (et bouton d'affichage s'il est disponible). */
export function HccBriefBar({ state, open, onToggle }: { state: HccBriefState; open: boolean; onToggle: () => void }) {
  if (state.status === "aucun") return null
  if (state.status === "disponible") {
    const { brief } = state
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 text-caption">
        <p className="min-w-0">
          <span className="font-semibold">Brief HCC</span> · « {brief.contenu.titre} » · brief version {brief.briefVersion}, cadrage version {brief.cadrageVersion}
          {brief.simplifie && " · version simplifiée"}
          <span className="text-muted-foreground"> — l&apos;assistant s&apos;appuie sur ce brief.</span>
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onToggle} aria-expanded={open} aria-controls="hcc-brief-panel">
          <FileTextIcon aria-hidden data-icon="inline-start" />
          {open ? "Masquer le brief" : "Voir le brief"}
        </Button>
      </div>
    )
  }
  return (
    <div role="status" className="shrink-0 border-b bg-background px-4 py-2 text-caption">
      <p className="text-muted-foreground">Brief HCC indisponible pour le moment : l&apos;éditeur reste utilisable, l&apos;assistant travaille sans brief.</p>
    </div>
  )
}

/** Panneau latéral « Brief HCC » : objectif, audience, angle, promesse, messages, ton, CTA, preuves, contraintes… */
export function HccBriefPanel({ brief, onClose }: { brief: EditorialBrief; onClose: () => void }) {
  return (
    <aside id="hcc-brief-panel" aria-label="Brief HCC" className="flex w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <p className="text-body font-semibold">Brief HCC</p>
        <button type="button" aria-label="Fermer le brief" className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" onClick={onClose}>
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium">{brief.contenu.titre}</p>
          <p className="text-caption text-muted-foreground">
            {brief.priseDeParole.nom} · {brief.contenu.moment} · brief version {brief.briefVersion} (cadrage version {brief.cadrageVersion}), rédigé le {new Date(brief.redigeLe).toLocaleDateString("fr-FR")} · lecture seule
          </p>
        </div>
        {brief.simplifie && (
          <p role="note" className="rounded-lg border border-dashed px-3 py-2 text-caption">
            Version simplifiée : l&apos;IA du HCC n&apos;a pas pu rédiger ce brief. Complète-le dans le HCC avant de t&apos;y fier.
          </p>
        )}
        <section className="flex flex-col gap-1.5 rounded-lg bg-muted/60 px-3 py-2">
          <h3 className="text-caption font-semibold text-muted-foreground">Intention</h3>
          <p className="text-body font-medium">{intentionLabels[brief.intention.valeur]}</p>
          <p className="text-body text-muted-foreground">{brief.intention.justification}</p>
        </section>
        <Rubrique titre="Objectif" items={[brief.objectif]} />
        <Rubrique titre="Audience" items={[brief.audience]} />
        <Rubrique titre="Angle" items={[brief.angle]} />
        <Rubrique titre="Promesse" items={[brief.promesse]} />
        <Rubrique titre="Message principal" items={[brief.messages.principal]} />
        <Rubrique titre="Messages secondaires" items={brief.messages.secondaires} />
        <Rubrique titre="Ton" items={[brief.tonalite]} />
        <Rubrique titre="Appel à l'action" items={[brief.cta]} />
        <Rubrique titre="Preuves" items={brief.preuves} />
        <Rubrique titre="Contraintes" items={brief.contraintes} />
        <Rubrique titre="Spécificités Email" items={brief.specificites.map((s) => ({ texte: `${s.libelle} : ${s.texte}`, aConfirmer: s.aConfirmer }))} />
        <section className="flex flex-col gap-1.5">
          <h3 className="text-caption font-semibold text-muted-foreground">Structure recommandée</h3>
          <ol className="flex flex-col gap-1 text-body">
            {brief.structure.map((partie, index) => (
              <li key={index}>
                <span className="font-medium">
                  {index + 1}. {partie.partie}
                </span>{" "}
                <span className="text-muted-foreground">{partie.contenu}</span>
              </li>
            ))}
          </ol>
        </section>
        {brief.aConfirmer.length > 0 && (
          <section className="flex flex-col gap-1.5 rounded-lg border border-dashed px-3 py-2">
            <h3 className="text-caption font-semibold">À confirmer avant l&apos;envoi</h3>
            <ul className="list-disc pl-4 text-body">
              {brief.aConfirmer.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {brief.sources.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-caption font-semibold text-muted-foreground">Sources studi.com</h3>
            <ul className="flex flex-col gap-1.5 text-body">
              {brief.sources.map((s) => (
                <li key={s.url + s.texte}>
                  {s.texte}{" "}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-caption underline underline-offset-2">
                    {s.url.replace(/^https?:\/\/(www\.)?/, "")}
                    <span className="sr-only"> (nouvel onglet)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}
