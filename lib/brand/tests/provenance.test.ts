/**
 * Provenance et autorité : le registre reprend le front matter réel des 20
 * documents, les trois statuts du corpus sont fermés, et rien n'est promu.
 */
import assert from "node:assert/strict"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { approvedProvenanceOf, brandDocumentIds, brandStatuses, isApproved, provenanceOf, scopeOf } from "../index"
import { body, guidelinesDir, parseFrontMatter, readCorpus, root } from "./corpus"

const files = readdirSync(join(root, guidelinesDir)).filter((name) => name.endsWith(".md")).sort()

const statusOf: Record<string, string> = { approuve: "approved", en_revue: "in-review", brouillon: "draft" }

describe("provenance : le registre suit le corpus", () => {
  test("trois statuts fermés, ceux du corpus", () => {
    assert.deepEqual([...brandStatuses], ["approved", "in-review", "draft"])
  })

  test("un document du registre par fichier de ressources/brand/guidelines, et seulement ceux-là", () => {
    assert.equal(files.length, 20)
    assert.deepEqual(brandDocumentIds.map((id) => provenanceOf(id).path.split("/").pop()).sort(), files)
  })

  test("pour chaque document : id, statut, owner, portée légale, dernière revue, canaux et audiences identiques au front matter", () => {
    for (const id of brandDocumentIds) {
      const provenance = provenanceOf(id)
      const markdown = readCorpus(provenance.path)
      const front = parseFrontMatter(markdown)
      assert.equal(front.id, id, provenance.path)
      assert.equal(provenance.documentId, front.id)
      assert.equal(provenance.status, statusOf[front.statut], `${id} : statut`)
      assert.equal(provenance.owner, front.owner === "à définir" ? undefined : front.owner, `${id} : owner`)
      assert.equal(provenance.legalScope, front.portee_legale === "True", `${id} : portée légale`)
      assert.equal(provenance.lastReview, front.derniere_revue, `${id} : dernière revue`)
      assert.deepEqual([...scopeOf(id).channels], front.canaux, `${id} : canaux`)
      assert.deepEqual([...scopeOf(id).audiences], front.audiences, `${id} : audiences`)
      assert.ok(body(markdown).length > 100, id)
    }
  })

  test("répartition réelle : 3 approuvés, 13 en revue, 4 brouillons ; aucun statut promu", () => {
    const count = (status: string) => brandDocumentIds.filter((id) => provenanceOf(id).status === status).length
    assert.deepEqual([count("approved"), count("in-review"), count("draft")], [3, 13, 4])
    assert.deepEqual(
      brandDocumentIds.filter((id) => isApproved(provenanceOf(id))).sort(),
      ["chiffres-cles", "disclaimers-recap", "legal-decret-influence"]
    )
  })

  test("le seul chemin vers une donnée approuvée refuse un document en revue ou brouillon", () => {
    for (const id of brandDocumentIds) {
      if (provenanceOf(id).status === "approved") assert.equal(approvedProvenanceOf(id).status, "approved")
      else assert.throws(() => approvedProvenanceOf(id), /ne peut pas fonder une donnée approuvée/, id)
    }
  })

  test("les owners absents restent absents (« à définir » n'est pas un owner) ; les owners réels sont conservés", () => {
    assert.equal(provenanceOf("lexique-marque").owner, undefined)
    assert.equal(provenanceOf("diplomes-certifications").owner, "Aurélie Lasselin")
    assert.equal(provenanceOf("chiffres-cles").owner, "direction marketing")
    assert.match(provenanceOf("offres-bourses").owner!, /Anaig EPIE.*Olivia Matmuller/)
    assert.equal(provenanceOf("chiffres-cles").legalScope, true)
    assert.equal(provenanceOf("identite-marque").legalScope, false)
  })
})
