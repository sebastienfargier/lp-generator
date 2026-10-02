import { StepSequence } from "@/components/sections/step-sequence"

export default function StepSequenceExamplePage() {
  return (
    <main>
      <StepSequence
        title="Clarifier son projet pas à pas"
        description="Quelques repères pour passer d'une première idée à une direction plus précise."
        items={[
          {
            title: "Explorer les possibilités",
            description:
              "Parcourez les domaines et les métiers qui vous attirent, sans vous fermer de porte.",
          },
          {
            title: "Comparer les pistes",
            description:
              "Mettez en regard ce que chaque piste demande et ce qu'elle peut vous apporter.",
          },
          {
            title: "Préciser son choix",
            description:
              "Gardez la piste qui correspond le mieux à votre situation et à vos envies.",
          },
        ]}
      />
    </main>
  )
}
