/**
 * Banque d'images Email V2 : douze photos, des dérivés recadrés une fois pour
 * toutes, et un vocabulaire visuel fermé. Le futur modèle ne désignera jamais
 * un fichier, une URL, un recadrage, des dimensions ni un alt : il choisira une
 * intention visuelle (ou une frise prédéfinie), le code résout le reste.
 *
 * Ce module est ADDITIF. `image-catalog.ts` (quatre photos de démo) reste le
 * catalogue du moteur actuel et n'est pas modifié : rien ici n'est branché au
 * prompt, au brouillon ni au resolver. Les trois identifiants communs aux deux
 * catalogues (`tablette-interieur`, `canape-lumiere`, `ecouteur-exterieur`)
 * ne désignent pas les mêmes fichiers : la banque V2 a ses propres dérivés.
 *
 * Source de vérité des données de fichier :
 * - les cadres sont ceux des templates (vérifiés par les tests) ;
 * - un dérivé est `public/images/email/v2/<image>--<format>.jpg`, à 2x du
 *   cadre exact ; ses rectangles de recadrage vivent dans
 *   `scripts/email-image-bank/crops.json` (hors runtime, avec les sources) ;
 * - l'URL canonique d'un dérivé est sur `demo-assets.invalid` (comme les
 *   visuels de démo) ; seul l'aperçu la remplace par le fichier local, via
 *   `emailBankPreviews`.
 *
 * Provenance : les sources n'ont ni licence ni crédit connus. Tout est marqué
 * « à confirmer » ; rien n'est « approuvé production ».
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailDemoAssetHost } from "./demo-assets"
import type { EmailBlockType, ImageAssetSlot } from "./types"

/** Les quatre intentions visuelles : tout ce que le modèle verra d'une image. */
export const emailVisualIntents = ["warm-reassurance", "editorial-work", "career-movement", "campaign-portrait"] as const
export type EmailVisualIntent = (typeof emailVisualIntents)[number]

/** Indication courte par intention, pour le futur contexte du modèle (jamais d'alt, d'URL ni de dimension). */
const intentHints: Record<EmailVisualIntent, string> = {
  "warm-reassurance": "scène posée et chaleureuse, lumière douce",
  "editorial-work": "scène de travail ou d'échange, ton éditorial",
  "career-movement": "personne en déplacement, rythme dynamique",
  "campaign-portrait": "portrait cadré, esprit campagne",
}

/**
 * Formats d'une image : le cadre exact du template (px) et les lames qui le
 * portent. Un dérivé est produit à 2x. `newsletter-variant-02` et
 * `text-and-cta-variant-02` ont le même cadre : un seul format les sert.
 */
export const emailImageFormats = {
  medium: { frame: { width: 600, height: 270 }, blocks: ["email-module-hero-promotional-image-medium"] },
  large: { frame: { width: 600, height: 534 }, blocks: ["email-module-hero-promotional-image-large"] },
  split: { frame: { width: 229, height: 456 }, blocks: ["email-module-hero-split-image"] },
  band: { frame: { width: 520, height: 174 }, blocks: ["email-hero-newsletter-variant-02", "email-module-text-and-cta-variant-02"] },
  /** Hero d'offre (R4, promotion) : image en tête du panneau sombre de l'offre. */
  offer: { frame: { width: 600, height: 300 }, blocks: ["email-module-hero-offer-image-top"] },
} as const satisfies Record<string, { frame: { width: number; height: number }; blocks: readonly EmailBlockType[] }>

export type EmailImageFormat = keyof typeof emailImageFormats

/** Lame de la frise de portraits : cinq visuels de cadres différents, un par position. */
export const emailPortraitStripBlock = "email-hero-newsletter-variant-01" as const satisfies EmailBlockType

/** Cadres des cinq positions de la frise (px), dans l'ordre des slots `image-1` à `image-5`. */
export const emailPortraitStripFrames = [
  { width: 96, height: 174 },
  { width: 96, height: 158 },
  { width: 96, height: 190 },
  { width: 96, height: 158 },
  { width: 104, height: 174 },
] as const

export type EmailPortraitStripPosition = 1 | 2 | 3 | 4 | 5

/** Facteur entre le cadre du template et le dérivé. */
export const emailImageScale = 2

export type EmailImageProvenance = "a-confirmer" | "approuvee"

type EmailBankEntry = {
  /** Intention principale, une seule. */
  intent: EmailVisualIntent
  /** Alt contrôlé : factuel, sans âge, métier, origine, statut, situation ni émotion complexe. */
  alt: string
  /** Décor ou lieu : deux photos du même cluster ne figurent jamais dans la même frise. */
  cluster: string
  provenance: EmailImageProvenance
  /** Formats pour lesquels un dérivé existe (jugés A ou B après vérification visuelle). */
  formats: readonly EmailImageFormat[]
}

export const emailBank = {
  // warm-reassurance
  "tablette-interieur": {
    intent: "warm-reassurance",
    alt: "Personne assise au sol avec une tablette dans un salon lumineux.",
    cluster: "salon-lumineux",
    provenance: "a-confirmer",
    formats: ["medium", "large", "band"],
  },
  "canape-lumiere": {
    intent: "warm-reassurance",
    alt: "Personne assise sur un canapé, le regard tourné vers la lumière.",
    cluster: "salon-lumineux",
    provenance: "a-confirmer",
    formats: ["medium", "large", "split", "band"],
  },
  "ecouteur-exterieur": {
    intent: "warm-reassurance",
    alt: "Personne assise en extérieur, un écouteur à l'oreille et une tablette à la main.",
    cluster: "terrasse-verdure",
    provenance: "a-confirmer",
    formats: ["medium", "large", "split"],
  },
  // editorial-work
  "bureau-lampe-bleu": {
    intent: "editorial-work",
    alt: "Personne travaillant sur un ordinateur portable à un bureau, devant un mur bleu.",
    cluster: "bureau-fenetre",
    provenance: "a-confirmer",
    formats: ["medium", "large", "band"],
  },
  "table-fenetre": {
    intent: "editorial-work",
    alt: "Personne assise à une table près d'une fenêtre, avec un ordinateur portable.",
    cluster: "bureau-fenetre",
    provenance: "a-confirmer",
    formats: ["medium", "large", "band"],
  },
  "echange-motif-bleu": {
    intent: "editorial-work",
    alt: "Deux personnes qui échangent autour d'une table, devant un mur à motif bleu.",
    cluster: "motif-bleu",
    provenance: "a-confirmer",
    formats: ["medium", "large", "band"],
  },
  // career-movement
  "quai-gare": {
    intent: "career-movement",
    alt: "Personne debout sur un quai de gare, un téléphone à la main.",
    cluster: "transit",
    provenance: "a-confirmer",
    formats: ["medium", "large", "split", "band", "offer"],
  },
  "arret-bus-bleu": {
    intent: "career-movement",
    alt: "Personne debout devant une paroi bleue, un casque sur la tête et un gobelet à la main.",
    cluster: "transit",
    provenance: "a-confirmer",
    formats: ["medium", "large", "split", "band", "offer"],
  },
  "marche-rideau-metal": {
    intent: "career-movement",
    alt: "Personne en marche devant un rideau métallique, un téléphone à la main.",
    cluster: "rideau-metal",
    provenance: "a-confirmer",
    formats: ["medium", "large", "split", "band", "offer"],
  },
  // campaign-portrait
  "portrait-mur-rose": {
    intent: "campaign-portrait",
    alt: "Personne assise dans un fauteuil devant un mur rose, face à l'objectif.",
    cluster: "mur-rose",
    provenance: "a-confirmer",
    formats: ["medium", "large", "band", "offer"],
  },
  "couloir-verriere-a": {
    intent: "campaign-portrait",
    alt: "Personne marchant dans un couloir sous une verrière, une mallette et un sac à la main.",
    cluster: "verriere",
    provenance: "a-confirmer",
    formats: ["large", "split", "band"],
  },
  "mur-clair-debout": {
    intent: "campaign-portrait",
    alt: "Personne debout devant un mur clair, une main dans la poche.",
    cluster: "verriere",
    provenance: "a-confirmer",
    formats: ["medium", "large", "split", "band", "offer"],
  },
} as const satisfies Record<string, EmailBankEntry>

export type EmailBankImageId = keyof typeof emailBank

export const emailBankImageIds = Object.keys(emailBank) as EmailBankImageId[]

type EmailPortraitStrip = {
  /** Ce que montre la frise, pour le futur contexte du modèle. */
  hint: string
  /** Une image par position (`image-1` à `image-5`), jamais deux du même cluster. */
  images: readonly [EmailBankImageId, EmailBankImageId, EmailBankImageId, EmailBankImageId, EmailBankImageId]
}

/** Frises prédéfinies : le modèle ne choisit pas les cinq images, seulement la frise. */
export const emailPortraitStrips = {
  "portrait-strip-mixed-01": {
    hint: "cinq portraits variés, lieux de passage et intérieurs",
    images: ["quai-gare", "ecouteur-exterieur", "marche-rideau-metal", "canape-lumiere", "couloir-verriere-a"],
  },
  "portrait-strip-mixed-02": {
    hint: "cinq portraits variés, déplacements et lumière douce",
    images: ["arret-bus-bleu", "tablette-interieur", "mur-clair-debout", "ecouteur-exterieur", "marche-rideau-metal"],
  },
} as const satisfies Record<string, EmailPortraitStrip>

export type EmailPortraitStripId = keyof typeof emailPortraitStrips

export const emailPortraitStripIds = Object.keys(emailPortraitStrips) as EmailPortraitStripId[]

export function isEmailBankImageId(value: unknown): value is EmailBankImageId {
  return typeof value === "string" && Object.hasOwn(emailBank, value)
}

export function isEmailVisualIntent(value: unknown): value is EmailVisualIntent {
  return typeof value === "string" && (emailVisualIntents as readonly string[]).includes(value)
}

export function isEmailPortraitStripId(value: unknown): value is EmailPortraitStripId {
  return typeof value === "string" && Object.hasOwn(emailPortraitStrips, value)
}

export type EmailImageBankErrorCode = "unknown-image" | "unknown-intent" | "unknown-strip" | "incompatible-block" | "missing-derivative"

export class EmailImageBankError extends Error {
  readonly code: EmailImageBankErrorCode

  constructor(code: EmailImageBankErrorCode, message: string) {
    super(message)
    this.name = "EmailImageBankError"
    this.code = code
  }
}

const formatEntries = Object.entries(emailImageFormats) as [EmailImageFormat, (typeof emailImageFormats)[EmailImageFormat]][]

/** Format d'une image pour une lame, ou `undefined` si la lame n'a pas de dérivé pour cette image. */
function formatForBlock(id: EmailBankImageId, blockType: string): EmailImageFormat | undefined {
  const supported: readonly EmailImageFormat[] = emailBank[id].formats
  return formatEntries.find(([format, { blocks }]) => supported.includes(format) && (blocks as readonly string[]).includes(blockType))?.[0]
}

/** Lames où l'image peut aller : celles des formats pour lesquels un dérivé existe. */
export function emailBankImageBlocks(id: EmailBankImageId): EmailBlockType[] {
  const supported: readonly EmailImageFormat[] = emailBank[id].formats
  return formatEntries.filter(([format]) => supported.includes(format)).flatMap(([, { blocks }]) => [...blocks])
}

/** Images d'une intention compatibles avec une lame, dans l'ordre du catalogue. */
export function emailImagesForIntent(intent: string, blockType: string): EmailBankImageId[] {
  if (!isEmailVisualIntent(intent)) {
    throw new EmailImageBankError("unknown-intent", `Intention visuelle inconnue : "${intent}".`)
  }
  return emailBankImageIds.filter((id) => emailBank[id].intent === intent && formatForBlock(id, blockType) !== undefined)
}

const derivativeName = (id: string, suffix: string) => `${id}--${suffix}.jpg`
const canonicalUrl = (file: string) => `https://${emailDemoAssetHost}/email-v2/${file}` as const
const previewPath = (file: string) => `/images/email/v2/${file}`

export type EmailBankDerivative = {
  /** Nom de fichier, sous `public/images/email/v2/`. */
  file: string
  /** URL canonique (HTTPS) du contrat EmailConfig. */
  src: string
  /** Chemin local, réservé à l'aperçu. */
  preview: string
  /** Dimensions réelles du dérivé (2x le cadre). */
  width: number
  height: number
}

function derivative(file: string, frame: { width: number; height: number }): EmailBankDerivative {
  return { file, src: canonicalUrl(file), preview: previewPath(file), width: frame.width * emailImageScale, height: frame.height * emailImageScale }
}

/** Dérivé d'une image pour un format ; échoue si l'image n'a pas de dérivé pour ce format. */
export function emailBankDerivative(imageId: string, format: string): EmailBankDerivative {
  if (!isEmailBankImageId(imageId)) throw new EmailImageBankError("unknown-image", `Image inconnue de la banque : "${imageId}".`)
  if (!Object.hasOwn(emailImageFormats, format)) throw new EmailImageBankError("missing-derivative", `Format inconnu : "${format}".`)
  const known = format as EmailImageFormat
  if (!(emailBank[imageId].formats as readonly string[]).includes(known)) {
    throw new EmailImageBankError("missing-derivative", `Aucun dérivé "${known}" pour l'image "${imageId}".`)
  }
  return derivative(derivativeName(imageId, known), emailImageFormats[known].frame)
}

/** Dérivé d'une image à une position de frise ; échoue si cette image n'y figure pas. */
export function emailBankStripDerivative(imageId: string, position: number): EmailBankDerivative {
  const frame = emailPortraitStripFrames[position - 1]
  const used = Object.values(emailPortraitStrips).some((strip) => (strip.images as readonly string[])[position - 1] === imageId)
  if (!isEmailBankImageId(imageId) || !frame || !used) {
    throw new EmailImageBankError("missing-derivative", `Aucun dérivé de frise pour l'image "${imageId}" en position ${position}.`)
  }
  return derivative(derivativeName(imageId, `strip-${position}`), frame)
}

/**
 * Résout une image pour une lame : la valeur du slot visuel (URL canonique et
 * alt contrôlé), jamais le chemin local. Échoue si l'identifiant est inconnu
 * ou si la lame n'a pas de dérivé pour cette image.
 */
export function resolveEmailBankImage(imageId: string, blockType: string): ImageAssetSlot {
  if (!isEmailBankImageId(imageId)) throw new EmailImageBankError("unknown-image", `Image inconnue de la banque : "${imageId}".`)
  const format = formatForBlock(imageId, blockType)
  if (!format) {
    throw new EmailImageBankError(
      "incompatible-block",
      `L'image "${imageId}" n'est pas compatible avec la lame "${blockType}" (lames autorisées : ${emailBankImageBlocks(imageId).join(", ")}).`
    )
  }
  return { src: emailBankDerivative(imageId, format).src as ImageAssetSlot["src"], alt: emailBank[imageId].alt }
}

/** Les cinq visuels d'une frise, dans l'ordre des slots `image-1` à `image-5`. */
export function resolveEmailPortraitStrip(stripId: string): ImageAssetSlot[] {
  if (!isEmailPortraitStripId(stripId)) throw new EmailImageBankError("unknown-strip", `Frise inconnue : "${stripId}".`)
  return emailPortraitStrips[stripId].images.map((imageId, index) => ({
    src: emailBankStripDerivative(imageId, index + 1).src as ImageAssetSlot["src"],
    alt: emailBank[imageId].alt,
  }))
}

/** Choix déterministe d'une image pour une intention et une lame : le même `seed` donne toujours la même image. */
export function pickEmailBankImage(intent: string, blockType: string, seed = ""): EmailBankImageId {
  const candidates = emailImagesForIntent(intent, blockType)
  if (candidates.length === 0) {
    throw new EmailImageBankError("incompatible-block", `Aucune image d'intention "${intent}" pour la lame "${blockType}".`)
  }
  let hash = 0x811c9dc5
  for (const char of seed) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0
  return candidates[hash % candidates.length]!
}

/** Mapping fermé URL canonique → fichier local, pour l'aperçu uniquement (lu par `toPreviewHtml`). */
export const emailBankPreviews: ReadonlyMap<string, string> = new Map(
  [
    ...emailBankImageIds.flatMap((id) => emailBank[id].formats.map((format) => emailBankDerivative(id, format))),
    ...emailPortraitStripIds.flatMap((stripId) => emailPortraitStrips[stripId].images.map((id, index) => emailBankStripDerivative(id, index + 1))),
  ].map((entry) => [entry.src, entry.preview])
)

/** Image d'un `src` canonique de la banque, ou `undefined` si ce n'est pas une URL de la banque (validation des recettes). */
export function emailBankImageIdFromSrc(src: string): EmailBankImageId | undefined {
  if (!emailBankPreviews.has(src)) return undefined
  const id = /\/email-v2\/([a-z0-9-]+?)--(?:medium|large|split|band|offer|strip-[1-5])\.jpg$/.exec(src)?.[1]
  return isEmailBankImageId(id) ? id : undefined
}

export type EmailVisualIntentView ={ intent: EmailVisualIntent; hint: string }
export type EmailPortraitStripView = { id: EmailPortraitStripId; hint: string }

/**
 * Vue pour le contexte du modèle : les intentions qui ont au moins une image
 * pour l'une des lames candidates, avec une indication courte. Ni identifiant
 * d'image, ni URL, ni chemin, ni alt, ni dimension, ni nom de fichier.
 */
export function buildEmailVisualIntentView(candidateTypes?: readonly string[]): EmailVisualIntentView[] {
  return emailVisualIntents.flatMap((intent) => {
    const available = !candidateTypes || candidateTypes.some((type) => emailImagesForIntent(intent, type).length > 0)
    return available ? [{ intent, hint: intentHints[intent] }] : []
  })
}

/** Frises disponibles, avec une indication courte (jamais leurs images). */
export function buildEmailPortraitStripView(): EmailPortraitStripView[] {
  return emailPortraitStripIds.map((id) => ({ id, hint: emailPortraitStrips[id].hint }))
}
