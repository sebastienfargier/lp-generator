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
type Block = { id: string; name: string; fields: Field[]; readOnly?: unknown[] }
type Email = { blocks: Block[] }
type CatalogEntry = { type: string; name: string; family: string; fields: string[] }
type MockContext = { catalog?: CatalogEntry[]; selection?: { blockId: string } | null }

const advice = (message: string): AssistantResponse => ({ message, summary: "", changes: [], add: [], move: [], remove: [] })

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
const stem = (word: string) => word.replace(/(s|x)$/, "")

/** Les lames que la demande nomme (un mot de 4 lettres au moins du nom de la lame) ; sinon, la lame sélectionnée. */
function namedBlocks(email: Email, text: string, selection: MockContext["selection"]): Block[] {
  const words = plain(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 4).map(stem)
  const named = email.blocks.filter((block) => plain(block.name).split(/[^a-z0-9]+/).filter((word) => word.length >= 4).some((word) => words.includes(stem(word))))
  if (named.length > 0) return named
  const selected = selection ? email.blocks.find((block) => block.id === selection.blockId) : undefined
  return selected ? [selected] : []
}

const slotName = (field: string) => field.split(" (")[0]!
const sampleText = (field: string) => (field.includes("(titre)") ? "Et maintenant ?" : field.includes("(bouton)") ? "Découvrir le catalogue" : "Prenez le temps de comparer les formations qui vous intéressent.")

/** Une lame ajoutable d'après quelques mots de la demande. */
function pickType(catalog: CatalogEntry[], text: string): CatalogEntry | undefined {
  const wanted = /conclusion|bouton|cta|appel|fin\b/.test(text) ? (entry: CatalogEntry) => /^texte et bouton/i.test(entry.name) : /preuve|reassurance|temoign|avantage/.test(text) ? (entry: CatalogEntry) => entry.family === "Benefits" : /hero/.test(text) ? (entry: CatalogEntry) => entry.family === "Hero" : (entry: CatalogEntry) => entry.family === "Story"
  return catalog.find((entry) => wanted(entry) && entry.fields.length > 0) ?? catalog.find((entry) => entry.fields.length > 0)
}

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
export function mockAssistantAnswer(email: Email, request: string, context: MockContext = {}): AssistantResponse {
  const text = request.toLowerCase()
  const plainText = plain(request)
  const cta = email.blocks.flatMap((block) => block.fields).find((field) => field.kind === "bouton")
  const selection = context.selection ?? null
  const body = email.blocks.filter((block) => block.fields.length > 0)

  if (/surface|couleur|fond\b|dupliqu|statut|version|lien\b|exporte/.test(text)) {
    return advice("Je ne sais pas encore faire cela (surface, lien, statut, version, export). Je peux en revanche ajouter, retirer ou déplacer une lame, ou retravailler les textes et les boutons.")
  }
  // Un avis sur la structure : une réponse, jamais une mutation.
  if (/structure|sequence|enchain|ordre/.test(plainText) && !/supprim|enlev|retir|ajout|deplac|mets|simplifi/.test(plainText)) {
    return advice(`La séquence tient : ${body.map((block) => block.name).join(", ")}. Je ne changerais rien à la structure.`)
  }
  if (/simplifi|trop long|allege/.test(plainText) && body.length >= 2) {
    // Plan mixte : retirer une lame, remonter la dernière, resserrer le bouton.
    const removed = body[1]!
    const moved = body.length >= 3 ? body.at(-1)! : undefined
    const changes = cta ? propose(email, "cta") : []
    return {
      message: `Je propose de simplifier : retirer « ${removed.name} »${moved ? `, remonter « ${moved.name} » en tête` : ""}${changes.length ? " et resserrer le bouton" : ""}.`,
      summary: "Email simplifié",
      changes: changes.filter((change) => !removed.fields.some((field) => field.target === change.target)),
      add: [],
      move: moved ? [{ blockId: moved.id, placement: { where: "first", anchor: "" } }] : [],
      remove: [{ blockId: removed.id }],
    }
  }
  if (/supprim|enlev|retir/.test(plainText)) {
    const targets = namedBlocks(email, text.replace(/supprim\w*|enlev\w*|retir\w*|lame|section|bloc/g, " "), selection)
    if (targets.length !== 1) return advice(targets.length === 0 ? "Quelle lame veux-tu supprimer ? Sélectionne-la dans l'email ou donne-moi son nom." : `Plusieurs lames correspondent (${targets.map((block) => `« ${block.name} »`).join(", ")}). Laquelle veux-tu supprimer ?`)
    return { message: `Je propose de supprimer « ${targets[0]!.name} ».`, summary: `Supprimer « ${targets[0]!.name} »`, changes: [], add: [], move: [], remove: [{ blockId: targets[0]!.id }] }
  }
  if (/deplac|mets|remonte|descend/.test(plainText)) {
    const [before, after] = plainText.split(/\bavant\b|\bapres\b/)
    const direction = /\bapres\b/.test(plainText) ? "after" : "before"
    const moving = namedBlocks(email, before ?? "", selection)
    const anchor = after === undefined ? [] : namedBlocks(email, after, null)
    if (/debut|premiere/.test(plainText) && moving.length === 1) return { message: `Je propose de placer « ${moving[0]!.name} » en tête.`, summary: "Déplacer une lame", changes: [], add: [], move: [{ blockId: moving[0]!.id, placement: { where: "first", anchor: "" } }], remove: [] }
    if (/\bfin\b|derniere/.test(plainText) && moving.length === 1) return { message: `Je propose de placer « ${moving[0]!.name} » à la fin.`, summary: "Déplacer une lame", changes: [], add: [], move: [{ blockId: moving[0]!.id, placement: { where: "last", anchor: "" } }], remove: [] }
    if (moving.length !== 1 || anchor.length !== 1 || moving[0]!.id === anchor[0]!.id) return advice("Quelle lame veux-tu déplacer, et par rapport à quelle autre ? Sélectionne la lame ou nomme-la, par exemple « mets Offre avant Preuves ».")
    return { message: `Je propose de placer « ${moving[0]!.name} » ${direction === "before" ? "avant" : "après"} « ${anchor[0]!.name} ».`, summary: "Déplacer une lame", changes: [], add: [], move: [{ blockId: moving[0]!.id, placement: { where: direction, anchor: anchor[0]!.id } }], remove: [] }
  }
  if (/ajout/.test(plainText)) {
    const entry = pickType(context.catalog ?? [], plainText)
    if (!entry) return advice("Je ne trouve pas de lame adaptée dans la bibliothèque.")
    const last = body.at(-1)
    return {
      message: `Je propose d'ajouter « ${entry.name} » à la fin du corps de l'email, avec un texte adapté.`,
      summary: `Ajouter « ${entry.name} »`,
      changes: [],
      add: [{ ref: "new-1", blockType: entry.type, placement: last ? { where: "last", anchor: "" } : { where: "first", anchor: "" }, content: entry.fields.filter((field) => !/temoignage/.test(field)).slice(0, 3).map((field) => ({ slot: slotName(field), value: sampleText(field) })) }],
      move: [],
      remove: [],
    }
  }
  if (/(pens|avis|relis|analys|répét|repet|cohérent|coherent)/.test(text)) {
    const first = email.blocks.find((block) => block.fields.length > 0)
    return {
      add: [],
      move: [],
      remove: [],
      message: `L'ensemble est cohérent : l'offre est posée tout de suite${cta ? ` et le bouton « ${cta.current} » se comprend sans effort` : ""}. Je ne changerais rien de majeur${first ? `. Un détail : le début (${first.name}) pourrait être un peu plus court si tu veux aller droit au but` : ""}.`,
      summary: "",
      changes: [],
    }
  }
  const direct = /(direct|dynamique|raccourci|court|simplif|allège|allege|quand même|quand meme)/.test(text)
  if (direct || /\b(cta|bouton|libellé|libelle)\b/.test(text)) {
    const onlyCta = /\b(cta|bouton|libellé|libelle)\b/.test(text) && /(seulement|uniquement|garde)/.test(text) ? true : !direct
    const changes = propose(email, onlyCta ? "cta" : "all")
    if (changes.length === 0) return advice("Je ne vois rien de plus à resserrer : les textes sont déjà courts et directs.")
    return {
      add: [],
      move: [],
      remove: [],
      message: onlyCta ? "Je propose de rendre le bouton plus engageant, sans toucher au reste." : `Je propose d'aller plus droit au but : ${changes.length} contenu${changes.length > 1 ? "s" : ""} resserré${changes.length > 1 ? "s" : ""}, les valeurs de l'offre restent telles quelles.`,
      summary: onlyCta ? "Bouton plus engageant" : "Textes plus directs",
      changes,
    }
  }
  return advice("Dis-moi ce que tu veux améliorer : un texte, un bouton, une lame à ajouter, retirer ou déplacer, ou je peux relire l'email et te donner mon avis.")
}

/** Un client de la forme de `EmailClaudeClient`, sans réseau. */
export function createMockAssistantClient(): EmailClaudeClient {
  return {
    messages: {
      create: async (params) => {
        const last = params.messages.at(-1)
        const content = typeof last?.content === "string" ? last.content : ""
        const { email, request, catalog, selection } = JSON.parse(content) as { email: Email; request: string; catalog?: CatalogEntry[]; selection?: { blockId: string } | null }
        const answer = mockAssistantAnswer(email, request, { catalog: catalog ?? [], selection: selection ?? null })
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
