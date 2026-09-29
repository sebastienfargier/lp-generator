import { ProductHero } from "@/components/sections/product-hero"

export default function ProductHeroExamplePage() {
  return (
    <main>
      <ProductHero
        badges={[
          { label: "Populaire", variant: "accent-1" },
          { label: "100% En ligne · Titre RNCP de Niveau 7", variant: "brand-soft" },
        ]}
        title="MBA Manager Stratégique RH"
        description="Devenez un expert hautement qualifié de la transformation des ressources humaines. Un cursus d'excellence flexible pour concilier formation et activité professionnelle."
        pricing={{
          discount: "-20%",
          originalPrice: "1 250 €",
          price: "990 €",
          installment: "ou 82,50 €/mois",
          financing: {
            title: "Éligible MonCompteFormation",
            description:
              "Reste à charge possible de 0 € selon vos droits CPF cumulés.",
          },
        }}
        primaryAction={{ label: "Télécharger la documentation", href: "#documentation" }}
        secondaryAction={{ label: "Parler à un conseiller", href: "#contact" }}
        partner={{
          label: "En partenariat académique de prestige avec :",
          name: "ESGRH",
        }}
        visual={{
          src: "/images/hero-apprenante.jpg",
          alt: "Apprenante souriante assise sur un canapé",
        }}
        highlight={{
          title: "Débouchés professionnels",
          items: [
            "Consultant en stratégie d’entreprise",
            "Chargé de mission stratégique",
            "Chef de projet développement produit",
            "Consultant RH auto-entrepreneur",
          ],
        }}
      />
    </main>
  )
}
