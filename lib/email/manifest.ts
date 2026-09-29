/**
 * Manifeste des lames email : source de vérité du catalogue runtime.
 *
 * Origine : `lames.json` 0.1 (projet Email, 2026-09-23), puis normalisation 1.5
 * (voir README) : slots ajoutés aux contenus métier figés, éléments système
 * sortis des slots. Les ids, familles et fichiers sont inchangés. Chaque entrée
 * correspond à `templates/<file>` : ses `data-slot` et `data-system` sont
 * exactement ceux déclarés ici, dans l'ordre du document.
 *
 * Types de slots (valeur fournie par la config) :
 *   texte         texte de la balise
 *   cta           lien bouton, libellé seul (flèche portée par la structure)
 *   cta:fleche    lien bouton, gabarit `{libellé} &nbsp;&#8594;`
 *   lien          lien texte
 *   asset:visuel  `<img>` éditorial, `src` + `alt`
 *   asset:icone   `<img>` d'icône, choisie parmi `emailIconNames`
 *   disclaimer    mention légale choisie dans `emailDisclaimers`
 *
 * Tout slot est requis, sauf ceux listés dans `optional`, dont le renderer
 * connaît le comportement en cas d'absence. `system` liste les éléments
 * résolus par le système (`./system`), jamais par une config. `surfaceMode`
 * dit si la lame accepte une surface de couleur.
 *
 * Aucun HTML ici : les templates restent dans `./templates`.
 */
import type { emailSurfaceRules } from "./surfaces"
import type { EmailSystemElement } from "./system"

export const emailManifestSource = {
  file: "lames.json",
  version: "0.1",
  generatedOn: "2026-09-23",
  normalization: "1.5",
  /** Largeur canonique de l'email (et de chaque lame), en px. */
  width: 600,
} as const

export const emailSlotKinds = [
  "texte",
  "cta",
  "cta:fleche",
  "lien",
  "asset:visuel",
  "asset:icone",
  "disclaimer",
] as const

export type EmailSlotKind = (typeof emailSlotKinds)[number]

/** Les dix familles, dans l'ordre de `bibliotheque-lames.md`. */
export const emailBlockFamilies = [
  "Header",
  "Hero",
  "Story",
  "Offer",
  "Benefits",
  "Features",
  "Products",
  "Diagnostic",
  "Divider",
  "Footer",
] as const

export type EmailBlockFamily = (typeof emailBlockFamilies)[number]

/**
 * `configurable` : la table de substitution de `recettes-couleur.md` §3
 * s'applique à la lame, qui accepte une `surface`.
 * `fixed` : la lame garde ses couleurs ; une config ne fournit pas de surface.
 * Header et footer (disclaimer inclus) restent en Page, toujours (§4), ainsi
 * que les lames dont le panneau principal a un fond absent de la table §3
 * (`#45413B`, `#2F2A28`) : leurs couleurs ne sont pas substituables.
 */
export type EmailSurfaceMode = "configurable" | "fixed"

type PageOnlyFamily = (typeof emailSurfaceRules)["pageOnlyFamilies"][number]

type EmailManifestEntry = {
  /** Nom du composant Figma d'origine. */
  figma: string
  /** Fichier du template dans `./templates`. */
  file: string
  slots: Readonly<Record<string, EmailSlotKind>>
  optional?: readonly string[]
  system?: readonly EmailSystemElement[]
} & (
  | { family: Exclude<EmailBlockFamily, PageOnlyFamily>; surfaceMode: EmailSurfaceMode }
  // Un header ou un footer configurable ne compile pas.
  | { family: PageOnlyFamily; surfaceMode: "fixed" }
)

export const emailBlockManifest = {
  "email-hero-newsletter-variant-01": {
    family: "Hero",
    figma: "Email Hero / Newsletter / Variant 01",
    file: "email-hero-newsletter-variant-01.html",
    surfaceMode: "configurable",
    slots: {
      "sur-titre": "texte", "titre-principal": "texte", "texte-descriptif-1": "texte",
      "cta-1": "cta:fleche", "image-1": "asset:visuel", "image-2": "asset:visuel",
      "image-3": "asset:visuel", "image-4": "asset:visuel", "image-5": "asset:visuel",
    },
  },
  "email-hero-newsletter-variant-02": {
    family: "Hero",
    figma: "Email Hero / Newsletter / Variant 02",
    file: "email-hero-newsletter-variant-02.html",
    surfaceMode: "configurable",
    slots: {
      "sur-titre": "texte", "titre-principal": "texte", "texte-descriptif-1": "texte",
      "cta-1": "cta:fleche", "image-1": "asset:visuel",
    },
  },
  "email-module-banner-full": {
    family: "Offer",
    figma: "Email Module / Banner Full",
    file: "email-module-banner-full.html",
    surfaceMode: "fixed",
    slots: {
      "sous-titre": "texte", "valeur-cle": "texte", "texte-descriptif-1": "texte",
      "texte-descriptif-2": "texte", "cta-1": "cta:fleche",
    },
  },
  "email-module-benefits-and-testimonial": {
    family: "Benefits",
    figma: "Email Module / Benefits and Testimonial",
    file: "email-module-benefits-and-testimonial.html",
    surfaceMode: "configurable",
    slots: {
      "titre-section-1": "texte", "texte-descriptif-1": "texte",
      "titre-section-2": "texte", "item-1-titre": "texte", "item-1-texte": "texte",
      "item-2-titre": "texte", "item-2-texte": "texte", "item-3-titre": "texte",
      "item-3-texte": "texte", "texte-descriptif-2": "texte", "cta-1": "cta",
      "icone-1": "asset:icone", "temoignage": "texte", "temoignage-auteur": "texte",
    },
  },
  "email-module-benefits-compact-highlights": {
    family: "Benefits",
    figma: "Email Module / Benefits / Compact Highlights",
    file: "email-module-benefits-compact-highlights.html",
    surfaceMode: "fixed",
    slots: { "valeur-cle": "texte", "label": "texte" },
  },
  "email-module-cta-and-testimonial": {
    family: "Benefits",
    figma: "Email Module / CTA and Testimonial",
    file: "email-module-cta-and-testimonial.html",
    surfaceMode: "configurable",
    slots: {
      "texte-descriptif": "texte", "cta-1": "cta", "icone-1": "asset:icone",
      "temoignage": "texte", "temoignage-auteur": "texte",
    },
  },
  "email-module-diagnostic-progress-list": {
    family: "Diagnostic",
    figma: "Email Module / Diagnostic / Progress List",
    file: "email-module-diagnostic-progress-list.html",
    surfaceMode: "configurable",
    slots: {
      "label-1": "texte", "label-2": "texte", "label-3": "texte", "label-4": "texte",
      "label-5": "texte",
    },
  },
  "email-module-discount-banner-cards": {
    family: "Offer",
    figma: "Email Module / Discount Banner Cards",
    file: "email-module-discount-banner-cards.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "titre-principal": "texte", "texte-descriptif-1": "texte",
      "code-promo-1": "texte", "texte-descriptif-2": "texte",
    },
  },
  "email-module-discount-banner-full": {
    family: "Offer",
    figma: "Email Module / Discount Banner Full",
    file: "email-module-discount-banner-full.html",
    surfaceMode: "fixed",
    slots: {
      "sous-titre": "texte", "valeur-cle": "texte", "texte-descriptif": "texte",
      "code-promo-1": "texte", "cta-1": "cta:fleche", "lien-1": "lien",
    },
  },
  "email-module-divider-choice": {
    family: "Divider",
    figma: "Email Module / Divider / Choice",
    file: "email-module-divider-choice.html",
    surfaceMode: "configurable",
    slots: { "texte-separation": "texte" },
  },
  "email-module-footer-compact-legal": {
    family: "Footer",
    figma: "Email Module / Footer / Compact Legal",
    file: "email-module-footer-compact-legal.html",
    surfaceMode: "fixed",
    slots: { "lien-1": "lien", "lien-2": "lien", "lien-3": "lien" },
    system: [
      "logo", "social-1", "social-2", "social-3", "social-4",
      "lien-desabonnement", "lien-preferences",
    ],
  },
  "email-module-header-newsletter": {
    family: "Header",
    figma: "Email Module / Header / Newsletter",
    file: "email-module-header-newsletter.html",
    surfaceMode: "fixed",
    slots: {},
    system: ["logo"],
  },
  "email-module-header-seasonal-campaign": {
    family: "Header",
    figma: "Email Module / Header / Seasonal Campaign",
    file: "email-module-header-seasonal-campaign.html",
    surfaceMode: "fixed",
    slots: { "label": "texte" },
    system: ["logo"],
  },
  "email-module-hero-cards": {
    family: "Hero",
    figma: "Email Module / Hero / Cards",
    file: "email-module-hero-cards.html",
    surfaceMode: "configurable",
    slots: {
      "label": "texte", "valeur-cle": "texte", "texte-descriptif-1": "texte",
      "image-1": "asset:visuel", "titre-principal": "texte",
      "texte-descriptif-2": "texte", "cta-1": "cta:fleche",
    },
  },
  "email-module-hero-countdown-variant-01": {
    family: "Hero",
    figma: "Email Module / Hero / Countdown / Variant 01",
    file: "email-module-hero-countdown-variant-01.html",
    surfaceMode: "configurable",
    slots: {
      "compteur-1": "texte", "label-1": "texte", "compteur-2": "texte",
      "label-2": "texte", "compteur-3": "texte", "label-3": "texte",
      "titre-principal": "texte", "texte-descriptif": "texte",
    },
  },
  "email-module-hero-countdown-variant-02": {
    family: "Hero",
    figma: "Email Module / Hero / Countdown / Variant 02",
    file: "email-module-hero-countdown-variant-02.html",
    surfaceMode: "configurable",
    slots: {
      "compteur-1": "texte", "label-1": "texte", "compteur-2": "texte",
      "label-2": "texte", "compteur-3": "texte", "label-3": "texte",
      "titre-principal": "texte", "texte-descriptif": "texte", "cta-1": "cta:fleche",
    },
  },
  "email-module-hero-diagnostic-quiz": {
    family: "Hero",
    figma: "Email Module / Hero / Diagnostic Quiz",
    file: "email-module-hero-diagnostic-quiz.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "titre-principal": "texte", "texte-descriptif": "texte",
      "cta-1": "cta:fleche",
    },
  },
  "email-module-hero-offer-image-top": {
    family: "Hero",
    figma: "Email Module / Hero / Offer / Image-top",
    file: "email-module-hero-offer-image-top.html",
    surfaceMode: "fixed",
    slots: {
      "image-1": "asset:visuel", "sous-titre": "texte", "valeur-cle": "texte",
      "texte-descriptif": "texte", "code-promo-1": "texte", "cta-1": "cta:fleche",
      "lien-1": "lien",
    },
  },
  "email-module-hero-promotional-image-large": {
    family: "Hero",
    figma: "Email Module / Hero / Promotional / Image-large",
    file: "email-module-hero-promotional-image-large.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "titre-principal": "texte", "texte-descriptif": "texte",
      "cta-1": "cta:fleche", "image-1": "asset:visuel",
    },
  },
  "email-module-hero-promotional-image-medium": {
    family: "Hero",
    figma: "Email Module / Hero / Promotional / Image-medium",
    file: "email-module-hero-promotional-image-medium.html",
    surfaceMode: "configurable",
    slots: {
      "titre-principal": "texte", "texte-descriptif": "texte", "cta-1": "cta:fleche",
      "image-1": "asset:visuel",
    },
  },
  "email-module-hero-split-image-dark": {
    family: "Hero",
    figma: "Email Module / Hero / Split Image / Dark",
    file: "email-module-hero-split-image-dark.html",
    surfaceMode: "fixed",
    slots: {
      "partenaire": "texte", "titre-principal": "texte", "cta-1": "cta:fleche",
      "image-1": "asset:visuel", "texte-descriptif-1": "texte",
      "texte-descriptif-2": "texte", "cta-2": "cta:fleche",
    },
  },
  "email-module-hero-split-image": {
    family: "Hero",
    figma: "Email Module / Hero / Split Image",
    file: "email-module-hero-split-image.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "titre-principal": "texte", "texte-descriptif": "texte",
      "cta-1": "cta:fleche", "image-1": "asset:visuel",
    },
  },
  "email-module-icons-grid": {
    family: "Features",
    figma: "Email Module / Icons Grid",
    file: "email-module-icons-grid.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "titre-principal": "texte", "icone-1": "asset:icone",
      "item-1-titre": "texte", "texte-descriptif-1": "texte", "icone-2": "asset:icone",
      "item-2-titre": "texte", "texte-descriptif-2": "texte", "icone-3": "asset:icone",
      "item-3-titre": "texte", "texte-descriptif-3": "texte", "icone-4": "asset:icone",
      "item-4-titre": "texte", "texte-descriptif-4": "texte",
    },
  },
  "email-module-icons-list": {
    family: "Features",
    figma: "Email Module / Icons List",
    file: "email-module-icons-list.html",
    surfaceMode: "configurable",
    slots: {
      "titre-section": "texte", "icone-1": "asset:icone", "item-1-titre": "texte",
      "texte-descriptif-1": "texte", "icone-2": "asset:icone", "item-2-titre": "texte",
      "texte-descriptif-2": "texte", "icone-3": "asset:icone", "item-3-titre": "texte",
      "texte-descriptif-3": "texte",
    },
  },
  "email-module-numbered-list": {
    family: "Features",
    figma: "Email Module / Numbered List",
    file: "email-module-numbered-list.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "item-1-titre": "texte", "texte-descriptif-1": "texte",
      "item-2-titre": "texte", "texte-descriptif-2": "texte", "item-3-titre": "texte",
      "texte-descriptif-3": "texte",
    },
  },
  "email-module-numbererd-grid": {
    family: "Features",
    figma: "Email Module / Numbererd Grid",
    file: "email-module-numbererd-grid.html",
    surfaceMode: "configurable",
    slots: {
      "sous-titre": "texte", "titre-principal": "texte", "item-1-titre": "texte",
      "texte-descriptif-1": "texte", "item-2-titre": "texte",
      "texte-descriptif-2": "texte", "item-3-titre": "texte",
      "texte-descriptif-3": "texte", "item-4-titre": "texte",
      "texte-descriptif-4": "texte",
    },
  },
  "email-module-preheader": {
    family: "Header",
    figma: "Email Module / Preheader",
    file: "email-module-preheader.html",
    surfaceMode: "fixed",
    slots: { "label": "texte", "lien-1": "lien" },
  },
  "email-module-product-details-variant-01": {
    family: "Benefits",
    figma: "Email Module / Product details / Variant 01",
    file: "email-module-product-details-variant-01.html",
    surfaceMode: "configurable",
    slots: {
      "label": "texte", "titre-principal": "texte", "titre-section": "texte",
      "texte-descriptif": "texte", "cta-1": "cta",
    },
  },
  "email-module-product-details-variant-02": {
    family: "Benefits",
    figma: "Email Module / Product details / Variant 02",
    file: "email-module-product-details-variant-02.html",
    surfaceMode: "configurable",
    slots: {
      "titre-principal-1": "texte", "label": "texte", "titre-principal-2": "texte",
      "texte-descriptif": "texte", "cta-1": "cta",
    },
  },
  "email-module-products-four-column-grid": {
    family: "Products",
    figma: "Email Module / Products / Four-column Grid",
    file: "email-module-products-four-column-grid.html",
    surfaceMode: "configurable",
    slots: {
      "image-1": "asset:visuel", "produit-1-titre": "texte",
      "texte-descriptif-1": "texte", "lien-1": "lien", "image-2": "asset:visuel",
      "produit-2-titre": "texte", "texte-descriptif-2": "texte", "lien-2": "lien",
      "image-3": "asset:visuel", "produit-3-titre": "texte",
      "texte-descriptif-3": "texte", "lien-3": "lien", "image-4": "asset:visuel",
      "produit-4-titre": "texte", "texte-descriptif-4": "texte", "lien-4": "lien",
    },
  },
  "email-module-products-three-column-grid": {
    family: "Products",
    figma: "Email Module / Products / Three-column Grid",
    file: "email-module-products-three-column-grid.html",
    surfaceMode: "configurable",
    slots: {
      "image-1": "asset:visuel", "produit-1-titre": "texte",
      "texte-descriptif-1": "texte", "lien-1": "lien", "image-2": "asset:visuel",
      "produit-2-titre": "texte", "texte-descriptif-2": "texte", "lien-2": "lien",
      "image-3": "asset:visuel", "produit-3-titre": "texte",
      "texte-descriptif-3": "texte", "lien-3": "lien",
    },
  },
  "email-module-text-and-cta-variant-01": {
    family: "Story",
    figma: "Email Module / Text and CTA / Variant 01",
    file: "email-module-text-and-cta-variant-01.html",
    surfaceMode: "configurable",
    slots: {
      "titre-section": "texte", "texte-descriptif": "texte", "cta-1": "cta:fleche",
    },
  },
  "email-module-text-and-cta-variant-02": {
    family: "Story",
    figma: "Email Module / Text and CTA / Variant 02",
    file: "email-module-text-and-cta-variant-02.html",
    surfaceMode: "configurable",
    slots: {
      "titre-section": "texte", "image-1": "asset:visuel", "texte-descriptif": "texte",
      "cta-1": "cta:fleche",
    },
  },
  "email-module-text-and-feature-card": {
    family: "Story",
    figma: "Email Module / Text and Feature Card",
    file: "email-module-text-and-feature-card.html",
    surfaceMode: "configurable",
    slots: {
      "titre-section": "texte", "texte-descriptif-1": "texte",
      "titre-principal": "texte", "texte-descriptif-2": "texte", "cta-1": "cta:fleche",
    },
  },
  "email-module-text-only": {
    family: "Story",
    figma: "Email Module / Text Only",
    file: "email-module-text-only.html",
    surfaceMode: "configurable",
    slots: { "titre-section": "texte", "texte-descriptif": "texte" },
  },
  "email-module-legal-disclaimer": {
    family: "Footer",
    figma: "Ajout projet — hors catalogue Figma",
    file: "lame-disclaimer.html",
    surfaceMode: "fixed",
    slots: { "disclaimer-1": "disclaimer", "disclaimer-2": "disclaimer" },
    optional: ["disclaimer-2"],
  },
} as const satisfies Record<string, EmailManifestEntry>

/** Les 40 icônes disponibles sur le CDN (`icones-disponibles.txt`). */
export const emailIconNames = [
  "award", "briefcase", "chart-column", "chart-simple", "circle-info",
  "circle-question", "cloud", "comment", "comments", "face-confused",
  "face-frown", "face-meh", "face-smile", "folder-open", "gear",
  "graduation-cap", "hand-holding-heart", "hands-clapping", "handshake-simple",
  "heart", "laptop", "light-emergency-on", "lightbulb", "lock",
  "magnifying-glass", "megaphone", "microchip-ai", "microphone", "paper-plane",
  "phone", "presentation-screen", "rocket-launch", "scale-balanced", "star",
  "stopwatch", "thumbs-down", "thumbs-up", "user-large", "users", "wifi",
] as const

export type EmailIconName = (typeof emailIconNames)[number]
