/**
 * Interface d'édition conversationnelle : état et historique (pur), ajustements
 * rapides, erreurs, transport navigateur et câblage du composant. Hors ligne :
 * `fetch` est un pont simulé vers la vraie route, avec un fournisseur simulé :
 * aucun appel Anthropic.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import Anthropic from "@anthropic-ai/sdk"

import { DEFAULT_EMAIL_MODEL, type EmailClaudeClient } from "../anthropic"
import { checkEditInstruction } from "../edit-guard"
import { postEmailEdit, readEditResult } from "../edit-client"
import { editEmailV2 } from "../edit-engine"
import { handleEmailEdit } from "../edit-handler"
import {
  canEditEmail,
  canRedo,
  canSendEditInstruction,
  canUndo,
  currentVersion,
  describeEmailEditError,
  emailEditNotice,
  emailEditorReducer,
  emailQuickAdjustments,
  initialEmailEditorState,
  toEmailEditBody,
  versionLabel,
  type EmailEditorAction,
  type EmailEditorState,
} from "../editor-state"
import type { EmailGenerationSuccess } from "../generation"
import { emailGeneratorExamples } from "../generator-examples"
import { toEmailRequestBody } from "../generator-form"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const realFetch = globalThis.fetch
const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => fetchGuard.mock.restore())

const email = (label: string, draft: unknown = { subject: label }): EmailGenerationSuccess => ({ status: "success", subject: label, preheader: "P", blockCount: 6, html: `<p>${label}</p>`, previewHtml: `<p>${label}</p>`, draft })
const run = (state: EmailEditorState, ...actions: EmailEditorAction[]) => actions.reduce(emailEditorReducer, state)
const generated = (label = "V1") => run(initialEmailEditorState, { type: "generated", email: email(label), generation: { intent: "promotion" } })
const edited = (state: EmailEditorState, label: string, instruction = `Instruction ${label}`) => run(state, { type: "edit-start" }, { type: "edit-success", email: email(label), instruction, summary: `Résumé ${label}` })

describe("historique local : V1, V2, V3, annuler, rétablir", () => {
  test("avant toute génération : rien à éditer, rien à annuler", () => {
    assert.deepEqual(initialEmailEditorState, { versions: [], index: -1, generation: null, status: "idle", notice: null, error: null })
    assert.equal(canEditEmail(initialEmailEditorState), false)
    assert.equal(canUndo(initialEmailEditorState) || canRedo(initialEmailEditorState), false)
    assert.equal(emailEditorReducer(initialEmailEditorState, { type: "edit-start" }), initialEmailEditorState, "pas d'édition sans email")
    assert.equal(currentVersion(initialEmailEditorState), null)
  })

  test("V1 = la génération initiale ; chaque modification réussie ajoute une version et devient la version affichée", () => {
    const v1 = generated()
    assert.deepEqual(v1.versions.map(versionLabel), ["V1 — Génération initiale"])
    assert.equal(v1.index, 0)
    assert.equal(canEditEmail(v1), true)
    const v2 = edited(v1, "V2", "Rends l'accroche plus directe.")
    const v3 = edited(v2, "V3", "Raccourcis la conclusion.")
    assert.deepEqual(v3.versions.map((version) => version.number), [1, 2, 3])
    assert.deepEqual(v3.versions.map(versionLabel), ["V1 — Génération initiale", "V2 — Rends l'accroche plus directe.", "V3 — Raccourcis la conclusion."])
    assert.equal(v3.index, 2)
    assert.equal(currentVersion(v3)!.email.subject, "V3")
    assert.equal(v3.notice, emailEditNotice)
    assert.equal(emailEditNotice, "Email mis à jour")
    assert.equal(currentVersion(v3)!.summary, "Résumé V3")
    assert.equal(v3.status, "idle")
  })

  test("annuler recule d'une version, rétablir avance ; aucun appel, aucune version perdue tant qu'on ne modifie pas", () => {
    const v3 = edited(edited(generated(), "V2"), "V3")
    const back = run(v3, { type: "undo" })
    assert.equal(back.index, 1)
    assert.equal(currentVersion(back)!.email.subject, "V2")
    assert.equal(back.versions.length, 3, "V3 reste rétablissable")
    assert.equal(canUndo(back) && canRedo(back), true)
    assert.equal(run(back, { type: "undo" }).index, 0)
    assert.equal(canUndo(run(back, { type: "undo" })), false, "rien avant V1")
    assert.equal(run(back, { type: "undo" }, { type: "undo" }).index, 0)
    assert.equal(run(back, { type: "redo" }).index, 2)
    assert.equal(canRedo(run(back, { type: "redo" })), false, "rien après la dernière version")
    assert.equal(run(v3, { type: "redo" }), v3, "rétablir sans retour en arrière ne fait rien")
  })

  test("une modification faite après un retour en arrière remplace les versions rétablissables", () => {
    const v3 = edited(edited(generated(), "V2"), "V3")
    const forked = edited(run(v3, { type: "undo" }), "V4-bis", "Autre idée.")
    assert.deepEqual(forked.versions.map((version) => version.email.subject), ["V1", "V2", "V4-bis"])
    assert.equal(forked.index, 2)
    assert.equal(canRedo(forked), false)
    assert.deepEqual(forked.versions.map((version) => version.number), [1, 2, 4], "les numéros d'affichage ne se réutilisent pas")
  })

  test("annuler et rétablir ne dépendent pas du serveur : aucune requête, quel que soit le nombre d'allers-retours", () => {
    let state = edited(edited(generated(), "V2"), "V3")
    for (let index = 0; index < 5; index += 1) state = run(state, { type: "undo" }, { type: "undo" }, { type: "redo" }, { type: "redo" })
    assert.equal(state.index, 2)
    assert.equal(fetchGuard.mock.callCount(), 0)
    assert.ok(!/fetch|postEmailEdit/.test(code("components/email/email-edit-panel.tsx")), "le panneau ne fait aucune requête")
  })

  test("une nouvelle génération repart de V1 : l'ancien historique est abandonné", () => {
    const v3 = edited(edited(generated(), "V2"), "V3")
    const again = run(v3, { type: "generated", email: email("Nouvelle"), generation: { intent: "preuves" } })
    assert.deepEqual(again.versions.map((version) => version.number), [1])
    assert.deepEqual(again.generation, { intent: "preuves" })
    assert.equal(again.index, 0)
    assert.equal(again.notice, null)
  })

  test("pendant une modification : une seule à la fois, ni annuler ni rétablir ; une erreur n'ajoute aucune version et garde la version affichée", () => {
    const v2 = edited(generated(), "V2")
    const editing = run(v2, { type: "edit-start" })
    assert.equal(editing.status, "editing")
    assert.equal(emailEditorReducer(editing, { type: "edit-start" }), editing, "pas de seconde soumission")
    assert.equal(canUndo(editing), false)
    assert.equal(canRedo(run(v2, { type: "undo" }, { type: "edit-start" })), false)
    const failed = run(editing, { type: "edit-failure", error: { code: "provider-error", issues: [] } })
    assert.equal(failed.status, "idle")
    assert.equal(failed.versions.length, 2, "aucune version ajoutée")
    assert.equal(failed.index, 1)
    assert.equal(currentVersion(failed)!.email.subject, "V2", "la dernière version valide reste affichée")
    assert.equal(failed.error?.code, "provider-error")
    assert.equal(run(failed, { type: "undo" }).error, null, "l'action suivante efface l'erreur")
    assert.equal(emailEditorReducer(v2, { type: "edit-failure", error: { code: "internal", issues: [] } }), v2, "un échec sans modification en cours est ignoré")
    assert.equal(emailEditorReducer(v2, { type: "edit-success", email: email("X"), instruction: "x", summary: "x" }), v2, "un succès sans modification en cours est ignoré")
  })

  test("une version garde son Draft : annuler redonne le Draft de la version précédente à la prochaine modification", () => {
    const v1 = run(initialEmailEditorState, { type: "generated", email: email("V1", { n: 1 }), generation: { g: 1 } })
    const v2 = run(v1, { type: "edit-start" }, { type: "edit-success", email: email("V2", { n: 2 }), instruction: "x", summary: "y" })
    assert.deepEqual(toEmailEditBody(v2, " Raccourcis. ").draft, { n: 2 })
    assert.deepEqual(toEmailEditBody(run(v2, { type: "undo" }), "Raccourcis.").draft, { n: 1 })
    assert.deepEqual(toEmailEditBody(v2, " Raccourcis. "), { instruction: "Raccourcis.", generation: { g: 1 }, draft: { n: 2 } })
  })

  test("un email sans Draft éditable (mode démo) n'est pas modifiable", () => {
    const demo = run(initialEmailEditorState, { type: "generated", email: { ...email("D"), draft: undefined }, generation: {} })
    assert.equal(canEditEmail(demo), false)
  })
})

describe("ajustements rapides et instruction libre", () => {
  test("trois ou quatre ajustements, chacun une instruction d'édition ordinaire qui passe les garde-fous de toutes les familles", () => {
    assert.ok(emailQuickAdjustments.length >= 3 && emailQuickAdjustments.length <= 4)
    assert.deepEqual(emailQuickAdjustments.map((entry) => entry.label), ["Plus direct", "Plus court", "Plus chaleureux", "Plus dynamique"])
    for (const adjustment of emailQuickAdjustments) {
      for (const address of ["vouvoiement", "tutoiement"] as const) assert.equal(checkEditInstruction(adjustment.instruction, { address, protectedTokens: ["DEMO20", "-20 %", "59 000"] }), undefined, adjustment.instruction)
    }
    assert.equal(new Set(emailQuickAdjustments.map((entry) => entry.id)).size, emailQuickAdjustments.length)
  })

  test("l'instruction libre : au moins trois caractères, au plus cinq cents", () => {
    assert.equal(canSendEditInstruction(""), false)
    assert.equal(canSendEditInstruction("  ok "), false)
    assert.equal(canSendEditInstruction("Raccourcis."), true)
    assert.equal(canSendEditInstruction("a".repeat(501)), false)
  })
})

describe("erreurs d'édition : un titre et une phrase, jamais un détail interne", () => {
  test("un refus avant appel donne son motif ; les autres erreurs ont un message fixe qui rassure sur la version conservée", () => {
    const refused = describeEmailEditError({ code: "edit-refused", issues: [{ path: "instruction", message: "Le code promo vient des données de l'offre." }] })
    assert.equal(refused.title, "Modification refusée")
    assert.equal(refused.message, "Le code promo vient des données de l'offre.")
    assert.match(describeEmailEditError({ code: "protected-mutation", issues: [] }).message, /version actuelle est conservée/)
    assert.equal(describeEmailEditError({ code: "no-change", issues: [] }).title, "Aucun changement")
    for (const code of ["provider-error", "timeout", "rate-limit", "validation-failed", "brand-violation", "invalid-output", "network"] as const) {
      const view = describeEmailEditError({ code, issues: [{ path: "a.b.c", message: "détail interne" }] })
      assert.match(view.message, /version actuelle est conservée/)
      assert.ok(!/détail interne|a\.b\.c/.test(`${view.title} ${view.message}`))
    }
    assert.equal(describeEmailEditError({ code: "configuration", issues: [] }).title, "Service indisponible")
  })
})

/* -------------------------------------------------------------------------- */
/* Transport et route : pont simulé                                           */
/* -------------------------------------------------------------------------- */

describe("transport navigateur → /api/edit-email (pont simulé)", () => {
  const form = () => {
    const example = emailGeneratorExamples.find((entry) => entry.id === "promotion")!.form
    return { ...example, promotion: { ...example.promotion, endDate: "2099-12-31" } }
  }
  const draft = {
    subject: "-20 % sur les formations",
    preheader: "Une offre de rentrée à découvrir dans le catalogue des formations concernées.",
    visualIntent: "career-movement",
    offer: { eyebrow: "Offre rentrée", text: "Vous développez vos compétences à côté du travail ? Cette offre vous aide à vous lancer.", ctaLabel: "Voir les formations" },
    support: {
      title: "Avant de vous décider",
      items: [
        { icon: "magnifying-glass", title: "Repérez", text: "Parcourez le catalogue et notez ce qui vous intéresse." },
        { icon: "handshake-simple", title: "Pensez à votre quotidien", text: "Repérez ce qui s'accorde avec votre activité." },
        { icon: "stopwatch", title: "Comparez", text: "Lisez le détail de chaque formation avant de choisir." },
      ],
    },
    closing: { title: "À vous de choisir", text: "Le catalogue détaille chaque formation. Comparez-les, puis retenez celle qui vous convient.", ctaLabel: "Parcourir le catalogue" },
  }
  const message = (text: string) =>
    ({ id: "m", type: "message", role: "assistant", model: DEFAULT_EMAIL_MODEL, content: [{ type: "text", text, citations: null }], stop_reason: "end_turn", stop_sequence: null, stop_details: null, usage: { input_tokens: 1, output_tokens: 1, output_tokens_details: { thinking_tokens: 0 }, cache_read_input_tokens: null, cache_creation_input_tokens: null } }) as unknown as Anthropic.Message

  /** `fetch` du navigateur → la vraie route d'édition, avec un fournisseur simulé. */
  function bridge(respond: () => Anthropic.Message | Promise<Anthropic.Message>) {
    let calls = 0
    const client: EmailClaudeClient = { messages: { create: async () => ((calls += 1), respond()) } }
    fetchGuard.mock.mockImplementation((async (url: string, init: RequestInit) => {
      assert.equal(url, "/api/edit-email")
      assert.equal(init.method, "POST")
      return handleEmailEdit(new Request(`http://localhost${url}`, { method: "POST", body: init.body as string }), { engine: (input) => editEmailV2(input, { client, env: {} }), log: () => {} })
    }) as typeof fetch)
    return { calls: () => calls }
  }

  test("parcours : génération (V1) → modification (V2) → annuler → rétablir → refus protégé : un appel par modification, aucune version sur refus", async () => {
    const provider = bridge(() => message(JSON.stringify({ summary: "Accroche plus dynamique", edits: [{ field: "offer.text", text: "Cap sur la rentrée : vous développez vos compétences avec un coup de pouce." }] })))
    const generation = toEmailRequestBody(form())
    let state = run(initialEmailEditorState, { type: "generated", email: { ...email("V1"), draft }, generation })

    // V2 : l'instruction part avec la génération d'origine et le Draft de la version affichée.
    state = run(state, { type: "edit-start" })
    const result = await postEmailEdit(toEmailEditBody(state, "Rends l'accroche plus dynamique."))
    assert.ok("email" in result, JSON.stringify(result))
    if (!("email" in result)) return
    state = run(state, { type: "edit-success", email: result.email, instruction: "Rends l'accroche plus dynamique.", summary: result.summary })
    assert.equal(provider.calls(), 1)
    assert.equal(state.versions.length, 2)
    assert.equal(result.summary, "Accroche plus dynamique")
    assert.ok(result.email.html.includes("Cap sur la rentrée") && result.email.html.includes("DEMO20") && result.email.html.includes("31 décembre 2099"))
    assert.ok(result.email.previewHtml.length > 1000)
    assert.ok(typeof result.email.draft === "object")
    assert.ok(!("changed" in result.email) && !("summary" in result.email))

    // Annuler / rétablir : aucun appel.
    state = run(state, { type: "undo" })
    assert.equal(currentVersion(state)!.email.subject, "V1")
    state = run(state, { type: "redo" })
    assert.equal(currentVersion(state)!.email.html, result.email.html)
    assert.equal(provider.calls(), 1)

    // Demande protégée : refusée avant appel, aucune version.
    state = run(state, { type: "edit-start" })
    const refused = await postEmailEdit(toEmailEditBody(state, "Passe -20 % à -30 %."))
    assert.ok(!("email" in refused))
    if ("email" in refused) return
    assert.equal(refused.code, "edit-refused")
    state = run(state, { type: "edit-failure", error: refused })
    assert.equal(state.versions.length, 2)
    assert.equal(provider.calls(), 1, "aucun appel pour un refus")
    assert.match(describeEmailEditError(refused).message, /valeur de l'offre/)
  })

  test("erreurs réseau et réponses illisibles : une erreur réseau, jamais une exception", async () => {
    fetchGuard.mock.mockImplementation((async () => {
      throw new Error("hors ligne")
    }) as typeof fetch)
    assert.deepEqual(await postEmailEdit({}), { code: "network", issues: [] })
    fetchGuard.mock.mockImplementation((async () => new Response("pas du json")) as typeof fetch)
    assert.deepEqual(await postEmailEdit({}), { code: "network", issues: [] })
    assert.deepEqual(readEditResult(null), { code: "network", issues: [] })
    assert.deepEqual(readEditResult({ status: "inconnu" }), { code: "network", issues: [] })
    assert.deepEqual(readEditResult({ status: "error", code: "timeout", issues: [{ path: "x", message: "y" }] }), { code: "timeout", issues: [{ path: "x", message: "y" }] })
    assert.deepEqual(readEditResult({ status: "error" }), { code: "internal", issues: [] })
    assert.equal(fetchGuard.mock.callCount() >= 0, true)
    assert.equal(typeof realFetch, "function")
  })
})

/* -------------------------------------------------------------------------- */
/* Câblage et garde-fous de l'interface                                       */
/* -------------------------------------------------------------------------- */

describe("interface d'édition : câblage", () => {
  const panel = code("components/email/email-edit-panel.tsx")
  const workspace = code("components/email/email-workspace.tsx")
  const preview = code("components/email/email-preview.tsx")

  test("aucun éditeur HTML : ni contenteditable, ni innerHTML, ni modification du DOM de l'aperçu ; l'iframe reste isolée", () => {
    for (const [name, source] of [["panneau", panel], ["workspace", workspace], ["aperçu", preview]] as const) {
      assert.ok(!/contentEditable|contenteditable|dangerouslySetInnerHTML|innerHTML|designMode|execCommand/.test(source), name)
    }
    assert.match(preview, /sandbox="allow-same-origin"/)
    assert.ok(!/allow-scripts/.test(preview))
    assert.ok(!/contentDocument\.(?:body|write)|document\.write/.test(`${panel}${workspace}`))
  })

  test("le panneau n'apparaît qu'après une génération réussie ; le formulaire initial n'est pas retiré", () => {
    assert.match(workspace, /\{canEditEmail\(editor\) && \(/)
    assert.match(workspace, /<EmailBriefPanel/)
    assert.match(workspace, /canGenerate=\{canGenerateEmail\(form\) && !editing\}/, "pas de génération pendant une modification")
    assert.match(workspace, /editorDispatch\(\{ type: "generated"/)
  })

  test("l'édition passe par le transport dédié ; le composant n'a toujours qu'un fetch, celui de la génération", () => {
    assert.equal((workspace.match(/fetch\(/g) ?? []).length, 1)
    assert.match(workspace, /postEmailEdit\(toEmailEditBody\(editor, instruction\)\)/)
    assert.match(code("lib/email/edit-client.ts"), /fetch\("\/api\/edit-email"/)
    assert.equal((code("lib/email/edit-client.ts").match(/fetch\(/g) ?? []).length, 1)
    assert.ok(!/\/api\/generate-email/.test(code("lib/email/edit-client.ts")))
    assert.match(workspace, /if \(inFlight\.current \|\| !canEditEmail\(editor\)\) return false/, "une seule requête à la fois, génération comprise")
  })

  test("libellés : Modifier l'email, ajustements rapides, instruction, Envoyer, historique, Annuler, Rétablir ; aucun bouton d'export", () => {
    for (const label of ["Modifier l&apos;email", "Ajustements rapides", "Votre instruction", "Envoyer", "Historique", "Annuler", "Rétablir", "Modification en cours"]) assert.ok(panel.includes(label), label)
    assert.match(panel, /placeholder=\{emailEditPlaceholder\}/)
    assert.match(code("lib/email/editor-state.ts"), /Ex\. Rends l'accroche plus directe et raccourcis la conclusion\./)
    assert.ok(!/exporter|télécharger|copier le html|code html|\.html/i.test(panel), "aucun bouton trompeur d'export")
  })

  test("pendant la modification : commandes désactivées, aperçu conservé avec un indicateur discret", () => {
    assert.match(panel, /const busy = editing \|\| generating/)
    assert.match(panel, /disabled=\{busy\}/)
    assert.match(panel, /disabled=\{busy \|\| !canSendEditInstruction\(instruction\)\}/)
    assert.match(preview, /\{editing && \(/)
    assert.match(preview, /Modification en cours…/)
    assert.ok(!/setMeasured\(undefined\)|html=\{null\}/.test(workspace), "l'aperçu n'est jamais vidé par une modification")
    assert.match(workspace, /editing=\{editing\}/)
  })

  test("l'état est local : ni stockage navigateur, ni base, ni cookie", () => {
    for (const source of [panel, workspace, code("lib/email/editor-state.ts"), code("lib/email/edit-client.ts")]) {
      assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(source))
    }
  })
})
