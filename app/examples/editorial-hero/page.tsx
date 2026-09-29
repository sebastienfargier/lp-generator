import { EditorialHero } from "@/components/sections/editorial-hero"

export default function EditorialHeroExamplePage() {
  return (
    <main>
      <EditorialHero
        title="Vous êtes en charge d'enfants, et vous n'avez pas le temps pour vous former ?"
        visual={{
          src: "/images/hero-parent-enfant.jpg",
          alt: "Une mère joue avec son jeune enfant dans un salon lumineux",
        }}
        primaryAction={{
          label: "Découvrir nos formations",
          href: "#formations",
        }}
        supportingText="Formations 100% en ligne, à votre rythme, compatibles avec votre vie de famille."
      />
    </main>
  )
}
