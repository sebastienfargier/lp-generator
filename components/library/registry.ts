/**
 * Registre des lames de la bibliothèque : source unique pour la galerie
 * `/library` et les pages de détail. Ajouter une lame = ajouter une entrée ici
 * (et sa page de démo dans `app/examples/<slug>`).
 */

export const libraryCategories = ["Hero", "Listing", "Contenu"] as const

export type LibraryCategory = (typeof libraryCategories)[number]

export type LibrarySection = {
  slug: string
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
]

export function getLibrarySection(slug: string) {
  return librarySections.find((section) => section.slug === slug)
}
