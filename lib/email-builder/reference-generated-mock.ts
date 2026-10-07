/**
 * Second appel SIMULÉ (V2.9.4b), pour le développement et les tests : un client de la forme de `EmailClaudeClient` qui
 * ne fait AUCUN appel réseau, ne regarde aucune image et répond de façon déterministe à la REQUÊTE qu'il reçoit
 * (`GeneratedReferenceRequest`) selon le scénario du fichier envoyé. Il compose, pour chaque candidat, un blueprint
 * simple qui couvre ses gaps déclarés ; certains scénarios renvoient volontairement un texte refusé par le
 * système (fait commercial) ou lèvent une erreur.
 *
 * Activé seulement avec le mock de l'appel 1 (`?reference=mock`) et hors production. Jamais utilisé par défaut.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailClaudeClient } from "../email/anthropic"
import { compileGeneratedReferenceBlueprint, type GeneratedReferenceBlueprint } from "./reference-generated-blueprint"
import { deriveGeneratedSlots } from "./generated/slots"
import type { ReferenceMockScenario } from "./reference-mock"
import type { GeneratedReferenceCandidate, GeneratedReferenceRequest } from "./reference-generated-request"
import type { GeneratedReferenceOutput } from "./reference-generated-schema"

const base: GeneratedReferenceBlueprint = { archetype: "items", count: 1, columns: 1, itemStyle: "plain", proportion: "equal", imagePosition: "none", imageFormat: "none", overlap: 0, align: "start", intro: "title-body", cta: false }

/** Un blueprint simple qui couvre les gaps déclarés d'un candidat (et respecte `hasCta`). */
function blueprintFor(candidate: GeneratedReferenceCandidate): GeneratedReferenceBlueprint {
  const gaps = new Set(candidate.structure)
  const cta = candidate.hasCta
  const layoutColumns = Number(/columns-(\d)/.exec(candidate.layout)?.[1] ?? 0)
  const n = (value: number) => value as GeneratedReferenceBlueprint["count"]
  const count = n(Math.min(4, Math.max(1, candidate.repeatedItems)))
  const columns = n(layoutColumns >= 2 && count % layoutColumns === 0 ? layoutColumns : layoutColumns >= 2 ? count : 1)
  if (gaps.has("card-over-image")) return { ...base, archetype: "overlap", imagePosition: "top", imageFormat: "band", overlap: 40, align: "center", cta }
  if (gaps.has("repeated-cards")) return { ...base, count, columns: n(Math.min(columns, count)), itemStyle: "card", align: "center", intro: "none" }
  if (gaps.has("icon-items")) return { ...base, count, columns: n(columns >= 2 ? Math.min(columns, count) : count % 2 === 0 ? 2 : 1), itemStyle: "icon", intro: "none" }
  if (gaps.has("stat-emphasis")) return { ...base, itemStyle: "stat", align: "center", intro: "eyebrow-title-body", cta }
  if (gaps.has("image-placement") || (candidate.hasImage && layoutColumns === 0)) {
    const position = candidate.layout === "image-left" ? "left" : candidate.layout === "image-right" ? "right" : "top"
    return { ...base, archetype: "media", imagePosition: position, imageFormat: position === "top" ? "medium" : "split", proportion: gaps.has("column-proportions") && position !== "top" ? "first-wide" : "equal", cta }
  }
  if (gaps.has("column-proportions")) return { ...base, count: 2, columns: 2, proportion: "first-wide", intro: "none", cta }
  return { ...base, count: n(Math.max(2, columns)), columns: n(Math.max(2, columns)), intro: "none", cta }
}

/** Un texte que le système refuse (un pourcentage) : pour simuler une génération dont le contenu n'est pas retenu. */
const refusedText = "Jusqu'à -20 % de remise"

/** La réponse simulée d'un scénario à une requête : une entrée par candidat demandé. */
export function mockGeneratedAnswer(request: GeneratedReferenceRequest, scenario: ReferenceMockScenario): GeneratedReferenceOutput {
  return {
    items: request.candidates.map((candidate) => {
      const blueprint = blueprintFor(candidate)
      const compiled = compileGeneratedReferenceBlueprint(blueprint, candidate.role)
      const slots = compiled.ok ? deriveGeneratedSlots(compiled.spec) : []
      const texts = slots.filter((slot) => slot.kind === "texte" && !/^stat-\d$/.test(slot.name))
      const firstText = texts[0]?.name
      // Invalide : tous les candidats de ces scénarios ; mixte : les listes à icônes seulement (les autres réussissent).
      const invalid = scenario === "generated-invalid-unmatched" || scenario === "generated-invalid-approximate" || (scenario === "generated-mixed" && candidate.structure.includes("icon-items"))
      return {
        ref: candidate.ref,
        blueprint,
        texts: texts.map((slot) => ({ slot: slot.name, value: invalid && slot.name === firstText ? refusedText : "Avancer à votre rythme" })) as GeneratedReferenceOutput["items"][number]["texts"],
        buttons: slots.filter((slot) => slot.kind === "cta" || slot.kind === "cta:fleche").map(() => ({ slot: "cta" as const, label: "Découvrir" })),
        icons: slots.filter((slot) => slot.kind === "asset:icone").map((slot, index) => ({ slot: slot.name, icon: (["rocket-launch", "users", "award", "laptop"] as const)[index % 4]! })) as GeneratedReferenceOutput["items"][number]["icons"],
        images: slots.filter((slot) => slot.kind === "asset:visuel").map(() => ({ slot: "image" as const, intent: "warm-reassurance" as const })),
      }
    }),
  }
}

/** Un client de la forme de `EmailClaudeClient`, sans réseau ; il lit la requête dans le message et répond selon le scénario. */
export function createMockGeneratedClient(scenario: ReferenceMockScenario): EmailClaudeClient {
  return {
    messages: {
      create: async (params) => {
        if (scenario === "generated-engine-error") throw new Error("Erreur simulée du fournisseur.")
        const last = params.messages.at(-1)
        const blocks = Array.isArray(last?.content) ? last.content : []
        const block = blocks.find((entry) => entry.type === "text")
        const { request } = JSON.parse(block && "text" in block ? block.text : "{}") as { request?: GeneratedReferenceRequest }
        return {
          id: "msg_mock_generated",
          type: "message",
          role: "assistant",
          model: "mock-generated-reference",
          content: [{ type: "text", text: JSON.stringify(mockGeneratedAnswer(request ?? { candidates: [], documentRoles: [] }, scenario)), citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          stop_details: null,
          usage: { input_tokens: 0, output_tokens: 0, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
        } as unknown as Awaited<ReturnType<EmailClaudeClient["messages"]["create"]>>
      },
    },
  }
}
