/**
 * Surfaces de couleur : les sept surfaces fermées de `recettes-couleur.md`.
 * Une lame reçoit un nom de surface, jamais une valeur ; le renderer applique
 * la table de substitution correspondante.
 *
 * `emailSurfaceRules` décrit les invariants structurels que le futur schéma
 * Zod bloquera. Restent des consignes de génération, hors validation V1 :
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
  /** Header et footer restent en Page (repères de marque ; disclaimer inclus). */
  pageOnlyFamilies: ["Header", "Footer"],
  /** Jamais deux lames colorées à la suite. */
  allowConsecutiveColoredZones: false,
} as const satisfies {
  neutral: EmailSurface
  pageOnlyFamilies: readonly EmailBlockFamily[]
  allowConsecutiveColoredZones: boolean
}
