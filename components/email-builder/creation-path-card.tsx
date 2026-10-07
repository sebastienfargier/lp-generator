import type { ReactNode } from "react"
import { ArrowRightIcon } from "lucide-react"

type CreationPathCardProps = {
  /** Identifiant stable de la carte (pour relier le nom accessible). */
  id: string
  title: string
  description: string
  /** Micro-CTA : « Commencer ». Jamais un bouton principal : les cartes ont toutes le même poids. */
  cta: string
  /** Une précision discrète (« 6 lames »). */
  meta?: string
  /** La scène : des aperçus décoratifs, hors de l'arbre d'accessibilité. */
  stage: ReactNode
  /** Teinte de la scène (classe de fond : une surface de la palette Studi). */
  stageClass: string
  /** Hauteur de la scène (classes) ; par défaut, la hauteur des chemins d'entrée. */
  stageHeight?: string
  onSelect: () => void
}

/**
 * Une carte-chemin : la scène (un aperçu de l'expérience), le titre, une description, un micro-CTA.
 * Toute la carte est activable par le motif du dashboard (`ToolCard`) : le CTA est le SEUL élément
 * interactif et s'étend sur la carte (`::after`). La scène, elle, ne reçoit ni clic ni focus (elle
 * contient des iframes, interdites dans un bouton). Le nom accessible du bouton est le TITRE de la carte
 * (`aria-label`) : le micro-CTA reste un libellé visuel ; la description est reliée par `aria-describedby`.
 */
export function CreationPathCard({ id, title, description, cta, meta, stage, stageClass, stageHeight = "h-60 sm:h-80 lg:h-[clamp(16rem,42vh,28rem)]", onSelect }: CreationPathCardProps) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-xs ring-1 ring-border transition-shadow duration-200 hover:shadow-md hover:ring-brand-green/40 active:bg-surface has-[button:focus-visible]:shadow-md has-[button:focus-visible]:ring-[3px] has-[button:focus-visible]:ring-ring motion-reduce:transition-none">
      <div aria-hidden inert className={`relative shrink-0 overflow-hidden ${stageHeight} ${stageClass}`}>
        {stage}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2">{title}</h2>
          <p id={`${id}-description`} className="text-body text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            aria-label={title}
            aria-describedby={`${id}-description`}
            onClick={onSelect}
            className="-ml-1 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-1 text-body font-semibold outline-none after:absolute after:inset-0 after:content-['']"
          >
            {cta}
            <ArrowRightIcon className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" aria-hidden />
          </button>
          {meta && <span className="text-caption text-muted-foreground">{meta}</span>}
        </div>
      </div>
    </div>
  )
}
