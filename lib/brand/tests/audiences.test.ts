import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { brandAudienceIds, brandAudiences, getBrandAudience, isBrandAudienceId, provenanceOf } from "../index"
import { body, parseFrontMatter, readCorpus } from "./corpus"

const adaptation = readCorpus(provenanceOf("adaptation-par-cible").path)

describe("audiences : les cinq cibles du corpus", () => {
  test("liste exacte, identifiants stables, identiques à ceux du front matter de 03", () => {
    assert.deepEqual([...brandAudienceIds], ["reconversion", "actifs_en_poste", "alternants", "b2b_rh", "demandeurs_emploi"])
    assert.deepEqual([...brandAudienceIds], parseFrontMatter(adaptation).audiences)
    assert.deepEqual(Object.keys(brandAudiences), [...brandAudienceIds])
    for (const id of brandAudienceIds) assert.equal(getBrandAudience(id).id, id)
    assert.ok(isBrandAudienceId("alternants") && !isBrandAudienceId("tous") && !isBrandAudienceId("entreprises_opco") && !isBrandAudienceId(undefined))
  })

  test("tutoiement pour les seuls alternants, vouvoiement pour les autres", () => {
    for (const id of brandAudienceIds) assert.equal(brandAudiences[id].addressMode, id === "alternants" ? "tutoiement" : "vouvoiement", id)
    assert.match(body(readCorpus(provenanceOf("identite-marque").path)), /Vouvoiement par défaut \(tutoiement uniquement en alternance\)/)
    assert.match(adaptation, /Alternants \| Dynamique, accessible \(tutoiement\)/)
  })

  test("le ton et les points clés reprennent le tableau du document, mot pour mot", () => {
    const rows = [...adaptation.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \| «/gm)].map((match) => ({ target: match[1]!.trim(), tone: match[2]!.trim(), points: match[3]!.trim() }))
    assert.equal(rows.length, 5)
    const norm = (text: string) => text.replace(/\s*\(tutoiement\)/, "").toLowerCase()
    for (const id of brandAudienceIds) {
      const audience = brandAudiences[id]
      const row = rows.find((entry) => norm(entry.tone) === audience.tone.toLowerCase())
      assert.ok(row, `${id} : ton « ${audience.tone} » absent du tableau`)
      assert.equal(audience.keyPoints.join(", ").toLowerCase().replace(/\s+/g, " "), row.points.toLowerCase().replace(/\s+/g, " "), `${id} : points clés`)
    }
  })

  test("la provenance est celle de 03 : brouillon, jamais présentée comme approuvée", () => {
    for (const id of brandAudienceIds) {
      assert.equal(brandAudiences[id].provenance.documentId, "adaptation-par-cible")
      assert.equal(brandAudiences[id].provenance.status, "draft")
    }
  })

  test("guidance compacte : champs courts, aucun exemple de copy à recopier, sensibilités sourcées", () => {
    for (const id of brandAudienceIds) {
      const audience = brandAudiences[id]
      assert.ok(audience.tone.length <= 40 && audience.label.length <= 40, id)
      assert.ok(audience.keyPoints.length >= 3 && audience.keyPoints.length <= 3, id)
      assert.ok(!/«|»/.test(JSON.stringify(audience)), `${id} : pas de phrase d'exemple`)
      if ("sensitivity" in audience) assert.match(audience.sensitivity, /\((?:09|11|12)-[a-z-]+, en revue\)/, id)
    }
    assert.ok(!("sensitivity" in brandAudiences.reconversion) && !("sensitivity" in brandAudiences.actifs_en_poste))
  })
})
