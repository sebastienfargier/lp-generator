/**
 * Catalogue de lames pour le MAPPING d'une référence visuelle : un sous-ensemble
 * du catalogue de composition (`composition.ts`), enrichi du minimum utile à une
 * comparaison visuelle. Tout est dérivé de l'existant (manifest, bibliothèque,
 * catalogue métier `section-catalog.ts`, banque d'images) ; la seule donnée écrite
 * à la main est une étiquette de disposition pour les lames dont le nom ne suffit
 * pas. Ni HTML, ni URL, ni rendu.
 *
 * Exclues du mapping : l'en-tête, le footer et les mentions légales (l'enveloppe
 * Studi est posée par le système).
 *
 * Les lames PROMOTIONNELLES (celles qui portent une valeur clé ou un code
 * promotionnel) y sont : une référence promotionnelle doit pouvoir utiliser une
 * vraie STRUCTURE promotionnelle. Mais une référence n'est pas une source de
 * vérité commerciale : les slots contrôlés (valeur, code) ne sont ni remplis depuis
 * la référence, ni exposés comme champs éditoriaux, ni laissés à leur contenu
 * d'exemple. Ils reçoivent un état NEUTRE et honnête (« À définir ») qui ne peut
 * pas passer pour une offre ; une future saisie des Promotion Facts n'aura qu'à
 * les renseigner (`unfilledControlledSlots`) : ce sont de simples slots texte.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailDestinations, emailDestinationUrl } from "../email/destinations"
import { emailBank } from "../email/image-bank"
import { promotionSecondaryLink } from "../email/promotion-facts"
import { footerDestinations } from "../email/recipe-resolver"
import { emailBlockManifest } from "../email/manifest"
import { emailSectionCatalog } from "../email/section-catalog"
import type { EmailBlockType } from "../email/types"
import { compatibleImages, slotProtection } from "./assistant-proposal"
import { editableSlots, type CompositionCatalog } from "./composition"
import type { EmailDocument } from "./document"
import { referenceShell } from "./reference-plan"

/** Étiquettes de disposition : seulement là où le nom de la lame n'indique pas la mise en page. */
const layoutTags: Record<string, string> = {
  "email-hero-newsletter-variant-02": "text above one wide image",
  "email-module-hero-promotional-image-large": "large image with text",
  "email-module-hero-promotional-image-medium": "medium image with text",
  "email-module-hero-split-image": "text beside one tall image",
  "email-module-hero-countdown-variant-01": "countdown timer, no button",
  "email-module-hero-countdown-variant-02": "countdown timer with button",
  "email-module-hero-diagnostic-quiz": "quiz introduction",
  "email-module-text-and-cta-variant-02": "text with image and button",
  "email-module-text-and-feature-card": "text with a highlighted card",
  "email-module-benefits-and-testimonial": "benefit items and a quote",
  "email-module-cta-and-testimonial": "button and a quote",
  "email-module-product-details-variant-01": "detail card, title below",
  "email-module-product-details-variant-02": "detail card, title above",
  "email-module-icons-grid": "2x2 grid of icons",
  "email-module-icons-list": "vertical list of icons",
  "email-module-numbered-list": "vertical numbered list",
  "email-module-numbererd-grid": "2x2 numbered grid",
  "email-module-diagnostic-progress-list": "skills with progress bars",
  "email-module-divider-choice": "text divider",
}

type Manifest = Record<string, { family: string; surfaceMode: string; slots: Record<string, string> }>
const manifest = emailBlockManifest as unknown as Manifest

/** La lame peut-elle servir à reproduire une section de corps ? (Ni l'enveloppe Studi, ni les mentions légales.) */
export function isReferenceBodyBlock(type: string): boolean {
  const entry = manifest[type]
  if (!entry || entry.family === "Header" || entry.family === "Footer") return false
  return !Object.values(entry.slots).includes("disclaimer")
}

/** Les slots contrôlés d'une lame (valeur clé, code promotionnel) : la structure promotionnelle, sans ses données. */
export const controlledSlotsOf = (type: string): string[] => Object.keys(manifest[type]?.slots ?? {}).filter((slot) => slotProtection(type as EmailBlockType, slot) === "valeur de référence")

/**
 * L'état neutre d'un slot contrôlé : un texte qui dit qu'il reste à renseigner et
 * ne ressemble à aucune offre. Aucune valeur de démonstration, aucune valeur de la
 * référence.
 */
export const controlledPlaceholders = { value: "À définir", code: "à définir" } as const
const placeholderFor = (slot: string) => (slot.startsWith("code-promo") ? controlledPlaceholders.code : controlledPlaceholders.value)

/** Un lien de la bibliothèque : un libellé Studi réel et sa destination contrôlée (jamais une URL inventée). */
const studiLink = (label: string, destination: keyof typeof emailDestinations) => ({ label, href: emailDestinationUrl(destination) })

/**
 * Le catalogue de composition d'une création depuis une référence : le même, sauf
 * - que les slots contrôlés des lames promotionnelles partent de l'état neutre au
 *   lieu des valeurs d'exemple de la bibliothèque ;
 * - que les LIENS de ces lames (lien texte secondaire) et ceux du footer Studi
 *   partent des libellés et destinations Studi déjà utilisés par les recettes
 *   (`footerDestinations`, `promotionSecondaryLink`), au lieu de « Lien de
 *   démonstration ». La bibliothèque historique n'est pas modifiée.
 */
export function referenceCompositionCatalog(catalog: CompositionCatalog): CompositionCatalog {
  return Object.fromEntries(
    Object.entries(catalog).map(([type, entry]) => {
      const starter: Record<string, unknown> = { ...entry.starter }
      if (type === referenceShell.footer) footerDestinations.forEach((destination, index) => (starter[`lien-${index + 1}`] = studiLink(emailDestinations[destination].label, destination)))
      else if (isReferenceBodyBlock(type)) {
        for (const slot of controlledSlotsOf(type)) starter[slot] = { text: placeholderFor(slot) }
        for (const [slot, kind] of Object.entries(manifest[type]!.slots)) if (kind === "lien") starter[slot] = studiLink(promotionSecondaryLink.label, promotionSecondaryLink.destination)
      }
      return [type, { ...entry, starter }]
    }),
  )
}

/** Les slots contrôlés encore à l'état neutre : ce qu'une future saisie des Promotion Facts viendrait renseigner. */
export function unfilledControlledSlots(document: EmailDocument): { blockId: string; slot: string }[] {
  return (document.config.blocks as unknown as { id: string; type: string; slots: Record<string, { text?: string }> }[]).flatMap((block) =>
    controlledSlotsOf(block.type).filter((slot) => block.slots[slot]?.text === placeholderFor(slot)).map((slot) => ({ blockId: block.id, slot })),
  )
}

/** Les types de lames de corps du catalogue de composition. */
export const referenceBodyTypes = (catalog: CompositionCatalog) => Object.keys(catalog).filter(isReferenceBodyBlock)

const repeated = (slots: string[]) => Math.max(0, ...["item", "icone", "produit"].map((prefix) => new Set(slots.filter((slot) => new RegExp(`^${prefix}-\\d+`).test(slot))).size))

/** Le catalogue vu par le modèle pour le mapping : compact, dérivé, sans rien de technique. */
export function describeReferenceCatalog(catalog: CompositionCatalog) {
  return referenceBodyTypes(catalog).map((type) => {
    const slots = Object.entries(manifest[type]!.slots)
    const images = slots.filter(([, kind]) => kind === "asset:visuel").map(([slot]) => slot)
    const section = (emailSectionCatalog as Record<string, { useWhen?: readonly string[] } | undefined>)[type]
    return {
      type,
      name: catalog[type]!.name,
      family: catalog[type]!.family,
      role: catalog[type]!.role,
      ...(section?.useWhen?.[0] ? { useWhen: section.useWhen[0] } : {}),
      layout: layoutTags[type] ?? (images.length === 0 ? "text only, single column" : "text with image"),
      fields: editableSlots(type).map((field) => `${field.slot} (${field.genre})`),
      ...(controlledSlotsOf(type).length > 0 ? { promotional: true, controlled: controlledSlotsOf(type) } : {}),
      ctas: slots.filter(([, kind]) => kind.startsWith("cta")).length,
      images: images.length,
      repeatedItems: repeated(slots.map(([slot]) => slot)),
      ...(images.length > 0 ? { imageChoices: Object.fromEntries(images.map((slot) => [slot, compatibleImages(type as EmailBlockType).map((image) => image.id)])) } : {}),
    }
  })
}

/** Description courte de chaque image de la banque, pour qu'un choix soit éclairé (une phrase par image, jamais un fichier ni une URL). */
export const describeBankImages = () => Object.fromEntries(Object.entries(emailBank).map(([id, entry]) => [id, entry.alt]))
