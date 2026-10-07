/**
 * Propositions de l'assistant (V2.5), hors modèle : ce que l'assistant peut viser,
 * comment une proposition devient des opérations V2.1, comment elle est validée
 * contre le document COURANT, et comment elle se périme. Aucun réseau.
 */
import assert from "node:assert/strict"
import { after, before, describe, mock, test } from "node:test"

import { assistantFields, compatibleImages, describeProposal, documentFingerprint, isProposalStale, maxProposalChanges, proposalToOperations, protectedFragments, validateProposal, type ProposalChange } from "../assistant-proposal"
import { buildDemoDocument } from "../demo-document"
import { cloneEmailDocument } from "../document"
import { validateDocumentIntegrity } from "../integrity"
import { applyDocumentOperation, applyDocumentOperations } from "../operations"
import { sameDocumentContent } from "../versions"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
const doc = () => buildDemoDocument()
const slot = (document: ReturnType<typeof doc>, id: string, name: string) => (document.config.blocks.find((block) => block.id === id) as unknown as { slots: Json }).slots[name]
const change = (target: string, value: string): ProposalChange => ({ target, value })

describe("champs que l'assistant peut viser", () => {
  const fields = assistantFields(doc())
  const targets = fields.map((field) => field.target)

  test("textes, libellés de bouton et images : rien d'autre (ni lien, ni icône, ni mention légale, ni structure)", () => {
    assert.ok(targets.includes("offer:sous-titre") && targets.includes("offer:texte-descriptif") && targets.includes("offer:cta-1:label") && targets.includes("offer:image-1") && targets.includes("closing:titre-section"))
    assert.deepEqual([...new Set(fields.map((field) => field.kind))].sort(), ["bouton", "image", "paragraphe", "titre"])
    assert.ok(!targets.some((target) => /icone|disclaimer|:href|surface|status/.test(target)), "ni icône, ni mention légale, ni lien, ni surface, ni statut")
    assert.ok(!targets.includes("offer:cta-1"), "un bouton se vise par son libellé")
    assert.ok(!targets.some((target) => target.startsWith("footer:") || target.startsWith("header:")), "en-tête et footer sont ceux du système")
    assert.ok(!targets.includes("offer:lien-1:label"), "un lien texte est un lien système")
  })

  test("les valeurs de référence à elles seules ne sont pas proposées : valeur de l'offre, code, date de fin", () => {
    for (const locked of ["offer:valeur-cle", "offer:code-promo-1", "header:label"]) assert.ok(!targets.includes(locked), locked)
  })

  test("un texte qui contient une valeur de référence la liste dans mustKeep (le périmètre de l'offre)", () => {
    const description = fields.find((field) => field.target === "offer:texte-descriptif")!
    assert.deepEqual(description.mustKeep, ["Offre valable sur les formations en alternance."])
    assert.deepEqual(protectedFragments(doc()).length, 5)
    assert.deepEqual(fields.find((field) => field.target === "closing:texte-descriptif")!.mustKeep, [])
  })

  test("images : seulement celles de la banque compatibles avec la lame", () => {
    const candidates = compatibleImages("email-module-hero-offer-image-top").map((image) => image.id)
    assert.ok(candidates.length >= 3 && candidates.includes("quai-gare"))
    assert.ok(compatibleImages("email-module-text-only").length === 0)
  })
})

describe("proposition → opérations V2.1", () => {
  test("texte → set-slot ; libellé de bouton → set-slot qui GARDE le lien ; image → set-image", () => {
    const document = doc()
    const result = proposalToOperations(document, [change("offer:sous-titre", "Nouveau"), change("offer:cta-1:label", "Découvrir"), change("offer:image-1", "arret-bus-bleu")])
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.operations, [
      { type: "set-slot", blockId: "offer", slot: "sous-titre", value: { text: "Nouveau" } },
      { type: "set-slot", blockId: "offer", slot: "cta-1", value: { label: "Découvrir", href: slot(document, "offer", "cta-1").href } },
      { type: "set-image", blockId: "offer", slot: "image-1", imageId: "arret-bus-bleu" },
    ])
  })

  test("refus : champ inconnu, champ en double, texte vide, trop de changements, proposition vide", () => {
    const document = doc()
    for (const changes of [[change("offer:inconnu", "x")], [change("offer:sous-titre", "a"), change("offer:sous-titre", "b")], [change("offer:sous-titre", "   ")], [], Array.from({ length: maxProposalChanges + 1 }, (_, i) => change(`offer:sous-titre${i}`, "x"))]) {
      assert.equal(proposalToOperations(document, changes).ok, false, JSON.stringify(changes).slice(0, 60))
    }
  })

  test("l'assistant ne peut viser ni la structure, ni un lien, ni la valeur de l'offre, ni le statut : ces champs n'existent pas", () => {
    for (const target of ["offer", "offer:valeur-cle", "offer:code-promo-1", "header:label", "offer:cta-1:href", "offer:cta-1", "support:icone-1", "mentions-legales:disclaimer-1", "status", "add_block", "remove-block:support", "closing:surface"]) {
      assert.equal(proposalToOperations(doc(), [change(target, "x")]).ok, false, target)
    }
  })
})

describe("validation contre le document courant", () => {
  test("plusieurs changements valides : le document suivant est exploitable, le courant n'est pas touché", () => {
    const document = deepFreeze(doc())
    const result = validateProposal(document, [change("offer:cta-1:label", "Découvrir les formations"), change("offer:texte-descriptif", "Tu vises l'alternance ? Offre valable sur les formations en alternance."), change("closing:titre-section", "À toi de jouer")])
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.operations.length, 3)
    assert.deepEqual(validateDocumentIntegrity(result.next), [])
    assert.equal(slot(result.next, "offer", "cta-1").label, "Découvrir les formations")
    assert.equal(slot(document, "offer", "cta-1").label, "Voir les formations")
  })

  test("ATOMIQUE : un seul changement invalide, et RIEN n'est appliqué", () => {
    const document = deepFreeze(doc())
    const result = validateProposal(document, [change("offer:cta-1:label", "Découvrir"), change("offer:image-1", "image-inventee"), change("closing:titre-section", "Titre")])
    assert.equal(result.ok, false)
    assert.equal(slot(document, "offer", "cta-1").label, "Voir les formations")
    assert.match((result as { message: string }).message, /image/i)
  })

  test("une valeur de référence ne disparaît pas : retirer le périmètre de l'offre est refusé, en entier", () => {
    const result = validateProposal(doc(), [change("closing:titre-section", "Autre"), change("offer:texte-descriptif", "Tu vises l'alternance ? Lance-toi.")])
    assert.equal(result.ok, false)
    assert.equal((result as { reason: string }).reason, "protected")
    assert.match((result as { message: string }).message, /Offre valable sur les formations en alternance/)
  })

  test("le périmètre légèrement reformulé n'est pas conservé : refusé ; conservé à l'identique (insécables près) : accepté", () => {
    const kept = validateProposal(doc(), [change("offer:texte-descriptif", "Lance-toi sans attendre. Offre valable sur les formations en alternance.")])
    assert.equal(kept.ok, true)
    assert.equal(validateProposal(doc(), [change("offer:texte-descriptif", "Lance-toi. Offre valable pour les formations en alternance.")]).ok, false)
  })

  test("une proposition qui ne change rien est refusée", () => {
    assert.equal(validateProposal(doc(), [change("offer:sous-titre", "Offre alternance")]).ok, false)
  })

  test("l'image doit venir de la banque ET être compatible avec la lame", () => {
    assert.equal(validateProposal(doc(), [change("offer:image-1", "arret-bus-bleu")]).ok, true)
    for (const bad of ["https://example.com/a.jpg", "quai-gare--offer.jpg", ""]) assert.equal(validateProposal(doc(), [change("offer:image-1", bad)]).ok, false, bad)
  })

  test("une consigne du modèle contenant du HTML ou un lien n'est pas un texte : refusée par le contrat du slot", () => {
    assert.equal(validateProposal(doc(), [change("offer:sous-titre", "<b>gras</b>")]).ok, false)
  })
})

describe("application atomique de plusieurs opérations (primitive générique)", () => {
  const set = (blockId: string, name: string, text: string) => ({ type: "set-slot", blockId, slot: name, value: { text } })

  test("toutes réussissent : UN document ; chaque opération voit les précédentes", () => {
    const result = applyDocumentOperations(doc(), [set("offer", "sous-titre", "A"), set("closing", "titre-section", "B")])
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(slot(result.value, "offer", "sous-titre").text, "A")
    assert.equal(slot(result.value, "closing", "titre-section").text, "B")
  })

  test("une seule échoue : AUCUNE n'est appliquée, l'erreur dit laquelle (index), l'entrée gelée n'est pas touchée", () => {
    const document = deepFreeze(doc())
    const result = applyDocumentOperations(document, [set("offer", "sous-titre", "A"), set("fantome", "x", "B"), set("closing", "titre-section", "C")])
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.error.index, 1)
    assert.equal(result.error.code, "unknown-block")
    assert.equal(slot(document, "offer", "sous-titre").text, "Offre alternance")
  })

  test("liste vide refusée ; opération inconnue refusée ; le résultat unique entre en UNE entrée d'historique", () => {
    assert.equal(applyDocumentOperations(doc(), []).ok, false)
    assert.equal(applyDocumentOperations(doc(), [{ type: "inconnue" }]).ok, false)
    const single = applyDocumentOperation(doc(), set("offer", "sous-titre", "A"))
    const batch = applyDocumentOperations(doc(), [set("offer", "sous-titre", "A")])
    assert.deepEqual(single.ok && batch.ok && single.value, batch.ok && batch.value)
  })
})

describe("empreinte et péremption", () => {
  test("même contenu = même empreinte (clone, ordre des clés) ; contenu différent = empreinte différente ; format stable", () => {
    const a = doc()
    const b = cloneEmailDocument(a)
    assert.equal(documentFingerprint(a), documentFingerprint(b))
    assert.match(documentFingerprint(a), /^[0-9a-f]{14}$/)
    const changed = applyDocumentOperation(a, { type: "set-slot", blockId: "offer", slot: "sous-titre", value: { text: "Autre" } })
    assert.equal(changed.ok && documentFingerprint(changed.value) !== documentFingerprint(a), true)
    const back = applyDocumentOperation(changed.ok ? changed.value : a, { type: "set-slot", blockId: "offer", slot: "sous-titre", value: { text: "Offre alternance" } })
    assert.equal(back.ok && documentFingerprint(back.value), documentFingerprint(a), "retour exact : même empreinte")
    assert.equal(sameDocumentContent(a, b), true)
  })

  test("une proposition est applicable sur le document qu'elle a vu, périmée sur un autre", () => {
    const document = doc()
    const proposal = { basedOn: documentFingerprint(document) }
    assert.equal(isProposalStale(proposal, document), false)
    const edited = applyDocumentOperation(document, { type: "set-slot", blockId: "offer", slot: "cta-1", value: { label: "Autre", href: slot(document, "offer", "cta-1").href } })
    assert.equal(edited.ok && isProposalStale(proposal, edited.value), true)
  })
})

describe("affichage d'une proposition", () => {
  test("une ligne par contenu : où, quoi, avant, après ; l'étendue (1 ou 8) se lit sans JSON", () => {
    const items = describeProposal(doc(), [change("offer:cta-1:label", "Découvrir"), change("offer:image-1", "arret-bus-bleu"), change("closing:titre-section", "Autre")], (type) => `Lame ${type.length}`)
    assert.equal(items.length, 3)
    assert.deepEqual(items.map((item) => item.label), ["Bouton", "Image", "Titre"])
    assert.equal(items[0]!.before, "Voir les formations")
    assert.equal(items[0]!.after, "Découvrir")
    assert.match(items[1]!.after, /paroi bleue/)
    assert.deepEqual(describeProposal(doc(), [change("fantome:x", "y")], () => "x"), [])
  })
})
