/**
 * La conversation avec l'assistant, côté navigateur : en mémoire, sans
 * persistance (un rechargement la remet à zéro), sans mémoire globale. Pur.
 *
 * Une proposition appartient au message de l'assistant qui l'a faite ; son statut
 * est `open`, `applied` ou `ignored`. Elle est aussi PÉRIMÉE dès que le document
 * n'est plus celui sur lequel elle a été préparée (`isProposalStale`) : cette
 * péremption se calcule, elle ne se stocke pas. Une nouvelle proposition (adaptation
 * d'une précédente) est un NOUVEAU message : l'historique reste intelligible.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import type { AssistantProposal } from "./assistant-proposal"

export type ChatProposalStatus = "open" | "applied" | "ignored"
export type ChatProposal = AssistantProposal & { status: ChatProposalStatus }

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; proposal?: ChatProposal; failed?: boolean }

export type AssistantChat = {
  messages: ChatMessage[]
  /** Un appel est en cours : pas de second envoi concurrent. */
  pending: boolean
  nextId: number
}

export const emptyChat: AssistantChat = { messages: [], pending: false, nextId: 1 }

export const chatSend = (chat: AssistantChat, text: string): AssistantChat => ({ messages: [...chat.messages, { id: `m${chat.nextId}`, role: "user", text: text.trim() }], pending: true, nextId: chat.nextId + 1 })

export const chatReply = (chat: AssistantChat, reply: { message: string; proposal?: AssistantProposal }): AssistantChat => ({
  messages: [...chat.messages, { id: `m${chat.nextId}`, role: "assistant", text: reply.message, ...(reply.proposal ? { proposal: { ...reply.proposal, status: "open" as const } } : {}) }],
  pending: false,
  nextId: chat.nextId + 1,
})

export const chatFail = (chat: AssistantChat, message: string): AssistantChat => ({ messages: [...chat.messages, { id: `m${chat.nextId}`, role: "assistant", text: message, failed: true }], pending: false, nextId: chat.nextId + 1 })

export const findChatProposal = (chat: AssistantChat, id: string) => {
  const message = chat.messages.find((candidate) => candidate.id === id)
  return message?.role === "assistant" ? message.proposal : undefined
}

export const setProposalStatus = (chat: AssistantChat, id: string, status: ChatProposalStatus): AssistantChat => ({
  ...chat,
  messages: chat.messages.map((message) => (message.id === id && message.role === "assistant" && message.proposal ? { ...message, proposal: { ...message.proposal, status } } : message)),
})

const statusWords: Record<ChatProposalStatus, string> = { open: "en attente", applied: "appliquée", ignored: "ignorée" }
const clip = (value: string, length = 140) => (value.length > length ? `${value.slice(0, length - 1)}…` : value)
const maxHistoryMessages = 24

/**
 * La conversation telle que l'API la reçoit : texte seulement, les échecs écartés ;
 * une proposition est rappelée en une ligne (résumé, champs, nouvelles valeurs, état)
 * pour que « garde le titre, change seulement le bouton » se comprenne.
 */
export function toApiHistory(chat: AssistantChat): { role: "user" | "assistant"; text: string }[] {
  return chat.messages
    .filter((message) => !(message.role === "assistant" && message.failed))
    .slice(-maxHistoryMessages)
    .map((message) => {
      if (message.role === "user" || !message.proposal) return { role: message.role, text: message.text }
      const { proposal } = message
      const placeText = (place: { where: string; anchor: string }) => (place.anchor ? `${place.where} ${place.anchor}` : place.where)
      const lines = [
        ...(proposal.structure?.add ?? []).map((action) => `ajout ${action.blockType} (${action.ref}, ${placeText(action.placement)})`),
        ...(proposal.structure?.move ?? []).map((action) => `déplacement ${action.blockId} (${placeText(action.placement)})`),
        ...(proposal.structure?.remove ?? []).map((action) => `suppression ${action.blockId}`),
        ...proposal.changes.map((change) => `${change.target} → « ${clip(change.value)} »`),
      ].join(" ; ")
      return { role: "assistant" as const, text: `${message.text}\n[Proposition ${statusWords[proposal.status]} : ${proposal.summary} — ${lines}]` }
    })
}
