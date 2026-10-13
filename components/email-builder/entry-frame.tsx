import type { ReactNode } from "react"

type EntryFrameProps = {
  /** Nom accessible de la zone principale. */
  label: string
  /** Le retour vers les choix (« Retour ») : seul contenu du header. Sans retour (l'entrée), pas de header. */
  back?: ReactNode
  /** Largeur du header ET du contenu : le header s'aligne toujours sur ce qu'il surplombe. */
  maxWidth?: string
  children: ReactNode
}

/**
 * L'enveloppe commune des écrans qui précèdent le Builder (l'entrée, le choix d'un modèle, la
 * référence) : un viewport, un header de 48 px aligné sur le contenu, et le fond des pages du HCC :
 * jaune très pâle en haut (`accent-1` à 22 % dans le blanc) vers le blanc sur 28rem, même règle que
 * le `body` du HCC. Jamais dans l'éditeur, qui garde une surface neutre. Aucune logique : ce que
 * l'écran affiche reste le sien.
 */
export function EntryFrame({ label, back, maxWidth = "max-w-6xl", children }: EntryFrameProps) {
  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background bg-no-repeat"
      style={{ backgroundImage: "linear-gradient(to bottom, color-mix(in oklab, var(--accent-1) 22%, var(--background)), var(--background) 28rem)" }}
    >
      {back && (
        <header className="h-12 shrink-0">
          <div className={`mx-auto flex h-full w-full items-center px-4 lg:px-6 ${maxWidth}`}>{back}</div>
        </header>
      )}
      <main aria-label={label} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
