import { cn } from "@/lib/utils"

/**
 * Largeur de page commune à toutes les sections de landing page :
 * elles partagent ainsi les mêmes axes gauche/droite.
 *
 * Convention : chaque composant de section rend
 *   <section> (fond pleine largeur, espacement vertical)
 *     └── <PageContainer>
 *           └── layout propre à la section
 * Les pages composent des sections et ne les enveloppent jamais
 * dans un autre PageContainer. Ne pas surcharger la largeur via `className`.
 */
export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 xl:px-12",
        className
      )}
      {...props}
    />
  )
}
