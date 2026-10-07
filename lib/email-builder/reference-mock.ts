/**
 * Analyse de référence SIMULÉE, pour le développement et les tests : un client de
 * la forme du client Anthropic (`messages.create`) qui ne fait AUCUN appel réseau
 * et ne regarde pas l'image. Il lit le catalogue que le message contient et répond
 * de façon déterministe selon un scénario (choisi par le nom du fichier envoyé).
 *
 * Activé seulement par la page (`?reference=mock`) et seulement hors production
 * (`reference-handler.ts`). Jamais utilisé par défaut.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailClaudeClient } from "../email/anthropic"
import type { ReferenceResponse } from "./reference-schema"

export const referenceMockScenarios = ["good", "approximate", "unmatched", "sensitive", "promotion", "proof", "visual", "not-an-email", "error", "no-match"] as const
export type ReferenceMockScenario = (typeof referenceMockScenarios)[number]

/** Le scénario d'un nom de fichier (`approximate.png`, `sensitive-offer.jpg`…) ; « good » par défaut. */
export function mockScenarioFor(fileName: string): ReferenceMockScenario {
  const name = fileName.toLowerCase()
  if (/not-?an-?email|notemail/.test(name)) return "not-an-email"
  if (/no-?match/.test(name)) return "no-match"
  if (/error|erreur/.test(name)) return "error"
  if (/promo/.test(name)) return "promotion"
  if (/proof|chiffre/.test(name)) return "proof"
  if (/visual|visuel/.test(name)) return "visual"
  if (/sensitive|sensible/.test(name)) return "sensitive"
  if (/approx/.test(name)) return "approximate"
  if (/unmatched/.test(name)) return "unmatched"
  return "good"
}

type CatalogEntry = { type: string; name: string; fields: string[]; imageChoices?: Record<string, string[]> }
type Section = ReferenceResponse["analysis"]["sections"][number]
type Mapping = ReferenceResponse["mapping"][number]

const slotOf = (field: string) => field.split(" (")[0]!
const sample = (field: string) => (field.includes("(titre)") ? "Avancer à votre rythme" : field.includes("(bouton)") ? "Découvrir la suite" : "Prenez le temps de regarder les possibilités, puis choisissez ce qui vous convient.")

const section = (ref: string, role: Section["role"], layout: Section["layout"], intent: string, extra: Partial<Section> = {}): Section => ({ ref, role, layout, intent, hasImage: false, imageCount: 0, hasCta: false, repeatedItems: 0, tone: "light", ...extra })

function map(catalog: CatalogEntry[], ref: string, name: string, status: Mapping["status"] = "matched", reason = "", imageIndex = 0, extraContent: Mapping["content"] = []): Mapping {
  const entry = catalog.find((candidate) => candidate.name === name) ?? catalog[0]!
  const images = Object.entries(entry.imageChoices ?? {}).map(([slot, ids]) => ({ slot, imageId: ids[imageIndex % ids.length]! }))
  return { ref, status, blockType: entry.type, reason, content: [...entry.fields.map((field) => ({ slot: slotOf(field), value: sample(field) })).filter((item) => !extraContent.some((extra) => extra.slot === item.slot)), ...extraContent], images }
}

const unmatched = (ref: string, reason: string): Mapping => ({ ref, status: "unmatched", blockType: "", reason, content: [], images: [] })

export function mockReferenceAnswer(catalog: CatalogEntry[], scenario: ReferenceMockScenario): ReferenceResponse {
  const empty: Pick<ReferenceResponse, "status" | "sensitive"> = { status: "valid", sensitive: [] }
  if (scenario === "not-an-email") return { status: "not-an-email", sensitive: [], analysis: { sections: [] }, mapping: [] }
  if (scenario === "no-match") {
    return { ...empty, analysis: { sections: [section("s1", "other", "other", "Tableau comparatif de plusieurs offres"), section("s2", "other", "other", "Carte interactive")] }, mapping: [unmatched("s1", "Aucune lame ne présente un tableau."), unmatched("s2", "Aucune lame ne porte une carte.")] }
  }
  const sections: Section[] = [
    section("s1", "hero", "image-top", "Ouverture : une promesse et un appel à découvrir", { hasImage: true, imageCount: 1, hasCta: true, tone: "brand" }),
    section("s2", "feature-list", "list", "Les étapes pour avancer", { repeatedItems: 3 }),
    section("s3", "text", "single-column", "Un message d'accompagnement"),
    section("s4", "cta", "single-column", "Invitation finale à passer à l'action", { hasCta: true }),
  ]
  const mapping: Mapping[] = [map(catalog, "s1", "Hero promotionnel, grand visuel", "matched", "", 0), map(catalog, "s2", "Liste numérotée"), map(catalog, "s3", "Texte seul"), map(catalog, "s4", "Texte et bouton")]
  if (scenario === "approximate") {
    sections.splice(2, 0, section("s5", "benefits", "columns-3", "Comparaison de trois avantages côte à côte", { repeatedItems: 3 }))
    mapping.splice(2, 0, map(catalog, "s5", "Liste à icônes", "approximate", "Liste verticale plutôt que trois colonnes."))
  }
  if (scenario === "unmatched") {
    sections.splice(2, 0, section("s5", "products", "columns-3", "Tableau comparatif de formations", { repeatedItems: 3, hasCta: true }))
    mapping.splice(2, 0, unmatched("s5", "Aucune lame ne présente un tableau comparatif."))
  }
  if (scenario === "promotion") {
    // Une offre promotionnelle : la STRUCTURE (lame promo) est reproduite, jamais ses valeurs (remise, code, date).
    sections.splice(0, 1, section("s1", "offer", "image-top", "Ouverture : une offre promotionnelle avec un code", { hasImage: true, imageCount: 1, hasCta: true, tone: "dark" }))
    mapping.splice(0, 1, map(catalog, "s1", "Hero offre avec code", "matched", "", 1, [{ slot: "sous-titre", value: "-30 % avec le code BIENVENUE20 jusqu'au 31 décembre" }]))
    return { ...empty, sensitive: ["percentage", "promo-code", "date"], analysis: { sections }, mapping }
  }
  if (scenario === "proof") {
    // Un chiffre clé de preuve : la lame « chiffre clé » est promotionnelle, la référence n'est PAS une offre.
    sections.splice(1, 0, section("s5", "proof", "banner", "Un grand chiffre qui rassure sur la communauté", { hasCta: true, tone: "dark" }))
    mapping.splice(1, 0, map(catalog, "s5", "Bandeau chiffre clé", "matched", "", 0))
    return { ...empty, sensitive: ["quantified-proof"], analysis: { sections }, mapping }
  }
  if (scenario === "visual") {
    // Une section avec photo mappée « matched » sur une lame sans visuel (le code la rétrograde), et une vraie lame à visuel qui reste « matched ».
    sections.splice(1, 0, section("s5", "offer", "image-background", "Une photo avec une carte superposée et un bouton", { hasImage: true, imageCount: 1, hasCta: true }))
    mapping.splice(1, 0, map(catalog, "s5", "Détail d'offre, titre sous l'encart", "matched", "Le visuel est géré par la lame."))
    return { ...empty, analysis: { sections }, mapping }
  }
  if (scenario === "sensitive") {
    sections.splice(1, 0, section("s5", "offer", "banner", "Une offre chiffrée à durée limitée", { hasCta: true, tone: "dark" }))
    mapping.splice(1, 0, map(catalog, "s5", "Texte et bouton", "approximate", "Pas de lame d'offre : rapprochée d'un texte avec bouton.", 0, [{ slot: "titre-section", value: "Profitez de -30 % jusqu'au 31 décembre" }]))
    return { ...empty, sensitive: ["price", "percentage", "date"], analysis: { sections }, mapping }
  }
  return { ...empty, analysis: { sections }, mapping }
}

/** Un client de la forme de `EmailClaudeClient`, sans réseau ; le scénario `error` lève une erreur réseau simulée. */
export function createMockReferenceClient(scenario: ReferenceMockScenario): EmailClaudeClient {
  return {
    messages: {
      create: async (params) => {
        if (scenario === "error") throw new Error("Erreur simulée du fournisseur.")
        const last = params.messages.at(-1)
        const blocks = Array.isArray(last?.content) ? last.content : []
        const text = blocks.find((block) => block.type === "text")
        const { catalog } = JSON.parse(text && "text" in text ? text.text : "{}") as { catalog?: CatalogEntry[] }
        return {
          id: "msg_mock",
          type: "message",
          role: "assistant",
          model: "mock-reference",
          content: [{ type: "text", text: JSON.stringify(mockReferenceAnswer(catalog ?? [], scenario)), citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          stop_details: null,
          usage: { input_tokens: 0, output_tokens: 0, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
        } as unknown as Awaited<ReturnType<EmailClaudeClient["messages"]["create"]>>
      },
    },
  }
}
