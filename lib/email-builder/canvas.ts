/**
 * HTML du canvas du Builder : le rendu du vrai renderer, adapté à l'aperçu,
 * avec un repère par lame. SERVEUR UNIQUEMENT (le renderer lit les templates).
 *
 *   EmailDocument → config → renderEmail → repères de lames → toPreviewHtml
 *
 * Reliance HTML ↔ blockId : chaque lame est un `<table>` de premier niveau du
 * corps de l'email. Avant l'adaptation d'aperçu, le HTML de chaque lame est
 * encadré de deux commentaires HTML :
 *
 *   <!--builder-block:ID--> …la lame… <!--/builder-block-->
 *
 * Les commentaires ne changent ni le rendu ni la mise en page ; le navigateur
 * les retrouve (`createTreeWalker`) pour mesurer la zone de chaque lame et y
 * poser les contrôles.
 *
 * Reliance HTML ↔ slot : le renderer rend la lame avec l'attribut `data-slot`
 * que ses templates portent déjà (`slotMarkers`, ajouté au renderer : il
 * retire normalement cet attribut). Un élément visible porte donc son nom de
 * slot, et sa lame est celle dont les repères l'encadrent : blockId + slotName,
 * sans jamais deviner un slot d'après un texte. L'attribut n'a aucun effet
 * visuel et n'existe que dans ce HTML d'aperçu. Les templates et l'export ne sont PAS modifiés : l'HTML
 * exporté ne passe jamais ici.
 *
 * Les fragments viennent de `renderEmailParts` (ajout minimal au renderer : le
 * même rendu, en morceaux ; `renderEmail` en est la jointure, octet pour octet).
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { toPreviewHtml } from "../email/preview"
import type { EmailDocument } from "./document"
import { renderDocumentParts } from "./render"

export const canvasBlockStart = (id: string) => `<!--builder-block:${id}-->`
export const canvasBlockEnd = "<!--/builder-block-->"

/**
 * HTML canonique + repères : le rendu du renderer avec, autour de chaque lame,
 * ses deux commentaires. Retirer les commentaires redonne exactement
 * `renderEmail` (même jointure : `renderEmailParts`).
 */
export function renderMarkedHtml(document: EmailDocument): string {
  const { head, blocks, tail } = renderDocumentParts(document, { slotMarkers: true })
  const marked = blocks.map((html, index) => `${canvasBlockStart(document.config.blocks[index]!.id)}${html}${canvasBlockEnd}`)
  return [head, ...marked, tail].join("\n")
}

/** Retire les repères du Builder (commentaires de lame, `data-slot`) : redonne exactement le HTML du renderer. */
export const stripCanvasMarkers = (html: string) => html.replace(/<!--\/?builder-block[^>]*-->/g, "").replace(/\sdata-slot="[^"]*"/g, "")

/** HTML du canvas : rendu du renderer, repères de lames, adaptation d'aperçu (logo et pictos locaux, liens inertes). */
export function renderCanvasHtml(document: EmailDocument): string {
  return toPreviewHtml(renderMarkedHtml(document))
}
