import { ContentCard, type ContentItem } from "@/components/content/content-card"
import { PageContainer } from "@/components/layout/page-container"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import { cn } from "@/lib/utils"

import { CarouselNav } from "./carousel-nav"

type ContentCarouselProps = {
  items: ContentItem[]
  /** Nom accessible du carrousel. */
  label?: string
  className?: string
}

export function ContentCarousel({
  items,
  label = "Contenus",
  className,
}: ContentCarouselProps) {
  return (
    <section
      aria-label={label}
      className={cn("bg-neutral-100 py-8 text-foreground md:py-12", className)}
    >
      <PageContainer>
        {/*
          Le viewport du carrousel reste dans PageContainer : il démarre sur l'axe
          commun et laisse entrevoir la carte suivante à droite.
          Mobile ~1,1 carte · tablette ~1,5 · desktop ~2,4.
        */}
        <Carousel
          opts={{ align: "start" }}
          aria-label={label}
          className="flex flex-col gap-6"
        >
          <CarouselContent>
            {items.map((item, index) => (
              <CarouselItem
                key={index}
                aria-label={`${index + 1} sur ${items.length}`}
                className="basis-11/12 sm:basis-2/3 lg:basis-5/12"
              >
                <ContentCard {...item} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselNav />
        </Carousel>
      </PageContainer>
    </section>
  )
}
