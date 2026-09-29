/**
 * Contrat EmailConfig v1 : l'email final, sérialisable, tel que le futur
 * renderer l'assemblera dans le socle. Types uniquement, tous dérivés de
 * `./manifest`, `./disclaimers` et `./surfaces` : aucun identifiant de lame,
 * nom de slot ou texte légal n'est recopié ici.
 *
 * Le contrat ne transporte que du contenu de slots. Il n'y a pas de champ
 * `html`, `style`, `className` ni de couleur libre : structure, tables,
 * responsive et styles restent ceux des templates. Les éléments système
 * (logo, réseaux sociaux, désabonnement, préférences) ne sont pas des slots.
 *
 * Les entrées du moteur de génération (mode, brief, cible, référence…) ne sont
 * pas ici : elles décrivent comment on produit l'email, pas l'email produit.
 */
import type { EmailDisclaimerId, emailDisclaimers } from "./disclaimers"
import type {
  EmailIconName,
  EmailSlotKind,
  emailBlockManifest,
} from "./manifest"
import type { EmailSurface, emailSurfaceRules } from "./surfaces"
import type { emailHrefPlaceholders } from "./system"

type EmailManifest = typeof emailBlockManifest

/** Identifiant d'une lame existante : les 36 clés du manifeste. */
export type EmailBlockType = keyof EmailManifest

/** Slots déclarés pour une lame donnée. */
export type EmailSlotName<Type extends EmailBlockType> =
  keyof EmailManifest[Type]["slots"] & string

type SlotKindOf<
  Type extends EmailBlockType,
  Slot extends EmailSlotName<Type>,
> = EmailManifest[Type]["slots"][Slot]

/* Liens */

/** URL absolue HTTPS ; une query `?[UTM À DÉFINIR — CRM]` est admise. */
export type EmailHttpsUrl = `https://${string}`

/** Expression Liquid complète, résolue par la plateforme d'envoi. */
export type EmailLiquidExpression = `{{${string}}}`

/**
 * Cible d'un lien. Jamais `javascript:`, `data:`, `mailto:` ni URL relative ;
 * le futur schéma interdira en plus espaces, guillemets et chevrons.
 */
export type EmailHref =
  | EmailHttpsUrl
  | EmailLiquidExpression
  | (typeof emailHrefPlaceholders)["urlToConfirm"]

/* Valeurs de slots */

/**
 * Remplace le texte de la balise porteuse. Texte brut : le renderer
 * l'échappe, aucune balise n'est interprétée. Les expressions Liquid
 * (`{{ … }}`) restent possibles, c'est la raison d'être de la convention.
 */
export type TextSlot = { text: string }

/**
 * Bouton : libellé et `href` du `<a>`. Pour `cta:fleche`, le renderer ajoute
 * la flèche du gabarit ; elle ne fait jamais partie du libellé.
 */
export type CtaSlot = { label: string; href: EmailHref }

/** Lien texte : libellé et `href` du `<a>`, sans décoration ajoutée. */
export type LinkSlot = { label: string; href: EmailHref }

/**
 * Visuel éditorial : `src` et `alt` de l'`<img data-slot>`. Dimensions et
 * ratio sont des propriétés du template, jamais de la config : le visuel est
 * fourni au ratio exact du slot.
 */
export type ImageAssetSlot = { src: EmailHttpsUrl; alt: string }

/** Icône choisie parmi les 40 du CDN ; le renderer résout l'URL. */
export type IconAssetSlot = { icon: EmailIconName }

type DisclaimerSelection<Id extends EmailDisclaimerId> =
  (typeof emailDisclaimers)[Id] extends { parameter: "endDate" }
    ? { disclaimer: Id; endDate: EmailDate }
    : { disclaimer: Id }

/** Date calendaire ISO, `AAAA-MM-JJ`. */
export type EmailDate = `${number}-${number}-${number}`

/**
 * Mention légale : un identifiant du catalogue, jamais un texte. Le texte
 * exact reste système (`./disclaimers`).
 */
export type DisclaimerSlot = {
  [Id in EmailDisclaimerId]: DisclaimerSelection<Id>
}[EmailDisclaimerId]

type SlotValueByKind = {
  texte: TextSlot
  cta: CtaSlot
  "cta:fleche": CtaSlot
  lien: LinkSlot
  "asset:visuel": ImageAssetSlot
  "asset:icone": IconAssetSlot
  disclaimer: DisclaimerSlot
}

/**
 * Valeur attendue par type de slot ; ne compile pas si un type du manifeste
 * n'a pas de valeur.
 */
export type EmailSlotValueMap = {
  [Kind in EmailSlotKind]: SlotValueByKind[Kind]
}

type OptionalSlotName<Type extends EmailBlockType> =
  EmailManifest[Type] extends { optional: readonly (infer Slot)[] }
    ? Extract<Slot, EmailSlotName<Type>>
    : never

type RequiredSlotName<Type extends EmailBlockType> = Exclude<
  EmailSlotName<Type>,
  OptionalSlotName<Type>
>

type SlotValue<
  Type extends EmailBlockType,
  Slot extends EmailSlotName<Type>,
> = EmailSlotValueMap[SlotKindOf<Type, Slot> & EmailSlotKind]

/**
 * Slots d'une lame : seuls ceux qu'elle déclare, chacun avec la valeur de son
 * type. Tous sont requis, sauf les `optional` du manifeste, dont l'absence a
 * un rendu défini : un texte de calage n'atteint jamais l'email final.
 */
export type EmailBlockSlots<Type extends EmailBlockType> = [
  EmailSlotName<Type>,
] extends [never]
  ? // Lame sans slot : `{}` accepterait n'importe quelle clé.
    Record<string, never>
  : {
      [Slot in RequiredSlotName<Type>]: SlotValue<Type, Slot>
    } & {
      [Slot in OptionalSlotName<Type>]?: SlotValue<Type, Slot>
    }

/* Blocs et email */

type PageOnlyFamily = (typeof emailSurfaceRules)["pageOnlyFamilies"][number]

/** Header et footer n'acceptent que la surface neutre. */
type AllowedSurface<Type extends EmailBlockType> =
  EmailManifest[Type]["family"] extends PageOnlyFamily
    ? (typeof emailSurfaceRules)["neutral"]
    : EmailSurface

export type EmailBlockOf<Type extends EmailBlockType> = {
  /** Identifiant unique dans l'email. */
  id: string
  type: Type
  /** Surface de la lame ; `page` si absente. */
  surface?: AllowedSurface<Type>
  slots: EmailBlockSlots<Type>
}

/** Union discriminée par `type` : une entrée par lame du manifeste. */
export type EmailBlock = {
  [Type in EmailBlockType]: EmailBlockOf<Type>
}[EmailBlockType]

export type EmailConfig = {
  version: 1
  id: string
  /** Nom interne de l'email (campagne, variante) ; jamais affiché. */
  name: string
  /** Objet : alimente la boîte de réception et le `<title>` du socle. */
  subject: string
  /** Texte de prévisualisation caché du socle (`[PREHEADER]`). */
  preheader: string
  /** Lames dans l'ordre d'affichage, collées entre les marqueurs LAMES. */
  blocks: EmailBlock[]
}
