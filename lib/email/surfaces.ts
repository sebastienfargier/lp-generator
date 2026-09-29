/**
 * Surfaces de couleur : les sept surfaces fermées de `recettes-couleur.md`.
 * Une lame reçoit un nom de surface, jamais une valeur ; le renderer applique
 * la table de substitution correspondante.
 *
 * `emailSurfaceRules` décrit les invariants structurels que `./schemas`
 * bloque. Restent des consignes de génération, hors validation V1 :
 * le nombre de zones colorées (« exactement une » dans `recettes-couleur.md`)
 * et le choix de la surface selon le type d'email ou la cible (Marque par
 * défaut, Accent 2 doux pour l'empathie…).
 */
import type { EmailBlockFamily } from "./manifest"

export const emailSurfaces = [
  "page",
  "bloc",
  "accent-1",
  "accent-2-soft",
  "accent-2",
  "marque",
  "encre",
] as const

export type EmailSurface = (typeof emailSurfaces)[number]

export const emailSurfaceRules = {
  /** Surface d'une lame sans `surface` ; toute autre forme une zone colorée. */
  neutral: "page",
  /**
   * Header et footer restent en Page (repères de marque ; disclaimer inclus) :
   * le manifeste ne compile que si leurs lames sont `surfaceMode: "fixed"`.
   */
  pageOnlyFamilies: ["Header", "Footer"],
  /** Jamais deux lames colorées à la suite. */
  allowConsecutiveColoredZones: false,
} as const satisfies {
  neutral: EmailSurface
  pageOnlyFamilies: readonly EmailBlockFamily[]
  allowConsecutiveColoredZones: boolean
}

/* Recettes de couleur (`recettes-couleur.md` §2 et §3) */

/** Rôle d'une couleur dans une lame, lu à la propriété qui la porte. */
export type EmailColorRole =
  | "fond"
  | "titre"
  | "texte"
  | "filet"
  | "fondCta"
  | "libelleCta"

/** Table de substitution §2 : valeur de chaque rôle, par surface. */
export const emailSurfaceRecipes = {
  page: { fond: "#FFFFFF", titre: "#1D1916", texte: "#79726B", filet: "#E7E5E4", fondCta: "#1D1916", libelleCta: "#FFFFFF" },
  bloc: { fond: "#FAFAF9", titre: "#1D1916", texte: "#79726B", filet: "#E7E5E4", fondCta: "#1D1916", libelleCta: "#FFFFFF" },
  "accent-1": { fond: "#EDF878", titre: "#1D1916", texte: "#58544D", filet: "#1D1916", fondCta: "#1D1916", libelleCta: "#FFFFFF" },
  "accent-2-soft": { fond: "#FED2CA", titre: "#1D1916", texte: "#58544D", filet: "#1D1916", fondCta: "#1D1916", libelleCta: "#FFFFFF" },
  "accent-2": { fond: "#F8745D", titre: "#1D1916", texte: "#1D1916", filet: "#1D1916", fondCta: "#1D1916", libelleCta: "#FFFFFF" },
  marque: { fond: "#0D302D", titre: "#FFFFFF", texte: "#A9A39D", filet: "#2F2A28", fondCta: "#EDF878", libelleCta: "#1D1916" },
  encre: { fond: "#1D1916", titre: "#FFFFFF", texte: "#A9A39D", filet: "#2F2A28", fondCta: "#EDF878", libelleCta: "#1D1916" },
} as const satisfies Record<EmailSurface, Record<EmailColorRole, string>>

/**
 * Table §3 : rôle de chaque valeur neutre des templates, par propriété
 * (`background`, `color`, `border*`). Une couleur absente de cette table
 * dans une lame `configurable` est une erreur de template, jamais devinée.
 * Le trait d'icône (`stroke`) n'a plus d'usage : les templates normalisés
 * ne contiennent aucun SVG.
 */
export const emailColorSubstitutions = {
  background: {
    "#FFFFFF": "fond",
    "#FAFAF9": "fond",
    "#F5F5F4": "fond",
    "#E7E5E4": "fond",
    "#1D1916": "fondCta",
    "#070A0D": "fondCta",
  },
  color: {
    "#1D1916": "titre",
    "#0C0A09": "titre",
    "#79726B": "texte",
    "#58544D": "texte",
    "#45413B": "texte",
    "#A9A39D": "texte",
    "#FFFFFF": "libelleCta",
  },
  border: {
    "#D7D3D0": "filet",
    "#E7E5E4": "filet",
    "#58544D": "filet",
  },
} as const satisfies Record<
  "background" | "color" | "border",
  Readonly<Record<string, EmailColorRole>>
>

/* Rôles de couleur explicites */

/**
 * Éléments dont les couleurs ne suivent pas la table §3, marqués dans le
 * template par `data-color-role`. Seules les exceptions connues sont
 * modélisées : le rôle est porté par le template, jamais deviné depuis une
 * valeur hexadécimale.
 */
export const emailColorRoles = ["icon-background", "overlay-card"] as const

export type EmailColorRoleName = (typeof emailColorRoles)[number]

/**
 * Valeur d'une couleur portée par un élément à rôle explicite, ou
 * `undefined` si la combinaison n'est pas établie par les sources.
 *
 * - `icon-background` (§3) : le rond blanc derrière les icônes « reste blanc
 *   sur les surfaces claires, et passe au Filet sur Marque et Encre ».
 * - `overlay-card` : carte superposée au visuel (product-details). Le design
 *   fini (exemple complet 5) la montre sur Page avec son fond blanc et son
 *   contour encre, tels que dans le template ; aucune source ne dit son rendu
 *   sur une surface colorée.
 */
export function resolveColorRole(
  role: EmailColorRoleName,
  surface: EmailSurface,
  property: "background" | "color" | "border",
  templateValue: string
): string | undefined {
  switch (role) {
    case "icon-background":
      if (property !== "background") return undefined
      return surface === "marque" || surface === "encre"
        ? emailSurfaceRecipes[surface].filet
        : "#FFFFFF"
    case "overlay-card":
      return surface === "page" ? templateValue : undefined
  }
}
