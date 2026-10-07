/**
 * Specs de référence de V2.9.1 : des `GeneratedBlockSpec` valides, écrites à la main,
 * qui démontrent l'expressivité du DSL SANS renderer. Aucun HTML, aucun contenu :
 * seulement de la structure et des noms de slots.
 */
import type { GeneratedBlockSpec } from "../generated/schema"

const text = (slot: string, style: string, tone = "text", align = "start") => ({ t: "text", slot, style, align, tone })
const button = (slot: string, variant = "primary", arrow = true, align = "start") => ({ t: "button", slot, variant, arrow, align })

/** A. Une section de texte : un titre, un paragraphe, un bouton. */
export const textSection = {
  specVersion: 1,
  role: "text",
  root: { t: "section", padX: 40, padY: 48, children: [{ t: "stack", gap: 18, align: "start", children: [text("titre", "title", "title"), text("texte", "body"), button("cta")] }] },
}

/** B. Un hero : visuel pleine largeur, puis un `inset` qui porte le texte (le visuel est plus large que le contenu éditorial). */
export const heroImageText = {
  specVersion: 1,
  role: "hero",
  root: {
    t: "section",
    padX: 0,
    padY: 0,
    children: [
      { t: "image", slot: "image", format: "large", radius: 0, align: "start" },
      { t: "inset", padX: 40, padY: 40, children: [{ t: "stack", gap: 18, align: "start", children: [text("sur-titre", "eyebrow", "muted"), text("titre", "title-xl", "title"), text("texte", "body"), button("cta")] }] },
    ],
  },
}

/** C. Trois cartes côte à côte, SANS petites images (le format de vignette n'existe pas encore dans la banque). */
const card = (n: number) => ({
  t: "card",
  fill: "soft",
  radius: 12,
  pad: 24,
  overlap: 0,
  children: [{ t: "stack", gap: 12, align: "center", children: [text(`titre-${n}`, "subtitle", "title", "center"), text(`texte-${n}`, "body", "muted", "center"), button(`lien-${n}`, "link", false, "center")] }],
})
export const threeCards = {
  specVersion: 1,
  role: "products",
  root: { t: "section", padX: 40, padY: 40, children: [{ t: "columns", ratio: "1:1:1", gap: 24, align: "top", children: [card(1), card(2), card(3)] }] },
}

/** D. Grande image en bandeau + carte qui la chevauche (`overlap` 40) : valide au niveau du DSL, pas encore garantie en rendu. */
export const bannerOverlapCard = {
  specVersion: 1,
  role: "offer",
  root: {
    t: "section",
    padX: 40,
    padY: 40,
    children: [
      { t: "image", slot: "image", format: "band", radius: 16, align: "start" },
      { t: "card", fill: "plain", radius: 12, pad: 24, overlap: 40, children: [{ t: "stack", gap: 12, align: "center", children: [text("etiquette", "eyebrow", "muted", "center"), text("titre", "title", "title", "center"), text("texte", "body", "text", "center"), button("cta", "primary", true, "center")] }] },
    ],
  },
}

/** E. Une grille d'éléments (2 × 2) : icône, titre, texte, avec un nombre d'éléments explicite. */
const item = (n: number) => ({ t: "stack", gap: 8, align: "start", children: [{ t: "icon", slot: `icone-${n}`, frame: "circle" }, text(`titre-${n}`, "subtitle", "title"), text(`texte-${n}`, "body", "muted")] })
export const itemGrid = {
  specVersion: 1,
  role: "feature-list",
  root: {
    t: "section",
    padX: 40,
    padY: 48,
    children: [
      { t: "stack", gap: 24, align: "start", children: [{ t: "columns", ratio: "1:1", gap: 24, align: "top", children: [item(1), item(2)] }, { t: "columns", ratio: "1:1", gap: 24, align: "top", children: [item(3), item(4)] }] },
    ],
  },
}

/** F. Un bandeau de preuve : un grand chiffre (texte « stat »), un libellé, un bouton. Le chiffre est du texte ordinaire, jamais une valeur de référence. */
export const statBanner = {
  specVersion: 1,
  role: "proof",
  root: {
    t: "section",
    padX: 40,
    padY: 48,
    children: [{ t: "card", fill: "soft", radius: 16, pad: 32, overlap: 0, children: [{ t: "stack", gap: 12, align: "center", children: [text("etiquette", "eyebrow", "muted", "center"), text("chiffre", "stat", "title", "center"), text("legende", "caption", "muted", "center"), button("cta", "accent", true, "center")] }] }],
  },
}

export const generatedFixtures = { textSection, heroImageText, threeCards, bannerOverlapCard, itemGrid, statBanner } as Record<string, unknown>
export type { GeneratedBlockSpec }
