/**
 * Fixtures de la bibliothèque Email : un contenu de démonstration, stable et
 * neutre, pour chacune des lames du manifeste. Elles servent uniquement à
 * montrer les lames de l'application (jamais envoyées, jamais écrites par un
 * modèle) : le contenu dit explicitement qu'il est fictif, sans prix, remise,
 * chiffre, témoignage, partenaire ni date présentés comme réels.
 *
 * Chaque fixture est dérivée du manifeste (slots, types, optionnels) : aucune
 * liste de lames n'est recopiée. Les liens sont des destinations contrôlées,
 * les icônes viennent du catalogue d'icônes, les disclaimers du catalogue.
 *
 * Images : les lames dont le cadre a une photo du catalogue d'images (compat
 * prouvée par `image-catalog.ts`) l'utilisent. Les autres n'ont AUCUN asset au
 * bon ratio : leur visuel est un emplacement explicitement vide
 * (`libraryEmptyVisual`), jamais une image prétendue valide. Ce catalogue n'est
 * pas élargi pour la bibliothèque.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { emailDestinationUrl, type EmailDestinationId } from "./destinations"
import { emailImagesForBlock, resolveEmailImage } from "./image-catalog"
import { emailBlockManifest, emailIconNames, type EmailSlotKind } from "./manifest"
import { toPreviewHtml } from "./preview"
import { renderEmail } from "./renderer"
import type { EmailBlock, EmailBlockType, EmailConfig } from "./types"

/** Emplacement visuel sans asset : URL HTTPS valide mais jamais résolue (TLD réservé). */
export const libraryEmptyVisual = {
  src: "https://demo-assets.invalid/library-sans-visuel.png",
  alt: "Emplacement du visuel (aucun asset au ratio de cette lame)",
} as const

const footerDestinations = ["catalogue-formations", "alternance", "trajectoire-magazine"] as const satisfies readonly EmailDestinationId[]
const linkDestinations = ["metiers", "diplomes", "certificats", "methode"] as const satisfies readonly EmailDestinationId[]
const ctaDestinations = ["catalogue-formations", "accompagnement"] as const satisfies readonly EmailDestinationId[]
const icons = ["users", "lightbulb", "stopwatch", "graduation-cap"] as const satisfies readonly (typeof emailIconNames)[number][]

const demoParagraph = "Texte de démonstration : ce paragraphe illustre la lame de la bibliothèque et n'a pas vocation à être envoyé."

/** Texte de démonstration d'un slot, d'après son nom (neutre, sans fait ni promesse). */
function demoText(slot: string): string {
  const number = /-(\d)(?:-|$)/.exec(slot)?.[1] ?? ""
  if (slot.startsWith("compteur-")) return "00"
  if (slot.startsWith("code-promo")) return "CODE-DEMO"
  if (slot === "valeur-cle") return "Valeur clé"
  if (slot === "temoignage-auteur") return "Auteur de démonstration"
  if (slot === "temoignage") return "Citation de démonstration, sans valeur de témoignage réel."
  if (slot === "partenaire") return "Partenaire de démonstration"
  if (slot === "texte-separation") return "ou"
  if (slot === "sur-titre" || slot === "sous-titre") return "Surtitre exemple"
  if (slot.startsWith("titre-principal") || slot.startsWith("titre-section")) return "Titre exemple"
  if (/^item-\d-titre$/.test(slot)) return `Élément ${number}`
  if (/^produit-\d-titre$/.test(slot)) return `Intitulé ${number}`
  if (slot.startsWith("texte-descriptif")) return demoParagraph
  if (slot.startsWith("label")) return number ? `Libellé ${number}` : "Libellé de démonstration"
  return "Texte de démonstration"
}

function demoValue(type: EmailBlockType, slot: string, kind: EmailSlotKind, footer: boolean) {
  const number = Number(/-(\d)$/.exec(slot)?.[1] ?? 1)
  switch (kind) {
    case "texte":
      return { text: demoText(slot) }
    case "cta":
    case "cta:fleche":
      return { label: "Bouton de démonstration", href: emailDestinationUrl(ctaDestinations[Math.min(number, ctaDestinations.length) - 1]!) }
    case "lien": {
      const destination = footer ? footerDestinations[number - 1]! : linkDestinations[(number - 1) % linkDestinations.length]!
      return { label: footer ? "Lien de démonstration" : "Lien texte de démonstration", href: emailDestinationUrl(destination) }
    }
    case "asset:visuel": {
      const image = emailImagesForBlock(type)[0]
      return image ? resolveEmailImage(image, type) : { ...libraryEmptyVisual }
    }
    case "asset:icone":
      return { icon: icons[(number - 1) % icons.length]! }
    case "disclaimer":
      return { disclaimer: "financement-personnel" }
  }
}

/** La lame, avec tous ses slots requis remplis (les optionnels sont laissés absents). */
export function buildEmailLibraryBlock(type: EmailBlockType): EmailBlock {
  const entry = emailBlockManifest[type] as { slots: Readonly<Record<string, EmailSlotKind>>; optional?: readonly string[]; family: string }
  const optional = new Set(entry.optional ?? [])
  const slots = Object.fromEntries(
    Object.entries(entry.slots)
      .filter(([slot]) => !optional.has(slot))
      .map(([slot, kind]) => [slot, demoValue(type, slot, kind, entry.family === "Footer")])
  )
  return { id: "lame", type, slots } as unknown as EmailBlock
}

const footerBlock = () => buildEmailLibraryBlock("email-module-footer-compact-legal")

const document = {
  version: 1,
  id: "bibliotheque-email",
  name: "Bibliothèque Email",
  subject: "Aperçu d'une lame de la bibliothèque",
  preheader: "Contenu de démonstration, jamais envoyé",
} as const

/**
 * Email technique valide contenant la lame, pour la validation : la lame, puis
 * le footer que `schemas.ts` exige en dernière position (une lame de mentions
 * légales doit le précéder immédiatement : c'est le cas).
 */
export function buildEmailLibraryConfig(type: EmailBlockType): EmailConfig {
  const block = buildEmailLibraryBlock(type)
  return { ...document, blocks: type === "email-module-footer-compact-legal" ? [block] : [block, { ...footerBlock(), id: "footer" }] } as EmailConfig
}

/**
 * Un emplacement vide devient un cadre gris étiqueté, au ratio exact du slot
 * (lu dans les `width` et `height` que le renderer a posés) : l'aperçu dit
 * clairement qu'aucune image n'est montrée, sans image cassée ni faux visuel.
 */
const emptyVisualTag = new RegExp(`<img\\b[^>]*src="${libraryEmptyVisual.src.replaceAll(".", "\\.")}"[^>]*>`, "g")

function placeholderFor(tag: string) {
  const width = Number(/\swidth="(\d+)"/.exec(tag)?.[1] ?? 0)
  const height = Number(/\sheight="(\d+)"/.exec(tag)?.[1] ?? 0)
  if (!width || !height) throw new Error("Emplacement de visuel sans dimensions : ratio inconnu.")
  const label = width >= 180 ? `<text x='50%' y='50%' fill='#79726b' font-family='sans-serif' font-size='${Math.min(14, Math.round(width / 12))}' text-anchor='middle' dominant-baseline='middle'>Emplacement visuel</text>` : ""
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><rect width='100%' height='100%' fill='#e7e5e4'/>${label}</svg>`
  return tag.replace(/src="[^"]*"/, `src="data:image/svg+xml,${encodeURIComponent(svg)}"`)
}

/**
 * Aperçu HTML d'UNE lame : la lame seule, rendue par le vrai renderer avec son
 * vrai template et le socle, puis adaptée pour l'application par `toPreviewHtml`
 * (logo, icônes et photos locaux, liens inertes). Rien n'est recréé en JSX.
 */
export function renderEmailLibraryPreview(type: EmailBlockType): string {
  const block = buildEmailLibraryBlock(type)
  const html = renderEmail({ ...document, blocks: [block] } as EmailConfig)
  return toPreviewHtml(html).replace(emptyVisualTag, placeholderFor)
}
