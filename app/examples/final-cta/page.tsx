import { FinalCta } from "@/components/sections/final-cta"

export default function FinalCtaExamplePage() {
  return (
    <main>
      <FinalCta
        title="Prêt à explorer les formations ?"
        description="Parcourez le catalogue Studi pour découvrir les formations qui correspondent à votre projet."
        primaryAction={{
          label: "Voir le catalogue",
          href: "https://www.studi.com/fr/formations",
        }}
      />
    </main>
  )
}
