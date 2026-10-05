/**
 * Catalogue d'images contrôlé du domaine Email : les seules images que le futur
 * modèle pourra désigner, toujours par un identifiant, jamais par une URL.
 *
 * Il ne contient aucune donnée de fichier : chaque entrée référence un visuel
 * de `demo-assets.ts` (source de l'URL canonique, du fichier d'aperçu, du cadre
 * et de la lame). Il y ajoute ce que le modèle et le futur resolver doivent
 * savoir : l'alt contrôlé et une courte indication sémantique.
 *
 * Seules les quatre photos génériques y entrent. Les trois créations de
 * campagne (Black Friday, Studi Days, Studi Meet) portent leur texte dans
 * l'image : elles restent réservées à la démo et ne peuvent pas être
 * référencées ici (le type de `asset` les exclut).
 *
 * Compatibilité : une photo est recadrée à 2x du cadre exact d'une lame, et le
 * renderer ne recadre pas. Elle n'est donc compatible qu'avec la lame de son
 * cadre (aucune autre lame à slot visuel n'a ce cadre : vérifié par les tests
 * sur les templates), jamais avec toute lame possédant un slot visuel.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailDemoAssets, type EmailDemoAssetId } from "./demo-assets"
import type { EmailBlockType, ImageAssetSlot } from "./types"

/** Identifiants des seules photos de démo (les créations de campagne sont exclues). */
type PhotoAssetId = {
  [Id in EmailDemoAssetId]: (typeof emailDemoAssets)[Id]["kind"] extends "photo" ? Id : never
}[EmailDemoAssetId]

type EmailImageEntry = {
  /** Visuel source dans `demo-assets.ts` : URL canonique, cadre et lame. */
  asset: PhotoAssetId
  /** Alt contrôlé : factuel, sans âge, identité, métier ni situation personnelle. */
  alt: string
  /** Ce que représente l'image, pour le choix du modèle (jamais affiché). */
  hint: string
}

export const emailImageCatalog = {
  "tablette-interieur": {
    asset: "reconversion",
    alt: "Femme souriante, assise près d'un canapé, qui regarde une tablette",
    hint: "femme souriante avec une tablette, intérieur lumineux, cadrage large",
  },
  "ecouteur-exterieur": {
    asset: "accompagnement",
    alt: "Femme souriante assise en extérieur, un écouteur à l'oreille et une tablette à la main",
    hint: "femme souriante en extérieur, écouteur et tablette, cadrage vertical",
  },
  "canape-lumiere": {
    asset: "evolution",
    alt: "Femme souriante assise sur un canapé, le regard tourné vers la lumière",
    hint: "portrait souriant sur un canapé, lumière douce, ton posé",
  },
  "duo-ciel-bleu": {
    asset: "promotion",
    alt: "Deux femmes souriantes sous un ciel bleu, l'une tenant un téléphone",
    hint: "deux femmes souriantes sous un ciel bleu, ton énergique",
  },
} as const satisfies Record<string, EmailImageEntry>

export type EmailImageId = keyof typeof emailImageCatalog

export const emailImageIds = Object.keys(emailImageCatalog) as EmailImageId[]

export function isEmailImageId(value: unknown): value is EmailImageId {
  return typeof value === "string" && Object.hasOwn(emailImageCatalog, value)
}

/**
 * Lames compatibles avec une image : celle du cadre auquel la photo est
 * recadrée (source : `demo-assets.ts`). Une seule, prouvée par les tests.
 */
export function emailImageBlocks(id: EmailImageId): readonly EmailBlockType[] {
  return [emailDemoAssets[emailImageCatalog[id].asset].lame]
}

/** Images autorisées pour une lame : la réponse déterministe à « que mettre ici ? ». */
export function emailImagesForBlock(blockType: EmailBlockType): EmailImageId[] {
  return emailImageIds.filter((id) => emailImageBlocks(id).includes(blockType))
}

export type EmailImageErrorCode = "unknown-image" | "incompatible-block"

export class EmailImageError extends Error {
  readonly code: EmailImageErrorCode

  constructor(code: EmailImageErrorCode, message: string) {
    super(message)
    this.name = "EmailImageError"
    this.code = code
  }
}

/**
 * Résout une image pour une lame : la valeur du slot visuel (`src` canonique
 * et `alt` contrôlé), jamais le chemin local. Échoue explicitement si
 * l'identifiant est inconnu ou si la lame n'est pas compatible.
 */
export function resolveEmailImage(imageId: string, blockType: EmailBlockType): ImageAssetSlot {
  if (!isEmailImageId(imageId)) {
    throw new EmailImageError("unknown-image", `Image inconnue du catalogue : "${imageId}".`)
  }
  if (!emailImageBlocks(imageId).includes(blockType)) {
    throw new EmailImageError(
      "incompatible-block",
      `L'image "${imageId}" n'est pas compatible avec la lame "${blockType}" (lames autorisées : ${emailImageBlocks(imageId).join(", ")}).`
    )
  }
  const entry = emailImageCatalog[imageId]
  return { src: emailDemoAssets[entry.asset].src, alt: entry.alt }
}

export type EmailImageView = { id: EmailImageId; hint: string; blocks: readonly EmailBlockType[] }

/**
 * Vue compacte pour le contexte du modèle : l'identifiant, ce que montre
 * l'image et les lames où elle peut aller. Ni URL, ni chemin, ni alt, ni
 * donnée d'aperçu. `candidateTypes` restreint la vue aux lames candidates ;
 * une image sans lame candidate disparaît.
 */
export function buildEmailImageView(candidateTypes?: readonly string[]): EmailImageView[] {
  const candidates = candidateTypes && new Set(candidateTypes)
  return emailImageIds.flatMap((id) => {
    const blocks = emailImageBlocks(id).filter((type) => !candidates || candidates.has(type))
    return blocks.length > 0 ? [{ id, hint: emailImageCatalog[id].hint, blocks }] : []
  })
}
