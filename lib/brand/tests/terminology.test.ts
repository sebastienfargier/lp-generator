import assert from "node:assert/strict"
import { describe, test } from "node:test"

import * as brand from "../index"
import { brandKnownConflicts, brandTerminologyRules, foldBrandText, lintBrandText, provenanceOf } from "../index"
import { body, parseForbiddenWords, readCorpus } from "./corpus"

const lexique = readCorpus(provenanceOf("lexique-marque").path)
const forbidden = parseForbiddenWords(lexique)
const ids = (text: string) => lintBrandText(text).map((finding) => finding.ruleId)

describe("terminologie : les règles viennent du lexique", () => {
  test("le lexique source compte 25 mots interdits, tous couverts par une règle", () => {
    assert.equal(forbidden.length, 25)
    const covered = new Set<string>(brandTerminologyRules.flatMap((rule) => ("corpusEntry" in rule ? [rule.corpusEntry] : [])))
    for (const entry of forbidden) assert.ok(covered.has(entry.forbidden), `non couvert : ${entry.forbidden}`)
    assert.ok(brandTerminologyRules.length >= 25)
  })

  test("chaque règle sourcée du lexique garde l'alternative du document, mot pour mot", () => {
    for (const rule of brandTerminologyRules) {
      if (!("corpusEntry" in rule)) continue
      const entry = forbidden.find((candidate) => candidate.forbidden === rule.corpusEntry)
      assert.ok(entry, rule.id)
      assert.equal(("alternative" in rule ? rule.alternative : undefined), entry.alternative, rule.id)
    }
  })

  test("les règles hors lexique citent leur propre document, et leur alternative y figure", () => {
    for (const rule of brandTerminologyRules) {
      if ("corpusEntry" in rule) continue
      const source = body(readCorpus(provenanceOf(rule.documentId).path))
      assert.notEqual(rule.documentId, "lexique-marque", rule.id)
      if ("alternative" in rule) assert.ok(source.includes(rule.alternative), `${rule.id} : alternative absente de ${rule.documentId}`)
    }
  })

  test("identifiants uniques ; gravités fermées ; provenance toujours en revue ou brouillon, jamais approuvée", () => {
    assert.equal(new Set(brandTerminologyRules.map((rule) => rule.id)).size, brandTerminologyRules.length)
    for (const rule of brandTerminologyRules) {
      assert.ok(rule.severity === "error" || rule.severity === "warning", rule.id)
      assert.notEqual(provenanceOf(rule.documentId).status, "approved", rule.id)
    }
  })
})

describe("terminologie : détection", () => {
  const cases: [string, string[]][] = [
    ["Un diplôme garanti pour tous", ["diplome-garanti"]],
    ["Votre réussite assurée, avec un emploi garanti", ["reussite-assuree", "emploi-garanti"]],
    ["Un job assuré dès la fin de la formation", ["emploi-garanti"]],
    ["Succès garanti et embauche garantie", ["succes-garanti", "embauche-garantie"]],
    ["Le salaire garanti et un débouché garanti", ["salaire-garanti", "debouche-garanti"]],
    ["Un résultat garanti", ["garanti"]],
    ["Formation gratuite pour les demandeurs d'emploi", ["gratuit"]],
    ["À partir de 0 € avec votre CPF", ["zero-euro"]],
    ["Formez-vous sans rien payer", ["zero-euro"]],
    ["Formation 100% financée", ["finance-a-100"]],
    ["Votre projet financé à 100 %", ["finance-a-100"]],
    ["Une formation prise en charge par l'État", ["pris-en-charge-etat"]],
    ["Une formation reconnue par l'État", ["formation-reconnue-etat"]],
    ["Un diplôme certifié par l'État", ["certifie-par-etat"]],
    ["Une certification RNCP de niveau 6", ["certification-rncp"]],
    ["Un niveau Master en ligne", ["master"]],
    ["Un accompagnement sur-mesure", ["sur-mesure"]],
    ["Votre coach personnel vous suit", ["coach-mentor-dedie"]],
    ["Un suivi personnalisé 100%", ["suivi-personnalise"]],
    ["Apprenez sans effort et devenez immédiatement opérationnel", ["sans-effort", "immediatement-operationnel"]],
    ["Un métier mieux payé", ["mieux-paye"]],
    ["Découvrez notre promotion de rentrée", ["promotion-reduction"]],
    ["Chaque user progresse", ["user-apprenant"]],
    ["Vous devez vous inscrire", ["injonction"]],
    ["Une reconversion facile et rapide", ["facile-rapide", "facile-rapide"]],
  ]

  for (const [text, expected] of cases) {
    test(`« ${text} » → ${expected.join(", ")}`, () => assert.deepEqual(ids(text), expected))
  }

  test("insensible à la casse, aux accents, aux apostrophes typographiques et aux espaces insécables", () => {
    assert.deepEqual(ids("FORMATION GRATUITE"), ["gratuit"])
    assert.deepEqual(ids("EMPLOI GARANTI"), ["emploi-garanti"])
    assert.deepEqual(ids("réussite assurée"), ["reussite-assuree"])
    assert.deepEqual(ids("Formation reconnue par l’État"), ["formation-reconnue-etat"])
    assert.deepEqual(ids("Financé à 100 %"), ["finance-a-100"])
    assert.deepEqual(ids("Sans effort"), ["sans-effort"])
    assert.equal(foldBrandText("Éléphant œuf İ").length, "Éléphant œuf İ".length)
  })

  test("les alertes citent le texte d'origine, à leur position, avec gravité, alternative du corpus et provenance", () => {
    const text = "Notre emploi garanti et la formation GRATUITE"
    const findings = lintBrandText(text)
    assert.equal(findings.length, 2)
    for (const finding of findings) assert.equal(text.slice(finding.index, finding.index + finding.match.length), finding.match)
    assert.deepEqual(findings.map((finding) => finding.match), ["emploi garanti", "GRATUITE"])
    const [job, free] = findings as [(typeof findings)[number], (typeof findings)[number]]
    assert.deepEqual([job.severity, job.alternative], ["error", "favorise l'employabilité"])
    assert.deepEqual([free.severity, free.alternative], ["error", "finançable / jusqu'à 100%*"])
    for (const finding of findings) {
      assert.equal(finding.provenance.documentId, "lexique-marque")
      assert.equal(finding.provenance.status, "in-review")
      assert.equal(finding.provenance.legalScope, true)
    }
    assert.ok(findings[0]!.index < findings[1]!.index)
  })

  test("une règle sans alternative dans le corpus n'en invente pas ; la provenance brouillon est conservée", () => {
    const [finding] = lintBrandText("Vous devez vous inscrire")
    assert.ok(finding && !("alternative" in finding))
    assert.equal(finding.provenance.status, "draft")
    assert.equal(finding.provenance.documentId, "identite-marque")
    const [accompagnement] = lintBrandText("Un accompagnement personnalisé")
    assert.equal(accompagnement?.ruleId, "accompagnement-personnalise")
    assert.ok(accompagnement && !("alternative" in accompagnement))
  })

  test("la règle spécifique l'emporte sur la générale sans doublon", () => {
    assert.deepEqual(ids("emploi garanti"), ["emploi-garanti"])
    assert.deepEqual(ids("Le diplôme garanti ou remboursé"), ["diplome-garanti"])
    assert.equal(lintBrandText("Garanti garanti").length, 2)
  })

  test("le lint ne modifie jamais le texte et ne corrige rien : aucune fonction de réécriture n'est exportée", () => {
    const text = "Formation gratuite"
    lintBrandText(text)
    assert.equal(text, "Formation gratuite")
    assert.ok(!Object.keys(brand).some((name) => /fix|correct|rewrite|replace|sanitize/i.test(name)))
  })
})

describe("terminologie : formulations admises par le corpus, sans fausse alerte", () => {
  const allowed = [
    "Peut vous aider à évoluer",
    "Favorise l'employabilité",
    "Vous prépare à l'obtention du diplôme",
    "Préparation à un diplôme reconnu par l'État",
    "Diplôme reconnu par l'État",
    "Titre RNCP de niveau 7",
    "Certification professionnelle de niveau 6",
    "Mastère ou MBA",
    "Financé jusqu'à 100%*",
    "Formation jusqu'à 100% financée*",
    "Jusqu'à 100 % financé*",
    "Finançable avec votre CPF",
    "Éligible CPF",
    "Finançable par France Travail",
    "Accompagnement vers la réussite",
    "Accompagnement individualisé",
    "Équipe pédagogique et suivi pédagogique",
    "Garantie Diplômé ou Remboursé*",
    "la garantie Diplômé ou Remboursé* (soumis à conditions)",
    "À votre rythme, accessible et progressif",
    "Coaching carrière",
    "À partir de 100 € par mois",
    "Plus de 400 formations, du CAP au Bac+5, dans 18 filières",
    "59 000 apprenants en cours de formation",
    "Sous réserve d'acceptation. Vous disposez d'un délai de rétractation.",
  ]
  for (const text of allowed) test(`« ${text} »`, () => assert.deepEqual(lintBrandText(text), []))

  test("les formulations « à utiliser » du tableau du lexique ne déclenchent aucune alerte", () => {
    const table = /## Formulations conformes — promesses\n([\s\S]*)$/.exec(lexique)?.[1] ?? ""
    const used = [...table.matchAll(/^\| [^|]+ \| ([^|]+) \| [^|]+ \|$/gm)].map((match) => match[1]!).filter((cell) => !/^-+$/.test(cell.trim()) && !/À utiliser/.test(cell))
    assert.ok(used.length >= 5)
    for (const cell of used) assert.deepEqual(lintBrandText(cell), [], cell)
  })
})

describe("terminologie : le conflit connu « facilement »", () => {
  const conflict = brandKnownConflicts[0]

  test("il est représenté, non résolu, avec ses sources de part et d'autre", () => {
    assert.equal(brandKnownConflicts.length, 1)
    assert.equal(conflict.id, "facilement")
    assert.equal(conflict.status, "unresolved")
    assert.deepEqual(conflict.forbids.map((entry) => entry.documentId), ["lexique-marque", "promesse-editoriale"])
    assert.equal(conflict.mandates.documentId, "financement-personnel")
    assert.deepEqual([...conflict.affectedRuleIds], ["facile-rapide"])
    for (const source of [...conflict.forbids, conflict.mandates]) {
      assert.ok(readCorpus(provenanceOf(source.documentId).path).includes(source.quote), `${source.documentId} : citation absente du document`)
      assert.notEqual(provenanceOf(source.documentId).status, "approved", "les trois documents du conflit sont en revue")
    }
  })

  test("l'expression imposée par 10 est repérée par la règle générale ET marquée « conflit connu », sans correction ni tri", () => {
    const text = "Financez votre formation facilement en plusieurs fois sans frais*"
    const findings = lintBrandText(text)
    assert.equal(findings.length, 1)
    const [finding] = findings
    assert.equal(finding!.ruleId, "facile-rapide")
    assert.equal(finding!.match, "facilement")
    assert.equal(finding!.conflictId, "facilement")
    assert.equal(finding!.severity, "warning")
    assert.equal(finding!.alternative, "accessible / à votre rythme")
    assert.equal(finding!.provenance.documentId, "lexique-marque")
  })

  test("hors de l'expression imposée, « facilement » reste une simple alerte, sans conflit", () => {
    for (const text of ["Réussissez facilement votre reconversion", "Une formation facile", "Financez facilement votre formation", "Rapidement opérationnel"]) {
      const findings = lintBrandText(text)
      assert.ok(findings.length >= 1, text)
      assert.ok(findings.every((finding) => !("conflictId" in finding)), text)
    }
    // Une autre partie du même texte reste signalée à part de l'expression imposée.
    const mixed = lintBrandText("Financez votre formation facilement en plusieurs fois sans frais*. Un parcours rapide.")
    assert.deepEqual(mixed.map((finding) => finding.conflictId), ["facilement", undefined])
  })

  test("la règle commune et l'expression imposée sont documentées dans le code, et le corpus n'est pas modifié", () => {
    const rule = brandTerminologyRules.find((entry) => entry.id === "facile-rapide")!
    assert.match(rule.note, /Conflit connu/)
    assert.match(rule.note, /brandKnownConflicts/)
    assert.match(body(readCorpus(provenanceOf("financement-personnel").path)), /Financez votre formation facilement en plusieurs fois sans frais/)
    assert.match(lexique, /mot_interdit: "facile \/ rapide"/)
  })
})
