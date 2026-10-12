"use client"

import { FileTextIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { intentionLabels } from "@/lib/email-builder/brief-templates"
import type { BriefItemStatus, EditorialBriefV1, HccBriefState } from "@/lib/hcc/brief"

// Brief éditorial reçu du HCC (option B), en LECTURE SEULE : le Builder ne le modifie jamais. Les statuts restent
// visibles : une hypothèse ou un élément à confirmer n'est jamais présenté comme une décision.

const statuts: Record<BriefItemStatus, { label: string; variant: "brand-soft" | "outline" | "accent-1" }> = {
  acquis: { label: "Acquis", variant: "brand-soft" },
  hypothese: { label: "Hypothèse", variant: "outline" },
  a_confirmer: { label: "À confirmer", variant: "accent-1" },
}

type Item = { texte: string; statut: BriefItemStatus }

function Statut({ statut }: { statut: BriefItemStatus }) {
  return (
    <Badge variant={statuts[statut].variant} className="shrink-0">
      {statuts[statut].label}
    </Badge>
  )
}

function Ligne({ item }: { item: Item }) {
  return (
    <li className="flex items-start justify-between gap-2">
      <span className="min-w-0 break-words">{item.texte}</span>
      <Statut statut={item.statut} />
    </li>
  )
}

function Rubrique({ titre, items }: { titre: string; items: readonly Item[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-caption font-semibold text-muted-foreground">{titre}</h3>
      {items.length ? <ul className="flex flex-col gap-1.5 text-body">{items.map((item, index) => <Ligne key={index} item={item} />)}</ul> : <p className="text-caption text-muted-foreground">Aucun</p>}
    </section>
  )
}

/** Bandeau sous la barre d'enregistrement : état du brief (et bouton d'affichage s'il est valide). */
export function HccBriefBar({ state, open, onToggle }: { state: HccBriefState; open: boolean; onToggle: () => void }) {
  if (state.status === "aucun") return null
  if (state.status === "valide") {
    const { brief } = state
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 text-caption">
        <p className="min-w-0">
          <span className="font-semibold">Brief HCC</span> · {brief.contenu.id} « {brief.contenu.titre} » · version {brief.briefVersion} · validé
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
    <div role={state.status === "obsolete" ? "alert" : "status"} className="shrink-0 border-b bg-background px-4 py-2 text-caption">
      {state.status === "obsolete" ? (
        <p>
          <span className="font-semibold text-destructive">Brief HCC obsolète.</span> Le brief de cette production a changé dans le HCC et doit être revalidé : l&apos;assistant travaille sans brief.
        </p>
      ) : (
        <p className="text-muted-foreground">Brief HCC indisponible pour le moment : l&apos;éditeur reste utilisable, l&apos;assistant travaille sans brief.</p>
      )}
    </div>
  )
}

/** Panneau latéral « Brief HCC » : objectif, audience, angle, promesse, messages, ton, CTA, preuves, contraintes… */
export function HccBriefPanel({ brief, onClose }: { brief: EditorialBriefV1; onClose: () => void }) {
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
          <p className="text-body font-medium">
            {brief.contenu.id} · {brief.contenu.titre}
          </p>
          <p className="text-caption text-muted-foreground">
            {brief.priseDeParole.nom} · version {brief.briefVersion}, validée le {new Date(brief.valideLe).toLocaleDateString("fr-FR")} · lecture seule
          </p>
        </div>
        <section className="flex flex-col gap-1.5 rounded-lg bg-muted/60 px-3 py-2">
          <h3 className="text-caption font-semibold text-muted-foreground">Statut du brief</h3>
          <p className="text-body">
            <Badge variant="brand-soft">Validé dans le HCC</Badge> <span className="text-muted-foreground">version {brief.briefVersion}, relu à chaque génération</span>
          </p>
          <h3 className="mt-1 text-caption font-semibold text-muted-foreground">Intention</h3>
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
        <Rubrique titre="Spécificités Email" items={brief.specificites.map((s) => ({ texte: `${s.libelle} : ${s.texte}`, statut: s.statut }))} />
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
      </div>
    </aside>
  )
}
