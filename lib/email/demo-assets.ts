/**
 * Visuels du mode démo, chacun au ratio exact de sa lame :
 * - quatre photos, recadrées à 2x du cadre (`kind: "photo"`) ;
 * - trois créations de campagne fournies, texte intégré à l'image
 *   (`kind: "campaign"`). Elles ne sont jamais étirées ; leur texte, leurs
 *   personnes et leurs éléments de marque sont conservés : seul du fond uni
 *   est retiré ou ajouté (couleurs exactes de la palette), ou, pour la photo
 *   Studi Meet, le haut du mur et le bas de la table. Leur texte appartient
 *   à l'image : il n'est ni extrait, ni repris en données.
 *
 * Dans l'EmailConfig et le HTML canonique, chaque visuel est une URL HTTPS
 * sur `demo-assets.invalid` : TLD réservé (RFC 2606), jamais résolu. Le HTML
 * exporté reste donc visiblement non envoyable, sans assouplir
 * `ImageAssetSlot` (HTTPS uniquement).
 *
 * Seul l'aperçu (`toPreviewHtml`) remplace ces URLs, et elles seules,
 * par le fichier local de `public/images/`. Une autre URL de
 * `demo-assets.invalid` n'est pas résolue. Les chemins `/images/…`
 * n'appartiennent jamais au contrat EmailConfig ni au HTML envoyable.
 */

export const emailDemoAssetHost = "demo-assets.invalid"

export const emailDemoAssets = {
  reconversion: {
    kind: "photo",
    src: "https://demo-assets.invalid/email-demo-reconversion.jpg",
    preview: "/images/email-demo-reconversion.jpg",
    alt: "Femme assise dans son salon, souriante, qui consulte une tablette",
    /** Lame et cadre (px) auxquels la photo est recadrée, en 2x. */
    lame: "email-module-hero-promotional-image-medium",
    frame: { width: 600, height: 270 },
  },
  accompagnement: {
    kind: "photo",
    src: "https://demo-assets.invalid/email-demo-accompagnement.jpg",
    preview: "/images/email-demo-accompagnement.jpg",
    alt: "Femme assise en extérieur, un écouteur à l'oreille, qui suit un échange sur sa tablette",
    lame: "email-module-hero-split-image",
    frame: { width: 229, height: 456 },
  },
  evolution: {
    kind: "photo",
    src: "https://demo-assets.invalid/email-demo-evolution.jpg",
    preview: "/images/email-demo-evolution.jpg",
    alt: "Femme souriante assise sur un canapé, le regard tourné vers la lumière",
    lame: "email-module-hero-promotional-image-large",
    frame: { width: 600, height: 534 },
  },
  promotion: {
    kind: "photo",
    src: "https://demo-assets.invalid/email-demo-promotion.jpg",
    preview: "/images/email-demo-promotion.jpg",
    alt: "Deux femmes souriantes sous un ciel bleu, l'une tenant un téléphone",
    lame: "email-module-hero-offer-image-top",
    frame: { width: 600, height: 300 },
  },
  /** Source : campaign-black-friday-640.jpg (640 × 681). Fond lime retiré en haut et en bas, marges Accent 1 sur les côtés. */
  "black-friday": {
    kind: "campaign",
    src: "https://demo-assets.invalid/email-demo-black-friday.jpg",
    preview: "/images/email-demo-black-friday.jpg",
    alt: "Visuel de campagne Black Friday Studi",
    lame: "email-module-hero-promotional-image-large",
    frame: { width: 600, height: 534 },
  },
  /** Source : campaign-studi-days-640.jpg (640 × 417). Marges Marque en haut et en bas. */
  "studi-days": {
    kind: "campaign",
    src: "https://demo-assets.invalid/email-demo-studi-days.jpg",
    preview: "/images/email-demo-studi-days.jpg",
    alt: "Visuel de campagne Studi Days : une personne avec un sac à dos",
    lame: "email-module-hero-promotional-image-large",
    frame: { width: 600, height: 534 },
  },
  /** Source : service-studi-meet-640.jpg (640 × 417). Recadrage 640 × 288 à partir de y = 60. */
  "studi-meet": {
    kind: "campaign",
    src: "https://demo-assets.invalid/email-demo-studi-meet.jpg",
    preview: "/images/email-demo-studi-meet.jpg",
    alt: "Visuel Studi Meet : deux personnes souriantes à leur bureau",
    lame: "email-module-hero-promotional-image-medium",
    frame: { width: 600, height: 270 },
  },
} as const

export type EmailDemoAssetId = keyof typeof emailDemoAssets

/** Mapping fermé URL canonique → fichier local, pour l'aperçu uniquement. */
export const emailDemoAssetPreviews: ReadonlyMap<string, string> = new Map(
  Object.values(emailDemoAssets).map((asset) => [asset.src, asset.preview])
)

/** Valeur du slot image : URL canonique et alt, jamais le chemin local. */
export function emailDemoImage(id: EmailDemoAssetId) {
  const { src, alt } = emailDemoAssets[id]
  return { src, alt }
}
