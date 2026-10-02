import { NarrativeSplit } from "@/components/sections/narrative-split"

export default function NarrativeSplitExamplePage() {
  return (
    <main>
      <NarrativeSplit
        eyebrow="Votre projet"
        title="Changer de métier commence par clarifier ce qui vous attire"
        description="Une reconversion commence rarement par une formation. Elle commence par des questions : ce que vous aimez faire, ce que vous voulez quitter, ce que vous voulez construire."
        visual={{
          src: "/images/audience-2.jpg",
          alt: "Homme à lunettes montant un escalier, un classeur jaune sous le bras",
        }}
        visualSide="left"
      />
      <NarrativeSplit
        eyebrow="Votre rythme"
        title="Se former en gardant sa vie en équilibre"
        description="Apprendre en parallèle d'un emploi ou d'un quotidien déjà chargé demande de la souplesse. L'organisation de vos journées reste la vôtre."
        visual={{
          src: "/images/content-1.jpg",
          alt: "Femme en tablier rose, souriante, travaillant sur un ordinateur portable dans sa cuisine",
        }}
        visualSide="right"
      />
    </main>
  )
}
