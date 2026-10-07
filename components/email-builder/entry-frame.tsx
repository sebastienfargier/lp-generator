import type { ReactNode } from "react"

type EntryFrameProps = {
  /** Nom accessible de la zone principale. */
  label: string
  /** Le retour (Dashboard, ou Retour vers les choix) : seul contenu du header. */
  back: ReactNode
  /** Largeur du header ET du contenu : le header s'aligne toujours sur ce qu'il surplombe. */
  maxWidth?: string
  children: ReactNode
}

/**
 * L'enveloppe commune des écrans qui précèdent le Builder (l'entrée, le choix d'un modèle, la
 * référence) : un viewport, un header de 48 px aligné sur le contenu, et une atmosphère très
 * légère sur la surface Studi (`surface`) : un halo `brand-green-soft` en haut à gauche, un halo
 * `accent-1` discret en bas à droite. Statique, sans image ni texture, hors de l'arbre
 * d'accessibilité et sans capture de souris. Aucune logique : ce que l'écran affiche reste le sien.
 */
export function EntryFrame({ label, back, maxWidth = "max-w-6xl", children }: EntryFrameProps) {
  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(48rem 26rem at 6% 0%, color-mix(in srgb, var(--brand-green-soft) 85%, transparent), transparent 70%), radial-gradient(40rem 22rem at 100% 100%, color-mix(in srgb, var(--accent-1) 22%, transparent), transparent 70%)",
        }}
      />
      <header className="relative z-10 h-12 shrink-0">
        <div className={`mx-auto flex h-full w-full items-center px-4 lg:px-6 ${maxWidth}`}>{back}</div>
      </header>
      <main aria-label={label} className="relative min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
