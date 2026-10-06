/**
 * État du Builder (V2.2), hors React : ce que fait chaque geste de l'interface,
 * puisque l'interface n'est qu'un dispatch d'actions sur `builderReducer`. Le
 * document de démonstration est un vrai email du POC ; toute modification passe
 * par les opérations de V2.1 ; aucun réseau, aucun modèle.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { builderLames } from "../catalog"
import { buildDemoDocument } from "../demo-document"
import { validateDocumentIntegrity } from "../integrity"
import { builderCanRedo, builderCanUndo, builderDocument, builderReducer, createBuilderState, selectedBlockId, type BuilderAction, type BuilderState } from "../builder-state"
import type { DocumentOperation } from "../operations"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const starter = (type: string) => builderLames().find((lame) => lame.type === type)!.starter!
const add = (type: string, index?: number): DocumentOperation => ({ type: "add-block", blockType: type, slots: starter(type), ...(index === undefined ? {} : { index }) }) as DocumentOperation
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state)
const operate = (state: BuilderState, operation: DocumentOperation) => builderReducer(state, { type: "operation", operation })
const ids = (state: BuilderState) => builderDocument(state).config.blocks.map((block) => block.id)
const block = (state: BuilderState, id: string) => builderDocument(state).config.blocks.find((candidate) => candidate.id === id) as unknown as { surface?: string; slots: Record<string, unknown> }
const start = () => createBuilderState(buildDemoDocument())

describe("Builder — document initial", () => {
  test("il charge un vrai email du POC (promotion R4-B), exploitable, sans sélection ni retour ; rien à annuler", () => {
    const state = start()
    assert.deepEqual(ids(state), ["header", "offer", "support", "closing", "mentions-legales", "footer"])
    assert.equal(builderDocument(state).config.name, "Offre alternance, démonstration B")
    assert.deepEqual(validateDocumentIntegrity(builderDocument(state)), [])
    assert.equal(selectedBlockId(state), null)
    assert.equal(state.panel, null)
    assert.equal(state.notice, null)
    assert.equal(builderCanUndo(state), false)
    assert.equal(builderCanRedo(state), false)
  })

  test("l'état ne contient que l'historique de documents et un peu d'interface : jamais de HTML, jamais un second modèle de l'email", () => {
    const state = run(start(), { type: "select-block", blockId: "offer" }, { type: "open-library", index: 2 })
    assert.deepEqual(Object.keys(state).sort(), ["history", "notice", "noticeKey", "panel", "selection"])
    assert.ok(!/<html|<table|<!--/i.test(JSON.stringify(state)))
    assert.deepEqual(Object.keys(state.history).sort(), ["future", "past", "present"])
  })

  test("le document de démonstration est déterministe", () => {
    assert.deepEqual(buildDemoDocument(), buildDemoDocument())
  })
})

describe("Builder — sélection", () => {
  test("sélectionner une lame, la changer, désélectionner ; une lame inconnue ne se sélectionne pas", () => {
    let state = run(start(), { type: "select-block", blockId: "offer" })
    assert.equal(selectedBlockId(state), "offer")
    state = run(state, { type: "select-block", blockId: "closing" })
    assert.equal(selectedBlockId(state), "closing")
    assert.equal(selectedBlockId(run(state, { type: "select-block", blockId: "fantome" })), null)
    assert.equal(selectedBlockId(run(state, { type: "select-block", blockId: null })), null)
  })

  test("sélectionner ne modifie jamais le document ni l'historique", () => {
    const state = start()
    const selected = run(state, { type: "select-block", blockId: "offer" })
    assert.equal(builderDocument(selected), builderDocument(state))
    assert.equal(builderCanUndo(selected), false)
  })
})

describe("Builder — ajouter une lame (add-block)", () => {
  test("depuis une position précise : la lame s'insère à cet index, elle est sélectionnée, la bibliothèque se ferme", () => {
    const opened = run(start(), { type: "open-library", index: 3 })
    assert.deepEqual(opened.panel, { kind: "library", index: 3 })
    const state = operate(opened, add("email-module-text-only", 3))
    assert.deepEqual(ids(state), ["header", "offer", "support", "email-module-text-only", "closing", "mentions-legales", "footer"])
    assert.equal(selectedBlockId(state), "email-module-text-only")
    assert.equal(state.panel, null)
    assert.equal(builderCanUndo(state), true)
    assert.deepEqual(builderDocument(state).blockMeta["email-module-text-only"], { origin: "builder" })
  })

  test("au début, au milieu et à la fin : l'index demandé est celui de la lame ajoutée", () => {
    for (const index of [0, 2, 6]) {
      const state = operate(start(), add("email-module-text-only", index))
      assert.equal(ids(state)[index], "email-module-text-only", `index ${index}`)
      assert.equal(ids(state).length, 7)
    }
  })

  test("sans position (bouton « Ajouter une lame ») : avant les mentions légales et le footer", () => {
    const state = operate(run(start(), { type: "open-library" }), add("email-module-text-only"))
    assert.deepEqual(ids(state).slice(-3), ["email-module-text-only", "mentions-legales", "footer"])
  })

  test("le contenu ajouté est le contenu provisoire de la bibliothèque (texte de démonstration explicite)", () => {
    const state = operate(start(), add("email-module-text-only", 3))
    const slots = block(state, "email-module-text-only").slots as Record<string, { text: string }>
    assert.match(slots["titre-section"]!.text, /exemple/i)
    assert.match(slots["texte-descriptif"]!.text, /démonstration/i)
  })

  test("deux fois la même lame : identifiants distincts", () => {
    const state = operate(operate(start(), add("email-module-text-only", 3)), add("email-module-text-only", 3))
    assert.deepEqual(ids(state).filter((id) => id.startsWith("email-module-text-only")), ["email-module-text-only-2", "email-module-text-only"])
  })

  test("toutes les lames ajoutables du catalogue s'ajoutent réellement (le catalogue ne promet que ce que le Builder sait faire)", () => {
    const addable = builderLames().filter((lame) => lame.starter)
    assert.ok(addable.length >= 30)
    for (const lame of addable) {
      const state = operate(start(), add(lame.type, 2))
      assert.equal(ids(state)[2], lame.type, lame.type)
      assert.equal(state.notice?.tone === "error", false, lame.type)
      assert.deepEqual(validateDocumentIntegrity(builderDocument(state)), [], lame.type)
    }
  })
})

describe("Builder — supprimer une lame (remove-block)", () => {
  test("la lame disparaît, la sélection aussi ; annuler la rend, exactement", () => {
    const before = start()
    const selected = run(before, { type: "select-block", blockId: "support" })
    const removed = operate(selected, { type: "remove-block", blockId: "support" })
    assert.deepEqual(ids(removed), ["header", "offer", "closing", "mentions-legales", "footer"])
    assert.equal(selectedBlockId(removed), null)
    const restored = run(removed, { type: "undo" })
    assert.deepEqual(builderDocument(restored), builderDocument(before))
    assert.equal(builderCanRedo(restored), true)
  })

  test("supprimer une autre lame que la sélection garde la sélection", () => {
    const state = operate(run(start(), { type: "select-block", blockId: "offer" }), { type: "remove-block", blockId: "support" })
    assert.equal(selectedBlockId(state), "offer")
  })
})

describe("Builder — déplacer une lame (move-block)", () => {
  test("monter, descendre : l'ordre change, la sélection suit la lame", () => {
    let state = run(start(), { type: "select-block", blockId: "closing" })
    state = operate(state, { type: "move-block", blockId: "closing", toIndex: 2 })
    assert.deepEqual(ids(state), ["header", "offer", "closing", "support", "mentions-legales", "footer"])
    assert.equal(selectedBlockId(state), "closing")
    state = operate(state, { type: "move-block", blockId: "closing", toIndex: 3 })
    assert.deepEqual(ids(state), ["header", "offer", "support", "closing", "mentions-legales", "footer"])
  })

  test("un ordre inhabituel n'est pas refusé ; seul un conseil peut apparaître", () => {
    const state = operate(start(), { type: "move-block", blockId: "footer", toIndex: 0 })
    assert.equal(ids(state)[0], "footer")
    assert.equal(state.notice?.tone, "warning")
    assert.match(state.notice!.message, /footer/)
  })
})

describe("Builder — surface (set-surface)", () => {
  test("une lame configurable change de surface, immédiatement dans le document", () => {
    const state = operate(start(), { type: "set-surface", blockId: "support", surface: "accent-1" })
    assert.equal(block(state, "support").surface, "accent-1")
    assert.equal(state.notice, null)
  })

  test("deux zones colorées consécutives : l'opération est ACCEPTÉE, avec un conseil discret qui ne bloque rien", () => {
    let state = operate(start(), { type: "set-surface", blockId: "support", surface: "accent-1" })
    state = operate(state, { type: "set-surface", blockId: "closing", surface: "marque" })
    assert.equal(block(state, "closing").surface, "marque")
    assert.equal(block(state, "support").surface, "accent-1")
    assert.deepEqual(state.notice, { tone: "info", message: "Deux zones colorées se suivent. Studi recommande généralement d'alterner les surfaces." })
    // On peut continuer : rien n'est bloqué, le conseil s'ignore.
    state = operate(run(state, { type: "dismiss-notice" }), { type: "set-surface", blockId: "closing", surface: "bloc" })
    assert.equal(block(state, "closing").surface, "bloc")
    assert.equal(state.notice, null)
  })

  test("une lame à couleurs fixes : refus technique lisible, document et historique intacts", () => {
    const before = start()
    const state = operate(before, { type: "set-surface", blockId: "offer", surface: "marque" })
    assert.equal(state.notice?.tone, "error")
    assert.equal(state.notice?.message, "Cette lame garde ses couleurs : sa surface ne se change pas.")
    assert.equal(state.history, before.history)
  })
})

describe("Builder — recommandations et refus", () => {
  test("retirer le footer ou les mentions légales est accepté, avec une alerte compréhensible (jamais un refus)", () => {
    const noFooter = operate(start(), { type: "remove-block", blockId: "footer" })
    assert.equal(ids(noFooter).includes("footer"), false)
    assert.equal(noFooter.notice?.tone, "warning")
    assert.match(noFooter.notice!.message, /plus de footer.*désabonnement/)
    const noLegal = operate(start(), { type: "remove-block", blockId: "mentions-legales" })
    assert.equal(ids(noLegal).includes("mentions-legales"), false)
    assert.match(noLegal.notice!.message, /mention légale/)
  })

  test("seules les recommandations NOUVELLES parlent : ajouter une lame dans une promotion n'ouvre pas un tableau de conformité", () => {
    const state = operate(start(), add("email-module-text-only", 3))
    assert.equal(state.notice, null)
  })

  test("une impossibilité technique : une phrase, le document ne bouge pas (même historique)", () => {
    const before = start()
    for (const operation of [{ type: "remove-block", blockId: "fantome" }, { type: "move-block", blockId: "offer", toIndex: 99 }, { type: "add-block", blockType: "email-module-text-only", slots: {} }] as DocumentOperation[]) {
      const state = operate(before, operation)
      assert.equal(state.notice?.tone, "error", JSON.stringify(operation))
      assert.ok(state.notice!.message.length > 10)
      assert.equal(state.history, before.history)
    }
  })

  test("le dernier bloc ne peut pas être supprimé : message clair", () => {
    let state = start()
    for (const id of ["header", "offer", "support", "closing", "mentions-legales"]) state = operate(state, { type: "remove-block", blockId: id })
    assert.deepEqual(ids(state), ["footer"])
    state = operate(state, { type: "remove-block", blockId: "footer" })
    assert.equal(state.notice?.message, "Un email garde toujours au moins une lame.")
    assert.deepEqual(ids(state), ["footer"])
  })

  test("le retour se ferme à la demande ; ouvrir et fermer la bibliothèque ne touchent pas au document", () => {
    let state = operate(start(), { type: "remove-block", blockId: "footer" })
    assert.ok(state.notice)
    state = run(state, { type: "dismiss-notice" })
    assert.equal(state.notice, null)
    const document = builderDocument(state)
    state = run(state, { type: "open-library", index: 1 }, { type: "close-panel" })
    assert.equal(builderDocument(state), document)
  })
})

describe("Builder — annuler / rétablir", () => {
  test("ajout → déplacement → suppression → annuler → annuler → rétablir : exactement les documents attendus", () => {
    const s0 = start()
    const s1 = operate(s0, add("email-module-text-only", 3))
    const s2 = operate(s1, { type: "move-block", blockId: "email-module-text-only", toIndex: 1 })
    const s3 = operate(s2, { type: "remove-block", blockId: "support" })
    assert.deepEqual(ids(s3), ["header", "email-module-text-only", "offer", "closing", "mentions-legales", "footer"])
    const u1 = run(s3, { type: "undo" })
    assert.deepEqual(builderDocument(u1), builderDocument(s2))
    const u2 = run(u1, { type: "undo" })
    assert.deepEqual(builderDocument(u2), builderDocument(s1))
    const r1 = run(u2, { type: "redo" })
    assert.deepEqual(builderDocument(r1), builderDocument(s2))
    assert.equal(builderCanUndo(r1), true)
    assert.equal(builderCanRedo(r1), true)
    assert.deepEqual(builderDocument(run(r1, { type: "undo" }, { type: "undo" }, { type: "undo" })), builderDocument(s0))
  })

  test("annuler / rétablir hors de portée : sans effet ; les boutons le reflètent", () => {
    const state = start()
    assert.equal(run(state, { type: "undo" }), state)
    assert.equal(run(state, { type: "redo" }), state)
    const changed = operate(state, { type: "remove-block", blockId: "support" })
    assert.equal(builderCanUndo(changed), true)
    assert.equal(builderCanRedo(changed), false)
    const undone = run(changed, { type: "undo" })
    assert.equal(builderCanUndo(undone), false)
    assert.equal(builderCanRedo(undone), true)
  })

  test("une nouvelle opération après annuler abandonne la branche rétablissable", () => {
    let state = operate(operate(start(), { type: "remove-block", blockId: "support" }), { type: "remove-block", blockId: "closing" })
    state = run(state, { type: "undo" })
    assert.equal(builderCanRedo(state), true)
    state = operate(state, { type: "set-surface", blockId: "closing", surface: "bloc" })
    assert.equal(builderCanRedo(state), false)
  })

  test("la sélection suit l'historique : annuler l'ajout d'une lame sélectionnée la désélectionne", () => {
    const state = run(operate(start(), add("email-module-text-only", 3)), { type: "undo" })
    assert.equal(selectedBlockId(state), null)
    assert.equal(ids(state).includes("email-module-text-only"), false)
  })

  test("annuler après une suppression rend la lame avec son contenu", () => {
    const before = start()
    const state = run(operate(before, { type: "remove-block", blockId: "offer" }), { type: "undo" })
    assert.deepEqual(builderDocument(state), builderDocument(before))
  })
})
