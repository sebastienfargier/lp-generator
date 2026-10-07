/**
 * Prédicats de COUVERTURE d'une spec générée (V2.9.4a) : une spec valide au sens du DSL ne remplace une
 * approximation que si elle représente CHAQUE gap structurel déclaré. Purs, sur l'arbre de la spec
 * (`walkNodes`) : aucune heuristique visuelle, aucun score, aucun modèle juge.
 *
 * - `columns` : un nœud `columns` avec le nombre de colonnes de la disposition (columns-N) ;
 * - `column-proportions` : deux colonnes en 1:2 ou 2:1 ; pour image-left / image-right, le visuel est dans la
 *   colonne du bon côté ;
 * - `repeated-cards` : autant de cartes que d'éléments répétés ; `icon-items` : autant d'icônes ;
 * - `card-over-image` : une carte en chevauchement placée juste après une image ;
 * - `stat-emphasis` : un texte de style `stat` ;
 * - `image-placement` : au moins une image ; en image-top, la première feuille de contenu est l'image ; en
 *   image-left / image-right, voir `column-proportions`.
 *
 * Garde-fous : aucun visuel si la référence n'en a pas, pas plus de visuels que la référence, aucun bouton si
 * la référence n'en a pas. Un bouton ou un visuel en plus, dans la limite de la référence, reste admis.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { GeneratedBlockSpec, GeneratedNode } from "./generated/schema"
import { walkNodes } from "./generated/slots"
import type { ExpressibleReferenceGap } from "./reference-gap"
import type { GeneratedReferenceCandidate } from "./reference-generated-request"

export type GeneratedReferenceStructureCheck = { ok: true } | { ok: false; reason: "structural-coverage" | "image-not-allowed" | "cta-not-allowed"; gap?: ExpressibleReferenceGap }

const withChildren = (node: GeneratedNode): node is Extract<GeneratedNode, { children: GeneratedNode[] }> => "children" in node
const subtree = (node: GeneratedNode): GeneratedNode[] => [node, ...(withChildren(node) ? node.children.flatMap(subtree) : [])]
const hasImage = (node: GeneratedNode) => subtree(node).some((entry) => entry.t === "image")
const layoutColumns = (layout: string) => /^columns-([234])$/.exec(layout)?.[1]

/** Une carte en chevauchement placée juste après une image, dans n'importe quel conteneur. */
function hasOverlapAfterImage(nodes: readonly GeneratedNode[]): boolean {
  return nodes.some((node, index) => (node.t === "card" && node.overlap > 0 && nodes[index - 1]?.t === "image") || (withChildren(node) && hasOverlapAfterImage(node.children)))
}

/** La première feuille de contenu (ni conteneur, ni espaceur, ni séparateur) dans l'ordre du document. */
const firstContentLeaf = (spec: GeneratedBlockSpec) => walkNodes(spec).find((node) => !withChildren(node) && node.t !== "spacer" && node.t !== "divider")

/** Un `columns` à deux colonnes dont le visuel n'est que du côté demandé. */
const imageOnSide = (nodes: readonly GeneratedNode[], layout: string) =>
  nodes.some((node) => node.t === "columns" && node.children.length === 2 && (layout === "image-left" ? hasImage(node.children[0]!) && !hasImage(node.children[1]!) : hasImage(node.children[1]!) && !hasImage(node.children[0]!)))

const covers: Record<ExpressibleReferenceGap, (spec: GeneratedBlockSpec, nodes: GeneratedNode[], candidate: GeneratedReferenceCandidate) => boolean> = {
  columns: (_spec, nodes, candidate) => {
    const expected = layoutColumns(candidate.layout)
    return expected !== undefined && nodes.some((node) => node.t === "columns" && node.children.length === Number(expected))
  },
  "column-proportions": (_spec, nodes, candidate) =>
    nodes.some((node) => {
      if (node.t !== "columns" || node.children.length !== 2 || !(node.ratio === "1:2" || node.ratio === "2:1")) return false
      if (candidate.layout === "columns-2") return true
      return (candidate.layout === "image-left" || candidate.layout === "image-right") && imageOnSide([node], candidate.layout)
    }),
  "repeated-cards": (_spec, nodes, candidate) => nodes.filter((node) => node.t === "card").length === candidate.repeatedItems,
  "icon-items": (_spec, nodes, candidate) => nodes.filter((node) => node.t === "icon").length === candidate.repeatedItems,
  "card-over-image": (spec) => hasOverlapAfterImage(spec.root.children),
  "stat-emphasis": (_spec, nodes) => nodes.some((node) => node.t === "text" && node.style === "stat"),
  "image-placement": (spec, nodes, candidate) => {
    if (!nodes.some((node) => node.t === "image")) return false
    if (candidate.layout === "image-top") return firstContentLeaf(spec)?.t === "image"
    if (candidate.layout === "image-left" || candidate.layout === "image-right") return imageOnSide(nodes, candidate.layout)
    return true
  },
}

/** La spec représente-t-elle tous les gaps déclarés, sans visuel ni bouton que la référence n'a pas ? */
export function checkGeneratedReferenceStructure(spec: GeneratedBlockSpec, candidate: GeneratedReferenceCandidate): GeneratedReferenceStructureCheck {
  const nodes = walkNodes(spec)
  const images = nodes.filter((node) => node.t === "image").length
  if (!candidate.hasImage ? images > 0 : images > Math.max(candidate.imageCount, 1)) return { ok: false, reason: "image-not-allowed" }
  if (!candidate.hasCta && nodes.some((node) => node.t === "button")) return { ok: false, reason: "cta-not-allowed" }
  for (const gap of candidate.structure) if (!covers[gap](spec, nodes, candidate)) return { ok: false, reason: "structural-coverage", gap }
  return { ok: true }
}
