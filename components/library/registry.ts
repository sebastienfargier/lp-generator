/**
 * Registre des lames de la bibliothèque : source unique pour la galerie
 * `/library` et les pages de détail. Ajouter une lame = ajouter une entrée ici
 * (et sa page de démo dans `app/examples/<slug>`). Le statut IA n'est pas
 * stocké ici : il est dérivé de `lib/landing/section-generation`. Procédure
 * complète : `lib/landing/README.md`.
 */

import type { LandingSectionType } from "@/lib/landing/types"

export const libraryCategories = ["Hero", "Listing", "Contenu", "Conversion"] as const

export type LibraryCategory = (typeof libraryCategories)[number]

export type LibrarySection = {
  slug: string
  /** Type de section du contrat `LandingPageConfig` que cette entrée documente. */
  type: LandingSectionType
  name: string
  category: LibraryCategory
  description: string
  importPath: string
  /** Route de la page de démonstration, affichée dans les aperçus. */
  example: string
  usage: string
}

export const librarySections: LibrarySection[] = [
  {
    slug: "product-hero",
    type: "product-hero",
    name: "ProductHero",
    category: "Hero",
    description:
      "Hero de page produit : texte, prix et financement, deux CTA, partenaire, visuel avec card de débouchés.",
    importPath: "@/components/sections/product-hero",
    example: "/examples/product-hero",
    usage: `<ProductHero
  badges={[{ label: "Populaire", variant: "accent-1" }]}
  title="MBA Manager Stratégique RH"
  description="…"
  pricing={{ discount: "-20%", originalPrice: "1 250 €", price: "990 €" }}
  primaryAction={{ label: "Télécharger la documentation", href: "#" }}
  secondaryAction={{ label: "Parler à un conseiller", href: "#" }}
  partner={{ label: "En partenariat avec :", name: "ESGRH" }}
  visual={{ src: "/images/…", alt: "…" }}
  highlight={{ title: "Débouchés professionnels", items: ["…"] }}
/>`,
  },
  {
    slug: "editorial-hero",
    type: "editorial-hero",
    name: "EditorialHero",
    category: "Hero",
    description:
      "Hero de campagne centré : promesse forte, grand visuel, un CTA principal et un texte de réassurance.",
    importPath: "@/components/sections/editorial-hero",
    example: "/examples/editorial-hero",
    usage: `<EditorialHero
  title="Vous êtes en charge d'enfants, et vous n'avez pas le temps pour vous former ?"
  visual={{ src: "/images/…", alt: "…" }}
  primaryAction={{ label: "Découvrir nos formations", href: "#formations" }}
  supportingText="Formations 100% en ligne, à votre rythme."
/>`,
  },
  {
    slug: "immersive-hero",
    type: "immersive-hero",
    name: "ImmersiveHero",
    category: "Hero",
    description:
      "Hero plein écran sur image avec overlay : logo, badge, titre en blocs surlignés ligne par ligne, CTA.",
    importPath: "@/components/sections/immersive-hero",
    example: "/examples/immersive-hero",
    usage: `<ImmersiveHero
  badge={{ label: "Bilan d’orientation gratuit", variant: "accent-1" }}
  headline={["Votre formation", "est peut-être déjà", "finançable"]}
  description="30 min pour savoir si c’est jouable"
  primaryAction={{ label: "Faire mon bilan", href: "#bilan" }}
  visual={{ src: "/images/…", alt: "", position: "right" }}
/>`,
  },
  {
    slug: "product-grid",
    type: "product-grid",
    name: "ProductGrid",
    category: "Listing",
    description:
      "Listing de formations en cartes cliquables : image, badge, partenaire, prix. 3 colonnes sur desktop.",
    importPath: "@/components/sections/product-grid",
    example: "/examples/product-grid",
    usage: `<ProductGrid
  label="Nos formations"
  products={[
    {
      title: "MBA Manager stratégique RH",
      href: "/formations/mba-manager-strategique-rh",
      image: { src: "/images/…", alt: "…" },
      badge: { label: "Populaire", variant: "accent-1" },
      partner: { label: "Partenaire académique", name: "ESGRH" },
      pricing: { discount: "-20%", originalPrice: "1 250 €", price: "990 €" },
    },
  ]}
/>`,
  },
  {
    slug: "value-props",
    type: "value-props",
    name: "ValueProps",
    category: "Contenu",
    description:
      "Bandeau de bénéfices en colonnes séparées par des filets : un titre et une description par item.",
    importPath: "@/components/sections/value-props",
    example: "/examples/value-props",
    usage: `<ValueProps
  label="Nos engagements"
  items={[{ title: "…", description: "…" }]}
/>`,
  },
  {
    slug: "pillars",
    type: "pillars",
    name: "PillarsSection",
    category: "Contenu",
    description:
      "Introduction (eyebrow, titre, description) suivie de piliers numérotés automatiquement en cartes.",
    importPath: "@/components/sections/pillars",
    example: "/examples/pillars",
    usage: `<PillarsSection
  eyebrow="Three pillars"
  title="A simpler way to build production software"
  description="…"
  items={[{ title: "…", description: "…" }]}
/>`,
  },
  {
    slug: "content-carousel",
    type: "content-carousel",
    name: "ContentCarousel",
    category: "Contenu",
    description:
      "Carrousel éditorial de grandes cartes (catégorie, titre, photo), avec swipe et navigation précédent / suivant.",
    importPath: "@/components/sections/content-carousel",
    example: "/examples/content-carousel",
    usage: `<ContentCarousel
  label="Nos contenus"
  items={[
    {
      eyebrow: "Lorem ipsum",
      title: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      image: { src: "/images/…", alt: "…" },
    },
  ]}
/>`,
  },
  {
    slug: "audience-switcher",
    type: "audience-switcher",
    name: "AudienceSwitcher",
    category: "Contenu",
    description:
      "Profils cliquables toujours visibles ; le profil actif change la grande image en dessous (fondu).",
    importPath: "@/components/sections/audience-switcher",
    example: "/examples/audience-switcher",
    usage: `<AudienceSwitcher
  defaultValue="employed"
  items={[
    {
      id: "employed",
      eyebrow: "En poste",
      title: "Lorem ipsum dolor",
      description: "…",
      image: { src: "/images/…", alt: "…" },
    },
  ]}
/>`,
  },
  {
    slug: "narrative-split",
    type: "narrative-split",
    name: "NarrativeSplit",
    category: "Contenu",
    description:
      "Une idée développée : image d'un côté, surtitre, titre et paragraphe de l'autre ; l'image change de côté d'une section à l'autre.",
    importPath: "@/components/sections/narrative-split",
    example: "/examples/narrative-split",
    usage: `<NarrativeSplit
  eyebrow="Votre rythme"
  title="Se former en gardant sa vie en équilibre"
  description="Apprendre en parallèle d'un emploi ou d'un quotidien déjà chargé demande de la souplesse."
  visual={{ src: "/images/…", alt: "…" }}
  visualSide="right"
/>`,
  },
  {
    slug: "step-sequence",
    type: "step-sequence",
    name: "StepSequence",
    category: "Contenu",
    description:
      "Une progression ordonnée de trois ou quatre étapes, chacune avec un titre et une phrase.",
    importPath: "@/components/sections/step-sequence",
    example: "/examples/step-sequence",
    usage: `<StepSequence
  title="Clarifier son projet pas à pas"
  description="…"
  items={[
    { title: "Explorer les possibilités", description: "…" },
    // 3 à 4 étapes
  ]}
/>`,
  },
  {
    slug: "destination-cards",
    type: "destination-cards",
    name: "DestinationCards",
    category: "Conversion",
    description:
      "Deux ou trois suites cliquables vers des destinations Studi : titre et courte description, sans image.",
    importPath: "@/components/sections/destination-cards",
    example: "/examples/destination-cards",
    usage: `<DestinationCards
  title="Trois façons de poursuivre votre exploration"
  description="Explorez votre projet par métier, par niveau de diplôme ou dans le catalogue."
  items={[
    {
      title: "Explorer les métiers",
      description: "Découvrir un métier avant de choisir une formation.",
      href: "https://www.studi.com/fr/metiers",
    },
    // 2 à 3 cartes, chacune vers une destination différente
  ]}
/>`,
  },
  {
    slug: "campaign-spotlight",
    type: "campaign-spotlight",
    name: "CampaignSpotlight",
    category: "Conversion",
    description:
      "Une communication mise à l'affiche : grand panneau arrondi, visuel à gauche, titre à fin mise en valeur, phrase et un seul bouton.",
    importPath: "@/components/sections/campaign-spotlight",
    example: "/examples/campaign-spotlight",
    usage: `<CampaignSpotlight
  title="Explorez les temps forts"
  accent="de Studi"
  description="…"
  visual={{ src: "/images/content-4.jpg", alt: "…" }}
  primaryAction={{ label: "Découvrir les formations", href: "…" }}
/>`,
  },
  {
    slug: "final-cta",
    type: "final-cta",
    name: "FinalCta",
    category: "Conversion",
    description:
      "Bandeau de clôture : titre, phrase courte et un seul bouton, sur fond de marque.",
    importPath: "@/components/sections/final-cta",
    example: "/examples/final-cta",
    usage: `<FinalCta
  title="Prêt à explorer les formations ?"
  description="Parcourez le catalogue Studi pour découvrir les formations qui correspondent à votre projet."
  primaryAction={{ label: "Voir le catalogue", href: "https://www.studi.com/fr/formations" }}
/>`,
  },
]

export function getLibrarySection(slug: string) {
  return librarySections.find((section) => section.slug === slug)
}

/**
 * Pièces du shell global : présentes automatiquement sur chaque landing page
 * (rendues par `LandingPageRenderer`), hors de `sections[]`. Ce ne sont pas des
 * lames : elles n'ont pas de type au contrat, ne sont pas dans
 * `section-catalog` ni dans le Draft, et n'ont donc ni statut « générable par
 * IA » ni « bibliothèque uniquement » : Claude ne les choisit jamais.
 */
export const libraryShellCategory = "Shell global"

export const libraryShellNote = "Présent automatiquement sur chaque landing page"

export type LibraryShellPart = {
  slug: string
  name: string
  description: string
  importPath: string
  /** Route de la page de démonstration, affichée dans les aperçus. */
  example: string
  usage: string
}

export const libraryShellParts: LibraryShellPart[] = [
  {
    slug: "landing-header",
    name: "LandingHeader",
    description:
      "Header global : logo Studi à gauche, un bouton CTA (placeholder, non navigant) à droite, sur fond de page.",
    importPath: "@/components/landing/landing-header",
    example: "/examples/landing-header",
    usage: `<LandingHeader />`,
  },
  {
    slug: "landing-footer",
    name: "LandingFooter",
    description:
      "Footer global : logo Studi, deux groupes de liens fixes (Explorer, Votre projet) et une barre légale, sur fond neutral-950.",
    importPath: "@/components/landing/landing-footer",
    example: "/examples/landing-footer",
    usage: `<LandingFooter />`,
  },
]

export function getLibraryShellPart(slug: string) {
  return libraryShellParts.find((part) => part.slug === slug)
}
