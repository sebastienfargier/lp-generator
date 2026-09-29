import type { LandingPageConfig } from "./types"

/**
 * Landing page de démonstration, décrite uniquement par des données
 * sérialisables. Rendue par `app/examples/generated-landing`.
 */
export const demoLandingPage = {
  version: 1,
  id: "reconversion-rh",
  title: "Se reconvertir dans les ressources humaines",
  sections: [
    {
      id: "hero",
      type: "editorial-hero",
      props: {
        title:
          "Envie de changer de métier ? Faites des ressources humaines votre nouveau terrain de jeu.",
        visual: {
          src: "/images/hero-apprenante.jpg",
          alt: "Apprenante souriante, assise sur un canapé, en pleine réflexion",
        },
        primaryAction: {
          label: "Découvrir les formations RH",
          href: "#formations",
        },
        supportingText:
          "Formations 100 % en ligne, compatibles avec votre emploi actuel.",
      },
    },
    {
      id: "benefices",
      type: "value-props",
      props: {
        label: "Pourquoi se former avec Studi",
        items: [
          {
            title: "À votre rythme",
            description:
              "Des cours en ligne accessibles le soir et le week-end, sans quitter votre poste.",
          },
          {
            title: "Des diplômes reconnus",
            description:
              "Des titres RNCP enregistrés, valorisés par les recruteurs RH.",
          },
          {
            title: "Un accompagnement réel",
            description:
              "Un coach pédagogique et des formateurs issus du métier à vos côtés.",
          },
          {
            title: "Finançable",
            description:
              "Mobilisez votre CPF ou un projet de transition professionnelle.",
          },
        ],
      },
    },
    {
      id: "formations",
      type: "product-grid",
      props: {
        label: "Nos formations en ressources humaines",
        products: [
          {
            title: "Titre pro Assistant ressources humaines",
            href: "/formations/assistant-ressources-humaines",
            image: {
              src: "/images/content-1.jpg",
              alt: "Apprenante travaillant sur son ordinateur dans sa cuisine",
            },
            badge: { label: "Accessible sans bac+2", variant: "brand-soft" },
            pricing: { price: "2 490 €" },
          },
          {
            title: "Bachelor Chargé de ressources humaines",
            href: "/formations/bachelor-charge-ressources-humaines",
            image: {
              src: "/images/content-3.jpg",
              alt: "Femme travaillant debout devant son ordinateur près d'une fenêtre",
            },
            badge: { label: "Populaire", variant: "accent-1" },
            partner: { label: "Partenaire académique", name: "ESGRH" },
            pricing: {
              discount: "-15%",
              originalPrice: "4 200 €",
              price: "3 570 €",
            },
          },
          {
            title: "MBA Manager stratégique RH",
            href: "/formations/mba-manager-strategique-rh",
            image: {
              src: "/images/audience-1.jpg",
              alt: "Homme souriant travaillant sur son ordinateur à la maison",
            },
            partner: { label: "Partenaire académique", name: "ESGRH" },
            pricing: {
              discount: "-20%",
              originalPrice: "1 250 €",
              price: "990 €",
            },
          },
        ],
      },
    },
    {
      id: "profils",
      type: "audience-switcher",
      props: {
        label: "Un parcours adapté à votre situation",
        defaultValue: "salarie",
        items: [
          {
            id: "salarie",
            eyebrow: "Salarié en poste",
            title: "Préparez la suite sans lâcher votre emploi",
            description:
              "Un rythme compatible avec votre semaine de travail et vos contraintes.",
            image: {
              src: "/images/audience-3.jpg",
              alt: "Femme consultant une tablette, assise dans son salon",
            },
          },
          {
            id: "transition",
            eyebrow: "En transition professionnelle",
            title: "Accélérez votre changement de métier",
            description:
              "Un parcours intensif et un accompagnement vers l'emploi en RH.",
            image: {
              src: "/images/content-2.jpg",
              alt: "Femme lisant sur une tablette, assise en extérieur",
            },
          },
          {
            id: "manager",
            eyebrow: "Manager",
            title: "Faites évoluer votre rôle vers les RH",
            description:
              "Capitalisez sur votre expérience d'encadrement pour piloter les talents.",
            image: {
              src: "/images/audience-2.jpg",
              alt: "Homme montant un escalier, un classeur sous le bras",
            },
          },
        ],
      },
    },
    {
      id: "contenus",
      type: "content-carousel",
      props: {
        label: "Ressources pour préparer votre reconversion",
        items: [
          {
            eyebrow: "Métiers",
            title: "Les 5 métiers RH qui recrutent le plus en 2026",
            image: {
              src: "/images/content-4.jpg",
              alt: "Deux amies souriantes, l'une tenant un téléphone",
            },
          },
          {
            eyebrow: "Financement",
            title: "CPF, PTP : comment financer votre reconversion",
            image: {
              src: "/images/hero-bilan.jpg",
              alt: "Femme travaillant sur un ordinateur portable",
            },
          },
          {
            eyebrow: "Témoignage",
            title: "« J'ai quitté la logistique pour devenir chargée RH »",
            image: {
              src: "/images/hero-parent-enfant.jpg",
              alt: "Une mère joue avec son jeune enfant dans un salon lumineux",
            },
          },
          {
            eyebrow: "Conseils",
            title: "Reprendre des études en travaillant : nos conseils",
            image: {
              src: "/images/content-1.jpg",
              alt: "Apprenante souriante devant son ordinateur",
            },
          },
        ],
      },
    },
  ],
} satisfies LandingPageConfig
