"use client"

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCarousel } from "@/components/ui/carousel"

/** Précédent / suivant, désactivés aux extrémités (pas de boucle). */
export function CarouselNav() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel()

  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Élément précédent"
        disabled={!canScrollPrev}
        onClick={scrollPrev}
      >
        <ArrowLeftIcon aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Élément suivant"
        disabled={!canScrollNext}
        onClick={scrollNext}
      >
        <ArrowRightIcon aria-hidden />
      </Button>
    </div>
  )
}
