/**
 * Vocabulaire FERMÉ des lames générées locales (V2.9.1) : toutes les valeurs
 * qu'une spec peut porter, et les limites qui la bornent. Chaque valeur vient
 * d'une observation des 36 templates (`lib/email/templates`) et du socle
 * (`socle-email.html`) : paddings, espaceurs, rayons, graisses, tailles. La spec ne
 * contient jamais une taille, une couleur ou une URL : seulement des noms de ce
 * vocabulaire, que le futur compilateur traduira en fragments constants.
 *
 * Pur : aucun import React, Anthropic ni renderer.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailImageFormats } from "../../email/image-bank"

export const generatedSpecVersion = 1 as const

/* Limites ------------------------------------------------------------------ */

export const generatedLimits = {
  /** Niveaux SOUS la racine : la racine est au niveau 0, ses enfants au niveau 1. */
  maxDepth: 4,
  maxNodes: 40,
  maxSlots: 24,
  /** Taille du JSON sérialisé, en OCTETS UTF-8 (pas en caractères). */
  maxBytes: 6 * 1024,
  maxSlotNameLength: 32,
} as const

/**
 * Policy PAR EMAIL (pas par lame) : `validateGeneratedBlockSpec` valide une lame ;
 * c'est l'intégration au document (V2.9.3) qui comptera les lames générées.
 */
export const maxGeneratedBlocksPerEmail = 3

/* Tokens ------------------------------------------------------------------- */

/** Paddings de section (px) : ceux des classes `pxN` / `pyN` du socle. */
export const sectionPaddingX = [0, 20, 32, 40, 48, 56] as const
export const sectionPaddingY = [0, 32, 40, 48, 56, 64] as const

/** Espaceurs et écarts verticaux (px) : les hauteurs d'espaceur des templates. */
export const stackGaps = [6, 8, 12, 16, 18, 20, 24, 28, 30] as const
export const spacerSizes = [8, 12, 16, 20, 24, 28, 30] as const

export const columnGaps = [16, 20, 24] as const
/** Ratio de colonnes → nombre de colonnes qu'il suppose. */
export const columnRatios = { "1:1": 2, "1:2": 2, "2:1": 2, "1:1:1": 3, "1:1:1:1": 4 } as const
export const columnAligns = ["top", "middle"] as const

export const radii = [0, 12, 16] as const
export const cardPaddings = [16, 20, 24, 32] as const
/** Chevauchement d'une carte sur le visuel qui la précède (px, marge négative haute future) : 0 = aucun. */
export const overlaps = [0, 24, 40, 56] as const
export const cardFills = ["plain", "soft"] as const

export const aligns = ["start", "center"] as const

/** Styles typographiques sémantiques : jamais une taille brute. */
export const textStyles = ["eyebrow", "title-xl", "title", "subtitle", "body", "caption", "stat", "pill"] as const
/** Rôles de couleur du texte : jamais une couleur. */
export const textTones = ["title", "text", "muted"] as const
export const buttonVariants = ["primary", "inverse", "accent", "link"] as const
export const iconFrames = ["none", "circle"] as const

/**
 * Formats d'image DISPONIBLES : ceux de la banque, lus à la source (jamais
 * recopiés). Une spec ne peut pas référencer un format sans dérivé réel.
 */
export const availableImageFormats = Object.keys(emailImageFormats) as (keyof typeof emailImageFormats)[]

/**
 * Capacités FUTURES, nommées mais NON utilisables : tant qu'aucun dérivé n'existe dans
 * la banque, une spec qui les demande est refusée (au lieu de prétendre qu'un asset existe).
 * Ex. `card` : la vignette de carte (environ 157 × 122 px) des grilles de produits.
 */
export const futureImageFormats = ["card"] as const

/** Longueur maximale du contenu futur d'un slot, par style de texte (le contenu viendra du bloc, pas de la spec). */
export const textMaxLength = { eyebrow: 60, "title-xl": 90, title: 120, subtitle: 140, body: 600, caption: 80, stat: 12, pill: 40 } as const satisfies Record<(typeof textStyles)[number], number>
export const buttonMaxLength = 40
