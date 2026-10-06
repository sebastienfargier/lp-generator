/**
 * Versions nommées et statut (V2.4), hors React. Trois notions distinctes :
 * le travail courant (EmailDocument + annuler / rétablir), les versions
 * (snapshots volontaires et immuables) et le statut. Rien n'est persisté ; la
 * date est fournie par l'appelant ; aucun réseau, aucun modèle.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { builderBase, builderCanRedo, builderCanUndo, builderDocument, builderReadOnly, builderReducer, builderViewing, createBuilderState, hasChangesSinceVersion, shownDocument, type BuilderAction, type BuilderState } from "../builder-state"
import { buildDemoDocument } from "../demo-document"
import { cloneEmailDocument } from "../document"
import { canonicalJson, createVersion, documentStatuses, nextVersionNumber, nextVersionPrefix, normalizeVersionName, relativeTime, sameDocumentContent, statusLabels, versionLabel } from "../versions"
import { builderLames } from "../catalog"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 6, 9, minutes)).toISOString()
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state)
const start = () => createBuilderState(buildDemoDocument())
const title = (text: string): BuilderAction[] => [{ type: "start-edit", blockId: "offer", slot: "sous-titre" }, { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text } }]
const titleOf = (document: ReturnType<typeof builderDocument>) => ((document.config.blocks.find((block) => block.id === "offer") as unknown as { slots: Json }).slots["sous-titre"].text as string)
const save = (name: string, minutes = 0): BuilderAction => ({ type: "save-version", name, at: at(minutes) })

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

describe("modèle de version", () => {
  test("première = V1, puis V2, V3 : numérotation attribuée par le système, jamais réutilisée", () => {
    const document = buildDemoDocument()
    const v1 = createVersion([], { name: "Première proposition", document, status: "draft", createdAt: at(0) })
    const v2 = createVersion([v1], { name: "Plus dynamique", document, status: "review", createdAt: at(5) })
    const v3 = createVersion([v1, v2], { name: "", document, status: "ready", createdAt: at(9) })
    assert.deepEqual([v1.number, v2.number, v3.number], [1, 2, 3])
    assert.deepEqual([v1.id, v2.id, v3.id], ["v1", "v2", "v3"])
    assert.equal(nextVersionNumber([]), 1)
    assert.equal(nextVersionNumber([v1, v3]), 4, "un numéro n'est jamais réutilisé")
    assert.equal(nextVersionPrefix([v1, v2]), "V3 –")
  })

  test("libellé : « V2 – Plus dynamique », ou « V3 » sans nom (le nom est facultatif) ; nom court et propre", () => {
    const document = buildDemoDocument()
    const named = createVersion([], { name: "  Plus   dynamique \n", document, status: "draft", createdAt: at(0) })
    assert.equal(named.name, "Plus dynamique")
    assert.equal(versionLabel({ number: 2, name: "Plus dynamique" }), "V2 – Plus dynamique")
    assert.equal(versionLabel({ number: 3, name: "" }), "V3")
    assert.equal(createVersion([], { name: "   ", document, status: "draft", createdAt: at(0) }).name, "")
    assert.equal(normalizeVersionName("x".repeat(100)).length, 60)
  })

  test("le snapshot est COMPLET et INDÉPENDANT : modifier le document d'origine ne change pas la version", () => {
    const document = buildDemoDocument()
    const version = createVersion([], { name: "A", document, status: "draft", createdAt: at(0) })
    assert.deepEqual(version.document, document)
    assert.notEqual(version.document, document)
    assert.notEqual(version.document.config, document.config)
    ;(document.config.blocks[1] as unknown as { slots: Json }).slots["sous-titre"].text = "Modifié après coup"
    document.facts.promotion!.scope = "autre"
    assert.equal(titleOf(version.document), "Offre alternance")
    assert.equal(version.document.facts.promotion!.scope, "les formations en alternance")
  })

  test("trois statuts, avec leurs libellés ; la version garde le statut du moment, à titre historique", () => {
    assert.deepEqual([...documentStatuses], ["draft", "review", "ready"])
    assert.deepEqual(statusLabels, { draft: "Brouillon", review: "À valider", ready: "Prêt à envoyer" })
    const document = buildDemoDocument()
    assert.equal(createVersion([], { name: "", document, status: "review", createdAt: at(0) }).status, "review")
  })

  test("contenu comparé de façon déterministe : l'ordre des clés, les références et les dates n'y changent rien", () => {
    const a = buildDemoDocument()
    const b = cloneEmailDocument(a)
    assert.equal(sameDocumentContent(a, b), true)
    assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }))
    ;(b.config.blocks[1] as unknown as { slots: Json }).slots["sous-titre"].text = "Autre"
    assert.equal(sameDocumentContent(a, b), false)
  })

  test("temps relatif : à l'instant, minutes, heures, jours", () => {
    const now = Date.parse(at(60))
    assert.equal(relativeTime(at(60), now), "à l'instant")
    assert.equal(relativeTime(at(40), now), "il y a 20 min")
    assert.equal(relativeTime(new Date(now - 3 * 3_600_000).toISOString(), now), "il y a 3 h")
    assert.equal(relativeTime(new Date(now - 2 * 86_400_000).toISOString(), now), "il y a 2 j")
  })
})

describe("enregistrer une version", () => {
  test("le Builder démarre sans version ; le travail n'en est pas une ; rien ne s'enregistre tout seul", () => {
    const state = run(start(), ...title("Un"), ...title("Deux"))
    assert.deepEqual(state.versions, [])
    assert.equal(state.baseId, null)
    assert.equal(hasChangesSinceVersion(state), false)
  })

  test("V1 puis V2 puis V3 : ordre chronologique conservé, numéros stables, nom optionnel", () => {
    const state = run(start(), save("Première proposition", 0), ...title("Un"), save("Plus dynamique", 5), ...title("Deux"), save("", 9))
    assert.deepEqual(state.versions.map(versionLabel), ["V1 – Première proposition", "V2 – Plus dynamique", "V3"])
    assert.deepEqual(state.versions.map((version) => version.createdAt), [at(0), at(5), at(9)])
    assert.equal(state.baseId, "v3")
    assert.deepEqual([...state.versions].reverse().map((version) => version.number), [3, 2, 1], "affichage : la plus récente d'abord")
  })

  test("enregistrer ne touche NI au document, NI à l'historique, NI à la sélection : pas une opération, pas une entrée d'annulation", () => {
    const before = run(start(), { type: "select-block", blockId: "offer" }, ...title("Un"))
    const after = run(before, save("V"))
    assert.equal(after.history, before.history, "même objet : past, present et future intacts")
    assert.equal(builderDocument(after), builderDocument(before))
    assert.deepEqual(after.selection, before.selection)
    assert.equal(after.history.past.length, before.history.past.length)
    assert.equal(after.notice, before.notice)
  })

  test("titre → image → enregistrer V1 → annuler : le geste d'avant la version s'annule encore", () => {
    let state = run(start(), ...title("Titre 2"))
    const imageId = "arret-bus-bleu"
    state = run(state, { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-1", imageId } })
    state = run(state, save("Première proposition"))
    assert.equal(builderCanUndo(state), true)
    const undone = run(state, { type: "undo" })
    assert.notEqual(JSON.stringify(builderDocument(undone)), JSON.stringify(builderDocument(state)))
    assert.match(JSON.stringify(builderDocument(state)), /arret-bus-bleu--offer/)
    assert.doesNotMatch(JSON.stringify(builderDocument(undone)), /arret-bus-bleu--offer/)
    assert.equal(titleOf(builderDocument(undone)), "Titre 2")
    assert.equal(state.versions.length, 1, "annuler ne supprime pas la version")
    assert.match(JSON.stringify(state.versions[0]!.document), /arret-bus-bleu--offer/, "la version garde l'image")
  })

  test("annuler PUIS enregistrer garde le futur : rétablir fonctionne encore", () => {
    let state = run(start(), ...title("Un"), ...title("Deux"))
    state = run(state, { type: "undo" })
    assert.equal(builderCanRedo(state), true)
    state = run(state, save("Au milieu"))
    assert.equal(builderCanRedo(state), true)
    assert.equal(titleOf(builderDocument(run(state, { type: "redo" }))), "Deux")
    assert.equal(titleOf(state.versions[0]!.document), "Un")
  })

  test("le statut courant est capturé : V1 en Brouillon, V2 À valider, V3 Prêt à envoyer", () => {
    const state = run(start(), save("A"), { type: "set-status", status: "review" }, save("B"), { type: "set-status", status: "ready" }, save("C"))
    assert.deepEqual(state.versions.map((version) => version.status), ["draft", "review", "ready"])
  })
})

describe("statut", () => {
  test("trois valeurs, changement libre dans tous les sens, immédiat : ni historique, ni opération, ni transition imposée", () => {
    const before = start()
    assert.equal(before.status, "draft")
    let state = before
    for (const status of ["ready", "draft", "review", "ready", "review", "draft"] as const) {
      state = run(state, { type: "set-status", status })
      assert.equal(state.status, status)
      assert.equal(state.history, before.history)
      assert.equal(state.notice, null)
    }
    assert.equal(run(before, { type: "set-status", status: "draft" }), before, "même statut : rien")
  })

  test("aucune recommandation ne bloque « Prêt à envoyer » : même un email sans footer ni mentions légales, avec une alerte forte", () => {
    let state = run(start(), { type: "operation", operation: { type: "remove-block", blockId: "footer" } }, { type: "operation", operation: { type: "remove-block", blockId: "mentions-legales" } })
    assert.equal(state.notice?.tone, "warning")
    state = run(state, { type: "set-status", status: "ready" })
    assert.equal(state.status, "ready")
  })

  test("changer le statut ne modifie jamais une version existante ; un statut seul ne rend pas le travail différent d'une version", () => {
    const saved = run(start(), save("V"))
    const after = run(saved, { type: "set-status", status: "ready" })
    assert.equal(after.versions[0]!.status, "draft")
    assert.equal(after.versions[0], saved.versions[0])
    assert.equal(hasChangesSinceVersion(after), false)
  })
})

describe("consulter une version", () => {
  const base = () => run(start(), ...title("Version 1"), save("Première", 0), ...title("Travail en cours"), { type: "set-status", status: "review" })

  test("ouvrir une version : le canvas affiche le snapshot ; le travail courant est intact, statut compris", () => {
    const state = base()
    const viewing = run(state, { type: "view-version", id: "v1" })
    assert.equal(builderViewing(viewing)?.id, "v1")
    assert.equal(titleOf(shownDocument(viewing)), "Version 1")
    assert.equal(titleOf(builderDocument(viewing)), "Travail en cours")
    assert.equal(viewing.history, state.history)
    assert.equal(viewing.status, "review")
    assert.equal(builderReadOnly(viewing), true)
    assert.equal(builderReadOnly(state), false)
  })

  test("lecture seule : tout geste d'édition est ignoré (opérations, édition inline, sélection, annuler, rétablir, panneaux, statut, enregistrement) — l'état reste le MÊME objet", () => {
    const viewing = run(base(), { type: "view-version", id: "v1" })
    const actions: BuilderAction[] = [
      { type: "operation", operation: { type: "remove-block", blockId: "support" } },
      { type: "operation", operation: { type: "set-slot", blockId: "offer", slot: "sous-titre", value: { text: "x" } } },
      { type: "operation", operation: { type: "set-surface", blockId: "support", surface: "accent-1" } },
      { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-1", imageId: "arret-bus-bleu" } },
      { type: "start-edit", blockId: "offer", slot: "sous-titre" },
      { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "x" } },
      { type: "select-block", blockId: "offer" },
      { type: "select-element", blockId: "offer", slot: "image-1" },
      { type: "undo" },
      { type: "redo" },
      { type: "open-library" },
      { type: "open-images", blockId: "offer", slot: "image-1" },
      { type: "escape" },
      { type: "set-status", status: "ready" },
      { type: "save-version", name: "x", at: at(1) },
    ]
    for (const action of actions) assert.equal(builderReducer(viewing, action), viewing, action.type)
  })

  test("le snapshot reste immuable pendant la consultation, même après des tentatives de modification", () => {
    const viewing = run(base(), { type: "view-version", id: "v1" })
    const snapshot = JSON.stringify(viewing.versions)
    run(viewing, { type: "operation", operation: { type: "remove-block", blockId: "offer" } }, { type: "set-status", status: "ready" })
    assert.equal(JSON.stringify(viewing.versions), snapshot)
  })

  test("revenir au travail actuel : rien n'est perdu (document, historique, statut)", () => {
    const state = base()
    const back = run(state, { type: "view-version", id: "v1" }, { type: "exit-view" })
    assert.equal(back.viewingId, null)
    assert.equal(back.history, state.history)
    assert.equal(titleOf(shownDocument(back)), "Travail en cours")
    assert.equal(back.status, "review")
    assert.equal(builderCanUndo(back), true)
  })

  test("passer d'une version à une autre est possible ; une version inconnue est ignorée", () => {
    const state = run(base(), save("Seconde", 5))
    assert.equal(builderViewing(run(state, { type: "view-version", id: "v1" }, { type: "view-version", id: "v2" }))?.id, "v2")
    assert.equal(run(state, { type: "view-version", id: "v9" }), state)
  })

  test("consulter ferme les panneaux et la sélection du travail (rien de ce qui est affiché n'est sélectionnable)", () => {
    const viewing = run(start(), save("V"), { type: "select-block", blockId: "offer" }, { type: "open-library" }, { type: "view-version", id: "v1" })
    assert.deepEqual(viewing.selection, { kind: "none" })
    assert.equal(viewing.panel, null)
  })

  test("même renderer, même cache : le snapshot consulté a la clé du document qui l'a produit (aucun rendu spécial « historique »)", () => {
    const state = run(start(), ...title("Un"))
    const savedKey = JSON.stringify(builderDocument(state))
    const viewing = run(state, save("V"), ...title("Deux"), { type: "view-version", id: "v1" })
    assert.equal(JSON.stringify(shownDocument(viewing)), savedKey)
  })
})

describe("repartir d'une version", () => {
  const scenario = () => {
    let state = run(start(), ...title("Version 1"), save("Première", 0), ...title("Version 2"), { type: "set-status", status: "ready" }, save("Seconde", 5), ...title("Encore"), { type: "operation", operation: { type: "remove-block", blockId: "support" } })
    state = run(state, { type: "view-version", id: "v1" })
    return state
  }

  test("le travail devient une COPIE du snapshot ; la consultation se ferme", () => {
    const state = run(scenario(), { type: "restart-from", id: "v1" })
    assert.deepEqual(builderDocument(state), state.versions[0]!.document)
    assert.notEqual(builderDocument(state), state.versions[0]!.document, "copie, pas la même référence")
    assert.equal(state.viewingId, null)
    assert.equal(titleOf(builderDocument(state)), "Version 1")
    assert.equal(builderDocument(state).config.blocks.some((block) => block.id === "support"), true)
  })

  test("le statut repasse à Brouillon, même si la version source était « Prêt à envoyer »", () => {
    const state = run(start(), { type: "set-status", status: "ready" }, save("Prête"), { type: "view-version", id: "v1" }, { type: "restart-from", id: "v1" })
    assert.equal(state.versions[0]!.status, "ready")
    assert.equal(state.status, "draft")
  })

  test("l'historique repart à zéro : present = snapshot, past et future vides ; annuler / rétablir n'ont rien à faire", () => {
    const state = run(scenario(), { type: "restart-from", id: "v1" })
    assert.deepEqual(state.history.past, [])
    assert.deepEqual(state.history.future, [])
    assert.equal(builderCanUndo(state), false)
    assert.equal(builderCanRedo(state), false)
    assert.equal(run(state, { type: "undo" }), state)
  })

  test("toutes les versions sont conservées, la source n'est pas touchée ; les prochains numéros continuent (V3)", () => {
    const before = scenario()
    const frozen = JSON.stringify(before.versions)
    const state = run(before, { type: "restart-from", id: "v1" })
    assert.equal(JSON.stringify(state.versions), frozen)
    assert.equal(state.baseId, "v1")
    assert.equal(hasChangesSinceVersion(state), false)
    const next = run(state, ...title("Plus directe"), save("Plus directe", 20))
    assert.deepEqual(next.versions.map((version) => version.number), [1, 2, 3])
  })

  test("modifier le travail après avoir repris une version ne modifie ni cette version ni les autres", () => {
    const before = scenario()
    const frozen = JSON.stringify(before.versions)
    const after = run(before, { type: "restart-from", id: "v1" }, ...title("Nouveau"), { type: "operation", operation: { type: "remove-block", blockId: "support" } }, { type: "undo" }, { type: "redo" }, { type: "set-status", status: "review" })
    assert.equal(JSON.stringify(after.versions), frozen)
  })

  test("version inconnue : ignoré", () => {
    const state = scenario()
    assert.equal(run(state, { type: "restart-from", id: "v9" }), state)
  })

  test("le travail repris a la clé de rendu du snapshot : le rendu déjà en cache est réutilisé", () => {
    const state = run(start(), ...title("Un"), save("V"), ...title("Deux"), { type: "restart-from", id: "v1" })
    assert.equal(JSON.stringify(builderDocument(state)), JSON.stringify(state.versions[0]!.document))
  })
})

describe("immuabilité des versions", () => {
  test("opérations, annuler, rétablir, statut, remplacement d'image, édition inline, restauration d'une autre version : jamais d'effet sur un snapshot (documents gelés : une mutation lèverait)", () => {
    let state = run(start(), ...title("A"), save("Première", 0), { type: "set-status", status: "review" }, ...title("B"), save("Seconde", 5))
    state = { ...state, versions: state.versions.map((version) => ({ ...version, document: deepFreeze(version.document) })) }
    const frozen = JSON.stringify(state.versions)
    const lame = builderLames().find((entry) => entry.type === "email-module-text-only")!
    state = run(
      state,
      ...title("C"),
      { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-1", imageId: "arret-bus-bleu" } },
      { type: "operation", operation: { type: "add-block", blockType: lame.type, slots: lame.starter!, index: 2 } },
      { type: "operation", operation: { type: "set-surface", blockId: "closing", surface: "accent-1" } },
      { type: "operation", operation: { type: "remove-block", blockId: "support" } },
      { type: "undo" },
      { type: "undo" },
      { type: "redo" },
      { type: "set-status", status: "ready" },
      { type: "view-version", id: "v1" },
      { type: "exit-view" },
      { type: "restart-from", id: "v2" },
      ...title("D"),
      { type: "restart-from", id: "v1" },
      { type: "view-version", id: "v2" },
      { type: "exit-view" },
    )
    assert.equal(JSON.stringify(state.versions), frozen)
  })

  test("deux versions du même travail sont deux snapshots distincts, sans partage de références", () => {
    const state = run(start(), save("A"), save("B"))
    assert.notEqual(state.versions[0]!.document, state.versions[1]!.document)
    assert.notEqual(state.versions[0]!.document.config, state.versions[1]!.document.config)
    assert.notEqual(state.versions[0]!.document.config.blocks[0], state.versions[1]!.document.config.blocks[0])
  })
})

describe("indicateur « modifications non enregistrées dans une version »", () => {
  test("sans version de référence : aucun indicateur ; juste après un enregistrement : propre", () => {
    assert.equal(hasChangesSinceVersion(run(start(), ...title("Un"))), false)
    assert.equal(hasChangesSinceVersion(run(start(), ...title("Un"), save("V"))), false)
  })

  test("une modification : différent ; retour EXACT au snapshot (annuler, ou retaper la même valeur) : propre ; le statut seul n'y change rien", () => {
    const saved = run(start(), save("V"))
    const edited = run(saved, ...title("Autre"))
    assert.equal(hasChangesSinceVersion(edited), true)
    assert.equal(hasChangesSinceVersion(run(edited, { type: "undo" })), false)
    assert.equal(hasChangesSinceVersion(run(edited, ...title("Offre alternance"))), false)
    assert.equal(hasChangesSinceVersion(run(saved, { type: "set-status", status: "ready" })), false)
  })

  test("l'indicateur compare le contenu : ni références, ni historique, ni sélection, ni dates", () => {
    const saved = run(start(), save("V", 0))
    const noisy = run(saved, { type: "select-block", blockId: "offer" }, { type: "open-library" }, ...title("Autre"), { type: "undo" }, { type: "redo" }, { type: "undo" })
    assert.equal(hasChangesSinceVersion(noisy), false)
    assert.notEqual(noisy.history, saved.history)
    assert.equal(builderBase(noisy)?.id, "v1")
  })

  test("repartir d'une version ancienne : on compare à CETTE version (pas à la dernière enregistrée)", () => {
    const state = run(start(), ...title("Un"), save("A"), ...title("Deux"), save("B"), { type: "view-version", id: "v1" }, { type: "restart-from", id: "v1" })
    assert.equal(builderBase(state)?.id, "v1")
    assert.equal(hasChangesSinceVersion(state), false)
    assert.equal(hasChangesSinceVersion(run(state, ...title("Trois"))), true)
  })
})

describe("V2.2 et V2.3 inchangés", () => {
  test("ajout, déplacement, surface, suppression, édition, annulation fonctionnent toujours, avec des versions en place", () => {
    const lame = builderLames().find((entry) => entry.type === "email-module-text-only")!
    let state = run(start(), save("V"))
    state = run(state, { type: "operation", operation: { type: "add-block", blockType: lame.type, slots: lame.starter!, index: 3 } }, { type: "operation", operation: { type: "move-block", blockId: "email-module-text-only", toIndex: 1 } }, { type: "operation", operation: { type: "set-surface", blockId: "support", surface: "accent-1" } }, ...title("Mon titre"))
    assert.equal(builderDocument(state).config.blocks[1]!.id, "email-module-text-only")
    assert.equal(titleOf(builderDocument(state)), "Mon titre")
    assert.equal(hasChangesSinceVersion(state), true)
    state = run(state, { type: "undo" }, { type: "undo" }, { type: "undo" }, { type: "undo" })
    assert.equal(hasChangesSinceVersion(state), false)
  })
})
