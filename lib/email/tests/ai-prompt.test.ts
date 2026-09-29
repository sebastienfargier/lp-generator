/**
 * Prompt de génération et validation de la réponse, sans réseau : requête
 * stricte, prompt déterministe, schéma de sortie dérivé de Zod, seconde
 * couche de contrôle avant renderEmail.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  buildEmailAiPrompt,
  buildEmailOutputJsonSchema,
  buildEmailOutputSchema,
  emailSystemPrompt,
  validateGeneratedEmail,
} from "../ai-prompt"
import { emailDisclaimers } from "../disclaimers"
import { safeParseEmailGenerationRequest } from "../generation-request"
import { renderEmail } from "../renderer"
import { EmailConfigSchema } from "../schemas"
import { getEmailSectionCatalogForPrompt } from "../section-catalog"
import { scenarios } from "./scenarios"

type Ready = Extract<ReturnType<typeof buildEmailAiPrompt>, { status: "ready" }>
const ready = (request: unknown): Ready => {
  const prompt = buildEmailAiPrompt(request)
  assert.equal(prompt.status, "ready", JSON.stringify(prompt))
  return prompt as Ready
}
const prompts = Object.fromEntries(Object.entries(scenarios).map(([name, request]) => [name, ready(request)]))

/** Réponse modèle simulée, valide pour le scénario reconversion. */
function simulatedOutput(prompt: Ready) {
  const link = prompt.context.links.find((candidate) => candidate.id === "metiers")!.url
  const footer = (id: string) => prompt.context.links.find((candidate) => candidate.id === id)!.url
  return {
    version: 1,
    id: "reconversion-professionnelle",
    name: "Reconversion professionnelle",
    subject: "Et si c'était le bon moment pour changer de métier ?",
    preheader: "Trois étapes pour clarifier votre projet et découvrir les métiers qui vous attirent",
    blocks: [
      { id: "header", type: "email-module-header-newsletter", slots: {} },
      { id: "hero", type: "email-module-hero-diagnostic-quiz", surface: "marque", slots: { "sous-titre": { text: "Reconversion" }, "titre-principal": { text: "Changer de métier, étape par étape" }, "texte-descriptif": { text: "Faites le point à votre rythme." }, "cta-1": { label: "Découvrir les métiers", href: link } } },
      { id: "cloture", type: "email-module-text-only", slots: { "titre-section": { text: "Avancez à votre rythme" }, "texte-descriptif": { text: "Une formation en ligne peut s'organiser autour de votre agenda." } } },
      { id: "footer", type: "email-module-footer-compact-legal", slots: { "lien-1": { label: "Catalogue Studi", href: footer("catalogue-formations") }, "lien-2": { label: "Catalogue Alternance", href: footer("alternance") }, "lien-3": { label: "Magazine Trajectoire", href: footer("trajectoire-magazine") } } },
    ],
  }
}

describe("requête de génération", () => {
  test("stricte : clé inconnue, objectif ou type inconnus refusés", () => {
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.reconversion, html: "<b>x</b>" }).success, false)
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.reconversion, objective: "promo" }).success, false)
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.reconversion, emailType: "flash" }).success, false)
  })

  test("faits validés : disclaimer du catalogue, code en capitales, date réelle, 3 compteurs", () => {
    const offer = scenarios.promo!.offer!
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.promo, offer: { ...offer, disclaimer: "garantie" } }).success, false)
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.promo, offer: { ...offer, code: "rentree" } }).success, false)
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.promo, offer: { ...offer, endDate: "2026-02-30" } }).success, false)
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.promo, offer: { ...offer, countdown: offer.countdown!.slice(0, 2) } }).success, false)
    const noDate = safeParseEmailGenerationRequest({ ...scenarios.promo, offer: { ...offer, endDate: undefined, countdown: undefined } })
    assert.equal(noDate.success, false, "l'offre promotionnelle exige sa date de fin")
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.reconversion, facts: [{ statement: "59 000 apprenants" }] }).success, true)
  })

  test("visuels : HTTPS uniquement, jamais un chemin local", () => {
    for (const src of ["/images/hero-bilan.jpg", "/logos/logo_studi_sombre_lowres.png", "/icones/star.png", "http://cdn.studi.com/v.jpg"]) {
      assert.equal(safeParseEmailGenerationRequest({ ...scenarios.reconversion, visuals: [{ src, alt: "" }] }).success, false, src)
    }
    assert.equal(safeParseEmailGenerationRequest({ ...scenarios.reconversion, visuals: [{ src: "https://cdn.studi.com/v.jpg", alt: "" }] }).success, true)
  })

  test("requête invalide : diagnostic, pas de prompt", () => {
    const prompt = buildEmailAiPrompt({ ...scenarios.reconversion, brief: "" })
    assert.equal(prompt.status, "invalid-request")
  })
})

describe("prompt", () => {
  test("déterministe et sérialisable", () => {
    for (const [name, request] of Object.entries(scenarios)) {
      const again = ready(request)
      assert.equal(JSON.stringify(again), JSON.stringify(prompts[name]), name)
      assert.deepEqual(JSON.parse(prompts[name]!.user), { request, context: prompts[name]!.context })
    }
  })

  test("aucun HTML de template, CSS ni classe ; aucun texte juridique", () => {
    for (const prompt of Object.values(prompts)) {
      const all = prompt.system + prompt.user
      assert.ok(!/<table|<td|<img|<!DOCTYPE|data-slot/i.test(all))
      assert.ok(!/className|class=|style=|#[0-9a-f]{6}\b/i.test(all))
      for (const { text } of Object.values(emailDisclaimers)) assert.ok(!all.includes(text.slice(0, 40)))
    }
  })

  test("aucun fait commercial ajouté par l'assembleur", () => {
    for (const [name, prompt] of Object.entries(prompts)) {
      const figures = (text: string) => text.match(/\d+\s?(?:%|€)/g) ?? []
      // Tout pourcentage ou montant du message vient de la requête, ou du
      // texte statique du catalogue (ex. « financement jusqu'à 100 % » dans
      // les cas qui appellent un disclaimer) : jamais de l'assembleur.
      const sources = JSON.stringify(scenarios[name]) + JSON.stringify(getEmailSectionCatalogForPrompt())
      for (const figure of figures(prompt.user)) assert.ok(sources.includes(figure), `${name} : ${figure}`)
      assert.deepEqual(figures(emailSystemPrompt), [])
    }
  })

  test("schéma de sortie dérivé de Zod, limité aux lames candidates", () => {
    for (const prompt of Object.values(prompts)) {
      const schema = JSON.stringify(prompt.outputSchema)
      const inSchema = [...schema.matchAll(/"const":"(email-[a-z0-9-]+)"/g)].map((match) => match[1]).sort()
      assert.deepEqual(inSchema, prompt.context.sections.map((section) => section.type).sort())
      assert.ok(schema.includes('"additionalProperties":false'))
    }
    // Même construction que le contrat : les clés racine sont celles d'EmailConfig.
    assert.deepEqual(Object.keys(buildEmailOutputSchema(["email-module-footer-compact-legal"]).shape), Object.keys(EmailConfigSchema.shape))
    assert.throws(() => buildEmailOutputJsonSchema([]))
  })

  test("composition impossible : diagnostic explicite", () => {
    const prompt = buildEmailAiPrompt({ ...scenarios.promo, offer: { ...scenarios.promo!.offer!, countdown: undefined } })
    assert.equal(prompt.status, "impossible")
    if (prompt.status === "impossible") assert.match(prompt.reasons.join(" "), /Aucun hero/)
  })
})

describe("validation de la réponse", () => {
  const prompt = prompts.reconversion!

  test("réponse conforme → EmailConfig → renderEmail", () => {
    const result = validateGeneratedEmail(simulatedOutput(prompt), prompt)
    assert.equal(result.status, "valid", JSON.stringify(result))
    if (result.status === "valid") assert.ok(renderEmail(result.config).startsWith("<!DOCTYPE html>"))
  })

  test("Zod reste l'autorité : réponse non conforme refusée", () => {
    const output = simulatedOutput(prompt)
    assert.equal(validateGeneratedEmail({ ...output, blocks: output.blocks.slice(0, 2) }, prompt).status, "invalid")
    assert.equal(validateGeneratedEmail("```json {}```", prompt).status, "invalid")
  })

  test("lien inventé, lame hors candidates, visuel non fourni : refusés", () => {
    const output = simulatedOutput(prompt)
    const hero = output.blocks[1]!
    const invented = { ...output, blocks: [output.blocks[0], { ...hero, slots: { ...hero.slots, "cta-1": { label: "Go", href: "https://www.studi.com/fr/inventee" } } }, ...output.blocks.slice(2)] }
    assert.match(JSON.stringify(validateGeneratedEmail(invented, prompt)), /destinations contrôlées/)
    const outsider = { ...output, blocks: [output.blocks[0], { id: "grille", type: "email-module-icons-grid", slots: { "sous-titre": { text: "a" }, "titre-principal": { text: "a" }, "icone-1": { icon: "star" }, "item-1-titre": { text: "a" }, "texte-descriptif-1": { text: "a" }, "icone-2": { icon: "star" }, "item-2-titre": { text: "a" }, "texte-descriptif-2": { text: "a" }, "icone-3": { icon: "star" }, "item-3-titre": { text: "a" }, "texte-descriptif-3": { text: "a" }, "icone-4": { icon: "star" }, "item-4-titre": { text: "a" }, "texte-descriptif-4": { text: "a" } } }, ...output.blocks.slice(1)] }
    assert.match(JSON.stringify(validateGeneratedEmail(outsider, prompt)), /hors des candidates/)
  })

  test("fait recopié différent de la requête : refusé", () => {
    const promo = prompts.promo!
    const link = promo.context.links[0]!.url
    const output = {
      ...simulatedOutput(prompts.reconversion!),
      blocks: [
        { id: "header", type: "email-module-header-seasonal-campaign", slots: { label: { text: "Offre de rentrée" } } },
        { id: "hero", type: "email-module-hero-countdown-variant-02", surface: "encre", slots: { "compteur-1": { text: "03" }, "compteur-2": { text: "12" }, "compteur-3": { text: "99" }, "label-1": { text: "JOURS" }, "label-2": { text: "HEURES" }, "label-3": { text: "MINUTES" }, "titre-principal": { text: "t" }, "texte-descriptif": { text: "t" }, "cta-1": { label: "Profiter", href: link } } },
        { id: "code", type: "email-module-discount-banner-cards", slots: { "sous-titre": { text: "s" }, "titre-principal": { text: "t" }, "texte-descriptif-1": { text: "t" }, "code-promo-1": { text: "PROMO50" }, "texte-descriptif-2": { text: "t" } } },
        { id: "mentions", type: "email-module-legal-disclaimer", slots: { "disclaimer-1": { disclaimer: "offre-promotionnelle", endDate: "2026-12-31" } } },
        simulatedOutput(prompts.reconversion!).blocks[3],
      ],
    }
    const result = JSON.stringify(validateGeneratedEmail(output, promo))
    assert.match(result, /compteur-3/)
    assert.match(result, /code-promo-1/)
    assert.match(result, /endDate/)
  })
})
