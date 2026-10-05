import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { approvedClaimIds, approvedClaims, brandDocumentIds, getApprovedClaim, getClaimDisplay, isApproved, provenanceOf } from "../index"
import { body, readCorpus } from "./corpus"

const chiffresCles = readCorpus(provenanceOf("chiffres-cles").path)
const documentValues = [...(/valeurs:\n((?:  - ".+"\n)+)/.exec(chiffresCles)?.[1] ?? "").matchAll(/^  - "(.+)"$/gm)].map((match) => match[1]!)

describe("claims approuvées : uniquement 15-chiffres-cles, mot pour mot", () => {
  test("le document source est approuvé et porte six valeurs", () => {
    assert.equal(provenanceOf("chiffres-cles").status, "approved")
    assert.equal(documentValues.length, 6)
  })

  test("six claims, dans l'ordre du document, formulations identiques au caractère près", () => {
    assert.deepEqual(approvedClaims.map((claim) => claim.statement), documentValues)
    assert.deepEqual(approvedClaims.map((claim) => claim.statement), [
      "59 000 apprenants en cours de formation",
      "Plus de 400 formations, du CAP au Bac+5, dans 18 filières",
      "Près de 1 000 formateurs et conseillers pédagogiques (dont 700 formateurs)",
      "Plus de 130 formations en alternance",
      "Partenaires académiques : ESG, Hetic, Elije, Digital Campus, LISAA, Naratiiv, Cours Florent...",
      "Financement : CPF, France Travail, alternance, entreprise, paiement jusqu'à 36 mois",
    ])
  })

  test("identifiants stables et uniques", () => {
    assert.deepEqual(approvedClaimIds, [
      "apprenants-en-formation",
      "catalogue-formations",
      "formateurs-conseillers",
      "formations-alternance",
      "partenaires-academiques",
      "financement-dispositifs",
    ])
    assert.equal(new Set(approvedClaimIds).size, approvedClaimIds.length)
    for (const claim of approvedClaims) assert.equal(getApprovedClaim(claim.id), claim)
    assert.equal(getApprovedClaim("plus-de-300-formations"), undefined)
  })

  test("chaque claim garde sa provenance approuvée, son owner, sa portée légale, ses canaux et audiences", () => {
    for (const claim of approvedClaims) {
      assert.deepEqual(claim.provenance, provenanceOf("chiffres-cles"))
      assert.equal(claim.provenance.status, "approved")
      assert.equal(claim.provenance.owner, "direction marketing")
      assert.equal(claim.provenance.legalScope, true)
      assert.deepEqual([...claim.channels], ["tous"])
      assert.deepEqual([...claim.audiences], ["tous"])
    }
  })

  test("aucune disclaimerId (le document n'en exige pas) ; validation humaine seulement si le document l'exige", () => {
    for (const claim of approvedClaims) {
      assert.ok(!("disclaimerId" in claim), claim.id)
      assert.equal(claim.requiresHumanApproval, false, claim.id)
    }
    assert.match(body(chiffresCles), /doit être validée par la direction marketing avant diffusion/)
    assert.match(getApprovedClaim("financement-dispositifs")!.note!, /règles 07 à 12 \(en revue\)/)
  })
})

describe("claims approuvées : rien de non approuvé n'entre dans le catalogue", () => {
  test("toute claim vient d'un document approuvé, et ce document est 15-chiffres-cles", () => {
    for (const claim of approvedClaims) assert.ok(isApproved(claim.provenance) && claim.provenance.documentId === "chiffres-cles")
    const sources = new Set(approvedClaims.map((claim) => claim.provenance.documentId))
    assert.deepEqual([...sources], ["chiffres-cles"])
    // Les deux autres documents approuvés ne sont pas des documents de données : disclaimers et avis juridique.
    assert.deepEqual(
      brandDocumentIds.filter((id) => provenanceOf(id).status === "approved" && !sources.has(id)).sort(),
      ["disclaimers-recap", "legal-decret-influence"]
    )
  })

  test("les chiffres des documents en revue ou brouillon (Audirep, salaires, tarifs, signature) ne sont pas des claims approuvées", () => {
    const audirep = readCorpus(provenanceOf("chiffres-performance").path)
    const inReview = [...audirep.matchAll(/valeur: "([^"]+)"/g)].map((match) => match[1]!)
    assert.deepEqual(inReview, ["9/10", "96%", "93%", "82%", "+10 000"])
    const all = approvedClaims.map((claim) => claim.statement).join(" | ")
    for (const value of inReview) assert.ok(!all.includes(value), value)
    for (const text of ["102,23", "72 €/mois", "51 €/mois", "100 % en ligne", "100% en ligne", "-30", "Talent.com", "Audirep", "2309"]) assert.ok(!all.includes(text), text)
    assert.equal(provenanceOf("chiffres-performance").status, "in-review")
    assert.equal(provenanceOf("identite-marque").status, "draft")
  })

  test("les anciennes valeurs de test (« Plus de 300 formations », « plus de 59 000 apprenants ») ne sont pas des claims approuvées", () => {
    const statements = approvedClaims.map((claim) => claim.statement)
    assert.ok(!statements.some((statement) => /\b300\b/.test(statement)))
    assert.ok(!statements.includes("Plus de 300 formations sont proposées."))
    assert.ok(!statements.includes("Studi accompagne plus de 59 000 apprenants."))
    assert.ok(!statements.includes("Les formations Studi sont accessibles 100 % en ligne."))
    // La valeur approuvée est 400 ; 59 000 s'écrit « en cours de formation », sans « plus de ».
    assert.ok(statements.includes("Plus de 400 formations, du CAP au Bac+5, dans 18 filières"))
    assert.ok(!statements.some((statement) => /plus de 59 000/i.test(statement)))
  })

  test("le type interdit une provenance non approuvée", () => {
    // @ts-expect-error une claim ne peut pas avoir une provenance « en revue »
    const bad: (typeof approvedClaims)[number]["provenance"] = provenanceOf("lexique-marque")
    assert.equal(bad.status, "in-review")
    assert.ok(!approvedClaims.some((claim) => claim.provenance.status !== "approved"))
  })
})

describe("claims approuvées : projection d'affichage contrôlée (valeur / libellé)", () => {
  const displayed = approvedClaims.filter((claim) => "displayValue" in claim)

  test("quatre claims chiffrées ont une projection ; les deux autres n'en ont pas", () => {
    assert.deepEqual(displayed.map((claim) => claim.id), ["apprenants-en-formation", "catalogue-formations", "formateurs-conseillers", "formations-alternance"])
    for (const id of ["partenaires-academiques", "financement-dispositifs"]) {
      assert.equal(getClaimDisplay(id), undefined, id)
      assert.ok(!("displayValue" in getApprovedClaim(id)!) && !("displayLabel" in getApprovedClaim(id)!), id)
    }
  })

  test("valeur + libellé redonnent la formulation canonique au caractère près ; la valeur et le libellé en sont des morceaux", () => {
    for (const claim of displayed) {
      const projection = getClaimDisplay(claim.id)!
      assert.equal(`${projection.value} ${projection.label}`, claim.statement, claim.id)
      assert.equal(projection.statement, claim.statement, "le statement canonique reste la référence")
      assert.ok(claim.statement.startsWith(projection.value) && claim.statement.endsWith(projection.label), claim.id)
      assert.match(projection.value, /\d/, "une valeur chiffrée")
      assert.ok(projection.value.length > 0 && projection.label.length > 0)
    }
  })

  test("la projection garde la provenance approuvée de la claim, et aucun chiffre n'y est ajouté", () => {
    for (const claim of displayed) {
      assert.equal(claim.provenance.status, "approved")
      assert.equal(claim.provenance.documentId, "chiffres-cles")
      const digits = (value: string) => (value.match(/\d+/g) ?? []).join()
      assert.equal(digits(`${claim.displayValue} ${claim.displayLabel}`), digits(claim.statement), claim.id)
    }
    assert.equal(getClaimDisplay("plus-de-300-formations"), undefined)
    assert.equal(getClaimDisplay("financement-dispositifs"), undefined, "aucune projection pour le financement")
  })
})
