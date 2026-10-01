/**
 * Images contrôlées des landing pages : les seuls `src` qu'un modèle peut
 * utiliser. Catalogue propre au domaine Landing, sur les photos de
 * `public/images/` destinées aux landing pages. Le modèle ne voit pas les
 * images : `alt` est un texte alternatif suggéré, à reprendre ou à reformuler.
 * Seul `src` est contrôlé à la validation.
 *
 * Retenues : `audience-*`, `content-*`, `hero-*`, toutes en paysage 3:2
 * (1200 × 800 à 1920 × 1280), déjà employées par les exemples Landing.
 *
 * Exclues : tout `email-demo-*` (recadrages du domaine Email, dont les
 * visuels Black Friday, Studi Days et Studi Meet), `public/logos`,
 * `public/icones` (ressources Email) et les `.svg` de démarrage Next.js.
 *
 * `subject` : position du sujet dans l'image (estimation visuelle), une aide
 * au cadrage pour `visual.position` d'un `immersive-hero`, qui rogne l'image en
 * `cover`. Jamais une règle : la validation l'ignore.
 */

export type LandingImageSubject = "left" | "center" | "right"

export type LandingCatalogImage = {
  id: string
  src: string
  alt: string
  subject: LandingImageSubject
}

export const landingImages = [
  { id: "hero-apprenante", src: "/images/hero-apprenante.jpg", alt: "Femme souriante assise sur un canapé, le regard tourné vers la lumière", subject: "center" },
  { id: "hero-bilan", src: "/images/hero-bilan.jpg", alt: "Femme aux cheveux bouclés travaillant sur un ordinateur portable, un casque autour du cou, une tasse jaune près d'elle", subject: "right" },
  { id: "hero-parent-enfant", src: "/images/hero-parent-enfant.jpg", alt: "Femme accroupie jouant avec un jeune enfant dans une pièce lumineuse", subject: "left" },
  { id: "audience-1", src: "/images/audience-1.jpg", alt: "Homme souriant, assis à son bureau devant un ordinateur, une tasse jaune posée devant lui", subject: "right" },
  { id: "audience-2", src: "/images/audience-2.jpg", alt: "Homme à lunettes montant un escalier, un classeur jaune sous le bras", subject: "center" },
  { id: "audience-3", src: "/images/audience-3.jpg", alt: "Femme assise par terre dans son salon, souriante, qui consulte une tablette", subject: "center" },
  { id: "content-1", src: "/images/content-1.jpg", alt: "Femme en tablier rose, souriante, travaillant sur un ordinateur portable dans sa cuisine", subject: "center" },
  { id: "content-2", src: "/images/content-2.jpg", alt: "Femme assise à l'extérieur, un écouteur à l'oreille, qui consulte une tablette", subject: "left" },
  { id: "content-3", src: "/images/content-3.jpg", alt: "Femme debout dans une pièce lumineuse, une tablette à la main, devant un ordinateur portable", subject: "left" },
  { id: "content-4", src: "/images/content-4.jpg", alt: "Deux femmes souriantes sous un ciel bleu, l'une tenant un téléphone", subject: "center" },
] as const satisfies readonly LandingCatalogImage[]

export type LandingImageId = (typeof landingImages)[number]["id"]
