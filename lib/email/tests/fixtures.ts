/**
 * Fixtures partagées des tests Email : un email valide de référence
 * (Header + Hero + contenu + Footer) et des valeurs d'exemple par type de
 * slot, conformes au manifeste.
 */
import type { EmailBlock, EmailBlockOf, EmailConfig } from "../types"

export const header: EmailBlockOf<"email-module-header-newsletter"> = {
  id: "header",
  type: "email-module-header-newsletter",
  slots: {},
}

export const hero: EmailBlockOf<"email-module-hero-split-image"> = {
  id: "hero",
  type: "email-module-hero-split-image",
  surface: "marque",
  slots: {
    "sous-titre": { text: "Rentrée 2026" },
    "titre-principal": { text: "Studi & vous : <5 min pour démarrer" },
    "texte-descriptif": { text: 'Bonjour {{ customer.first_name }}, "votre" projet avance.' },
    "cta-1": {
      label: "Faire mon bilan",
      href: "https://www.studi.com/fr/bilan?campagne=rentree&[UTM À DÉFINIR — CRM]",
    },
    "image-1": {
      src: "https://cdn.studi.com/visuels/hero.jpg?w=246&h=456",
      alt: 'Apprenante "concentrée" devant son ordinateur',
    },
  },
}

export const content: EmailBlockOf<"email-module-text-only"> = {
  id: "contenu",
  type: "email-module-text-only",
  slots: {
    "titre-section": { text: "Un rythme qui vous ressemble" },
    "texte-descriptif": { text: "x > 5 formations adaptées à votre agenda." },
  },
}

export const footer: EmailBlockOf<"email-module-footer-compact-legal"> = {
  id: "footer",
  type: "email-module-footer-compact-legal",
  slots: {
    "lien-1": { label: "Nos formations", href: "[URL À CONFIRMER]" },
    "lien-2": { label: "L'alternance", href: "{{ event.catalogue_url }}" },
    "lien-3": {
      label: "Le magazine",
      href: "https://www.studi.com/fr/magazine?id={{ customer.id }}",
    },
  },
}

export const disclaimer: EmailBlockOf<"email-module-legal-disclaimer"> = {
  id: "mentions",
  type: "email-module-legal-disclaimer",
  slots: { "disclaimer-1": { disclaimer: "chiffres-performance" } },
}

export const email: EmailConfig = {
  version: 1,
  id: "rentree-2026",
  name: "Rentrée — actifs",
  subject: "Studi & vous : rentrée le 12/10",
  preheader: "Réponse en <5 min, et vous savez ce qui reste à votre charge",
  blocks: [header, hero, content, footer],
}

/** Email valide avec les lames données, suivies du footer. */
export function withBlocks(...blocks: EmailBlock[]): EmailConfig {
  return { ...email, blocks: [...blocks, footer] }
}

/** Valeur d'exemple valide pour chaque type de slot du manifeste. */
export const sampleSlotValues: Record<string, unknown> = {
  texte: { text: "Texte" },
  cta: { label: "Découvrir", href: "https://www.studi.com" },
  "cta:fleche": { label: "Découvrir", href: "https://www.studi.com" },
  lien: { label: "Lien", href: "https://www.studi.com" },
  "asset:visuel": { src: "https://cdn.studi.com/visuel.jpg", alt: "" },
  "asset:icone": { icon: "star" },
  disclaimer: { disclaimer: "diplome-ou-rembourse" },
}

/** Attributs internes du renderer, jamais publiés. */
export const internalAttribute = /\sdata-(slot|system|optional|color-role)=/
