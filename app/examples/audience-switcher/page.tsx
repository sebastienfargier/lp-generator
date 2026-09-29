import {
  AudienceSwitcher,
  type AudienceItem,
} from "@/components/sections/audience-switcher"

const items: AudienceItem[] = [
  {
    id: "employed",
    eyebrow: "En poste",
    title: "Lorem ipsum dolor",
    description:
      "Fast, focused lessons that fit into your life and create career impact.",
    image: {
      src: "/images/audience-1.jpg",
      alt: "Homme souriant travaillant sur son ordinateur à la maison",
    },
  },
  {
    id: "student",
    eyebrow: "Étudiant",
    title: "Lorem ipsum dolor",
    description: "Learn strategies, frameworks, and more from industry leaders.",
    image: {
      src: "/images/audience-2.jpg",
      alt: "Étudiant montant un escalier, un classeur sous le bras",
    },
  },
  {
    id: "job-seeker",
    eyebrow: "Demandeur d’emploi",
    title: "Lorem ipsum dolor",
    description:
      "Gain high-impact skills you can apply now. No prereqs required.",
    image: {
      src: "/images/audience-3.jpg",
      alt: "Femme consultant une tablette, assise dans son salon",
    },
  },
]

export default function AudienceSwitcherExamplePage() {
  return (
    <main>
      <AudienceSwitcher
        label="Une formation pour chaque profil"
        items={items}
        defaultValue="employed"
      />
    </main>
  )
}
