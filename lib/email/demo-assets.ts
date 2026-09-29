/**
 * Visuels du mode démo : trois photos, chacune recadrée au ratio de sa lame.
 *
 * Dans l'EmailConfig et le HTML canonique, chaque visuel est une URL HTTPS
 * sur `demo-assets.invalid` : TLD réservé (RFC 2606), jamais résolu. Le HTML
 * exporté reste donc visiblement non envoyable, sans assouplir
 * `ImageAssetSlot` (HTTPS uniquement).
 *
 * Seul l'aperçu (`toPreviewHtml`) remplace ces trois URLs, et elles seules,
 * par le fichier local de `public/images/`. Une autre URL de
 * `demo-assets.invalid` n'est pas résolue. Les chemins `/images/…`
 * n'appartiennent jamais au contrat EmailConfig ni au HTML envoyable.
 */

export const emailDemoAssetHost = "demo-assets.invalid"

export const emailDemoAssets = {
  reconversion: {
    src: "https://demo-assets.invalid/email-demo-reconversion.jpg",
    preview: "/images/email-demo-reconversion.jpg",
    alt: "Femme assise dans son salon, souriante, qui consulte une tablette",
    /** Lame et cadre (px) auxquels la photo est recadrée, en 2x. */
    lame: "email-module-hero-promotional-image-medium",
    frame: { width: 600, height: 270 },
  },
  accompagnement: {
    src: "https://demo-assets.invalid/email-demo-accompagnement.jpg",
    preview: "/images/email-demo-accompagnement.jpg",
    alt: "Femme assise en extérieur, un écouteur à l'oreille, qui suit un échange sur sa tablette",
    lame: "email-module-hero-split-image",
    frame: { width: 229, height: 456 },
  },
  evolution: {
    src: "https://demo-assets.invalid/email-demo-evolution.jpg",
    preview: "/images/email-demo-evolution.jpg",
    alt: "Femme souriante assise sur un canapé, le regard tourné vers la lumière",
    lame: "email-module-hero-promotional-image-large",
    frame: { width: 600, height: 534 },
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
