/**
 * Édition directe (V2.3), hors React : quel éditeur pour quel slot, comment un
 * brouillon devient une valeur de slot, et ce que fait le Builder à chaque étape
 * (sélection d'élément, brouillon, validation, annulation, historique). Le
 * brouillon vit dans le composant d'édition : ici, on prouve que l'état du
 * Builder — donc le document, donc le rendu — ne bouge qu'à la validation.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { emailBankImageIdFromSrc, emailImagesForIntent } from "../../email/image-bank"
import { emailBlockManifest } from "../../email/manifest"
import type { EmailBlockType } from "../../email/types"
import { builderCanRedo, builderCanUndo, builderDocument, builderReducer, createBuilderState, selectedBlockId, type BuilderAction, type BuilderState } from "../builder-state"
import { buildDemoDocument } from "../demo-document"
import { initialDraft, normalizeTextDraft, sameSlotValue, slotEditor, slotValueFromDraft } from "../inline-edit"
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
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state)
const start = () => createBuilderState(buildDemoDocument())
const slots = (state: BuilderState, id: string) => (builderDocument(state).config.blocks.find((block) => block.id === id) as unknown as { slots: Json }).slots
const key = (state: BuilderState) => JSON.stringify(builderDocument(state))
const edit = (blockId: string, slot: string): BuilderAction[] => [{ type: "select-element", blockId, slot }, { type: "start-edit", blockId, slot }]

describe("slots — quel éditeur pour quel contenu", () => {
  test("chaque slot de chaque lame a un éditeur déterminé : texte court, paragraphe, bouton, image ; icônes et mentions légales ne s'éditent pas en direct", () => {
    const counts = { short: 0, long: 0, cta: 0, image: 0, none: 0 }
    for (const [type, entry] of Object.entries(emailBlockManifest)) {
      for (const [slot, kind] of Object.entries(entry.slots as Record<string, string>)) {
        const editor = slotEditor(type as EmailBlockType, slot)
        counts[editor ?? "none"] += 1
        if (kind === "texte") assert.ok(editor === "short" || editor === "long", `${type}.${slot}`)
        if (kind === "cta" || kind === "cta:fleche" || kind === "lien") assert.equal(editor, "cta", `${type}.${slot}`)
        if (kind === "asset:visuel") assert.equal(editor, "image", `${type}.${slot}`)
        if (kind === "asset:icone" || kind === "disclaimer") assert.equal(editor, null, `${type}.${slot}`)
      }
    }
    assert.ok(counts.short > 80 && counts.long > 40 && counts.cta > 30 && counts.image === 20 && counts.none === 11, JSON.stringify(counts))
  })

  test("titres et libellés sont courts ; paragraphes, descriptions et témoignages sont longs", () => {
    const type = "email-module-hero-offer-image-top" as EmailBlockType
    for (const slot of ["sous-titre", "valeur-cle", "code-promo-1"]) assert.equal(slotEditor(type, slot), "short", slot)
    assert.equal(slotEditor(type, "texte-descriptif"), "long")
    assert.equal(slotEditor(type, "cta-1"), "cta")
    assert.equal(slotEditor(type, "lien-1"), "cta")
    assert.equal(slotEditor(type, "image-1"), "image")
    assert.equal(slotEditor("email-module-benefits-and-testimonial", "temoignage"), "long")
    assert.equal(slotEditor("email-module-benefits-and-testimonial", "item-1-titre"), "short")
    assert.equal(slotEditor("email-module-benefits-and-testimonial", "item-1-texte"), "long")
    assert.equal(slotEditor(type, "slot-inconnu"), null)
  })
})

describe("brouillon → valeur de slot", () => {
  test("texte brut : les retours à la ligne deviennent des espaces, les bords sont rognés ; aucune balise n'est interprétée (le renderer échappe)", () => {
    assert.equal(normalizeTextDraft("  Une ligne\n\nUne autre\r\n  suite  "), "Une ligne Une autre suite")
    assert.deepEqual(slotValueFromDraft({ text: "  <b>gras</b> \n x " }), { text: "<b>gras</b> x" })
  })

  test("un bouton produit { label, href } ; un texte produit { text } : jamais de style, de police ni de HTML libre", () => {
    assert.deepEqual(slotValueFromDraft({ label: " Voir \n tout ", href: "  https://www.studi.com/fr/formations " }), { label: "Voir tout", href: "https://www.studi.com/fr/formations" })
    assert.deepEqual(Object.keys(slotValueFromDraft({ text: "x" })), ["text"])
    assert.deepEqual(Object.keys(slotValueFromDraft({ label: "x", href: "y" })).sort(), ["href", "label"])
  })

  test("le brouillon de départ est la valeur actuelle du slot", () => {
    assert.deepEqual(initialDraft("short", { text: "Titre" }), { text: "Titre" })
    assert.deepEqual(initialDraft("cta", { label: "Voir", href: "https://www.studi.com/fr/formations" }), { label: "Voir", href: "https://www.studi.com/fr/formations" })
    assert.deepEqual(initialDraft("long", undefined), { text: "" })
    assert.equal(sameSlotValue({ text: "a" }, { text: "a" }), true)
    assert.equal(sameSlotValue({ text: "a" }, { text: "b" }), false)
  })
})

describe("sélection : aucune → lame → élément → édition", () => {
  test("un clic sur un contenu sélectionne l'ÉLÉMENT, pas la lame : pas de barre de lame qui masque le contenu (priorité élément > lame)", () => {
    const state = run(start(), { type: "select-block", blockId: "offer" }, ...edit("offer", "sous-titre"))
    assert.deepEqual(state.selection, { kind: "editing", blockId: "offer", slot: "sous-titre" })
    assert.equal(selectedBlockId(state), "offer")
    assert.notEqual(state.selection.kind, "block")
  })

  test("démarrer une édition ne touche ni au document, ni à l'historique, ni au rendu (même clé de document)", () => {
    const before = start()
    const state = run(before, ...edit("offer", "texte-descriptif"))
    assert.equal(builderDocument(state), builderDocument(before))
    assert.equal(key(state), key(before))
    assert.equal(builderCanUndo(state), false)
    assert.equal(state.notice, null)
  })

  test("un slot qui ne s'édite pas en direct (icône, image, slot inconnu) ne démarre aucune édition", () => {
    const before = start()
    assert.deepEqual(run(before, { type: "start-edit", blockId: "support", slot: "icone-1" }).selection, { kind: "none" })
    assert.deepEqual(run(before, { type: "start-edit", blockId: "offer", slot: "image-1" }).selection, { kind: "none" })
    assert.deepEqual(run(before, { type: "start-edit", blockId: "offer", slot: "inconnu" }).selection, { kind: "none" })
    assert.deepEqual(run(before, { type: "start-edit", blockId: "fantome", slot: "x" }).selection, { kind: "none" })
  })

  test("Échap : annule l'édition (le document n'a jamais bougé), puis désélectionne l'élément, puis la lame", () => {
    let state = run(start(), { type: "select-block", blockId: "offer" }, ...edit("offer", "sous-titre"))
    const document = builderDocument(state)
    state = run(state, { type: "escape" })
    assert.deepEqual(state.selection, { kind: "element", blockId: "offer", slot: "sous-titre" })
    assert.equal(builderDocument(state), document)
    assert.equal(builderCanUndo(state), false)
    state = run(state, { type: "escape" })
    assert.deepEqual(state.selection, { kind: "block", blockId: "offer" })
    state = run(state, { type: "escape" })
    assert.deepEqual(state.selection, { kind: "none" })
    assert.equal(run(state, { type: "escape" }), state)
  })

  test("Échap ferme d'abord l'édition, puis le panneau ouvert, avant de désélectionner", () => {
    let state = run(start(), { type: "select-element", blockId: "offer", slot: "image-1" }, { type: "open-images", blockId: "offer", slot: "image-1" })
    state = run(state, { type: "escape" })
    assert.equal(state.panel, null)
    assert.equal(state.selection.kind, "element")
    state = run(state, { type: "escape" })
    assert.equal(state.selection.kind, "block")
  })
})

describe("validation : une opération set-slot, une entrée d'historique", () => {
  test("texte court : valider modifie UN slot, ajoute UNE entrée d'historique, ne dit rien ; le reste du document est identique", () => {
    const before = start()
    const state = run(before, ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "Offre reconversion" } })
    assert.equal(slots(state, "offer")["sous-titre"].text, "Offre reconversion")
    assert.equal(state.history.past.length, 1)
    assert.equal(builderCanUndo(state), true)
    assert.equal(state.notice, null)
    assert.deepEqual(state.selection, { kind: "element", blockId: "offer", slot: "sous-titre" })
    assert.deepEqual({ ...slots(state, "offer"), "sous-titre": null }, { ...slots(before, "offer"), "sous-titre": null })
    assert.deepEqual(builderDocument(state).facts, builderDocument(before).facts)
  })

  test("paragraphe : même chemin ; un collage multi-lignes tient sur une ligne", () => {
    const state = run(start(), ...edit("closing", "texte-descriptif"), { type: "commit-edit", blockId: "closing", slot: "texte-descriptif", draft: { text: "Première ligne\nDeuxième ligne" } })
    assert.equal(slots(state, "closing")["texte-descriptif"].text, "Première ligne Deuxième ligne")
    assert.equal(state.history.past.length, 1)
  })

  test("valeur identique : ni opération, ni historique, ni retour (la sélection revient simplement à l'élément)", () => {
    const before = start()
    const state = run(before, ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "  Offre alternance  " } })
    assert.equal(state.history, before.history)
    assert.equal(state.notice, null)
    assert.equal(state.selection.kind, "element")
  })

  test("validation vide ou refusée par le contrat : le document ne bouge pas, une phrase claire", () => {
    const before = start()
    for (const draft of [{ text: "   " }, { text: "" }]) {
      const state = run(before, ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft })
      assert.equal(state.history, before.history)
      assert.equal(state.notice?.tone, "error")
      assert.ok(state.notice!.message.length > 5)
      assert.equal(state.selection.kind, "element")
    }
  })

  test("plusieurs validations = plusieurs entrées ; saisir 30 caractères n'en crée aucune (le brouillon n'est pas dans l'état)", () => {
    let state = start()
    const initial = key(state)
    // Pendant la frappe : rien n'arrive au reducer, la clé de rendu ne change pas.
    state = run(state, ...edit("offer", "sous-titre"))
    assert.equal(key(state), initial)
    state = run(state, { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "Un" } }, ...edit("closing", "titre-section"), { type: "commit-edit", blockId: "closing", slot: "titre-section", draft: { text: "Deux" } })
    assert.equal(state.history.past.length, 2)
  })
})

describe("boutons : libellé et destination", () => {
  const cta = (state: BuilderState) => slots(state, "offer")["cta-1"] as { label: string; href: string }

  test("libellé seul : un set-slot, le lien est conservé", () => {
    const before = start()
    const state = run(before, ...edit("offer", "cta-1"), { type: "commit-edit", blockId: "offer", slot: "cta-1", draft: { label: "Découvrir", href: cta(before).href } })
    assert.deepEqual(cta(state), { label: "Découvrir", href: cta(before).href })
    assert.equal(state.history.past.length, 1)
  })

  test("destination seule : libellé conservé ; libellé et destination ensemble : UNE seule entrée d'historique", () => {
    const before = start()
    const href = "https://www.studi.com/fr/diplomes"
    const linkOnly = run(before, ...edit("offer", "cta-1"), { type: "commit-edit", blockId: "offer", slot: "cta-1", draft: { label: cta(before).label, href } })
    assert.deepEqual(cta(linkOnly), { label: cta(before).label, href })
    const both = run(before, ...edit("offer", "cta-1"), { type: "commit-edit", blockId: "offer", slot: "cta-1", draft: { label: "Voir les diplômes", href } })
    assert.deepEqual(cta(both), { label: "Voir les diplômes", href })
    assert.equal(both.history.past.length, 1)
  })

  test("lien techniquement impossible : refus lisible, document intact", () => {
    const before = start()
    for (const href of ["pas un lien", "javascript:alert(1)", "/relatif", "http://www.studi.com", ""]) {
      const state = run(before, ...edit("offer", "cta-1"), { type: "commit-edit", blockId: "offer", slot: "cta-1", draft: { label: "Voir", href } })
      assert.equal(state.history, before.history, href)
      assert.equal(state.notice?.tone, "error", href)
    }
  })

  test("lien inhabituel mais acceptable : accepté, avec un conseil non bloquant (l'export le refuserait)", () => {
    const state = run(start(), ...edit("offer", "cta-1"), { type: "commit-edit", blockId: "offer", slot: "cta-1", draft: { label: "Voir", href: "https://example.com/offre" } })
    assert.equal(cta(state).href, "https://example.com/offre")
    assert.equal(state.history.past.length, 1)
    assert.equal(state.notice?.tone, "warning")
    assert.match(state.notice!.message, /example\.com|exportable|destination/)
  })

  test("un lien texte (slot « lien ») s'édite comme un bouton", () => {
    const state = run(start(), ...edit("offer", "lien-1"), { type: "commit-edit", blockId: "offer", slot: "lien-1", draft: { label: "Voir plus", href: "https://www.studi.com/fr/formations" } })
    assert.deepEqual(slots(state, "offer")["lien-1"], { label: "Voir plus", href: "https://www.studi.com/fr/formations" })
  })
})

describe("images : remplacer depuis la banque", () => {
  const src = (state: BuilderState, id = "offer", slot = "image-1") => slots(state, id)[slot].src as string
  const other = (state: BuilderState) => emailImagesForIntent("campaign-portrait", "email-module-hero-offer-image-top").concat(emailImagesForIntent("career-movement", "email-module-hero-offer-image-top")).find((id) => id !== emailBankImageIdFromSrc(src(state)))!

  test("sélectionner une image ne l'édite pas ; « Remplacer » ouvre la banque pour CE visuel", () => {
    const state = run(start(), { type: "select-element", blockId: "offer", slot: "image-1" }, { type: "open-images", blockId: "offer", slot: "image-1" })
    assert.deepEqual(state.selection, { kind: "element", blockId: "offer", slot: "image-1" })
    assert.deepEqual(state.panel, { kind: "images", blockId: "offer", slot: "image-1" })
    assert.equal(state.history.past.length, 0)
  })

  test("choisir une image : set-image sur ce slot, entrée d'historique, banque fermée, élément resté sélectionné", () => {
    const before = start()
    const imageId = other(before)
    const opened = run(before, { type: "select-element", blockId: "offer", slot: "image-1" }, { type: "open-images", blockId: "offer", slot: "image-1" })
    const state = run(opened, { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-1", imageId } })
    assert.equal(emailBankImageIdFromSrc(src(state)), imageId)
    assert.notEqual(src(state), src(before))
    assert.equal(state.panel, null)
    assert.equal(state.selection.kind, "element")
    assert.equal(state.history.past.length, 1)
    assert.equal(state.notice, null)
  })

  test("une image incompatible avec la lame : refus lisible, document intact", () => {
    const before = start()
    const state = run(before, { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-1", imageId: "image-inventee" } })
    assert.equal(state.history, before.history)
    assert.equal(state.notice?.tone, "error")
  })

  test("lames à plusieurs visuels : chaque visuel a SON slot ; remplacer image-2 ne touche pas image-1 (la frise de portraits n'accepte pas set-image : refus, document intact)", () => {
    const strip = builderLames().find((lame) => lame.type === "email-hero-newsletter-variant-01")
    assert.equal(strip?.starter, undefined, "la lame multi-image n'est pas ajoutable : hors périmètre")
    for (const slot of ["image-1", "image-2", "image-3", "image-4", "image-5"]) assert.equal(slotEditor("email-hero-newsletter-variant-01", slot), "image", slot)
    // Une lame à un visuel ne reconnaît pas le slot d'une autre.
    const before = start()
    const state = run(before, { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-2", imageId: other(before) } })
    assert.equal(state.history, before.history)
    assert.equal(state.notice?.tone, "error")
  })
})

describe("historique : texte, bouton, image — annuler / rétablir", () => {
  test("titre → image → bouton → annuler → annuler → rétablir : exactement les états attendus", () => {
    const s0 = start()
    const s1 = run(s0, ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "Titre 2" } })
    const imageId = emailImagesForIntent("campaign-portrait", "email-module-hero-offer-image-top").find((id) => id !== emailBankImageIdFromSrc(slots(s0, "offer")["image-1"].src))!
    const s2 = run(s1, { type: "operation", operation: { type: "set-image", blockId: "offer", slot: "image-1", imageId } })
    const s3 = run(s2, ...edit("offer", "cta-1"), { type: "commit-edit", blockId: "offer", slot: "cta-1", draft: { label: "Autre", href: "https://www.studi.com/fr/diplomes" } })
    assert.equal(s3.history.past.length, 3)
    const u1 = run(s3, { type: "undo" })
    assert.deepEqual(builderDocument(u1), builderDocument(s2))
    const u2 = run(u1, { type: "undo" })
    assert.deepEqual(builderDocument(u2), builderDocument(s1))
    const r1 = run(u2, { type: "redo" })
    assert.deepEqual(builderDocument(r1), builderDocument(s2))
    assert.deepEqual(builderDocument(run(r1, { type: "undo" }, { type: "undo" }, { type: "undo" })), builderDocument(s0))
    assert.equal(builderCanRedo(run(r1, { type: "undo" })), true)
  })

  test("annuler ramène à la clé de document déjà rendue : le rendu en cache est réutilisé, aucune requête", () => {
    const s0 = start()
    const s1 = run(s0, ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "Nouveau" } })
    assert.notEqual(key(s1), key(s0))
    assert.equal(key(run(s1, { type: "undo" })), key(s0))
    assert.equal(key(run(s1, { type: "undo" }, { type: "redo" })), key(s1))
  })

  test("un brouillon annulé (Échap) n'entre jamais dans l'historique ; annuler n'a alors rien à défaire", () => {
    const state = run(start(), ...edit("offer", "sous-titre"), { type: "escape" })
    assert.equal(builderCanUndo(state), false)
  })

  test("une modification après annuler abandonne la branche rétablissable", () => {
    let state = run(start(), ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "A" } })
    state = run(state, { type: "undo" })
    assert.equal(builderCanRedo(state), true)
    state = run(state, ...edit("offer", "sous-titre"), { type: "commit-edit", blockId: "offer", slot: "sous-titre", draft: { text: "B" } })
    assert.equal(builderCanRedo(state), false)
  })
})

describe("V2.2 inchangé : la structure fonctionne toujours avec le contenu", () => {
  test("ajouter une lame, éditer son titre provisoire, la déplacer, annuler : tout passe par les mêmes opérations", () => {
    const lame = builderLames().find((entry) => entry.type === "email-module-text-only")!
    let state = run(start(), { type: "operation", operation: { type: "add-block", blockType: lame.type, slots: lame.starter!, index: 3 } })
    assert.deepEqual(state.selection, { kind: "block", blockId: "email-module-text-only" })
    state = run(state, ...edit("email-module-text-only", "titre-section"), { type: "commit-edit", blockId: "email-module-text-only", slot: "titre-section", draft: { text: "Mon titre" } })
    assert.equal(slots(state, "email-module-text-only")["titre-section"].text, "Mon titre")
    state = run(state, { type: "operation", operation: { type: "move-block", blockId: "email-module-text-only", toIndex: 1 } })
    assert.equal(builderDocument(state).config.blocks[1]!.id, "email-module-text-only")
    assert.equal(slots(state, "email-module-text-only")["titre-section"].text, "Mon titre")
    state = run(state, { type: "undo" }, { type: "undo" })
    assert.equal(slots(state, "email-module-text-only")["titre-section"].text, "Titre exemple")
  })

  test("supprimer la lame en cours de sélection d'élément désélectionne tout", () => {
    const state = run(start(), ...edit("support", "titre-section"), { type: "operation", operation: { type: "remove-block", blockId: "support" } })
    assert.deepEqual(state.selection, { kind: "none" })
  })
})
