/**
 * Assistant SIMULÉ, pour le développement et la démonstration : un client qui a la
 * forme du client Anthropic (`messages.create`) mais ne fait AUCUN appel réseau. Il
 * lit l'email que le prompt contient et répond de façon déterministe, selon quelques
 * mots de la demande, avec des changements qui visent de VRAIS champs de l'email
 * (donc validés comme n'importe quelle réponse du modèle).
 *
 * Activé seulement par la page (`?assistant=mock`) et seulement hors production
 * (`assistant-handler.ts`). Jamais utilisé par défaut.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailClaudeClient } from "../email/anthropic"
import type { AssistantResponse } from "./assistant-schema"

type Field = { target: string; kind: string; current: string; mustKeep?: string[] }
type Email = { blocks: { id: string; name: string; fields: Field[] }[] }

const ctaRewrites: Record<string, string> = { "Voir les formations": "Découvrir les formations", "Parcourir le catalogue": "Explorer le catalogue", "Découvrir les formations": "Explorer les formations" }

/** Première phrase d'un paragraphe, avec ce qui doit être conservé tel quel. */
function shorten(field: Field): string | null {
  const first = field.current.split(/(?<=[.!?])\s+/)[0] ?? field.current
  const kept = (field.mustKeep ?? []).filter((fragment) => !first.includes(fragment))
  const text = [first, ...kept].join(" ").trim()
  return text !== field.current && text.length > 0 ? text : null
}

function propose(email: Email, only: "cta" | "all"): AssistantResponse["changes"] {
  const fields = email.blocks.flatMap((block) => block.fields)
  const changes: AssistantResponse["changes"] = []
  for (const field of fields.filter((entry) => entry.kind === "bouton")) {
    const value = ctaRewrites[field.current]
    if (value && value !== field.current) {
      changes.push({ target: field.target, value })
      break
    }
  }
  if (only === "all") {
    for (const field of fields.filter((entry) => entry.kind === "paragraphe")) {
      const value = shorten(field)
      if (value) changes.push({ target: field.target, value })
      if (changes.length >= 3) break
    }
  }
  return changes
}

/** La réponse simulée à une demande. */
export function mockAssistantAnswer(email: Email, request: string): AssistantResponse {
  const text = request.toLowerCase()
  const cta = email.blocks.flatMap((block) => block.fields).find((field) => field.kind === "bouton")
  if (/supprim|enlev|ajout|déplac|deplac|dupliqu|surface|couleur|\blame\b|section/.test(text)) {
    return { message: "J'ai compris la demande, mais je ne sais pas encore modifier la structure de l'email (ajouter, retirer ou déplacer une lame, changer une surface). Je peux en revanche retravailler les textes, les boutons ou une image.", summary: "", changes: [] }
  }
  if (/(pens|avis|relis|analys|répét|repet|cohérent|coherent)/.test(text)) {
    const first = email.blocks.find((block) => block.fields.length > 0)
    return {
      message: `L'ensemble est cohérent : l'offre est posée tout de suite${cta ? ` et le bouton « ${cta.current} » se comprend sans effort` : ""}. Je ne changerais rien de majeur${first ? `. Un détail : le début (${first.name}) pourrait être un peu plus court si tu veux aller droit au but` : ""}.`,
      summary: "",
      changes: [],
    }
  }
  const direct = /(direct|dynamique|raccourci|court|simplif|allège|allege|quand même|quand meme)/.test(text)
  if (direct || /\b(cta|bouton|libellé|libelle)\b/.test(text)) {
    const onlyCta = /\b(cta|bouton|libellé|libelle)\b/.test(text) && /(seulement|uniquement|garde)/.test(text) ? true : !direct
    const changes = propose(email, onlyCta ? "cta" : "all")
    if (changes.length === 0) return { message: "Je ne vois rien de plus à resserrer : les textes sont déjà courts et directs.", summary: "", changes: [] }
    return {
      message: onlyCta ? "Je propose de rendre le bouton plus engageant, sans toucher au reste." : `Je propose d'aller plus droit au but : ${changes.length} contenu${changes.length > 1 ? "s" : ""} resserré${changes.length > 1 ? "s" : ""}, les valeurs de l'offre restent telles quelles.`,
      summary: onlyCta ? "Bouton plus engageant" : "Textes plus directs",
      changes,
    }
  }
  return { message: "Dis-moi ce que tu veux améliorer : un texte, un bouton, ou je peux relire l'email et te donner mon avis.", summary: "", changes: [] }
}

/** Un client de la forme de `EmailClaudeClient`, sans réseau. */
export function createMockAssistantClient(): EmailClaudeClient {
  return {
    messages: {
      create: async (params) => {
        const last = params.messages.at(-1)
        const content = typeof last?.content === "string" ? last.content : ""
        const { email, request } = JSON.parse(content) as { email: Email; request: string }
        const answer = mockAssistantAnswer(email, request)
        return {
          id: "msg_mock",
          type: "message",
          role: "assistant",
          model: "mock-assistant",
          content: [{ type: "text", text: JSON.stringify(answer), citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          stop_details: null,
          usage: { input_tokens: 0, output_tokens: 0, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
        } as unknown as Awaited<ReturnType<EmailClaudeClient["messages"]["create"]>>
      },
    },
  }
}
