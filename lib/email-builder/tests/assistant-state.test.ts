/**
 * Conversation, propositions et application (V2.5), côté état du Builder : ce que
 * fait chaque geste de l'utilisateur sur une proposition de l'assistant. L'assistant
 * propose ; l'état applique, une proposition à la fois, en UNE entrée d'historique.
 * Aucun réseau : les réponses du modèle sont des données.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import { findChatProposal, toApiHistory } from "../assistant-chat"
import { documentFingerprint, isProposalStale, type AssistantProposal } from "../assistant-proposal"
import { builderCanRedo, builderCanUndo, builderDocument, builderReducer, createBuilderState, shownDocument, type BuilderAction, type BuilderState } from "../builder-state"
import { buildDemoDocument } from "../demo-document"
import { hasChangesSinceVersion } from "../builder-state"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state)
const start = () => createBuilderState(buildDemoDocument())
const slots = (state: BuilderState, id: string) => (builderDocument(state).config.blocks.find((block) => block.id === id) as unknown as { slots: Json }).slots
const cta = (state: BuilderState) => slots(state, "offer")["cta-1"].label as string

/** Une proposition « réelle » : préparée sur le document courant, comme le serveur le fait. */
const proposalFor = (state: BuilderState, changes: AssistantProposal["changes"], summary = "Plus direct"): AssistantProposal => ({ summary, changes, basedOn: documentFingerprint(builderDocument(state)) })
const direct: AssistantProposal["changes"] = [
  { target: "offer:cta-1:label", value: "Découvrir les formations" },
  { target: "offer:texte-descriptif", value: "Tu vises l'alternance ? Offre valable sur les formations en alternance." },
  { target: "closing:titre-section", value: "À toi de jouer" },
]
/** Un message utilisateur, puis la réponse de l'assistant. */
const talk = (state: BuilderState, question: string, reply: { message: string; proposal?: AssistantProposal }): BuilderState => run(state, { type: "assistant-send", text: question }, { type: "assistant-reply", ...reply })
const withProposal = (changes = direct) => {
  const state = start()
  return talk(state, "Rends-le plus direct", { message: "Je propose ceci.", proposal: proposalFor(state, changes) })
}
const proposalId = (state: BuilderState) => [...state.assistant.messages].reverse().find((message) => message.role === "assistant" && message.proposal)!.id
/** Édition à la main d'un bouton (libellé, lien conservé) : comme dans le canvas. */
const edit = (blockId: string, slot: string, label: string): BuilderAction[] => [
  { type: "start-edit", blockId, slot },
  { type: "commit-edit", blockId, slot, draft: { label, href: "https://www.studi.com/fr/cfa-studi?[UTM À DÉFINIR — CRM]" } },
]

describe("conseil : aucune modification", () => {
  test("un conseil ajoute des messages et RIEN d'autre : document, historique, versions, statut, sélection intacts ; aucune proposition", () => {
    const before = start()
    const state = talk(before, "Qu'est-ce que tu en penses ?", { message: "L'ensemble est cohérent." })
    assert.equal(state.history, before.history)
    assert.equal(state.status, before.status)
    assert.deepEqual(state.versions, [])
    assert.equal(state.assistant.messages.length, 2)
    assert.equal(findChatProposal(state.assistant, state.assistant.messages[1]!.id), undefined)
    assert.equal(state.assistant.pending, false)
  })

  test("un envoi à la fois ; un message vide n'est pas envoyé ; un échec s'affiche sans toucher au document", () => {
    const sent = run(start(), { type: "assistant-send", text: "Avis ?" })
    assert.equal(sent.assistant.pending, true)
    assert.equal(run(sent, { type: "assistant-send", text: "Autre" }), sent, "pas de second envoi concurrent")
    assert.equal(run(start(), { type: "assistant-send", text: "   " }).assistant.messages.length, 0)
    const failed = run(sent, { type: "assistant-fail", message: "Je n'ai pas pu préparer cette proposition. Réessaie." })
    assert.equal(failed.assistant.pending, false)
    assert.equal(failed.history, sent.history)
    const last = failed.assistant.messages.at(-1)
    assert.equal(last?.role === "assistant" && last.failed === true, true)
  })
})

describe("transformation : proposer ne change rien, appliquer change tout en une fois", () => {
  test("une proposition reçue laisse le document INCHANGÉ ; elle est ouverte", () => {
    const state = withProposal()
    assert.equal(cta(state), "Voir les formations")
    assert.equal(builderCanUndo(state), false)
    assert.equal(findChatProposal(state.assistant, proposalId(state))?.status, "open")
  })

  test("appliquer : les 3 changements d'un coup, UNE entrée d'historique, proposition marquée appliquée, statut et sélection inchangés", () => {
    const before = withProposal()
    const state = run(before, { type: "apply-proposal", id: proposalId(before) })
    assert.equal(cta(state), "Découvrir les formations")
    assert.equal(slots(state, "closing")["titre-section"].text, "À toi de jouer")
    assert.equal(slots(state, "offer")["texte-descriptif"].text, "Tu vises l'alternance ? Offre valable sur les formations en alternance.")
    assert.equal(state.history.past.length, 1)
    assert.equal(findChatProposal(state.assistant, proposalId(state))?.status, "applied")
    assert.equal(state.status, before.status)
    assert.deepEqual(state.selection, before.selection)
  })

  test("annuler restaure TOUT en un seul geste ; rétablir remet TOUT", () => {
    const before = withProposal()
    const original = JSON.stringify(builderDocument(before))
    const applied = run(before, { type: "apply-proposal", id: proposalId(before) })
    const undone = run(applied, { type: "undo" })
    assert.equal(JSON.stringify(builderDocument(undone)), original)
    assert.equal(builderCanUndo(undone), false)
    const redone = run(undone, { type: "redo" })
    assert.deepEqual(builderDocument(redone), builderDocument(applied))
    assert.equal(builderCanRedo(redone), false)
  })

  test("une proposition ne s'applique qu'UNE fois ; après annuler, elle ne se réapplique pas non plus", () => {
    const before = withProposal()
    const applied = run(before, { type: "apply-proposal", id: proposalId(before) })
    assert.equal(run(applied, { type: "apply-proposal", id: proposalId(before) }), applied)
    const undone = run(applied, { type: "undo" })
    assert.equal(run(undone, { type: "apply-proposal", id: proposalId(before) }), undone)
  })

  test("les valeurs de référence restent après application : offre, code, date, périmètre, liens", () => {
    const before = withProposal()
    const state = run(before, { type: "apply-proposal", id: proposalId(before) })
    assert.equal(slots(state, "offer")["valeur-cle"].text, slots(before, "offer")["valeur-cle"].text)
    assert.equal(slots(state, "offer")["code-promo-1"].text, "DEMO20")
    assert.equal(slots(state, "header").label.text, slots(before, "header").label.text)
    assert.equal(slots(state, "offer")["cta-1"].href, slots(before, "offer")["cta-1"].href)
    assert.deepEqual(builderDocument(state).facts, builderDocument(before).facts)
    assert.equal(builderDocument(state).config.blocks.length, builderDocument(before).config.blocks.length)
  })

  test("le statut n'est jamais piloté par l'assistant : appliquer le conserve, dans les trois cas", () => {
    for (const status of ["draft", "review", "ready"] as const) {
      const base = run(start(), { type: "set-status", status })
      const state = talk(base, "Plus direct", { message: "ok", proposal: proposalFor(base, direct) })
      assert.equal(run(state, { type: "apply-proposal", id: proposalId(state) }).status, status)
    }
  })

  test("ignorer : la proposition est ignorée, le document ne bouge pas, on ne peut plus l'appliquer ; ne pas agir suffit aussi", () => {
    const before = withProposal()
    const ignored = run(before, { type: "ignore-proposal", id: proposalId(before) })
    assert.equal(findChatProposal(ignored.assistant, proposalId(before))?.status, "ignored")
    assert.equal(ignored.history, before.history)
    assert.equal(run(ignored, { type: "apply-proposal", id: proposalId(before) }), ignored)
  })
})

describe("proposition périmée", () => {
  test("le CTA modifié à la main après la proposition : l'ancienne proposition est périmée, REFUSÉE, et ne remplace rien", () => {
    const before = withProposal()
    const manual = run(before, ...edit("offer", "cta-1", "Je me lance"))
    assert.equal(cta(manual), "Je me lance")
    const proposal = findChatProposal(manual.assistant, proposalId(before))!
    assert.equal(isProposalStale(proposal, builderDocument(manual)), true)
    const attempt = run(manual, { type: "apply-proposal", id: proposalId(before) })
    assert.equal(attempt.history, manual.history, "le document n'a pas bougé")
    assert.equal(cta(attempt), "Je me lance", "le travail manuel n'est pas écrasé")
    assert.equal(attempt.notice?.tone, "warning")
    assert.equal(attempt.notice?.message, "L'email a changé depuis cette proposition. Demande-moi de l'actualiser.")
    assert.equal(findChatProposal(attempt.assistant, proposalId(before))?.status, "open", "elle reste visible, périmée")
  })

  test("retour EXACT au document d'origine (annuler la modification manuelle) : la proposition redevient applicable", () => {
    const before = withProposal()
    const back = run(before, ...edit("offer", "cta-1", "Autre"), { type: "undo" })
    assert.equal(isProposalStale(findChatProposal(back.assistant, proposalId(before))!, builderDocument(back)), false)
    assert.equal(cta(run(back, { type: "apply-proposal", id: proposalId(before) })), "Découvrir les formations")
  })

  test("appliquer une première proposition périme les autres : une seule transformation à la fois", () => {
    let state = withProposal()
    const first = proposalId(state)
    state = talk(state, "Améliore le CTA", { message: "ok", proposal: proposalFor(state, [{ target: "offer:cta-1:label", value: "Explorer" }], "Bouton") })
    const second = proposalId(state)
    assert.notEqual(first, second)
    const applied = run(state, { type: "apply-proposal", id: first })
    assert.equal(isProposalStale(findChatProposal(applied.assistant, second)!, builderDocument(applied)), true)
    const attempt = run(applied, { type: "apply-proposal", id: second })
    assert.equal(attempt.history, applied.history)
  })

  test("la péremption se calcule sur le CONTENU : statut, sélection, versions et historique n'y changent rien", () => {
    const before = withProposal()
    const noisy = run(before, { type: "set-status", status: "review" }, { type: "select-block", blockId: "offer" }, { type: "save-version", name: "V", at: "2026-10-07T09:00:00.000Z" })
    assert.equal(isProposalStale(findChatProposal(noisy.assistant, proposalId(before))!, builderDocument(noisy)), false)
  })

  test("un champ qui a disparu entre-temps : refus propre, document intact (même empreinte)", () => {
    const state = start()
    const bad = talk(state, "x", { message: "ok", proposal: proposalFor(state, [{ target: "closing:cta-1:label", value: "Autre" }, { target: "fantome:titre", value: "Autre" }]) })
    const attempt = run(bad, { type: "apply-proposal", id: proposalId(bad) })
    assert.equal(attempt.history, bad.history)
    assert.equal(attempt.notice?.tone, "error")
    assert.equal(findChatProposal(attempt.assistant, proposalId(bad))?.status, "open")
  })

  test("une proposition qui retirerait une valeur de référence est refusée à l'application aussi (revalidée contre le document courant)", () => {
    const state = start()
    const bad = talk(state, "x", { message: "ok", proposal: proposalFor(state, [{ target: "offer:texte-descriptif", value: "Tu vises l'alternance ? Lance-toi." }]) })
    const attempt = run(bad, { type: "apply-proposal", id: proposalId(bad) })
    assert.equal(attempt.history, bad.history)
    assert.match(String(attempt.notice?.message), /ne peut plus être appliquée/)
  })
})

describe("conversation", () => {
  test("le tour précédent est disponible au suivant : messages, et rappel d'une proposition (résumé, champs, valeurs, état)", () => {
    const state = withProposal()
    const history = toApiHistory(state.assistant)
    assert.deepEqual(history.map((turn) => turn.role), ["user", "assistant"])
    assert.match(history[1]!.text, /Je propose ceci\.\n\[Proposition en attente : Plus direct — offer:cta-1:label → « Découvrir les formations »/)
    const applied = run(state, { type: "apply-proposal", id: proposalId(state) })
    assert.match(toApiHistory(applied.assistant)[1]!.text, /Proposition appliquée/)
  })

  test("adapter une proposition crée un NOUVEAU message : l'ancienne reste telle quelle, l'historique reste lisible", () => {
    const first = withProposal()
    const firstId = proposalId(first)
    const frozen = JSON.stringify(findChatProposal(first.assistant, firstId))
    const second = talk(first, "Garde le titre, change seulement le CTA", { message: "D'accord.", proposal: proposalFor(first, [{ target: "offer:cta-1:label", value: "Découvrir" }], "Seulement le bouton") })
    assert.equal(second.assistant.messages.length, 4)
    assert.equal(JSON.stringify(findChatProposal(second.assistant, firstId)), frozen)
    assert.equal(findChatProposal(second.assistant, proposalId(second))?.summary, "Seulement le bouton")
  })

  test("les échecs ne sont pas rejoués au modèle ; l'historique est borné", () => {
    let state = start()
    state = run(state, { type: "assistant-send", text: "A" }, { type: "assistant-fail", message: "Je n'ai pas pu préparer cette proposition. Réessaie." })
    assert.deepEqual(toApiHistory(state.assistant).map((turn) => turn.text), ["A"])
    for (let index = 0; index < 20; index += 1) state = talk(state, `Q${index}`, { message: `R${index}` })
    assert.ok(toApiHistory(state.assistant).length <= 24)
  })

  test("la conversation vit hors du document : jamais dans EmailDocument, jamais dans une version", () => {
    const state = run(withProposal(), { type: "save-version", name: "V", at: "2026-10-07T09:00:00.000Z" })
    assert.ok(!JSON.stringify(builderDocument(state)).includes("Je propose ceci"))
    assert.ok(!JSON.stringify(state.versions).includes("Je propose ceci"))
  })
})

describe("versions V2.4 : l'assistant n'agit que sur le travail actuel", () => {
  const consulting = () => {
    const base = withProposal()
    return { base, viewing: run(base, { type: "save-version", name: "Avant", at: "2026-10-07T09:00:00.000Z" }, { type: "view-version", id: "v1" }) }
  }

  test("pendant la consultation : appliquer, ignorer-puis-appliquer, envoyer sont ignorés ; la version et le travail sont intacts", () => {
    const { base, viewing } = consulting()
    const id = proposalId(base)
    assert.equal(run(viewing, { type: "apply-proposal", id }), viewing)
    assert.equal(run(viewing, { type: "assistant-send", text: "Avis ?" }), viewing)
    assert.equal(cta(viewing), "Voir les formations", "le travail courant n'a pas bougé")
    assert.equal(findChatProposal(viewing.assistant, id)?.status, "open")
  })

  test("une réponse qui arrive pendant la consultation s'affiche (rien n'est appliqué) ; on peut ensuite revenir et appliquer", () => {
    const state = run(start(), { type: "save-version", name: "V", at: "2026-10-07T09:00:00.000Z" }, { type: "assistant-send", text: "Plus direct" })
    const viewing = run(state, { type: "view-version", id: "v1" })
    const arrived = run(viewing, { type: "assistant-reply", message: "Je propose ceci.", proposal: proposalFor(state, direct) })
    assert.equal(arrived.assistant.messages.length, 2)
    assert.equal(arrived.history, viewing.history)
    const back = run(arrived, { type: "exit-view" }, { type: "apply-proposal", id: proposalId(arrived) })
    assert.equal(cta(back), "Découvrir les formations")
  })

  test("appliquer une proposition ne modifie JAMAIS une version enregistrée ; la version garde son contenu ; le travail la dépasse", () => {
    const base = withProposal()
    const saved = run(base, { type: "save-version", name: "Avant", at: "2026-10-07T09:00:00.000Z" })
    const frozen = JSON.stringify(saved.versions)
    const applied = run(saved, { type: "apply-proposal", id: proposalId(base) })
    assert.equal(JSON.stringify(applied.versions), frozen)
    assert.equal(hasChangesSinceVersion(applied), true)
    assert.equal(shownDocument(run(applied, { type: "view-version", id: "v1" })).config.blocks.length, 6)
    assert.equal(slots({ ...applied, history: { ...applied.history, present: shownDocument(run(applied, { type: "view-version", id: "v1" })) } }, "offer")["cta-1"].label, "Voir les formations")
  })

  test("repartir d'une version garde la conversation (elle n'appartient à aucune version) ; ses propositions, périmées par le nouveau document, ne s'appliquent pas", () => {
    const base = withProposal()
    const applied = run(base, { type: "apply-proposal", id: proposalId(base) }, { type: "save-version", name: "Appliquée", at: "2026-10-07T09:00:00.000Z" }, ...edit("offer", "cta-1", "Autre"))
    const restarted = run(applied, { type: "view-version", id: "v1" }, { type: "restart-from", id: "v1" })
    assert.equal(restarted.assistant.messages.length, applied.assistant.messages.length)
    assert.equal(restarted.status, "draft")
  })
})

describe("garde-fous de source : l'assistant ne peut ni toucher au statut, ni à la structure, ni produire de HTML", () => {
  const root = process.cwd()
  const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
  const assistantFiles = ["assistant-proposal", "assistant-schema", "assistant-engine", "assistant-context", "assistant-chat", "assistant-handler", "assistant-mock"]

  test("aucun module de l'assistant ne produit une opération de structure, de surface, de statut ou de version", () => {
    for (const name of assistantFiles) {
      const source = code(`lib/email-builder/${name}.ts`)
      assert.ok(!/add-block|remove-block|move-block|set-surface|set-status|save-version|restart-from/.test(source), name)
    }
  })

  test("les seules opérations que l'assistant traduit sont set-slot et set-image", () => {
    const source = code("lib/email-builder/assistant-proposal.ts")
    const used = [...source.matchAll(/type: "([a-z-]+)"/g)].map((match) => match[1])
    assert.deepEqual([...new Set(used)].sort(), ["set-image", "set-slot"])
  })

  test("le prompt dit ce que l'assistant ne fait pas et ne simule jamais", () => {
    const prompt = readFileSync(join(root, "lib/email-builder/assistant-context.ts"), "utf8")
    for (const phrase of ["Tu ne modifies pas la structure", "Ne simule jamais l'action", "n'invente pas de problème", "fais-le quand même", "jamais le changer", "mot pour mot"]) assert.ok(prompt.includes(phrase), phrase)
  })
})
