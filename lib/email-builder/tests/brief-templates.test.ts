/**
 * Option B, L1 — modèles recommandés d'après l'intention du brief HCC : correspondance déterministe vers les modèles
 * Studi EXISTANTS, structures différentes entre une promotion et une newsletter, aucune fausse offre possible.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { catalogForBrief } from "../assistant-engine"
import { intentionTemplates, recommendTemplates } from "../brief-templates"
import { builderLames } from "../catalog"
import { compositionCatalog } from "../composition"
import { buildDemoDocument } from "../demo-document"
import { createBlankDocument } from "../document"
import { createShell, shellReducer } from "../shell-state"
import { builderTemplates } from "../templates"
import { emailBlockManifest } from "../../email/manifest"
import { briefIntentions, type BriefIntention, type EditorialBriefV1 } from "../../hcc/brief"

const templates = builderTemplates()
const i = (texte: string) => ({ texte, statut: "acquis" as const })
const brief = (valeur: BriefIntention): EditorialBriefV1 => ({
  schema: "editorial-brief", version: 1, briefId: "s1:C1", briefVersion: 1, valideLe: "2026-10-12T12:00:00.000Z", productionId: "ast_1",
  priseDeParole: { nom: "P" }, contenu: { id: "C1", titre: "T", format: "email", canal: "Email" }, intention: { valeur, justification: "Parce que." },
  objectif: i("o"), audience: i("a"), angle: i("an"), promesse: i("p"), messages: { principal: i("m"), secondaires: [] }, tonalite: i("t"), cta: i("c"),
  preuves: [], contraintes: [], criteresReussite: [], specificites: [], structure: [{ partie: "x", contenu: "y" }], aConfirmer: [],
})
const sequence = (id: string) => templates.find((t) => t.id === id)!.document.config.blocks.map((b) => b.type)
const OFFER_BLOCKS = ["email-module-hero-offer-image-top", "email-module-discount-banner-full", "email-module-banner-full", "email-module-discount-banner-cards"]
const hasOfferSlot = (type: string) => Object.keys((emailBlockManifest as Record<string, { slots: Record<string, unknown> }>)[type]?.slots ?? {}).some((slot) => /^(valeur-cle|code-promo-\d+)$/.test(slot))

describe("L1 — recommandation de modèles selon l'intention du brief", () => {
  test("chaque intention recommande DEUX modèles existants, avec une raison ; déterministe ; sans brief : aucune", () => {
    for (const intention of briefIntentions) {
      const r = recommendTemplates(brief(intention), templates)!
      assert.equal(r.templates.length, 2, intention)
      assert.ok(r.templates.every(({ template, reason }) => templates.includes(template) && reason.length > 20), intention)
      assert.deepEqual(recommendTemplates(brief(intention), templates)!.templates.map((t) => t.template.id), r.templates.map((t) => t.template.id))
      assert.equal(r.justification, "Parce que.")
    }
    assert.equal(recommendTemplates(null, templates), null)
    assert.ok(Object.values(intentionTemplates).flat().every(({ id }) => templates.some((t) => t.id === id)), "aucun modèle inventé")
  })
  test("promotion et newsletter : modèles différents, et structures (lames) différentes", () => {
    const promo = recommendTemplates(brief("promotionnel"), templates)!.templates.map((t) => t.template.id)
    const news = recommendTemplates(brief("editorial"), templates)!.templates.map((t) => t.template.id)
    assert.deepEqual([promo, news], [["R1-A", "R3-B"], ["R2-A", "R2-B"]])
    assert.equal(promo.filter((id) => news.includes(id)).length, 0)
    assert.notDeepEqual(sequence(promo[0]!), sequence(news[0]!))
    assert.ok(sequence(news[0]!).includes("email-module-preheader") && !sequence(promo[0]!).includes("email-module-preheader"))
    assert.ok(sequence(promo[0]!).includes("email-module-hero-promotional-image-large") && sequence(news[0]!).includes("email-hero-newsletter-variant-02"))
  })
  test("aucune fausse promotion : aucun modèle recommandé ne contient de bloc d'offre (valeur, code)", () => {
    for (const { id } of Object.values(intentionTemplates).flat()) assert.ok(!sequence(id).some((type) => OFFER_BLOCKS.includes(type)), id)
  })
  test("assistant avec brief et sans faits d'offre : les lames d'offre sortent du catalogue ; sans brief ou avec faits : inchangé", () => {
    const full = compositionCatalog(builderLames())
    assert.ok(Object.keys(full).some(hasOfferSlot), "le catalogue complet contient des lames d'offre")
    const filtered = catalogForBrief(full, createBlankDocument(), brief("promotionnel"))
    assert.ok(!Object.keys(filtered).some(hasOfferSlot))
    assert.ok(Object.keys(filtered).length > 10)
    assert.equal(catalogForBrief(full, createBlankDocument(), null), full)
    assert.equal(catalogForBrief(full, buildDemoDocument(), brief("promotionnel")), full) // faits d'offre réels présents
    assert.match(readFileSync(join(process.cwd(), "lib/email-builder/assistant-engine.ts"), "utf8"), /catalogForBrief\(input\.catalog \?\? compositionCatalog\(builderLames\(\)\), document, input\.brief\)/)
  })
  test("choisir un modèle recommandé ouvre le Builder depuis l'entrée (ou la liste) ; « choose-template » reste réservé à la liste", () => {
    const template = builderTemplates()[0]!
    const opened = shellReducer(createShell(), { type: "choose-recommended-template", document: template.document })
    assert.deepEqual(opened.screen === "builder" && opened.document, template.document)
    assert.notEqual(opened.screen === "builder" && opened.document, template.document) // copie : le modèle n'est jamais modifié
    assert.equal(shellReducer(createShell(), { type: "choose-template", document: template.document }).screen, "entry")
    const builder = shellReducer(createShell(), { type: "choose-blank" })
    assert.equal(shellReducer(builder, { type: "choose-recommended-template", document: template.document }), builder) // sans effet hors entrée
    assert.match(readFileSync(join(process.cwd(), "components/email-builder/builder-shell.tsx"), "utf8"), /onRecommendedTemplate=\{\(template\) => dispatch\(\{ type: "choose-recommended-template"/)
  })
})
