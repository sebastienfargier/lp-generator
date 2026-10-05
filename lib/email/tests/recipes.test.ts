/**
 * Recettes Email V2 (R1 découverte, R2 newsletter, R3 preuves), hors ligne :
 * définitions, composition déterministe d'un EmailConfig, validation de
 * recette, claims approuvées, diagnostic de terminologie, six fixtures rendues
 * par le vrai renderer, et mesures qui empêchent les recettes de devenir des
 * variantes cosmétiques du même email. Le moteur V1 n'est ni modifié ni
 * importé par ce code.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { approvedClaims } from "../../brand/claims"
import { emailDestinationUrl, emailDestinations, type EmailDestinationId } from "../destinations"
import { emailDisclaimers } from "../disclaimers"
import { emailDraftBodyLames, emailDraftHeroBlocks } from "../generation-draft"
import { emailBankPreviews, emailBank, emailBankImageIdFromSrc } from "../image-bank"
import { emailBlockManifest } from "../manifest"
import { toPreviewHtml } from "../preview"
import { emailRecipeFixtures, resolveEmailRecipeFixture } from "../recipe-fixtures"
import {
  composeEmailRecipe,
  emailClaimHighlightSplits,
  emailRecipeDisclaimers,
  resolveRecipeClaim,
  type EmailRecipeComposition,
} from "../recipe-resolver"
import {
  describeEmailRecipeConfig,
  lintEmailRecipeContent,
  validateEmailRecipeConfig,
} from "../recipe-validation"
import { emailIntrinsicDarkLames, emailRecipeIds, emailRecipeLames, emailRecipes } from "../recipes"
import { renderEmail } from "../renderer"
import { safeParseEmailConfig } from "../schemas"
import type { EmailBlock, EmailBlockType, EmailConfig } from "../types"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

type Fixture = (typeof emailRecipeFixtures)[number]
const fixtureById = (id: string) => emailRecipeFixtures.find((fixture) => fixture.id === id)! as Fixture
const composition = (id: string) => fixtureById(id).composition as unknown as EmailRecipeComposition

function resolved(id: string) {
  const result = resolveEmailRecipeFixture(id as Fixture["id"])
  assert.equal(result.status, "resolved", `${id} : ${result.status === "resolved" ? "" : JSON.stringify(result.issues)}`)
  if (result.status !== "resolved") throw new Error(id)
  return result
}

const configs = Object.fromEntries(emailRecipeFixtures.map((fixture) => [fixture.id, resolved(fixture.id).config])) as Record<Fixture["id"], EmailConfig>

const strip = (type: string) => type.replace(/^email-(module-)?/, "")
const content = (id: string) => describeEmailRecipeConfig(configs[id as Fixture["id"]]).content.map((block) => block.type)
const clone = (id: string): EmailConfig => structuredClone(configs[id as Fixture["id"]])
const block = (config: EmailConfig, type: EmailBlockType) => config.blocks.find((candidate) => candidate.type === type)! as unknown as { id: string; surface?: string; slots: Record<string, Record<string, string>> }

/** Codes d'erreur d'une config modifiée, pour la recette donnée. */
const codes = (recipe: (typeof emailRecipeIds)[number], config: EmailConfig) => validateEmailRecipeConfig(recipe, config).map((issue) => issue.code)

/** Ensemble des lames d'une fixture, pour mesurer la ressemblance. */
const lameSet = (id: string) => new Set(content(id))
const jaccard = (a: Set<string>, b: Set<string>) => [...a].filter((value) => b.has(value)).length / new Set([...a, ...b]).size

describe("recettes Email V2 : définitions", () => {
  test("trois recettes, chacune avec ses contraintes de composition (jamais de HTML ni de CSS)", () => {
    assert.deepEqual([...emailRecipeIds], ["discovery-reassurance", "editorial-newsletter", "brand-proof"])
    for (const id of emailRecipeIds) {
      const recipe = emailRecipes[id]
      assert.equal(recipe.id, id)
      assert.ok(recipe.label.length > 5 && recipe.purpose.length > 30, id)
      assert.ok(recipe.contentSections.min >= 3 && recipe.contentSections.max <= 5 && recipe.contentSections.min <= recipe.contentSections.max, id)
      assert.ok(recipe.heroLayouts.length >= 2 && recipe.roles.required.includes("hero"), id)
      assert.ok(recipe.cta.buttons >= 1 && recipe.destinations.length >= 4, id)
      for (const destination of recipe.destinations) assert.ok(destination in emailDestinations, `${id} : ${destination}`)
      assert.ok(recipe.images.intents.length >= 1 && recipe.surface.allowed.includes(recipe.surface.default), id)
      assert.ok(recipe.density.min < recipe.density.max && recipe.claims.min <= recipe.claims.max, id)
      assert.ok(!/<|class=|style=|#[0-9a-f]{6}|px\b/i.test(JSON.stringify(recipe)), `${id} : aucune valeur de rendu`)
    }
  })

  test("R1 : héros humains, étapes et appel final, une zone marque (ou douce), aucun claim, deux boutons vers une destination, aucun lien secondaire", () => {
    const recipe = emailRecipes["discovery-reassurance"]
    assert.deepEqual([...recipe.heroLayouts], ["large", "medium", "split"])
    assert.deepEqual([...recipe.roles.required], ["hero", "steps", "closing"])
    assert.deepEqual([...recipe.images.intents], ["warm-reassurance", "career-movement"])
    assert.deepEqual([...recipe.surface.allowed], ["marque", "accent-2-soft"])
    assert.equal(recipe.claims.min, 0, "aucun claim requis")
    assert.equal(recipe.claims.max, 0)
    assert.deepEqual(recipe.cta, { buttons: 2, secondaryLinks: 0 })
    assert.equal(recipe.figures, "none")
    const lames = emailRecipeLames("discovery-reassurance")
    for (const forbidden of ["email-module-hero-countdown-variant-01", "email-module-hero-offer-image-top", "email-module-discount-banner-full", "email-module-benefits-and-testimonial", "email-module-cta-and-testimonial", "email-module-banner-full"] as const) {
      assert.ok(!lames.includes(forbidden), forbidden)
    }
  })

  test("R2 : heros newsletter, rythme éditorial, intention éditoriale, frises, lien secondaire possible", () => {
    const recipe = emailRecipes["editorial-newsletter"]
    assert.deepEqual([...recipe.heroLayouts], ["banner", "portrait-strip"])
    assert.deepEqual([...recipe.images.intents], ["editorial-work"])
    assert.deepEqual([...recipe.images.strips], ["portrait-strip-mixed-01", "portrait-strip-mixed-02"])
    assert.deepEqual([...recipe.surface.allowed], ["marque"])
    assert.deepEqual(recipe.cta, { buttons: 2, secondaryLinks: 1 })
    assert.equal(recipe.claims.max, 0)
    assert.ok(emailRecipeLames("editorial-newsletter").includes("email-hero-newsletter-variant-01"))
    assert.ok(emailRecipeLames("editorial-newsletter").includes("email-hero-newsletter-variant-02"))
    assert.ok(emailRecipeLames("editorial-newsletter").includes("email-module-text-and-cta-variant-02"))
  })

  test("R3 : preuves, 2 à 3 claims approuvées, un seul bouton, chiffres des seules claims, zone sur la preuve", () => {
    const recipe = emailRecipes["brand-proof"]
    assert.equal(recipe.claims.min, 2)
    assert.equal(recipe.claims.max, 3)
    assert.deepEqual(recipe.cta, { buttons: 1, secondaryLinks: 0 })
    assert.equal(recipe.figures, "claims-only")
    assert.equal(recipe.surface.zone, "proof")
    assert.deepEqual([...recipe.images.intents], ["campaign-portrait", "editorial-work"])
    assert.ok(emailRecipeLames("brand-proof").includes("email-module-benefits-compact-highlights"))
  })

  test("les recettes diffèrent : budgets de boutons, politiques d'images et de surface, zone colorée", () => {
    const [r1, r2, r3] = emailRecipeIds.map((id) => emailRecipes[id])
    assert.equal(new Set([r1!.cta.buttons, r2!.cta.buttons, r3!.cta.buttons]).size, 2, "budgets de boutons : R1 = R2 = 2 (explicitement identiques), R3 = 1")
    assert.equal(r3!.cta.buttons, 1)
    assert.notEqual(r2!.cta.secondaryLinks, r1!.cta.secondaryLinks)
    const imagePolicies = emailRecipeIds.map((id) => JSON.stringify(emailRecipes[id].images))
    assert.equal(new Set(imagePolicies).size, 3, "trois politiques d'images distinctes")
    assert.equal(new Set(emailRecipeIds.map((id) => JSON.stringify(emailRecipes[id].surface))).size, 3)
    assert.equal(new Set(emailRecipeIds.map((id) => emailRecipes[id].heroLayouts.join())).size, 2, "R1 et R3 partagent les mêmes présentations de hero ; R2 a les siennes")
    assert.equal(new Set(emailRecipeIds.map((id) => JSON.stringify(emailRecipes[id].roles))).size, 3)
  })

  test("toutes les lames d'une recette existent au manifeste ; aucune n'est un compte à rebours, une offre ou un témoignage", () => {
    for (const id of emailRecipeIds) {
      for (const type of emailRecipeLames(id)) {
        assert.ok(type in emailBlockManifest, `${id} : ${type}`)
        assert.ok(!/countdown|discount|offer|testimonial|products|diagnostic/.test(type), `${id} : ${type}`)
      }
    }
  })
})

describe("recettes Email V2 : claims approuvées", () => {
  test("seules les six claims approuvées se résolvent ; rien d'en revue ni de brouillon ne devient une claim", () => {
    assert.equal(approvedClaims.length, 6)
    for (const claim of approvedClaims) {
      const resolvedClaim = resolveRecipeClaim(claim.id)
      assert.ok(resolvedClaim, claim.id)
      assert.equal(resolvedClaim.provenance.status, "approved")
      assert.equal(resolvedClaim.statement, claim.statement)
    }
    for (const unknown of ["plus-de-300-formations", "chiffres-performance", "audirep", "salaires", "", "toString", "__proto__"]) {
      assert.equal(resolveRecipeClaim(unknown), undefined, unknown)
    }
  })

  test("le découpage d'un bandeau redonne la formulation exacte de la claim", () => {
    for (const [id, split] of Object.entries(emailClaimHighlightSplits)) {
      assert.equal(`${split.value} ${split.label}`, resolveRecipeClaim(id)!.statement, id)
      assert.ok(split.label.length < 40, `${id} : libellé court (le bandeau est étroit)`)
    }
  })

  test("un disclaimer est déduit des claims qui l'exigent (aucune des claims actuelles n'en exige) ; un identifiant inconnu lève", () => {
    assert.deepEqual(emailRecipeDisclaimers(approvedClaims), [])
    assert.deepEqual(emailRecipeDisclaimers([{ disclaimerId: "chiffres-performance" }, { disclaimerId: "chiffres-performance" }, { disclaimerId: "salaires-metier" }]), ["chiffres-performance", "salaires-metier"])
    assert.throws(() => emailRecipeDisclaimers([{ disclaimerId: "inventé" }]))
    for (const id of emailRecipeDisclaimers([{ disclaimerId: "diplome-ou-rembourse" }])) assert.ok(id in emailDisclaimers)
  })
})

describe("recettes Email V2 : six fixtures", () => {
  test("six fixtures, deux par recette, aux identifiants stables", () => {
    assert.deepEqual(emailRecipeFixtures.map((fixture) => fixture.id), ["R1-A", "R1-B", "R2-A", "R2-B", "R3-A", "R3-B"])
    assert.deepEqual(emailRecipeFixtures.map((fixture) => fixture.recipe), ["discovery-reassurance", "discovery-reassurance", "editorial-newsletter", "editorial-newsletter", "brand-proof", "brand-proof"])
    assert.equal(new Set(emailRecipeFixtures.map((fixture) => fixture.composition.campaignName)).size, 6)
  })

  test("chaque fixture produit un EmailConfig valide (Zod), conforme à sa recette, sans lorem ipsum, déterministe", () => {
    for (const fixture of emailRecipeFixtures) {
      const result = resolved(fixture.id)
      assert.ok(safeParseEmailConfig(result.config).success, fixture.id)
      assert.deepEqual(validateEmailRecipeConfig(fixture.recipe, result.config), [], fixture.id)
      assert.deepEqual(resolveEmailRecipeFixture(fixture.id), result, `${fixture.id} : déterministe`)
      assert.ok(!/lorem|ipsum|démonstration|exemple/i.test(JSON.stringify(result.config)), fixture.id)
      assert.match(result.config.subject, /\S/)
      assert.ok(result.config.subject.length >= 30 && result.config.subject.length <= 45, `${fixture.id} : objet de ${result.config.subject.length} caractères`)
      assert.ok(result.config.preheader.length >= 60 && result.config.preheader.length <= 90, `${fixture.id} : préheader de ${result.config.preheader.length} caractères`)
    }
  })

  test("chaque fixture est rendue par le vrai renderer et produit un aperçu sans URL canonique résiduelle", () => {
    for (const fixture of emailRecipeFixtures) {
      const html = renderEmail(configs[fixture.id])
      assert.ok(html.includes("<html") || html.includes("<!DOCTYPE") || html.length > 5000, fixture.id)
      const preview = toPreviewHtml(html)
      assert.ok(!preview.includes("demo-assets.invalid"), `${fixture.id} : aperçu`)
      assert.ok(html.includes("demo-assets.invalid/email-v2/"), `${fixture.id} : le HTML canonique référence la banque`)
      const images = [...preview.matchAll(/src="(\/images\/email\/v2\/[a-z0-9-]+--[a-z0-9-]+\.jpg)"/g)].map((match) => match[1])
      assert.ok(images.length >= 1, fixture.id)
      for (const path of images) assert.ok([...emailBankPreviews.values()].includes(path!), path)
    }
  })

  test("destinations, images et alts sont contrôlés : liens du catalogue, URLs de la banque, alts du catalogue", () => {
    const hrefs = new Set<string>(Object.keys(emailDestinations).map((id) => emailDestinationUrl(id as EmailDestinationId)))
    for (const fixture of emailRecipeFixtures) {
      for (const candidate of configs[fixture.id].blocks) {
        const slots = candidate.slots as Record<string, Record<string, string>>
        for (const value of Object.values(slots)) {
          if (value.href) assert.ok(hrefs.has(value.href), `${fixture.id} : ${value.href}`)
          if (value.src) {
            const id = emailBankImageIdFromSrc(value.src)
            assert.ok(id, `${fixture.id} : ${value.src}`)
            assert.equal(value.alt, emailBank[id!].alt)
          }
        }
      }
    }
  })

  test("budgets de boutons : une seule destination, jamais plus que la recette ; liens secondaires seulement en R2", () => {
    for (const fixture of emailRecipeFixtures) {
      const description = describeEmailRecipeConfig(configs[fixture.id])
      assert.ok(description.buttons >= 1 && description.buttons <= emailRecipes[fixture.recipe].cta.buttons, fixture.id)
      assert.equal(description.buttonDestinations.length, 1, `${fixture.id} : un seul CTA principal`)
      assert.ok(description.links <= emailRecipes[fixture.recipe].cta.secondaryLinks, fixture.id)
    }
    assert.equal(describeEmailRecipeConfig(configs["R3-A"]).buttons, 1)
    assert.equal(describeEmailRecipeConfig(configs["R3-B"]).buttons, 1)
    assert.equal(describeEmailRecipeConfig(configs["R2-A"]).links, 1, "R2-A : lien secondaire via le bandeau preheader")
    assert.equal(configs["R2-A"].blocks[0]!.type, "email-module-preheader")
  })

  test("longueur : de trois à cinq sections de contenu, densité dans la fourchette de la recette", () => {
    for (const fixture of emailRecipeFixtures) {
      const recipe = emailRecipes[fixture.recipe]
      const description = describeEmailRecipeConfig(configs[fixture.id])
      assert.ok(description.content.length >= recipe.contentSections.min && description.content.length <= recipe.contentSections.max, `${fixture.id} : ${description.content.length} sections`)
      assert.ok(description.words >= recipe.density.min && description.words <= recipe.density.max, `${fixture.id} : ${description.words} mots`)
    }
    for (const id of ["R2-A", "R2-B"]) assert.ok(describeEmailRecipeConfig(configs[id as Fixture["id"]]).content.length >= 3, id)
  })

  test("séquences de lames attendues", () => {
    const sequence = (id: string) => configs[id as Fixture["id"]].blocks.map((candidate) => strip(candidate.type)).join(" > ")
    assert.equal(sequence("R1-A"), "header-newsletter > hero-promotional-image-large > numbered-list > icons-list > text-and-cta-variant-01 > footer-compact-legal")
    assert.equal(sequence("R1-B"), "header-newsletter > hero-split-image > numbered-list > text-and-cta-variant-01 > footer-compact-legal")
    assert.equal(sequence("R2-A"), "preheader > header-newsletter > hero-newsletter-variant-02 > text-only > numbered-list > text-and-cta-variant-02 > footer-compact-legal")
    assert.equal(sequence("R2-B"), "header-newsletter > hero-newsletter-variant-01 > text-only > numbererd-grid > text-and-feature-card > footer-compact-legal")
    assert.equal(sequence("R3-A"), "header-newsletter > hero-promotional-image-large > numbered-list > text-only > footer-compact-legal")
    assert.equal(sequence("R3-B"), "header-newsletter > hero-split-image > benefits-compact-highlights > text-only > text-only > footer-compact-legal")
  })
})

describe("recettes Email V2 : surfaces", () => {
  test("exactement une zone colorée forte par fixture, jamais deux zones colorées consécutives, surfaces autorisées", () => {
    for (const fixture of emailRecipeFixtures) {
      const config = configs[fixture.id]
      assert.equal(describeEmailRecipeConfig(config).strongZones.length, 1, fixture.id)
      config.blocks.forEach((candidate, index) => {
        const surface = (candidate as { surface?: string }).surface
        if (surface && surface !== "page") assert.ok((emailRecipes[fixture.recipe].surface.allowed as readonly string[]).includes(surface), `${fixture.id} : ${surface}`)
        const next = config.blocks[index + 1] as { surface?: string } | undefined
        const colored = (value: { surface?: string } | undefined, type: string) => (value?.surface !== undefined && value.surface !== "page") || (emailIntrinsicDarkLames as readonly string[]).includes(type)
        assert.ok(!(colored(candidate as { surface?: string }, candidate.type) && next && colored(next, config.blocks[index + 1]!.type)), `${fixture.id} : ${candidate.id}`)
      })
    }
  })

  test("R1 : marque par défaut, accent-2-soft seulement sur intention d'empathie ; R2 : marque sur le hero ; R3 : sur la preuve", () => {
    assert.equal((configs["R1-A"].blocks[1] as { surface?: string }).surface, "marque")
    assert.equal((configs["R1-B"].blocks[1] as { surface?: string }).surface, "accent-2-soft")
    assert.equal(composition("R1-B").surfaceIntent, "empathy")
    for (const id of ["R2-A", "R2-B"]) {
      const hero = describeEmailRecipeConfig(configs[id as Fixture["id"]]).content[0]!
      assert.equal((hero as { surface?: string }).surface, "marque", id)
    }
    const proofList = block(configs["R3-A"], "email-module-numbered-list")
    assert.equal(proofList.surface, "marque")
    assert.equal(block(configs["R3-A"], "email-module-hero-promotional-image-large").surface, undefined, "R3-A : le hero reste en page")
    assert.equal(block(configs["R3-B"], "email-module-hero-split-image").surface, undefined)
    assert.deepEqual(describeEmailRecipeConfig(configs["R3-B"]).strongZones, ["section-1"], "R3-B : le bandeau de preuve, sombre par construction")
  })

  test("les lames fixes ne reçoivent jamais de surface ; header, footer et mentions restent en page", () => {
    for (const fixture of emailRecipeFixtures) {
      for (const candidate of configs[fixture.id].blocks) {
        const manifest = emailBlockManifest[candidate.type]
        if (manifest.surfaceMode === "fixed") assert.ok(!("surface" in candidate), `${fixture.id} : ${candidate.id}`)
      }
    }
  })
})

describe("recettes Email V2 : images", () => {
  test("R1 : intentions chaleureuse ou mouvement ; R2 : éditorial ou frise prédéfinie ; R3 : portrait de campagne", () => {
    const intents = (id: string) => describeEmailRecipeConfig(configs[id as Fixture["id"]]).imageIds.map((image) => emailBank[image as keyof typeof emailBank].intent)
    for (const id of ["R1-A", "R1-B"]) for (const intent of intents(id)) assert.ok(["warm-reassurance", "career-movement"].includes(intent), id)
    assert.deepEqual(intents("R2-A"), ["editorial-work", "editorial-work"])
    assert.equal(describeEmailRecipeConfig(configs["R2-B"]).imageIds.length, 5, "frise de cinq portraits")
    for (const id of ["R3-A", "R3-B"]) for (const intent of intents(id)) assert.equal(intent, "campaign-portrait", id)
  })

  test("deux images d'un même email sont distinctes ; le choix suit la graine (déterministe)", () => {
    const ids = describeEmailRecipeConfig(configs["R2-A"]).imageIds
    assert.equal(new Set(ids).size, ids.length)
    const a = composeEmailRecipe({ ...composition("R1-A"), seed: "autre-graine" })
    const b = composeEmailRecipe({ ...composition("R1-A"), seed: "autre-graine" })
    assert.deepEqual(a, b)
    assert.equal(a.status, "resolved")
  })

  test("la frise de R2-B est la frise prédéfinie demandée, jamais cinq images choisies à la main", () => {
    const hero = block(configs["R2-B"], "email-hero-newsletter-variant-01")
    assert.deepEqual(Object.keys(hero.slots).filter((slot) => slot.startsWith("image-")), ["image-1", "image-2", "image-3", "image-4", "image-5"])
    assert.equal(composition("R2-B").stripId, "portrait-strip-mixed-02")
  })
})

describe("recettes Email V2 : claims, chiffres et terminologie dans les fixtures", () => {
  test("R3 contient au moins 2 claims approuvées exactes ; R1 et R2 n'en contiennent aucune ; claims différentes entre R3-A et R3-B", () => {
    const claims = (id: string) => describeEmailRecipeConfig(configs[id as Fixture["id"]]).claimIds
    assert.deepEqual(claims("R3-A"), ["catalogue-formations", "formateurs-conseillers", "formations-alternance"])
    assert.deepEqual(claims("R3-B"), ["apprenants-en-formation", "partenaires-academiques"])
    assert.equal(claims("R3-A").filter((id) => claims("R3-B").includes(id)).length, 0, "ensembles de claims disjoints")
    for (const id of ["R1-A", "R1-B", "R2-A", "R2-B"]) assert.deepEqual(claims(id), [], id)
    const text = JSON.stringify(configs["R3-A"])
    for (const id of claims("R3-A")) assert.ok(text.includes(JSON.stringify(resolveRecipeClaim(id)!.statement).slice(1, -1)), `${id} : formulation exacte`)
    // Bandeau : valeur + libellé = la formulation exacte.
    const band = block(configs["R3-B"], "email-module-benefits-compact-highlights")
    assert.equal(`${band.slots["valeur-cle"]!.text} ${band.slots["label"]!.text}`, resolveRecipeClaim("apprenants-en-formation")!.statement)
  })

  test("la provenance des claims est conservée pour la validation interne ; aucune mention légale n'est requise", () => {
    const result = resolved("R3-A")
    assert.deepEqual(result.claims.map((claim) => claim.id), ["catalogue-formations", "formations-alternance", "formateurs-conseillers"])
    for (const claim of result.claims) {
      assert.equal(claim.documentId, "chiffres-cles")
      assert.equal(claim.status, "approved")
      assert.equal(claim.statement, resolveRecipeClaim(claim.id)!.statement)
    }
    for (const fixture of emailRecipeFixtures) assert.deepEqual(describeEmailRecipeConfig(configs[fixture.id]).disclaimers, [], `${fixture.id} : aucun disclaimer (aucune claim n'en exige)`)
  })

  test("chiffres : aucun nombre en R1 et R2 ; en R3, seulement ceux des claims", () => {
    for (const id of ["R1-A", "R1-B", "R2-A", "R2-B"]) {
      const config = configs[id as Fixture["id"]]
      assert.ok(!/\d/.test(config.subject + config.preheader + describeEmailRecipeConfig(config).content.flatMap((candidate) => Object.values(candidate.slots as Record<string, Record<string, string>>).map((value) => value.text ?? value.label ?? "")).join(" ")), id)
    }
  })

  test("le diagnostic de terminologie est structuré, non bloquant, et les fixtures n'ont aucune erreur", () => {
    for (const fixture of emailRecipeFixtures) {
      const diagnostics = resolved(fixture.id).diagnostics
      assert.deepEqual(diagnostics, lintEmailRecipeContent(configs[fixture.id]))
      assert.deepEqual(diagnostics.filter((diagnostic) => diagnostic.level === "error"), [], fixture.id)
      for (const diagnostic of diagnostics) assert.deepEqual(Object.keys(diagnostic).sort().slice(0, 3), ["label", "level", "match"])
    }
  })

  test("le diagnostic distingue erreur, avertissement et conflit connu, sans rien réécrire", () => {
    const config = clone("R1-A")
    const hero = block(config, "email-module-hero-promotional-image-large")
    hero.slots["texte-descriptif"] = { text: "Une formation gratuite, facile à suivre, pour financer facilement en plusieurs fois sans frais." }
    const before = JSON.stringify(config)
    const diagnostics = lintEmailRecipeContent(config)
    assert.equal(JSON.stringify(config), before, "le contenu n'est jamais modifié")
    const byRule = Object.fromEntries(diagnostics.map((diagnostic) => [diagnostic.ruleId, diagnostic.level]))
    assert.equal(byRule["gratuit"], "error")
    assert.equal(byRule["facile-rapide"], "warning", "« facile » seul : avertissement")
    const conflict = lintEmailRecipeContent({ ...config, subject: "Financez votre formation facilement en plusieurs fois sans frais" }).find((diagnostic) => diagnostic.path === "subject")
    assert.equal(conflict?.level, "known-conflict")
    assert.equal(conflict?.conflictId, "facilement")
    for (const diagnostic of diagnostics) {
      assert.ok(["in-review", "draft", "approved"].includes(diagnostic.sourceStatus))
      assert.ok(diagnostic.path.length > 0 && diagnostic.sourceDocumentId.length > 0)
    }
    assert.ok(diagnostics.every((diagnostic) => diagnostic.sourceStatus !== "approved"), "aucune de ces règles n'est approuvée : un diagnostic n'est pas un verdict")
  })
})

describe("recettes Email V2 : différenciation mesurée", () => {
  test("R1, R2 et R3 n'ont pas la même séquence de lames, et les six fixtures sont toutes distinctes", () => {
    const sequences = emailRecipeFixtures.map((fixture) => configs[fixture.id].blocks.map((candidate) => candidate.type).join(">"))
    assert.equal(new Set(sequences).size, 6)
    const byRecipe = (recipe: string) => emailRecipeFixtures.filter((fixture) => fixture.recipe === recipe).map((fixture) => sequences[emailRecipeFixtures.indexOf(fixture)]!)
    const [r1, r2, r3] = ["discovery-reassurance", "editorial-newsletter", "brand-proof"].map(byRecipe)
    for (const [left, right] of [[r1, r2], [r1, r3], [r2, r3]] as const) {
      for (const sequence of left!) assert.ok(!right!.includes(sequence))
    }
  })

  test("les recettes ne sont pas des variantes cosmétiques : peu de lames en commun d'une recette à l'autre", () => {
    const groups = { r1: ["R1-A", "R1-B"], r2: ["R2-A", "R2-B"], r3: ["R3-A", "R3-B"] }
    const union = (ids: string[]) => new Set(ids.flatMap((id) => [...lameSet(id)]))
    for (const [a, b] of [["r1", "r2"], ["r1", "r3"], ["r2", "r3"]] as const) {
      assert.ok(jaccard(union(groups[a]), union(groups[b])) <= 0.5, `${a} / ${b} : ${jaccard(union(groups[a]), union(groups[b])).toFixed(2)}`)
    }
    for (const [a, b] of [["R1-A", "R2-A"], ["R1-A", "R3-A"], ["R2-B", "R3-B"], ["R1-B", "R3-B"]] as const) assert.ok(jaccard(lameSet(a), lameSet(b)) <= 0.5, `${a} / ${b}`)
  })

  test("les deux variantes R2 n'ont pas le même hero, ni le même visuel de hero (bandeau contre frise)", () => {
    const [a, b] = ["R2-A", "R2-B"].map((id) => content(id)[0])
    assert.equal(a, "email-hero-newsletter-variant-02")
    assert.equal(b, "email-hero-newsletter-variant-01")
    assert.notEqual(a, b)
    assert.equal(block(configs["R2-A"], "email-hero-newsletter-variant-02").slots["image-1"] !== undefined, true)
    assert.equal(Object.keys(block(configs["R2-B"], "email-hero-newsletter-variant-01").slots).filter((slot) => slot.startsWith("image-")).length, 5)
  })

  test("R2 utilise des lames que le Draft V1 ne peut pas produire ; R3 aussi", () => {
    const v1 = new Set<string>([...emailDraftHeroBlocks, ...emailDraftBodyLames, "email-module-header-newsletter", "email-module-footer-compact-legal", "email-module-legal-disclaimer"])
    const outside = (id: string) => content(id).filter((type) => !v1.has(type))
    assert.deepEqual(outside("R2-A"), ["email-hero-newsletter-variant-02", "email-module-text-and-cta-variant-02"])
    assert.deepEqual(outside("R2-B"), ["email-hero-newsletter-variant-01"])
    assert.deepEqual(outside("R3-B"), ["email-module-benefits-compact-highlights"])
    assert.ok(configs["R2-A"].blocks.some((candidate) => candidate.type === "email-module-preheader"), "bandeau preheader : lien secondaire propre")
    assert.deepEqual(outside("R1-A").concat(outside("R1-B")), [], "R1 reste dans le vocabulaire V1")
  })

  test("zones colorées à des endroits différents : hero en R1 et R2, preuve en R3", () => {
    const where = (id: string) => describeEmailRecipeConfig(configs[id as Fixture["id"]]).strongZones[0]
    assert.equal(where("R1-A"), "hero")
    assert.equal(where("R2-B"), "hero")
    assert.notEqual(where("R3-A"), "hero")
    assert.notEqual(where("R3-B"), "hero")
  })
})

describe("recettes Email V2 : validation de recette", () => {
  test("une zone colorée en trop, ou deux consécutives, est refusée", () => {
    const config = clone("R1-A")
    block(config, "email-module-numbered-list").surface = "accent-1"
    assert.ok(codes("discovery-reassurance", config).includes("surface"))
    const second = clone("R1-A")
    block(second, "email-module-icons-list").surface = "marque"
    assert.ok(codes("discovery-reassurance", second).includes("surface"))
    const wrong = clone("R1-A")
    block(wrong, "email-module-hero-promotional-image-large").surface = "encre"
    assert.ok(codes("discovery-reassurance", wrong).includes("surface"), "encre non autorisée en R1")
    const none = clone("R1-A")
    delete block(none, "email-module-hero-promotional-image-large").surface
    assert.ok(codes("discovery-reassurance", none).includes("surface"), "aucune zone colorée")
  })

  test("lame interdite, rôle répété, rôle requis absent, trop ou pas assez de sections", () => {
    const forbidden = clone("R1-A")
    const target = forbidden.blocks.find((candidate) => candidate.type === "email-module-icons-list")!
    ;(target as unknown as { type: string }).type = "email-module-hero-countdown-variant-01"
    assert.ok(codes("discovery-reassurance", forbidden).includes("forbidden-lame"))
    const withoutSteps = clone("R1-A")
    withoutSteps.blocks = withoutSteps.blocks.filter((candidate) => candidate.type !== "email-module-numbered-list")
    assert.ok(codes("discovery-reassurance", withoutSteps).includes("role"))
    const withoutClosing = clone("R1-B")
    withoutClosing.blocks = withoutClosing.blocks.filter((candidate) => candidate.type !== "email-module-text-and-cta-variant-01")
    assert.ok(codes("discovery-reassurance", withoutClosing).includes("sections"))
    const wrongHero = clone("R1-A")
    ;(wrongHero.blocks[1] as unknown as { type: string }).type = "email-hero-newsletter-variant-02"
    assert.ok(codes("discovery-reassurance", wrongHero).includes("hero"))
  })

  test("budget de boutons : un bouton de trop, ou une autre destination, est refusé", () => {
    const tooMany = clone("R3-A")
    const hero = block(tooMany, "email-module-hero-promotional-image-large")
    assert.ok(hero.slots["cta-1"])
    const extra: EmailBlock = { id: "extra", type: "email-module-text-and-cta-variant-01", slots: { "titre-section": { text: "Titre" }, "texte-descriptif": { text: "Texte" }, "cta-1": { label: "Voir", href: emailDestinationUrl("catalogue-formations") } } } as EmailBlock
    tooMany.blocks.splice(tooMany.blocks.length - 1, 0, extra)
    assert.ok(codes("brand-proof", tooMany).includes("cta"))
    const other = clone("R1-A")
    block(other, "email-module-text-and-cta-variant-01").slots["cta-1"]!.href = emailDestinationUrl("methode")
    assert.ok(codes("discovery-reassurance", other).includes("cta"), "deux destinations")
    const forbiddenDestination = clone("R1-A")
    for (const candidate of forbiddenDestination.blocks) {
      const slots = candidate.slots as Record<string, Record<string, string>>
      for (const slot of ["cta-1"]) if (slots[slot]?.href) slots[slot]!.href = emailDestinationUrl("blog")
    }
    assert.ok(codes("discovery-reassurance", forbiddenDestination).includes("destination"))
  })

  test("images : hors banque, intention non autorisée, alt modifié, doublon", () => {
    const outside = clone("R1-A")
    block(outside, "email-module-hero-promotional-image-large").slots["image-1"] = { src: "https://exemple.com/a.jpg", alt: "Une image" }
    assert.ok(codes("discovery-reassurance", outside).includes("image"))
    const intent = clone("R1-A")
    block(intent, "email-module-hero-promotional-image-large").slots["image-1"] = { src: "https://demo-assets.invalid/email-v2/portrait-mur-rose--large.jpg", alt: emailBank["portrait-mur-rose"].alt }
    assert.ok(codes("discovery-reassurance", intent).includes("image"), "campaign-portrait hors R1")
    const alt = clone("R3-A")
    block(alt, "email-module-hero-promotional-image-large").slots["image-1"]!.alt = "Un autre alt"
    assert.ok(codes("brand-proof", alt).includes("image"))
    const strip = clone("R2-B")
    block(strip, "email-hero-newsletter-variant-01").slots["image-3"] = { src: "https://demo-assets.invalid/email-v2/quai-gare--split.jpg", alt: emailBank["quai-gare"].alt }
    assert.ok(codes("editorial-newsletter", strip).includes("image"), "frise modifiée")
    const noStrip = clone("R2-B")
    assert.ok(codes("discovery-reassurance", noStrip).length > 0)
  })

  test("claims : une claim altérée ne compte plus, un chiffre inventé est refusé, un nombre figure interdit en R1", () => {
    const altered = clone("R3-A")
    const list = block(altered, "email-module-numbered-list")
    list.slots["item-1-titre"] = { text: "Plus de 450 formations, du CAP au Bac+5, dans 18 filières" }
    const issues = codes("brand-proof", altered)
    assert.ok(issues.includes("figure"), "le chiffre n'appartient plus à une claim")
    const invented = clone("R3-B")
    block(invented, "email-module-hero-split-image").slots["texte-descriptif"] = { text: "Plus de 95 % de satisfaction." }
    assert.ok(codes("brand-proof", invented).includes("figure"))
    const few = clone("R3-B")
    few.blocks = few.blocks.filter((candidate) => candidate.type !== "email-module-benefits-compact-highlights")
    assert.ok(codes("brand-proof", few).includes("claims"), "moins de deux claims")
    const digits = clone("R1-A")
    block(digits, "email-module-text-and-cta-variant-01").slots["texte-descriptif"] = { text: "Plus de 400 formations." }
    assert.ok(codes("discovery-reassurance", digits).includes("figure"))
    const lorem = clone("R2-B")
    block(lorem, "email-module-text-only").slots["texte-descriptif"] = { text: "Lorem ipsum dolor sit amet." }
    assert.ok(codes("editorial-newsletter", lorem).includes("placeholder"))
  })

  test("shell et mentions légales : header manquant, mentions sans claim, lien secondaire hors recette", () => {
    const noHeader = clone("R1-A")
    noHeader.blocks = noHeader.blocks.filter((candidate) => candidate.type !== "email-module-header-newsletter")
    assert.ok(codes("discovery-reassurance", noHeader).includes("shell"))
    const legal = clone("R3-A")
    legal.blocks.splice(legal.blocks.length - 1, 0, { id: "mentions-legales", type: "email-module-legal-disclaimer", slots: { "disclaimer-1": { disclaimer: "financement-personnel" } } } as EmailBlock)
    assert.ok(codes("brand-proof", legal).includes("disclaimer"), "mentions sans claim qui les appelle")
    const preheader = clone("R2-A")
    assert.ok(codes("discovery-reassurance", preheader).includes("secondary-link"))
  })

  test("densité : un texte trop court est signalé", () => {
    const config = clone("R1-B")
    block(config, "email-module-numbered-list").slots["texte-descriptif-1"] = { text: "Ok." }
    for (const slot of ["texte-descriptif-2", "texte-descriptif-3"]) block(config, "email-module-numbered-list").slots[slot] = { text: "Ok." }
    block(config, "email-module-hero-split-image").slots["texte-descriptif"] = { text: "Court." }
    assert.ok(codes("discovery-reassurance", config).includes("density"))
  })
})

describe("recettes Email V2 : composition (resolver)", () => {
  test("refus explicites, sans contenu de remplacement", () => {
    const refused = (input: object, code: string) => {
      const result = composeEmailRecipe(input as EmailRecipeComposition)
      assert.equal(result.status, "invalid-composition", JSON.stringify(input).slice(0, 80))
      assert.ok("issues" in result && result.issues.some((issue) => issue.code === code), `${code} : ${JSON.stringify(result)}`)
    }
    const r1 = composition("R1-A")
    refused({ ...r1, recipe: "inconnue" }, "recipe")
    refused({ ...r1, heroLayout: "banner" }, "hero")
    refused({ ...r1, visualIntent: "editorial-work" }, "image")
    refused({ ...r1, surfaceIntent: "empathy", recipe: "editorial-newsletter", heroLayout: "banner", visualIntent: "editorial-work", sections: composition("R2-A").sections, hero: composition("R2-A").hero }, "surface")
    refused({ ...r1, secondaryLink: { intro: "Lire", label: "Blog", destination: "blog" } }, "secondary-link")
    refused({ ...r1, hero: { ...r1.hero, cta: { label: "Lire", destination: "blog" } } }, "destination")
    refused({ ...r1, heroLayout: "medium" }, "hero")
    refused({ ...r1, sections: r1.sections.filter((section) => section.kind !== "steps") }, "role")
    refused({ ...r1, sections: [...r1.sections, { kind: "grid", eyebrow: "A", title: "B", items: [{ title: "a", text: "b" }, { title: "a", text: "b" }, { title: "a", text: "b" }, { title: "a", text: "b" }] }] }, "role")
    const r3 = composition("R3-A")
    refused({ ...r3, sections: [{ kind: "claim-highlight", claim: "catalogue-formations" }, ...r3.sections.slice(1)] }, "claim")
    refused({ ...r3, sections: [{ kind: "claim-text", claim: "plus-de-300-formations", text: "x" }] }, "claim")
    const r2 = composition("R2-B")
    refused({ ...r2, stripId: undefined }, "image")
    refused({ ...r2, stripId: "portrait-strip-mixed-09" }, "image")
    refused({ ...r1, heroLayout: "portrait-strip", stripId: "portrait-strip-mixed-01" }, "hero")
  })

  test("un mauvais EmailConfig ou une violation de recette sort comme une erreur, pas comme un succès", () => {
    const empty = composeEmailRecipe({ ...composition("R1-A"), subject: "   " })
    assert.equal(empty.status, "invalid-config")
    const tooShort = composeEmailRecipe({ ...composition("R1-B"), sections: composition("R1-B").sections.slice(1), hero: { ...composition("R1-B").hero, text: "Court." } })
    assert.notEqual(tooShort.status, "resolved")
  })

  test("la composition ne porte ni HTML, ni classe, ni URL, ni chemin, ni alt, ni dimension, ni nom de lame, ni couleur", () => {
    for (const fixture of emailRecipeFixtures) {
      const serialized = JSON.stringify(fixture.composition)
      assert.ok(!/https?:|<|class|\.jpe?g|\/images|demo-assets|\balt\b|\bsrc\b|width|height|crop|#[0-9a-fA-F]{3,6}|email-(module|hero)|\.html/.test(serialized), fixture.id)
      assert.ok(!/"surface"|"accent-1"|"accent-2"|"encre"/.test(serialized), `${fixture.id} : pas de surface brute (seulement une intention)`)
      const allowedKeys = ["recipe", "campaignName", "subject", "preheader", "heroLayout", "visualIntent", "stripId", "surfaceIntent", "seed", "hero", "sections", "secondaryLink"]
      for (const key of Object.keys(fixture.composition)) assert.ok(allowedKeys.includes(key), `${fixture.id} : champ « ${key} » hors du vocabulaire sémantique (ni footer, ni mentions, ni shell)`)
    }
  })

  test("même composition, même EmailConfig ; la graine change le choix d'image sans casser la recette", () => {
    const seeds = ["a", "b", "c", "d", "e", "f"]
    const results = seeds.map((seed) => composeEmailRecipe({ ...composition("R1-A"), seed }))
    for (const result of results) assert.equal(result.status, "resolved")
    const images = new Set(results.map((result) => (result.status === "resolved" ? describeEmailRecipeConfig(result.config).imageIds.join() : "")))
    assert.ok(images.size >= 2, "la graine fait varier le choix")
    for (const result of results) if (result.status === "resolved") assert.deepEqual(validateEmailRecipeConfig("discovery-reassurance", result.config), [])
  })
})

describe("recettes Email V2 : frontières et non-régression", () => {
  const recipeFiles = ["lib/email/recipes.ts", "lib/email/recipe-resolver.ts", "lib/email/recipe-validation.ts", "lib/email/recipe-fixtures.ts"]

  test("le code des recettes n'importe ni le moteur V1, ni Anthropic, ni Landing, ni le réseau", () => {
    for (const path of recipeFiles) {
      const source = code(path)
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]!)
      for (const specifier of imports) {
        assert.ok(!/anthropic|draft-prompt|draft-resolver|generation-draft|generate-handler|generation-context|ai-prompt|landing|section-catalog/.test(specifier), `${path} : ${specifier}`)
      }
      assert.ok(!/fetch\(|node:fs|process\.env|ANTHROPIC/.test(source), path)
    }
  })

  test("Brand n'est importé que par le resolver et la validation des recettes, jamais par le moteur V1", () => {
    const users = readdirSync(join(root, "lib/email")).filter((file) => file.endsWith(".ts")).filter((file) => /\.\.\/brand/.test(read(`lib/email/${file}`)))
    assert.deepEqual(users.sort(), ["recipe-resolver.ts", "recipe-validation.ts"])
  })

  test("le moteur V1 (client, schéma, prompt, brouillon, resolver, route) ne connaît pas les recettes", () => {
    for (const path of ["lib/email/anthropic.ts", "lib/email/anthropic-schema.ts", "lib/email/draft-prompt.ts", "lib/email/generation-draft.ts", "lib/email/draft-resolver.ts", "lib/email/generate-handler.ts", "lib/email/generation-context.ts", "lib/email/image-catalog.ts", "app/api/generate-email/route.ts"]) {
      assert.ok(!/recipe|image-bank/.test(code(path)), path)
    }
    for (const file of readdirSync(join(root, "components/email"))) assert.ok(!/recipe/.test(read(`components/email/${file}`)), file)
  })

  test("l'aperçu V1 est inchangé : les quatre visuels de démo et la banque V2 sont deux mappings fermés distincts", () => {
    const demo = toPreviewHtml('<html><body><img src="https://demo-assets.invalid/email-demo-evolution.jpg" alt=""><img src="https://demo-assets.invalid/email-v2/quai-gare--large.jpg" alt=""><img src="https://demo-assets.invalid/email-v2/inconnue--large.jpg" alt=""></body></html>')
    assert.ok(demo.includes('src="/images/email-demo-evolution.jpg"'))
    assert.ok(demo.includes('src="/images/email/v2/quai-gare--large.jpg"'))
    assert.ok(demo.includes('src="https://demo-assets.invalid/email-v2/inconnue--large.jpg"'), "une autre URL, même sur ce domaine, reste telle quelle")
  })
})
