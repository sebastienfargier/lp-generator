/**
 * Cohérence seulement : `lib/email/disclaimers.ts` reste la source opérationnelle
 * de l'Email. Ce test vérifie qu'il ne diverge pas, en silence, du récapitulatif
 * approuvé (`19-disclaimers-recap`). Rien n'est remplacé ni relié.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { emailDisclaimers, type EmailDisclaimerId } from "../../email/disclaimers"
import { provenanceOf } from "../index"
import { body, readCorpus } from "./corpus"

/** Correspondance explicite entre le contexte du récapitulatif et l'identifiant Email : aucune heuristique. */
const mapping = {
  "Financement jusqu'à 100 % (général)": { id: "financement-100-general", source: "financement-general" },
  "Financement CPF jusqu'à 100 %": { id: "financement-cpf-100", source: "financement-cpf" },
  "Financement appel d'offre": { id: "financement-appel-offre", source: "financement-appel-offre" },
  "Financement personnel": { id: "financement-personnel", source: "financement-personnel" },
  "Bourse d'études jusqu'à -30 %": { id: "bourse-etudes-30", source: "offres-bourses" },
  "Offre promotionnelle": { id: "offre-promotionnelle", source: "offres-bourses" },
  "Diplômé ou Remboursé": { id: "diplome-ou-rembourse", source: "diplomes-certifications" },
  "Salaires par métier": { id: "salaires-metier", source: "salaires" },
  "Chiffres de performance": { id: "chiffres-performance", source: "chiffres-performance" },
} as const satisfies Record<string, { id: EmailDisclaimerId; source: Parameters<typeof provenanceOf>[0] }>

const norm = (text: string) => text.replace(/\s+/g, " ").replace(/^\*+/, "").replace(/\*+$/, "").trim()

const recap = body(readCorpus(provenanceOf("disclaimers-recap").path))
const rows = [...recap.matchAll(/^\| ([^|]+) \| \*(.+)\* \|$/gm)].map((match) => ({ context: match[1]!.trim(), text: match[2]!.trim() }))

describe("disclaimers : le récapitulatif approuvé et lib/email/disclaimers.ts", () => {
  test("le récapitulatif est approuvé et compte neuf lignes, comme les neuf disclaimers Email", () => {
    assert.equal(provenanceOf("disclaimers-recap").status, "approved")
    assert.equal(rows.length, 9)
    assert.equal(Object.keys(emailDisclaimers).length, 9)
  })

  test("le mapping explicite couvre les 9 contextes du récapitulatif et les 9 identifiants Email, un pour un", () => {
    assert.deepEqual(rows.map((row) => row.context), Object.keys(mapping))
    assert.deepEqual(Object.values(mapping).map((entry) => entry.id).sort(), Object.keys(emailDisclaimers).sort())
    assert.equal(new Set(Object.values(mapping).map((entry) => entry.id)).size, 9)
  })

  test("9/9 : le texte Email est identique, au caractère près, à celui du récapitulatif (espaces normalisés, astérisque d'appel retiré)", () => {
    for (const row of rows) {
      const entry = mapping[row.context as keyof typeof mapping]
      assert.ok(entry, row.context)
      assert.equal(norm(emailDisclaimers[entry.id].text), norm(row.text), `${entry.id} diverge du récapitulatif`)
    }
  })

  test("le paramètre de date n'existe que pour l'offre promotionnelle, comme le récapitulatif (JJ/MM/AAAA)", () => {
    for (const row of rows) {
      const entry = mapping[row.context as keyof typeof mapping]
      const disclaimer = emailDisclaimers[entry.id] as { parameter?: string }
      assert.equal(row.text.includes("JJ/MM/AAAA"), disclaimer.parameter === "endDate", entry.id)
    }
  })

  test("chaque texte Email figure aussi dans son document source ; le financement personnel y a trois variantes", () => {
    for (const entry of Object.values(mapping)) {
      const source = norm(body(readCorpus(provenanceOf(entry.source).path)))
      assert.ok(source.includes(norm(emailDisclaimers[entry.id].text)), `${entry.id} absent de ${entry.source}`)
    }
    // 10 décrit trois cas (sans tarif, sans promotion, avec promotion -30 %). Le récapitulatif approuvé et l'Email
    // retiennent le tronc commun « Sous réserve d'acceptation… Voir les conditions. » ; le cas « sans tarif » ajoute
    // « (lien vers studi.com/fr/financement/financement-personnel) », et les deux autres un préfixe de calcul du tarif.
    const personal = norm(body(readCorpus(provenanceOf("financement-personnel").path)))
    assert.ok(personal.includes("Voir les conditions (lien vers"))
    assert.equal((personal.match(/Sous réserve d'acceptation\. Vous disposez d'un délai de rétractation\./g) ?? []).length, 3)
  })
})
