/** Catalogue de lames du Builder : ce qui peut être ajouté, avec quel contenu provisoire. */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { emailBankImageIdFromSrc } from "../../email/image-bank"
import { emailLibraryEntries } from "../../email/library"
import { emailBlockManifest } from "../../email/manifest"
import { builderLames, starterSlots } from "../catalog"
import { createEmailDocument } from "../document"
import { validateDocumentIntegrity } from "../integrity"
import { buildDemoDocument } from "../demo-document"
import { applyDocumentOperation } from "../operations"

describe("catalogue des lames du Builder", () => {
  const lames = builderLames()

  test("une entrée par lame de la bibliothèque, dans le même ordre ; nom, famille et rôle viennent de la bibliothèque", () => {
    assert.deepEqual(lames.map((lame) => lame.type), emailLibraryEntries.map((entry) => entry.type))
    assert.equal(lames.length, 36)
    for (const [index, lame] of lames.entries()) {
      assert.equal(lame.name, emailLibraryEntries[index]!.name)
      assert.equal(lame.surfaceMode, emailBlockManifest[lame.type].surfaceMode)
    }
  })

  test("chaque lame est soit ajoutable (contenu provisoire), soit indisponible avec sa raison", () => {
    for (const lame of lames) assert.equal(Boolean(lame.starter) !== Boolean(lame.unavailable), true, lame.type)
    const unavailable = lames.filter((lame) => !lame.starter).map((lame) => lame.type).sort()
    assert.deepEqual(unavailable, [
      "email-hero-newsletter-variant-01",
      "email-module-hero-cards",
      "email-module-hero-split-image-dark",
      "email-module-products-four-column-grid",
      "email-module-products-three-column-grid",
    ])
    for (const lame of lames.filter((entry) => entry.unavailable)) assert.match(lame.unavailable!, /banque d'images/)
  })

  test("le contenu provisoire est valide : toute lame ajoutable est acceptée par add-block ; ses images viennent de la banque", () => {
    for (const lame of lames.filter((entry) => entry.starter)) {
      const result = applyDocumentOperation(buildDemoDocument(), { type: "add-block", blockType: lame.type, slots: lame.starter })
      assert.equal(result.ok, true, lame.type)
      for (const slot of Object.values(lame.starter!) as Record<string, unknown>[]) {
        if (typeof slot.src === "string") assert.notEqual(emailBankImageIdFromSrc(slot.src), undefined, `${lame.type} : image hors banque`)
      }
    }
  })

  test("le contenu est celui de démonstration de la bibliothèque (fictif, explicite), jamais un contenu écrit par le Builder", () => {
    const text = starterSlots("email-module-text-only")
    assert.ok(text.ok)
    assert.match(JSON.stringify(text.ok && text.slots), /Titre exemple.*Texte de démonstration/)
  })

  test("le catalogue reste léger pour le navigateur", () => {
    assert.ok(JSON.stringify(lames).length < 40_000, `${JSON.stringify(lames).length}`)
  })

  test("le document de démonstration est un document de recette exploitable, avec ses faits", () => {
    const document = buildDemoDocument()
    assert.deepEqual(validateDocumentIntegrity(document), [])
    assert.equal(document.provenance.recipe, "promotion")
    assert.equal(document.facts.promotion?.code, "DEMO20")
    assert.deepEqual(validateDocumentIntegrity(createEmailDocument(document.config)), [])
  })
})
