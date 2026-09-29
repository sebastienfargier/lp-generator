import { ImmersiveHero } from "@/components/sections/immersive-hero"

export default function ImmersiveHeroExamplePage() {
  return (
    <main>
      <ImmersiveHero
        badge={{ label: "Bilan d’orientation gratuit", variant: "accent-1" }}
        headline={["Votre formation", "est peut-être déjà", "finançable"]}
        description="30 min pour savoir si c’est jouable"
        primaryAction={{ label: "Faire mon bilan", href: "#bilan" }}
        visual={{ src: "/images/hero-bilan.jpg", alt: "", position: "right" }}
      />
    </main>
  )
}
