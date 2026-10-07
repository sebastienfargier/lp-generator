/**
 * V2.7 : le moteur de composition et l'assistant structurel. Hors réseau, hors
 * React : le moteur est pur, l'assistant est testé avec un faux client Anthropic et
 * le mock de développement. Aucun appel de modèle.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type { CreateParams, EmailClaudeClient } from "../../email/anthropic"
import { handleAssistant } from "../assistant-handler"
import { assistantSystemPrompt, buildAssistantMessages } from "../assistant-context"
import { runAssistant } from "../assistant-engine"
import { assistantFields, documentFingerprint, type AssistantProposal } from "../assistant-proposal"
import { AssistantRequestSchema, safeParseAssistantResponse } from "../assistant-schema"
import { builderCanRedo, builderCanUndo, builderDocument, builderIsEmpty, builderReducer, createBuilderState, type BuilderAction, type BuilderState } from "../builder-state"
import { builderLames } from "../catalog"
import { applyCompositionPlan, compositionCatalog, describeCatalog, describeStructure, editableSlots, hasStructure, planOf, validateCompositionPlan, type CompositionPlan, type Placement } from "../composition"
import { buildDemoDocument } from "../demo-document"
import type { EmailDocument } from "../document"
import { validateDocumentIntegrity } from "../integrity"
import { builderTemplates } from "../templates"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const lames = builderLames()
const catalog = compositionCatalog(lames)
const doc = () => buildDemoDocument()
const ids = (document: EmailDocument) => document.config.blocks.map((block) => block.id)
const blockSlots = (document: EmailDocument, id: string) => (document.config.blocks.find((block) => block.id === id) as unknown as { slots: Json }).slots

const textAndCta = "email-module-text-and-cta-variant-01"
const benefitsType = Object.keys(catalog).find((type) => catalog[type]!.family === "Benefits" && editableSlots(type).length > 0)!
const top: Placement = { where: "first", anchor: "" }
const last: Placement = { where: "last", anchor: "" }
const ahead = (anchor: string): Placement => ({ where: "before", anchor })
const behind = (anchor: string): Placement => ({ where: "after", anchor })

const plan = (partial: Partial<CompositionPlan> = {}): CompositionPlan => ({ content: [], add: [], move: [], remove: [], ...partial })
const addText = (ref: string, placement: Placement = last, content: { slot: string; value: string }[] = []) => ({ ref, blockType: textAndCta, placement, content })
const ok = (document: EmailDocument, partial: Partial<CompositionPlan>) => {
  const checked = validateCompositionPlan(document, plan(partial), catalog)
  assert.equal(checked.ok, true, JSON.stringify(checked))
  return checked as Extract<typeof checked, { ok: true }>
}
const refused = (document: EmailDocument, partial: Partial<CompositionPlan>, pattern?: RegExp) => {
  const before = JSON.stringify(document)
  const checked = validateCompositionPlan(document, plan(partial), catalog)
  assert.equal(checked.ok, false, JSON.stringify(partial))
  if (!checked.ok && pattern) assert.match(checked.message, pattern)
  assert.equal(JSON.stringify(document), before, "le document d'entrée n'est jamais touché")
  return checked
}

/** État Builder + conversation avec une proposition ouverte portant ce plan. */
const proposed = (state: BuilderState, partial: Partial<CompositionPlan>, summary = "Test") => {
  const full = plan(partial)
  const proposal: AssistantProposal = { summary, changes: full.content, ...(hasStructure(full) ? { structure: { add: full.add, move: full.move, remove: full.remove } } : {}), basedOn: documentFingerprint(builderDocument(state)) }
  return builderReducer(state, { type: "assistant-reply", message: "Voici.", proposal })
}
const lastId = (state: BuilderState) => state.assistant.messages.at(-1)!.id
const applyLast = (state: BuilderState) => builderReducer(state, { type: "apply-proposal", id: lastId(state), catalog })
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state)

const message = (value: unknown) =>
  ({
    id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(value), citations: null }],
    stop_reason: "end_turn", stop_sequence: null, stop_details: null,
    usage: { input_tokens: 900, output_tokens: 200, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null },
  }) as unknown as Awaited<ReturnType<EmailClaudeClient["messages"]["create"]>>
const fake = (response: unknown) => {
  const calls: CreateParams[] = []
  const client: EmailClaudeClient = { messages: { create: async (params) => (calls.push(params), message(response)) } }
  return { calls, client }
}
const answer = (partial: Partial<{ message: string; summary: string; changes: Json[]; add: Json[]; move: Json[]; remove: Json[] }>) => ({ message: "Voilà.", summary: "", changes: [], add: [], move: [], remove: [], ...partial })
const ask = (document: EmailDocument, text: string, client: EmailClaudeClient, selection: { blockId: string; slot?: string } | null = null) => runAssistant({ document, history: [], message: text, selection, catalog }, { client, env: {} })

const schemaContext = (document = doc()) => ({ targets: assistantFields(document).map((field) => field.target), blockIds: ids(document), blockTypes: Object.keys(catalog) })

/* -------------------------------------------------------------------------- */

describe("V2.7 — contrat Structured Output", () => {
  const parse = (input: unknown) => safeParseAssistantResponse(schemaContext(), input).success
  const good = (partial: Json) => ({ message: "Ok", summary: "Résumé", changes: [], add: [], move: [], remove: [], ...partial })

  test("content, add, remove, move et plan mixte sont valides ; un conseil (tout vide) aussi", () => {
    assert.ok(parse(good({ message: "Rien à changer", summary: "" })))
    assert.ok(parse(good({ changes: [{ target: "offer:cta-1:label", value: "Découvrir" }] })))
    assert.ok(parse(good({ add: [{ ref: "new-1", blockType: textAndCta, placement: last, content: [{ slot: "titre-section", value: "Et ensuite ?" }] }] })))
    assert.ok(parse(good({ remove: [{ blockId: "support" }] })))
    assert.ok(parse(good({ move: [{ blockId: "closing", placement: ahead("offer") }] })))
    assert.ok(parse(good({ changes: [{ target: "offer:cta-1:label", value: "Découvrir" }], add: [{ ref: "new-1", blockType: textAndCta, placement: behind("offer"), content: [] }], move: [{ blockId: "closing", placement: top }], remove: [{ blockId: "support" }] })))
  })

  test("une action inconnue, un type de lame inventé, une lame inexistante, une place inconnue, du HTML ou une clé d'opération sont refusés", () => {
    assert.ok(!parse(good({ operations: [{ type: "remove-block", blockId: "support" }] })))
    assert.ok(!parse(good({ duplicate: [{ blockId: "support" }] })))
    assert.ok(!parse(good({ add: [{ ref: "new-1", blockType: "email-module-inventee", placement: last, content: [] }] })), "type inventé")
    assert.ok(!parse(good({ remove: [{ blockId: "fantome" }] })), "lame inexistante")
    assert.ok(!parse(good({ move: [{ blockId: "closing", placement: { where: "middle", anchor: "" } }] })), "place inconnue")
    assert.ok(!parse(good({ add: [{ ref: "<b>x</b>", blockType: textAndCta, placement: last, content: [] }] })), "ref avec balise")
    assert.ok(!parse(good({ add: [{ ref: "new-1", blockType: textAndCta, placement: last, content: [{ slot: "titre-section", value: "<script>x</script>" }] }] })), "HTML")
    assert.ok(!parse(good({ add: [{ ref: "new-1", blockType: textAndCta, placement: last, content: [], surface: "brand" }] })), "surface")
    assert.ok(!parse(good({ add: [{ ref: "new-1", blockType: textAndCta, placement: last, content: [{ slot: "cta-1", value: "https://example.com" }] }] })), "URL")
  })

  test("le schéma n'a ni plus de pouvoir sur les liens, le statut, les surfaces, les versions ou l'export", () => {
    const text = JSON.stringify(safeParseAssistantResponse(schemaContext(), good({})).success)
    assert.equal(text, "true")
    for (const key of ["status", "surface", "href", "version", "export"]) assert.ok(!parse(good({ [key]: "x" })), key)
  })

  test("la requête accepte une sélection (lame, champ) ou null, et refuse un champ inconnu", () => {
    const base = { document: {}, history: [], message: "Salut" }
    for (const selection of [undefined, null, { blockId: "offer" }, { blockId: "offer", slot: "cta-1" }]) assert.ok(AssistantRequestSchema.safeParse({ ...base, ...(selection === undefined ? {} : { selection }) }).success)
    assert.ok(!AssistantRequestSchema.safeParse({ ...base, selection: { blockId: "offer", html: "x" } }).success)
  })
})

describe("V2.7 — catalogue des lames exposé au modèle", () => {
  const described = describeCatalog(catalog)

  test("seules les lames ajoutables, compactes : type, nom, famille, rôle, champs éditoriaux, image ; aucun HTML", () => {
    assert.equal(described.length, lames.filter((lame) => lame.starter).length)
    assert.equal(described.length, 31)
    for (const entry of described) assert.deepEqual(Object.keys(entry), ["type", "name", "family", "role", "fields", "image"])
    const unavailable = lames.find((lame) => !lame.starter)
    if (unavailable) assert.ok(!described.some((entry) => entry.type === unavailable.type))
    const text = JSON.stringify(described)
    assert.ok(!/<[a-z]+[ >]|style=|https?:|href|\.jpg|\.png/i.test(text))
    assert.ok(text.length < 14_000, `${text.length}`)
    const textCta = described.find((entry) => entry.type === textAndCta)!
    assert.deepEqual(textCta.fields, ["titre-section (titre)", "texte-descriptif (paragraphe)", "cta-1 (bouton)"])
    assert.equal(textCta.image, false)
  })

  test("les champs d'une lame ajoutée excluent les valeurs contrôlées, les liens et les images", () => {
    for (const entry of described) {
      for (const field of entry.fields) assert.ok(!/valeur-cle|code-promo|^lien-|disclaimer|image/.test(field), `${entry.type} ${field}`)
    }
    assert.ok(described.some((entry) => entry.image))
  })

  test("le contexte de l'appel porte le catalogue et la sélection (ou null) ; une sélection inconnue est ignorée", () => {
    const parse = (selection: { blockId: string; slot?: string } | null) => JSON.parse(buildAssistantMessages(doc(), [], "Supprime cette lame", { catalog, selection }).at(-1)!.content as string) as Json
    const none = parse(null)
    assert.equal(none.selection, null)
    assert.equal(none.catalog.length, 31)
    const selected = parse({ blockId: "support" })
    assert.deepEqual(selected.selection, { blockId: "support", blockName: "Liste à icônes" })
    assert.equal(parse({ blockId: "offer", slot: "cta-1" }).selection.slot, "cta-1")
    assert.equal(parse({ blockId: "fantome" }).selection, null)
    assert.deepEqual(Object.keys(selected).sort(), ["catalog", "context", "email", "request", "selection"])
  })

  test("le prompt dit que la sélection est un indice, que l'ambiguïté appelle une question, et que rien d'inventé n'existe", () => {
    for (const phrase of ["jamais une autorisation", "question courte", "Ne supprime ni ne déplace jamais une lame au hasard", "un type absent du catalogue n'existe pas", "Tu ne crées pas de nouveau type de lame", "Ne propose jamais une modification juste pour en proposer une"]) assert.ok(assistantSystemPrompt.includes(phrase), phrase)
  })
})

describe("V2.7 — ajouter une lame", () => {
  test("une lame officielle s'ajoute avec son contenu initial valide (liens, image et surface par défaut), marquée « builder » ; le document reste valide", () => {
    const checked = ok(doc(), { add: [addText("new-1", ahead("mentions-legales"))] })
    assert.deepEqual(ids(checked.next), ["header", "offer", "support", "closing", textAndCta, "mentions-legales", "footer"])
    assert.deepEqual(validateDocumentIntegrity(checked.next), [])
    assert.equal(checked.next.blockMeta[textAndCta]?.origin, "builder")
    assert.deepEqual(blockSlots(checked.next, textAndCta), catalog[textAndCta]!.starter)
    assert.deepEqual(checked.operations.map((operation) => operation.type), ["add-block"])
  })

  test("les champs de la nouvelle lame se renseignent dans la MÊME proposition ; un bouton garde son lien par défaut", () => {
    const checked = ok(doc(), { add: [addText("new-1", last, [{ slot: "titre-section", value: "Et maintenant ?" }, { slot: "texte-descriptif", value: "Comparez les formations à votre rythme." }, { slot: "cta-1", value: "Découvrir le catalogue" }])] })
    const slots = blockSlots(checked.next, textAndCta)
    assert.equal(slots["titre-section"].text, "Et maintenant ?")
    assert.equal(slots["cta-1"].label, "Découvrir le catalogue")
    assert.equal(slots["cta-1"].href, (catalog[textAndCta]!.starter["cta-1"] as { href: string }).href, "le lien est celui de la bibliothèque, jamais choisi par l'IA")
    assert.deepEqual(checked.operations.map((operation) => operation.type), ["add-block", "set-slot", "set-slot", "set-slot"])
  })

  test("les places : début, fin du corps (avant mentions légales et footer), avant et après une lame, et après une lame ajoutée plus tôt (ref)", () => {
    assert.equal(ids(ok(doc(), { add: [addText("a", top)] }).next)[0], textAndCta)
    assert.deepEqual(ids(ok(doc(), { add: [addText("a", last)] }).next).slice(-3), [textAndCta, "mentions-legales", "footer"])
    assert.deepEqual(ids(ok(doc(), { add: [addText("a", ahead("support"))] }).next).slice(1, 4), ["offer", textAndCta, "support"])
    assert.deepEqual(ids(ok(doc(), { add: [addText("a", behind("offer"))] }).next).slice(1, 3), ["offer", textAndCta])
    const chained = ok(doc(), { add: [addText("a", behind("offer")), { ...addText("b", behind("a")), blockType: benefitsType }] })
    assert.deepEqual(ids(chained.next).slice(1, 4), ["offer", textAndCta, benefitsType])
  })

  test("un type inexistant, une lame non ajoutable, un type de manifest hors catalogue sont refusés", () => {
    refused(doc(), { add: [{ ...addText("a"), blockType: "email-module-inventee" }] }, /inconnue ou non ajoutable/)
    const unavailable = lames.find((lame) => !lame.starter)
    if (unavailable) refused(doc(), { add: [{ ...addText("a"), blockType: unavailable.type }] }, /non ajoutable/)
    const restricted = compositionCatalog(lames.filter((lame) => lame.type !== textAndCta))
    const checked = validateCompositionPlan(doc(), plan({ add: [addText("a")] }), restricted)
    assert.equal(checked.ok, false)
  })

  test("références : format, doublon, collision avec une lame, ancre inconnue, ancre déclarée plus loin (dépendance)", () => {
    refused(doc(), { add: [addText("Nouvelle Lame")] }, /Référence/)
    refused(doc(), { add: [addText("a"), addText("a")] }, /deux fois/)
    refused(doc(), { add: [addText("offer")] }, /déjà un identifiant/)
    refused(doc(), { add: [addText("a", behind("fantome"))] }, /n'existe pas/)
    refused(doc(), { add: [addText("a", behind("b")), addText("b")] }, /pas encore/)
    refused(doc(), { add: [addText("a", { where: "before", anchor: "" })] }, /désigne une lame/)
    refused(doc(), { add: [addText("a", { where: "first", anchor: "offer" })] }, /ne désigne aucune lame/)
  })

  test("champs d'une lame ajoutée : inconnus, liens, valeurs contrôlées, image, doublon, vide ou trop nombreux sont refusés", () => {
    refused(doc(), { add: [addText("a", last, [{ slot: "inconnu", value: "x" }])] }, /n'existe pas/)
    refused(doc(), { add: [addText("a", last, [{ slot: "titre-section", value: "a" }, { slot: "titre-section", value: "b" }])] }, /deux fois/)
    refused(doc(), { add: [addText("a", last, [{ slot: "titre-section", value: "  " }])] }, /vide/)
    const hero = Object.keys(catalog).find((type) => catalog[type]!.family === "Hero" && describeCatalog(catalog).find((entry) => entry.type === type)!.image)!
    refused(doc(), { add: [{ ...addText("a"), blockType: hero, content: [{ slot: "image-1", value: "photo" }] }] }, /n'existe pas/)
    const withControlled = Object.keys(catalog).find((type) => Object.keys((catalog[type]!.starter as Json)).includes("valeur-cle"))
    if (withControlled) refused(doc(), { add: [{ ...addText("a"), blockType: withControlled, content: [{ slot: "valeur-cle", value: "-90 %" }] }] }, /n'existe pas/)
    const withLink = Object.keys(catalog).find((type) => Object.keys((catalog[type]!.starter as Json)).some((slot) => slot.startsWith("lien-")))
    if (withLink) refused(doc(), { add: [{ ...addText("a"), blockType: withLink, content: [{ slot: "lien-1", value: "Cliquez" }] }] }, /n'existe pas/)
  })

  test("le nombre de champs renseignés d'une lame ajoutée est borné", () => {
    const many = Array.from({ length: 17 }, (_, index) => ({ slot: `champ-${index}`, value: "x" }))
    refused(doc(), { add: [addText("a", last, many)] }, /au plus/)
  })

  test("une lame avec image s'ajoute avec l'image de la banque par défaut : aucune URL inventée", () => {
    const hero = Object.keys(catalog).find((type) => describeCatalog(catalog).find((entry) => entry.type === type)!.image)!
    const checked = ok(doc(), { add: [{ ...addText("a", top), blockType: hero }] })
    assert.deepEqual(validateDocumentIntegrity(checked.next), [], "l'image est celle de la banque contrôlée")
    assert.deepEqual(blockSlots(checked.next, hero), catalog[hero]!.starter)
  })
})

describe("V2.7 — supprimer une lame", () => {
  test("une suppression produit un document sans la lame ni ses métadonnées ; une lame déjà disparue est refusée", () => {
    const checked = ok(doc(), { remove: [{ blockId: "support" }] })
    assert.deepEqual(ids(checked.next), ["header", "offer", "closing", "mentions-legales", "footer"])
    assert.equal(checked.next.blockMeta.support, undefined)
    refused(doc(), { remove: [{ blockId: "fantome" }] }, /n'existe plus/)
    refused(doc(), { remove: [{ blockId: "support" }, { blockId: "support" }] }, /deux fois/)
  })

  test("supprimer la dernière lame est autorisé : zéro lame, Brouillon, assistant désactivé, Undo restaure, Redo réapplique", () => {
    const only = run(createBuilderState(doc()), ...["header", "support", "closing", "mentions-legales", "footer"].map((blockId) => ({ type: "operation", operation: { type: "remove-block", blockId } }) as BuilderAction))
    assert.deepEqual(ids(builderDocument(only)), ["offer"])
    const ready = run(only, { type: "set-status", status: "review" })
    const pending = proposed(ready, { remove: [{ blockId: "offer" }] })
    const emptied = applyLast(pending)
    assert.ok(builderIsEmpty(emptied))
    assert.equal(emptied.status, "draft", "un email vidé redevient Brouillon")
    assert.equal(run(emptied, { type: "assistant-send", text: "Salut" }).assistant.pending, false, "l'assistant reste désactivé à zéro lame")
    assert.deepEqual(validateDocumentIntegrity(builderDocument(emptied)), [])
    const restored = run(emptied, { type: "undo" })
    assert.deepEqual(ids(builderDocument(restored)), ["offer"])
    const again = run(restored, { type: "redo" })
    assert.ok(builderIsEmpty(again))
  })

  test("retirer des informations importantes n'est pas refusé : la proposition est valide, le Builder conseille (mentions légales, footer)", () => {
    const legal = ok(doc(), { remove: [{ blockId: "mentions-legales" }] })
    assert.match(legal.notice ?? "", /mention légale/)
    const footer = ok(doc(), { remove: [{ blockId: "footer" }] })
    assert.match(footer.notice ?? "", /footer/)
    assert.ok(ids(footer.next).every((id) => id !== "footer"))
  })
})

describe("V2.7 — déplacer une lame", () => {
  test("avant, après, début, fin du corps ; les autres lames gardent leur ordre relatif", () => {
    assert.deepEqual(ids(ok(doc(), { move: [{ blockId: "closing", placement: ahead("offer") }] }).next), ["header", "closing", "offer", "support", "mentions-legales", "footer"])
    assert.deepEqual(ids(ok(doc(), { move: [{ blockId: "offer", placement: behind("closing") }] }).next), ["header", "support", "closing", "offer", "mentions-legales", "footer"])
    assert.deepEqual(ids(ok(doc(), { move: [{ blockId: "closing", placement: top }] }).next)[0], "closing")
    assert.deepEqual(ids(ok(doc(), { move: [{ blockId: "offer", placement: last }] }).next).slice(-3), ["offer", "mentions-legales", "footer"])
  })

  test("source ou cible inexistante, lame supprimée, auto-référence et double déplacement sont refusés", () => {
    refused(doc(), { move: [{ blockId: "fantome", placement: top }] }, /n'existe plus/)
    refused(doc(), { move: [{ blockId: "closing", placement: ahead("fantome") }] }, /n'existe pas/)
    refused(doc(), { move: [{ blockId: "closing", placement: ahead("closing") }] }, /elle-même/)
    refused(doc(), { move: [{ blockId: "closing", placement: top }], remove: [{ blockId: "closing" }] }, /supprimée/)
    refused(doc(), { move: [{ blockId: "closing", placement: top }, { blockId: "closing", placement: last }] }, /deux fois/)
    refused(doc(), { move: [{ blockId: "closing", placement: ahead("support") }], remove: [{ blockId: "support" }] }, /supprimée/)
  })

  test("un déplacement qui ne change rien est refusé seul, et toléré dans un plan qui change autre chose", () => {
    refused(doc(), { move: [{ blockId: "offer", placement: behind("header") }] }, /ne change rien/)
    const mixed = ok(doc(), { move: [{ blockId: "offer", placement: behind("header") }], remove: [{ blockId: "support" }] })
    assert.deepEqual(ids(mixed.next), ["header", "offer", "closing", "mentions-legales", "footer"])
  })
})

describe("V2.7 — propositions mixtes, application atomique, historique", () => {
  const mixed = (): Partial<CompositionPlan> => ({
    remove: [{ blockId: "support" }],
    move: [{ blockId: "closing", placement: ahead("offer") }],
    content: [{ target: "closing:cta-1:label", value: "Explorer le catalogue" }],
  })

  test("ajout + contenu ; suppression + déplacement + contenu : tout est appliqué dans l'ordre fixé par le système", () => {
    const checked = ok(doc(), mixed())
    assert.deepEqual(ids(checked.next), ["header", "closing", "offer", "mentions-legales", "footer"])
    assert.equal(blockSlots(checked.next, "closing")["cta-1"].label, "Explorer le catalogue")
    assert.deepEqual(checked.operations.map((operation) => operation.type), ["move-block", "remove-block", "set-slot"])
    const withAdd = ok(doc(), { add: [addText("new-1", last, [{ slot: "titre-section", value: "Et ensuite ?" }])], content: [{ target: "offer:cta-1:label", value: "Découvrir" }] })
    assert.equal(blockSlots(withAdd.next, textAndCta)["titre-section"].text, "Et ensuite ?")
    assert.equal(blockSlots(withAdd.next, "offer")["cta-1"].label, "Découvrir")
  })

  test("une erreur dans UNE action : aucun changement, aucune entrée d'historique", () => {
    let state = createBuilderState(doc())
    const bad = { ...mixed(), content: [{ target: "closing:cta-1:label", value: "Explorer" }, { target: "offer:valeur-cle", value: "-90 %" }] }
    state = proposed(state, bad)
    const before = JSON.stringify(builderDocument(state))
    const result = applyLast(state)
    assert.equal(JSON.stringify(builderDocument(result)), before)
    assert.equal(result.history.past.length, 0)
    assert.equal(result.notice?.tone, "error")
    const badMove = proposed(createBuilderState(doc()), { remove: [{ blockId: "support" }], move: [{ blockId: "closing", placement: ahead("fantome") }] })
    assert.equal(applyLast(badMove).history.past.length, 0)
    assert.equal(validateCompositionPlan(doc(), plan({ ...mixed(), add: [{ ...addText("a"), blockType: "inventee" }] }), catalog).ok, false)
  })

  test("une proposition appliquée = UNE entrée d'historique ; Undo restaure tout le document, Redo réapplique tout", () => {
    const state = applyLast(proposed(createBuilderState(doc()), { ...mixed(), add: [addText("new-1", last, [{ slot: "titre-section", value: "Et ensuite ?" }])] }))
    assert.equal(state.history.past.length, 1)
    assert.equal(state.assistant.messages.at(-1)?.role === "assistant" && state.assistant.messages.at(-1)!.role === "assistant" ? (state.assistant.messages.at(-1) as { proposal?: { status: string } }).proposal?.status : "", "applied")
    const applied = JSON.stringify(builderDocument(state))
    const undone = run(state, { type: "undo" })
    assert.equal(JSON.stringify(builderDocument(undone)), JSON.stringify(doc()))
    assert.equal(builderCanUndo(undone), false)
    assert.equal(builderCanRedo(undone), true)
    assert.equal(JSON.stringify(builderDocument(run(undone, { type: "redo" }))), applied)
  })

  test("applyCompositionPlan est le moteur lui-même : un plan écrit à la main (autre source) passe par le même contrôle", () => {
    const handmade: CompositionPlan = { content: [], add: [{ ref: "ref-1", blockType: textAndCta, placement: behind("offer"), content: [] }], move: [], remove: [{ blockId: "support" }] }
    const checked = applyCompositionPlan(doc(), handmade, catalog)
    assert.equal(checked.ok, true)
    assert.deepEqual(planOf({ changes: [], structure: { add: handmade.add, move: [], remove: handmade.remove } }), handmade)
  })
})

describe("V2.7 — protections", () => {
  test("un contenu en lecture seule reste non modifiable, même dans un plan mixte ; un lien, le statut et les versions aussi", () => {
    for (const target of ["offer:valeur-cle", "offer:code-promo-1", "offer:lien-1", "header:label", "mentions-legales:disclaimer-1", "offer:cta-1:href", "status"]) {
      refused(doc(), { remove: [{ blockId: "support" }], content: [{ target, value: "Autre" }] })
    }
    // le lien d'un bouton existant ne change jamais : seul le libellé, le href est conservé
    const checked = ok(doc(), { content: [{ target: "offer:cta-1:label", value: "Découvrir" }], remove: [{ blockId: "support" }] })
    assert.equal(blockSlots(checked.next, "offer")["cta-1"].href, blockSlots(doc(), "offer")["cta-1"].href)
    const state = applyLast(proposed(run(createBuilderState(doc()), { type: "set-status", status: "review" }), { remove: [{ blockId: "support" }] }))
    assert.equal(state.status, "review", "le statut n'est jamais touché")
    assert.equal(state.versions.length, 0)
  })

  test("mustKeep reste vérifié : une réécriture qui retire le périmètre de l'offre est refusée, même avec une structure valide", () => {
    refused(doc(), { remove: [{ blockId: "support" }], content: [{ target: "offer:texte-descriptif", value: "Tu vises l'alternance ? Lance-toi." }] }, /valeur de référence/)
    ok(doc(), { remove: [{ blockId: "support" }], content: [{ target: "offer:texte-descriptif", value: "Tu vises l'alternance ? Lance-toi. Offre valable sur les formations en alternance." }] })
  })

  test("le contenu d'une lame supprimée dans le même plan est refusé", () => {
    refused(doc(), { remove: [{ blockId: "closing" }], content: [{ target: "closing:cta-1:label", value: "Explorer" }] }, /lame supprimée/)
  })

  test("une version consultée est en lecture seule : une proposition ne s'y applique pas, et les versions enregistrées ne changent jamais", () => {
    let state = run(createBuilderState(doc()), { type: "save-version", name: "Départ", at: "2026-10-07T10:00:00.000Z" })
    state = proposed(state, { remove: [{ blockId: "support" }] })
    const viewing = run(state, { type: "view-version", id: "v1" })
    const attempted = applyLast(viewing)
    assert.equal(attempted, viewing)
    const applied = applyLast(state)
    assert.equal(JSON.stringify(applied.versions[0]!.document), JSON.stringify(doc()), "la version enregistrée reste intacte")
  })
})

describe("V2.7 — péremption", () => {
  test("une modification manuelle rend la proposition périmée : rien n'est écrasé ; le retour exact par Undo la rend à nouveau applicable", () => {
    const state = proposed(createBuilderState(doc()), { remove: [{ blockId: "support" }], move: [{ blockId: "closing", placement: top }] })
    const edited = run(state, { type: "operation", operation: { type: "set-slot", blockId: "offer", slot: "sous-titre", value: { text: "Autre texte" } } })
    const refusedApply = applyLast(edited)
    assert.equal(refusedApply.notice?.tone, "warning")
    assert.match(refusedApply.notice?.message ?? "", /a changé/)
    assert.deepEqual(ids(builderDocument(refusedApply)), ids(doc()))
    assert.equal(blockSlots(builderDocument(refusedApply), "offer")["sous-titre"].text, "Autre texte", "le travail récent est conservé")
    const back = run(edited, { type: "undo" })
    const applied = applyLast(back)
    assert.deepEqual(ids(builderDocument(applied)), ["closing", "header", "offer", "mentions-legales", "footer"])
  })

  test("une suppression visée qui a disparu entre-temps est refusée par le domaine, jamais appliquée à moitié", () => {
    const state = proposed(createBuilderState(doc()), { remove: [{ blockId: "support" }] })
    const manual = run(state, { type: "operation", operation: { type: "remove-block", blockId: "support" } })
    const result = applyLast(manual)
    assert.deepEqual(ids(builderDocument(result)), ["header", "offer", "closing", "mentions-legales", "footer"])
    assert.equal(result.history.past.length, 1)
  })
})

describe("V2.7 — assistant (faux client Anthropic, aucun réseau)", () => {
  test("une réponse structurelle devient une proposition validée, liée au document ; un conseil structurel n'en produit aucune", async () => {
    const advice = fake(answer({ message: "La séquence fonctionne bien, je ne changerais rien." }))
    const opinion = await ask(doc(), "Que penses-tu de la structure ?", advice.client)
    assert.equal(opinion.status === "success" && "proposal" in opinion, false)
    const remove = fake(answer({ message: "Je propose de retirer la liste.", summary: "Retirer la liste", remove: [{ blockId: "support" }] }))
    const removal = await ask(doc(), "Supprime la liste à icônes", remove.client)
    assert.equal(removal.status === "success" && removal.proposal?.structure?.remove[0]?.blockId, "support")
    assert.equal(removal.status === "success" && removal.proposal?.basedOn, documentFingerprint(doc()))
    const move = fake(answer({ message: "Je remonte la conclusion.", summary: "Déplacer", move: [{ blockId: "closing", placement: ahead("support") }] }))
    assert.equal((await ask(doc(), "Mets la conclusion avant la liste", move.client)).status === "success" && true, true)
    const add = fake(answer({ message: "J'ajoute une conclusion.", summary: "Ajouter une conclusion", add: [{ ref: "new-1", blockType: textAndCta, placement: last, content: [{ slot: "titre-section", value: "Et ensuite ?" }] }] }))
    const added = await ask(doc(), "Ajoute une conclusion", add.client)
    assert.equal(added.status === "success" && added.proposal?.structure?.add[0]?.blockType, textAndCta)
    assert.equal(add.calls.length, 1, "un seul appel de modèle")
  })

  test("une demande ambiguë peut se terminer sans proposition ; rien n'est forcé", async () => {
    const question = fake(answer({ message: "Quelle lame veux-tu supprimer ? Sélectionne-la ou donne-moi son nom." }))
    const result = await ask(doc(), "Supprime cette lame", question.client)
    assert.equal(result.status === "success" && "proposal" in result, false)
  })

  test("une réponse invalide est refusée en entier : type inventé (schéma), ancre supprimée ou lame inexistante (domaine), valeur contrôlée (domaine)", async () => {
    const invented = await ask(doc(), "Ajoute un truc", fake(answer({ summary: "x", add: [{ ref: "a", blockType: "inventee", placement: last, content: [] }] })).client)
    assert.equal(invented.status === "error" && invented.error.kind, "invalid-draft")
    const anchorRemoved = await ask(doc(), "Mets la conclusion avant la liste et supprime la liste", fake(answer({ summary: "x", remove: [{ blockId: "support" }], move: [{ blockId: "closing", placement: ahead("support") }] })).client)
    assert.equal(anchorRemoved.status === "error" && anchorRemoved.error.kind, "validation-failed")
    const unknownBlock = await ask(doc(), "Supprime", fake(answer({ summary: "x", remove: [{ blockId: "fantome" }] })).client)
    assert.equal(unknownBlock.status === "error" && unknownBlock.error.kind, "invalid-draft")
    const readOnly = await ask(doc(), "Change la valeur", fake(answer({ summary: "x", remove: [{ blockId: "support" }], changes: [{ target: "offer:valeur-cle", value: "-90 %" }] })).client)
    assert.equal(readOnly.status === "error", true)
    const noSummary = await ask(doc(), "Supprime", fake(answer({ remove: [{ blockId: "support" }] })).client)
    assert.equal(noSummary.status === "error" && noSummary.error.kind, "invalid-draft")
  })

  test("la sélection est transmise au modèle comme un indice structuré ; les listes fermées viennent du document courant", async () => {
    const { calls, client } = fake(answer({ message: "Je ne vois rien à changer." }))
    await ask(doc(), "Que penses-tu de cette lame ?", client, { blockId: "closing" })
    const body = JSON.parse(calls[0]!.messages.at(-1)!.content as string) as Json
    assert.deepEqual(body.selection, { blockId: "closing", blockName: "Texte et bouton" })
    const schema = JSON.stringify(calls[0]!.output_config)
    for (const id of ids(doc())) assert.ok(schema.includes(`"${id}"`), id)
    assert.ok(schema.includes(`"${textAndCta}"`))
  })

  test("la route : la sélection est transmise au moteur ; un email vide n'appelle jamais le moteur", async () => {
    let seen: unknown
    const post = (body: unknown) => handleAssistant(new Request("http://localhost/api/email-builder/assistant", { method: "POST", body: JSON.stringify(body) }), { engine: async (input) => ((seen = input.selection), { status: "success", message: "ok", model: "test" }), log: () => {} })
    const response = await post({ document: doc(), history: [], message: "Cette lame ?", selection: { blockId: "offer" } })
    assert.equal(response.status, 200)
    assert.deepEqual(seen, { blockId: "offer" })
  })
})

describe("V2.7 — mock de développement", () => {
  const post = async (document: EmailDocument, message: string, selection?: { blockId: string } | null) => {
    const response = await handleAssistant(new Request("http://localhost/api/email-builder/assistant", { method: "POST", body: JSON.stringify({ document, history: [], message, devMock: true, ...(selection ? { selection } : {}) }) }), { env: { NODE_ENV: "development" }, log: () => {} })
    return (await response.json()) as Json
  }

  test("suppression, déplacement, ajout et plan mixte : des propositions que le domaine valide ; conseil et ambiguïté sans proposition", async () => {
    const advice = await post(doc(), "Que penses-tu de la structure ?")
    assert.equal(advice.proposal, undefined)
    const ambiguous = await post(doc(), "Supprime cette lame")
    assert.equal(ambiguous.proposal, undefined)
    const bySelection = await post(doc(), "Supprime cette lame", { blockId: "support" })
    assert.deepEqual(bySelection.proposal.structure.remove, [{ blockId: "support" }])
    const byName = await post(doc(), "Supprime la lame Liste à icônes")
    assert.deepEqual(byName.proposal.structure.remove, [{ blockId: "support" }])
    const moved = await post(doc(), "Mets Texte et bouton avant Liste à icônes")
    assert.deepEqual(moved.proposal.structure.move, [{ blockId: "closing", placement: { where: "before", anchor: "support" } }])
    const proof = await post(doc(), "Ajoute une preuve sociale")
    assert.equal(validateCompositionPlan(doc(), planOf(proof.proposal as AssistantProposal), catalog).ok, true, "une lame riche (preuves) reçoit seulement quelques champs, jamais un témoignage inventé")
    assert.ok(!proof.proposal.structure.add[0].content.some((entry: Json) => /temoignage/.test(entry.slot)))
    const added = await post(doc(), "Ajoute une conclusion avec un CTA")
    assert.equal(added.proposal.structure.add[0].blockType, textAndCta)
    const simplified = await post(doc(), "Cet email est trop long, simplifie-le")
    assert.ok(simplified.proposal.structure.remove.length === 1 && simplified.proposal.structure.move.length === 1)
    for (const response of [bySelection, byName, moved, added, simplified]) {
      const proposal = response.proposal as AssistantProposal
      assert.equal(validateCompositionPlan(doc(), planOf(proposal), catalog).ok, true)
    }
  })

  test("le mock reste strictement un moteur de développement : ignoré en production, aucun réseau", async () => {
    const response = await handleAssistant(new Request("http://localhost/api/email-builder/assistant", { method: "POST", body: JSON.stringify({ document: doc(), history: [], message: "Supprime la lame Liste à icônes", devMock: true }) }), { env: { NODE_ENV: "production" }, log: () => {}, engine: async (_input, options) => ((assert.equal(options.devMock, false)), { status: "success", message: "réel", model: "test" }) })
    assert.equal(response.status, 200)
    assert.ok(!/fetch\(|new Anthropic|createClient|process\.env|node:http/.test(code("lib/email-builder/assistant-mock.ts")))
  })
})

describe("V2.7 — interface et architecture", () => {
  test("la carte de proposition montre la structure (ajouter, déplacer, supprimer, avec le nom de la lame) puis le contenu, avant l'application", () => {
    const panel = readFileSync(join(root, "components/email-builder/assistant-panel.tsx"), "utf8")
    for (const piece of ["Structure", "Ajouter ", "Déplacer ", "Supprimer ", "Contenu", "À savoir"]) assert.ok(panel.includes(piece), piece)
    assert.match(panel, /describeStructure\(document, proposal\.structure, catalog, blockName\)/)
    const items = describeStructure(doc(), { remove: [{ blockId: "support" }], move: [{ blockId: "closing", placement: ahead("offer") }], add: [addText("new-1", behind("offer"), [{ slot: "titre-section", value: "Et ensuite ?" }])] }, catalog, (type) => lames.find((lame) => lame.type === type)?.name ?? type)
    assert.deepEqual(items.map((item) => item.kind), ["remove", "move", "add"])
    assert.equal(items[0]!.title, "« Liste à icônes » (lame 3)")
    assert.match(items[1]!.detail, /avant « Hero offre avec code » \(lame 2\)/)
    assert.match(items[2]!.detail, /après « Hero offre avec code »/)
    assert.match(items[2]!.detail, /titre-section : « Et ensuite \? »/)
  })

  test("l'application passe par le catalogue du Builder, jamais par la réponse ; aucune application automatique", () => {
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /compositionCatalog\(lames\)/)
    assert.match(workspace, /selection: selectionHint\(state\.selection\)/)
    assert.equal((workspace.match(/type: "apply-proposal"/g) ?? []).length, 1)
  })

  test("le moteur de composition est indépendant du chat, de React et d'Anthropic : prêt à recevoir le plan d'une autre source", () => {
    const source = code("lib/email-builder/composition.ts")
    assert.ok(!/from "react"|assistant-chat|assistant-engine|assistant-context|assistant-handler|assistant-schema|anthropic|fetch\(|"use client"/.test(source))
    assert.match(source, /export function validateCompositionPlan/)
    assert.match(source, /export const applyCompositionPlan/)
  })

  test("l'assistant reste désactivé à zéro lame (V2.6 conservé) et les propositions de contenu seul (V2.5) gardent leur forme", () => {
    const empty = createBuilderState(builderTemplates()[0]!.document)
    assert.ok(!builderIsEmpty(empty))
    const contentOnly = proposed(empty, { content: [{ target: assistantFields(builderTemplates()[0]!.document)[0]!.target, value: "Nouveau texte" }] })
    const message = contentOnly.assistant.messages.at(-1)!
    assert.equal(message.role === "assistant" && message.proposal && "structure" in message.proposal, false)
  })
})
