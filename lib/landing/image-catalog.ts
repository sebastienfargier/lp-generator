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
 * `hint` : description courte et distinctive, destinée UNIQUEMENT au choix de
 * l'image par le modèle (vue IA, `ai-view.ts`). Le `alt` reste le texte
 * alternatif de la page finale (le résolveur le recopie) : il n'est jamais raccourci.
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
  /** Aide au choix par le modèle ; jamais affiché dans la page. */
  hint: string
  subject: LandingImageSubject
}

export const landingImages = [
  { id: "hero-apprenante", src: "/images/hero-apprenante.jpg", alt: "Femme souriante assise sur un canapé, le regard tourné vers la lumière", hint: "Femme souriante sur un canapé, regard vers la lumière", subject: "center" },
  { id: "hero-bilan", src: "/images/hero-bilan.jpg", alt: "Femme aux cheveux bouclés travaillant sur un ordinateur portable, un casque autour du cou, une tasse jaune près d'elle", hint: "Femme à l'ordinateur, casque autour du cou, tasse jaune", subject: "right" },
  { id: "hero-parent-enfant", src: "/images/hero-parent-enfant.jpg", alt: "Femme accroupie jouant avec un jeune enfant dans une pièce lumineuse", hint: "Femme accroupie jouant avec un jeune enfant", subject: "left" },
  { id: "audience-1", src: "/images/audience-1.jpg", alt: "Homme souriant, assis à son bureau devant un ordinateur, une tasse jaune posée devant lui", hint: "Homme souriant à son bureau devant un ordinateur, tasse jaune", subject: "right" },
  { id: "audience-2", src: "/images/audience-2.jpg", alt: "Homme à lunettes montant un escalier, un classeur jaune sous le bras", hint: "Homme à lunettes dans un escalier, classeur jaune", subject: "center" },
  { id: "audience-3", src: "/images/audience-3.jpg", alt: "Femme assise par terre dans son salon, souriante, qui consulte une tablette", hint: "Femme assise par terre dans son salon, avec une tablette", subject: "center" },
  { id: "content-1", src: "/images/content-1.jpg", alt: "Femme en tablier rose, souriante, travaillant sur un ordinateur portable dans sa cuisine", hint: "Femme en tablier rose à l'ordinateur dans sa cuisine", subject: "center" },
  { id: "content-2", src: "/images/content-2.jpg", alt: "Femme assise à l'extérieur, un écouteur à l'oreille, qui consulte une tablette", hint: "Femme dehors, écouteur à l'oreille, avec une tablette", subject: "left" },
  { id: "content-3", src: "/images/content-3.jpg", alt: "Femme debout dans une pièce lumineuse, une tablette à la main, devant un ordinateur portable", hint: "Femme debout avec une tablette devant un ordinateur", subject: "left" },
  { id: "content-4", src: "/images/content-4.jpg", alt: "Deux femmes souriantes sous un ciel bleu, l'une tenant un téléphone", hint: "Deux femmes souriantes sous un ciel bleu, un téléphone", subject: "center" },
] as const satisfies readonly LandingCatalogImage[]

export type LandingImageId = (typeof landingImages)[number]["id"]
