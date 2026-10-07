/**
 * La REQUÊTE du futur appel texte « lames générées » (V2.9.4a) : un type et un constructeur purs, sans moteur.
 *
 * Ce que le modèle recevra, et rien d'autre :
 * - par candidat : des données FERMÉES de l'analyse (`ref`, `role`, `layout`, `tone`, `hasImage`, `imageCount`,
 *   `hasCta`, `repeatedItems`) et la liste fermée `structure` ;
 * - les rôles du document, dans l'ordre ;
 * - un contexte SYSTÈME constant (vocabulaire Blueprint V2.9.4c.1 et ses capacités, noms de slots, formats d'image,
 *   limites de texte, icônes, intentions visuelles, règles éditoriales Studi). Le DSL complet n'est PAS envoyé.
 *
 * Ce qu'il ne reçoit JAMAIS : l'`intent` libre de la section (du texte dérivé d'une image non fiable : on ne
 * crée pas un canal image → texte libre → second modèle), le texte de la référence, l'image ou son base64, un
 * EmailDocument, du HTML, du CSS, du JSX, une URL. Le constructeur COPIE champ par champ : une section qui
 * porterait d'autres propriétés (dont `intent`) ne les transmet pas.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailImageFormats, emailVisualIntents } from "../email/image-bank"
import { emailIconNames } from "../email/manifest"
import { buildEditorialBrandContext } from "../email/recipe-brand-context"
import { referenceRoles } from "./document"
import { buttonMaxLength, textMaxLength } from "./generated/tokens"
import { isExpressibleReferenceGap, maxGeneratedReferenceCandidates, type ExpressibleReferenceGap, type ReferenceGapSection } from "./reference-gap"
import { blueprintAligns, blueprintColumns, blueprintCounts, blueprintImageFormats, blueprintImagePositions, blueprintIntros, blueprintItemStyles, blueprintOverlaps, blueprintProportions } from "./reference-generated-blueprint"

export type GeneratedReferenceCandidate = {
  ref: string
  role: ReferenceGapSection["role"]
  layout: ReferenceGapSection["layout"]
  tone: ReferenceGapSection["tone"]
  hasImage: boolean
  imageCount: number
  hasCta: boolean
  repeatedItems: number
  structure: ExpressibleReferenceGap[]
}

export type GeneratedReferenceRequest = {
  candidates: GeneratedReferenceCandidate[]
  /** Les rôles des sections du document, dans l'ordre de lecture : le contexte de position, sans texte. */
  documentRoles: (typeof referenceRoles)[number][]
}

/** Construit la requête : 1 à 3 candidats, tels que la sélection les a retenus (déjà expressibles et cohérents). */
export function buildGeneratedReferenceRequest(selected: readonly ReferenceGapSection[], documentRoles: readonly (typeof referenceRoles)[number][]): GeneratedReferenceRequest {
  if (selected.length === 0 || selected.length > maxGeneratedReferenceCandidates) throw new RangeError(`Une requête porte 1 à ${maxGeneratedReferenceCandidates} candidats.`)
  return {
    candidates: selected.map((section) => ({
      ref: section.ref,
      role: section.role,
      layout: section.layout,
      tone: section.tone,
      hasImage: section.hasImage,
      imageCount: section.imageCount,
      hasCta: section.hasCta,
      repeatedItems: section.repeatedItems,
      structure: section.structure.filter(isExpressibleReferenceGap),
    })),
    documentRoles: [...documentRoles],
  }
}

/**
 * Le contexte SYSTÈME de l'appel : constant, dérivé des modules existants (Blueprint, banque, icônes), jamais écrit
 * à la main pour les listes. Le DSL complet reste INTERNE au système : le modèle ne reçoit que le vocabulaire du
 * Blueprint, ses capacités, les noms de slots et les contraintes de contenu. Aucune URL, aucun format `card`.
 */
export function describeGeneratedReferenceContext() {
  const brand = buildEditorialBrandContext()
  return {
    blueprint: {
      archetypes: {
        items: "des éléments répétés (count) en colonnes (columns ; 1 = en pile), de style itemStyle ; pas de visuel",
        media: "un visuel en haut, à gauche ou à droite d'un texte (imagePosition)",
        overlap: "un visuel en haut avec une carte de texte qui le chevauche (overlap)",
      },
      values: {
        count: blueprintCounts,
        columns: blueprintColumns,
        itemStyle: blueprintItemStyles,
        proportion: blueprintProportions,
        imagePosition: blueprintImagePositions,
        imageFormat: blueprintImageFormats,
        overlap: blueprintOverlaps,
        align: blueprintAligns,
        intro: blueprintIntros,
        cta: [true, false],
      },
      /** Un blueprint est UN objet : tous les champs sont donnés ; une valeur neutre dit « sans objet ». */
      neutral: { items: { imagePosition: "none", imageFormat: "none", overlap: 0 }, "media / overlap": { count: 1, columns: 1, itemStyle: "plain" } },
      rules: [
        "items : columns ≤ count ; si columns ≥ 2, count est un multiple de columns ; une proportion autre que equal suppose columns = 2.",
        "media : imagePosition left ou right avec proportion first-wide (premier côté large) ou second-wide ; top avec equal. Formats : top = band, medium ou large ; left/right = split ou medium.",
        "overlap : imagePosition top, format band, medium ou large, overlap 24, 40 ou 56, proportion equal.",
        "media et overlap : intro n'est jamais none.",
      ],
      covers: {
        columns: "items avec columns ≥ 2, ou media avec imagePosition left/right",
        "column-proportions": "items avec columns = 2, ou media left/right, avec une proportion autre que equal",
        "repeated-cards": "items avec itemStyle card ou icon-card, count = repeatedItems",
        "icon-items": "items avec itemStyle icon ou icon-card, count = repeatedItems",
        "card-over-image": "overlap",
        "stat-emphasis": "items avec itemStyle stat",
        "image-placement": "media (imagePosition comme le layout : image-top → top, image-left → left, image-right → right) ou overlap",
      },
      slots: {
        intro: "eyebrow, title, body selon intro",
        items: "plain : item-N-title, item-N-body ; card : card-N-title, card-N-body ; icon : icon-N (icône), icon-N-title, icon-N-body ; icon-card : card-N-icon, card-N-title, card-N-body ; stat : stat-N (rempli par le système : ne l'écris pas), stat-N-label",
        media: "image (visuel), cta (bouton si cta)",
      },
    },
    textLimits: { eyebrow: textMaxLength.eyebrow, title: textMaxLength.title, "item / card / icon title": textMaxLength.subtitle, "body (intro et éléments)": textMaxLength.body, "stat label": textMaxLength.caption, button: buttonMaxLength },
    imageFormats: Object.fromEntries(blueprintImageFormats.filter((format) => format !== "none").map((format) => [format, emailImageFormats[format].frame])),
    visualIntents: emailVisualIntents,
    icons: emailIconNames,
    brand: { rules: brand.rules, avoid: brand.avoid },
  }
}
