import type { ContentItem } from "@/components/content/content-card"
import { ContentCarousel } from "@/components/sections/content-carousel"

const items: ContentItem[] = [
  {
    eyebrow: "Lorem ipsum",
    title: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    image: { src: "/images/content-1.jpg", alt: "Apprenante souriante devant son ordinateur dans une cuisine" },
  },
  {
    eyebrow: "Dolor sit amet",
    title: "Sed do eiusmod tempor incididunt ut labore et dolore.",
    image: { src: "/images/content-2.jpg", alt: "Femme lisant sur une tablette, assise en extérieur" },
  },
  {
    eyebrow: "Consectetur",
    title: "Ut enim ad minim veniam, quis nostrud exercitation.",
    image: { src: "/images/content-3.jpg", alt: "Femme travaillant debout devant son ordinateur près d'une fenêtre" },
  },
  {
    eyebrow: "Adipiscing elit",
    title: "Duis aute irure dolor in reprehenderit in voluptate.",
    image: { src: "/images/content-4.jpg", alt: "Deux amies souriantes, l'une tenant un téléphone" },
  },
]

export default function ContentCarouselExamplePage() {
  return (
    <main>
      <ContentCarousel label="Nos contenus" items={items} />
    </main>
  )
}
