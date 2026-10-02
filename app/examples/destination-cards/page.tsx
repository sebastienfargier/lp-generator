import { DestinationCards } from "@/components/sections/destination-cards"

export default function DestinationCardsExamplePage() {
  return (
    <main>
      <DestinationCards
        title="Trois façons de poursuivre votre exploration"
        description="Explorez votre projet par métier, par niveau de diplôme ou directement dans le catalogue."
        items={[
          {
            title: "Explorer les métiers",
            description: "Découvrir un métier avant de choisir une formation.",
            href: "https://www.studi.com/fr/metiers",
          },
          {
            title: "Comparer les niveaux de diplôme",
            description: "Choisir une formation selon le niveau de sortie visé.",
            href: "https://www.studi.com/fr/diplomes",
          },
          {
            title: "Parcourir le catalogue",
            description: "Consulter l'ensemble des formations, avec des filtres.",
            href: "https://www.studi.com/fr/formations",
          },
        ]}
      />
    </main>
  )
}
