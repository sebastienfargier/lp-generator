/**
 * R3 (preuves de marque) : impact des chiffres clés et copy « claim-safe »,
 * hors ligne. Les chiffres affichés viennent d'une projection CONTRÔLÉE de
 * Brand (valeur courte + libellé d'une claim approuvée), jamais d'un texte du
 * modèle ; le Draft R3 ne change pas (le modèle ne choisit que des
 * identifiants) ; le prompt trace la frontière entre « situer » et « prouver ».
 *
 * Limite assumée : aucun contrôle déterministe ne détecte une causalité
 * sémantique (« X formateurs, donc un accompagnement à chaque étape »). Une
 * liste de mots serait un pseudo-détecteur fragile : la frontière est portée
 * par le prompt et par les fixtures (testées ci-dessous), tandis que la
 * validation déterministe reste celle des chiffres et des claims. Aucun appel
 * Anthropic.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { approvedClaims, getClaimDisplay } from "../../brand/claims"
import { buildRecipeBrandContext } from "../recipe-brand-context"
import { emailRecipeDraftFixtures, resolveEmailRecipeDraftFixture } from "../recipe-draft-fixtures"
import { BrandProofDraftSchema, buildRecipeDraftJsonSchema, buildRecipeTransportSchema, proofRenderMode, resolveEmailRecipeDraft } from "../recipe-drafts"
import { brandProofSystemPrompt, buildEmailRecipePrompt, discoverySystemPrompt, newsletterSystemPrompt } from "../recipe-prompts"
import { describeEmailRecipeConfig, validateEmailRecipeConfig } from "../recipe-validation"
import { emailRecipeIds, emailRecipes } from "../recipes"
import type { EmailRecipeRequest } from "../recipe-selection"
import type { EmailBlock, EmailConfig } from "../types"
import { measure, type JsonSchema } from "./schema-metrics"

const root = process.cwd()
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 16)
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const numeric = ["apprenants-en-formation", "catalogue-formations", "formateurs-conseillers", "formations-alternance"] as const
const fixture = (id: string) => emailRecipeDraftFixtures.find((entry) => entry.id === id)!
const requestOf = (id: string) => fixture(id).request as unknown as EmailRecipeRequest
const draftOf = (id: string) => structuredClone(fixture(id).draft) as unknown as { claims: string[]; support: string[]; hero: { text: string }; closing: { title: string; text: string } }
const resolved = (id: string) => {
  const { resolution } = resolveEmailRecipeDraftFixture(id as never)
  assert.equal(resolution.status, "resolved", `${id} : ${"issues" in resolution ? JSON.stringify(resolution.issues) : ""}`)
  if (resolution.status !== "resolved") throw new Error(id)
  return resolution
}
const bands = (config: EmailConfig) =>
  config.blocks.filter((block) => block.type === "email-module-benefits-compact-highlights").map((block) => block.slots as unknown as Record<string, { text: string }>)

describe("R3 : projection contrôlée valeur / libellé", () => {
  test("la valeur et le libellé d'un bandeau viennent de Brand ; le statement canonique est la référence et reste inchangé", () => {
    for (const id of numeric) {
      const display = getClaimDisplay(id)!
      const claim = approvedClaims.find((entry) => entry.id === id)!
      assert.equal(display.statement, claim.statement)
      assert.equal(`${display.value} ${display.label}`, claim.statement)
      assert.equal(claim.provenance.status, "approved")
      assert.equal(claim.provenance.documentId, "chiffres-cles")
    }
    assert.deepEqual(approvedClaims.map((claim) => claim.statement), [
      "59 000 apprenants en cours de formation",
      "Plus de 400 formations, du CAP au Bac+5, dans 18 filières",
      "Près de 1 000 formateurs et conseillers pédagogiques (dont 700 formateurs)",
      "Plus de 130 formations en alternance",
      "Partenaires académiques : ESG, Hetic, Elije, Digital Campus, LISAA, Naratiiv, Cours Florent...",
      "Financement : CPF, France Travail, alternance, entreprise, paiement jusqu'à 36 mois",
    ])
  })

  test("le bandeau affiche exactement la projection de Brand (espaces insécables dans la valeur : présentation seulement)", () => {
    const config = resolved("D-R3-B").config
    const shown = bands(config)
    assert.equal(shown.length, 2)
    draftOf("D-R3-B").claims.forEach((id, index) => {
      const display = getClaimDisplay(id)!
      assert.equal(shown[index]!["valeur-cle"]!.text, display.value.replace(/ /g, " "))
      assert.equal(shown[index]!["valeur-cle"]!.text.replace(/ /g, " "), display.value)
      assert.equal(shown[index]!["label"]!.text, display.label)
      assert.equal(`${shown[index]!["valeur-cle"]!.text} ${shown[index]!["label"]!.text}`.replace(/ /g, " "), display.statement)
    })
  })

  test("aucune valeur n'est dérivée du Draft : le Draft R3 n'a ni valeur, ni libellé, ni statement ; le schéma de transport est identique", () => {
    assert.deepEqual(Object.keys(BrandProofDraftSchema.shape), ["subject", "preheader", "visualIntent", "hero", "claims", "support", "closing"])
    const sent = JSON.stringify(buildRecipeTransportSchema("brand-proof"))
    for (const key of ["displayValue", "displayLabel", "statement", "valeur-cle", "headline"]) assert.ok(!sent.includes(`"${key}"`), key)
    assert.equal(hash(buildRecipeTransportSchema("brand-proof")), "ba146d9379681f65", "schéma R3 identique à celui d'avant le chantier")
    assert.equal(hash(buildRecipeDraftJsonSchema("brand-proof")).length, 16)
    // Même avec un Draft qui tente de fournir une valeur : refusé (objets stricts).
    const draft = { ...draftOf("D-R3-B"), displayValue: "59 000", claims: ["apprenants-en-formation", "formations-alternance"] }
    assert.equal(resolveEmailRecipeDraft(requestOf("D-R3-B"), "brand-proof", draft).status, "invalid-draft")
    // Un texte d'appui ne peut pas non plus introduire une valeur.
    const withNumber = draftOf("D-R3-B")
    withNumber.support[0] = "Le premier repère, 60 000 personnes."
    assert.equal(resolveEmailRecipeDraft(requestOf("D-R3-B"), "brand-proof", withNumber).status, "invalid-recipe")
  })

  test("le contexte envoyé au modèle marque les claims affichables en chiffres clés par identifiant, sans valeur ni libellé de projection", () => {
    const { context } = buildRecipeBrandContext("brand-proof", "Adultes", "reconversion")
    assert.deepEqual(context.claims!.filter((claim) => claim.headline).map((claim) => claim.id), [...numeric])
    assert.ok(!context.claims!.some((claim) => claim.id === "partenaires-academiques" && claim.headline))
    assert.ok(!context.claims!.some((claim) => claim.id === "financement-dispositifs"))
    for (const claim of context.claims!) assert.deepEqual(Object.keys(claim).filter((key) => !["id", "statement", "headline"].includes(key)), [])
    assert.ok(JSON.stringify(context).length < 3500)
  })
})

describe("R3 : mode de rendu décidé par le code, d'après les identifiants", () => {
  test("trois claims : liste ; deux claims chiffrées : deux bandeaux ; deux dont une sans valeur chiffrée : deux titres", () => {
    assert.equal(proofRenderMode("brand-proof", ["catalogue-formations", "formateurs-conseillers", "apprenants-en-formation"]), "list")
    for (let i = 0; i < numeric.length; i++) for (let j = i + 1; j < numeric.length; j++) assert.equal(proofRenderMode("brand-proof", [numeric[i]!, numeric[j]!]), "headline", `${numeric[i]} + ${numeric[j]}`)
    assert.equal(proofRenderMode("brand-proof", ["apprenants-en-formation", "partenaires-academiques"]), "titles")
    assert.equal(proofRenderMode("brand-proof", ["partenaires-academiques", "formations-alternance"]), "titles")
  })

  test("les six paires de claims chiffrées se résolvent en deux bandeaux, une seule zone de preuve, aucune erreur de recette", () => {
    for (let i = 0; i < numeric.length; i++) {
      for (let j = i + 1; j < numeric.length; j++) {
        const draft = draftOf("D-R3-B")
        draft.claims = [numeric[i]!, numeric[j]!]
        const resolution = resolveEmailRecipeDraft(requestOf("D-R3-B"), "brand-proof", draft)
        assert.equal(resolution.status, "resolved", `${numeric[i]} + ${numeric[j]} : ${JSON.stringify("issues" in resolution ? resolution.issues : "")}`)
        if (resolution.status !== "resolved") continue
        const description = describeEmailRecipeConfig(resolution.config)
        assert.equal(bands(resolution.config).length, 2)
        assert.equal(description.strongZones.length, 1, "deux bandeaux à la suite = une zone de preuve")
        assert.deepEqual(validateEmailRecipeConfig("brand-proof", resolution.config), [])
        assert.deepEqual([...description.claimIds].sort(), [numeric[i]!, numeric[j]!].sort())
        assert.deepEqual(resolution.diagnostics, [])
      }
    }
  })

  test("une claim hors recette est refusée ; une claim sans projection ne s'affiche jamais en bandeau", () => {
    for (const claim of ["financement-dispositifs", "plus-de-300-formations"]) {
      const resolution = resolveEmailRecipeDraft(requestOf("D-R3-B"), "brand-proof", { ...draftOf("D-R3-B"), claims: [claim, "apprenants-en-formation"] })
      assert.notEqual(resolution.status, "resolved", claim)
    }
    // Deux claims dont une sans projection : repli en titres (le bandeau n'est jamais forcé).
    const mixed = resolveEmailRecipeDraft(requestOf("D-R3-B"), "brand-proof", { ...draftOf("D-R3-B"), claims: ["apprenants-en-formation", "partenaires-academiques"] })
    assert.equal(mixed.status, "resolved")
    if (mixed.status === "resolved") assert.equal(bands(mixed.config).length, 0)
  })

  test("zone de preuve : un bandeau suivi d'un bandeau est un seul bloc ; un bandeau séparé d'un autre, ou combiné à une surface colorée, compte comme deux zones", () => {
    const config = structuredClone(resolved("D-R3-B").config)
    const index = config.blocks.findIndex((block) => block.type === "email-module-benefits-compact-highlights")
    const second = config.blocks[index + 1]!
    // Séparés par le texte : deux zones sombres.
    const separated = { ...config, blocks: [...config.blocks.slice(0, index + 1), config.blocks[index + 2]!, second, ...config.blocks.slice(index + 3)] } as EmailConfig
    assert.ok(validateEmailRecipeConfig("brand-proof", separated).some((issue) => issue.code === "surface"))
    // Bandeaux + hero coloré : deux zones.
    const colored = structuredClone(config)
    ;(colored.blocks.find((block: EmailBlock) => block.id === "hero") as unknown as { surface: string }).surface = "marque"
    assert.ok(validateEmailRecipeConfig("brand-proof", colored).some((issue) => issue.code === "surface"))
  })
})

describe("R3 : consignes du prompt (copy claim-safe, angle, variété)", () => {
  const prompt = brandProofSystemPrompt

  test("l'appui dit ce que le repère permet de situer, pas ce qu'il prouve ni garantit ; liste des déductions interdites", () => {
    assert.match(prompt, /Il dit ce que ce repère permet de situer \(une échelle, une étendue, une taille\), pas ce qu'il prouve ni garantit/)
    const forbidden = prompt.slice(prompt.indexOf("Ne déduis d'une claim"))
    for (const word of ["qualité", "résultat", "efficacité", "disponibilité", "accompagnement individuel", "service précis", "engagement ou satisfaction des apprenants", "réussite", "garantie"]) assert.ok(forbidden.includes(word), word)
  })

  test("les exemples de frontière ne sont jamais injectés dans le prompt", () => {
    for (const sentence of ["donne une idée de l'étendue du catalogue", "Vous trouverez forcément", "permet de situer l'échelle de l'équipe", "Une équipe vous accompagne à chaque étape", "Rejoignez une communauté engagée"]) assert.ok(!prompt.includes(sentence), sentence)
  })

  test("le hero donne un angle aux preuves, sans inventer ni répéter une claim", () => {
    assert.match(prompt, /Le hero donne un ANGLE aux preuves : il répond à « pourquoi ces repères aident-ils à comprendre Studi \? » sans inventer de fait ni répéter une claim/)
  })

  test("objet et préheader : angle clair, pas le nom de campagne, aucune valeur chiffrée ; préheader qui prépare les preuves", () => {
    assert.match(prompt, /un angle clair, pas une reprise du nom de campagne/)
    assert.match(prompt, /il complète l'objet et prépare les preuves sans répéter le hero\. Aucune valeur chiffrée dans l'un ni dans l'autre/)
    assert.match(prompt, /subject : 30 à 45 caractères/)
    assert.match(prompt, /preheader : 60 à 90 caractères/)
  })

  test("variété légère : quatre formules, « quand une formulation plus précise existe », sans interdiction ni système anti-générique de R2", () => {
    const sentence = /Variété : ([^\n]+)/.exec(prompt)![1]!
    for (const phrase of ["à votre rythme", "avancer", "repères", "sereinement"]) assert.ok(sentence.includes(`« ${phrase} »`), phrase)
    assert.match(sentence, /quand une formulation plus précise existe/)
    assert.ok(!/interdi|jamais/i.test(sentence) && sentence.length < 220)
    assert.ok(!/passer à l'action|pistes concrètes|projet professionnel/.test(prompt), "pas le système de R2")
  })

  test("le modèle choisit deux claims par défaut et ne produit ni statement, ni valeur, ni libellé ; les claims « headline » s'affichent en grands chiffres", () => {
    assert.match(prompt, /2 par défaut, 3 seulement si le brief demande plusieurs repères/)
    assert.match(prompt, /deux claims marquées headline : le système les affiche en grands chiffres/)
    assert.match(prompt, /Tu ne recopies, ne reformules ni ne commentes aucun chiffre/)
    assert.ok(!/displayValue|displayLabel|valeur-cle|bandeau|email-module/.test(prompt), "aucun détail de gabarit")
  })

  test("la sécurité est intacte : faits, interdictions, règles de marque, un seul bouton", () => {
    assert.match(prompt, /Faits : request\.facts est la seule source/)
    assert.match(prompt, /n'écris aucun chiffre, prix, durée, date, effectif, certification, classement, garantie, témoignage, partenaire ni offre/)
    assert.match(prompt, /context\.rules et context\.avoid s'appliquent à tout le texte/)
    assert.match(prompt, /Un seul bouton dans tout l'email : celui du hero/)
    assert.match(prompt, /Ce que tu ne produis jamais : d'URL/)
  })

  test("budget : le prompt R3 gagne ses consignes, total sous 7 000 ; schéma identique, risque LOW", () => {
    const ready = buildEmailRecipePrompt({ campaignName: "Studi en quelques repères", brief: "Un email de réassurance.", audience: "Personnes en reconversion", target: "reconversion", intent: "brand-proof" })
    assert.ok(ready.status === "ready")
    if (ready.status !== "ready") return
    assert.ok(prompt.length > 2060 && prompt.length < 3400, `système R3 : ${prompt.length}`)
    assert.ok(ready.system.length + ready.user.length < 7000, `${ready.system.length + ready.user.length}`)
    const metrics = measure(ready.transportSchema as JsonSchema)
    assert.deepEqual([metrics.bytes, metrics.expandedBytes, metrics.objects, metrics.properties, metrics.alternatives, metrics.optional, metrics.patterns], [1452, 1108, 4, 15, 0, 0, 0])
  })
})

describe("R3 : fixtures claim-safe", () => {
  /** Formules de glissement observées au smoke réel ; vérifiées sur les FIXTURES seulement (jamais dans la validation). */
  const slips = [/accompagn/i, /à chaque étape/i, /communaut/i, /engag/i, /rejoign/i, /forcément/i, /garanti/i, /réussi/i, /satisf/i, /qualité/i, /efficac/i, /disponib/i]

  test("deux fixtures : trois claims en liste (A), deux claims en chiffres clés (B)", () => {
    const a = resolved("D-R3-A")
    const b = resolved("D-R3-B")
    assert.deepEqual(draftOf("D-R3-A").claims, ["catalogue-formations", "formateurs-conseillers", "apprenants-en-formation"])
    assert.deepEqual(draftOf("D-R3-B").claims, ["apprenants-en-formation", "formations-alternance"])
    assert.ok(describeEmailRecipeConfig(a.config).sequence.includes("email-module-numbered-list"))
    assert.equal(bands(a.config).length, 0)
    assert.equal(bands(b.config).length, 2)
    assert.deepEqual(describeEmailRecipeConfig(b.config).sequence.slice(1, 5), ["email-module-hero-promotional-image-large", "email-module-benefits-compact-highlights", "email-module-benefits-compact-highlights", "email-module-text-only"])
    for (const result of [a, b]) {
      assert.deepEqual(result.diagnostics, [], "0 diagnostic de terminologie")
      assert.equal(describeEmailRecipeConfig(result.config).buttons, 1)
      assert.ok(result.claims.every((claim) => claim.status === "approved"))
    }
  })

  test("copy d'appui : ce que le repère permet de situer, sans chiffre, sans promesse ni glissement ; hero sans chiffre ni claim", () => {
    for (const id of ["D-R3-A", "D-R3-B"]) {
      const draft = draftOf(id)
      const around = [...draft.support, draft.closing.title, draft.closing.text, draft.hero.text].join(" ")
      assert.ok(!/\d/.test(around), `${id} : aucun chiffre autour des claims`)
      for (const slip of slips) assert.ok(!slip.test(around), `${id} : ${slip}`)
      for (const claim of approvedClaims) assert.ok(!around.includes(claim.statement), `${id} : le texte ne recopie pas la claim`)
      for (const text of draft.support) assert.match(text, /situ|idée|repère|ampleur|étendue|échelle/i, `${id} : « ${text} »`)
    }
  })

  test("objet et préheader : longueurs, aucun chiffre, objet distinct du nom de campagne", () => {
    for (const id of ["D-R3-A", "D-R3-B"]) {
      const { config } = resolved(id)
      assert.ok(config.subject.length >= 30 && config.subject.length <= 45, `${id} : ${config.subject.length}`)
      assert.ok(config.preheader.length >= 60 && config.preheader.length <= 90, `${id} : ${config.preheader.length}`)
      assert.ok(!/\d/.test(config.subject + config.preheader))
      assert.notEqual(config.subject.toLowerCase(), requestOf(id).campaignName.toLowerCase())
    }
  })

  test("fixtures déterministes", () => {
    for (const id of ["D-R3-A", "D-R3-B"]) assert.deepEqual(resolved(id), resolved(id))
  })

  test("aucun pseudo-détecteur sémantique dans la validation : la frontière est portée par le prompt et les fixtures", () => {
    const validation = code("lib/email/recipe-validation.ts") + code("lib/email/recipe-resolver.ts") + code("lib/email/recipe-drafts.ts")
    for (const slip of ["accompagn", "à chaque étape", "communaut", "engag", "forcément"]) assert.ok(!validation.includes(slip), slip)
  })
})

describe("R3 : non-régression", () => {
  test("R1 et R2 : prompts et contextes strictement identiques ; les trois schémas de transport inchangés", () => {
    assert.equal(hash(discoverySystemPrompt), "7daddb994de807e0")
    assert.equal(hash(newsletterSystemPrompt), "c3c16e44a2e62968", "polish R2 (1ec7ee3) conservé")
    assert.equal(hash(buildRecipeBrandContext("discovery-reassurance", "Adultes", "actifs_en_poste").context), "895a881eaa614dab")
    assert.equal(hash(buildRecipeBrandContext("editorial-newsletter", "Adultes", "actifs_en_poste").context), "6d65c02cab11a515")
    const expected: Record<string, string> = { "discovery-reassurance": "6b9d61ddcfedfdd9", "editorial-newsletter": "668a8bd61e9f8f8b", "brand-proof": "ba146d9379681f65" }
    for (const recipe of emailRecipeIds) assert.equal(hash(buildRecipeTransportSchema(recipe)), expected[recipe], recipe)
  })

  test("les gabarits HTML, la banque d'images et les fixtures visuelles R1/R2 ne bougent pas", () => {
    const template = (name: string) => hash(readFileSync(join(root, "lib/email/templates", name), "utf8"))
    assert.equal(createHash("sha256").update(readFileSync(join(root, "lib/email/templates/email-module-benefits-compact-highlights.html"))).digest("hex").slice(0, 16), "10d541e03de30527")
    assert.equal(template("email-module-numbered-list.html").length, 16)
    assert.equal(emailRecipes["brand-proof"].heroLayouts.join(), "large,medium,split")
    assert.equal(emailRecipes["brand-proof"].cta.buttons, 1)
    assert.deepEqual(emailRecipes["brand-proof"].images.intents, ["campaign-portrait", "editorial-work"])
  })

  test("un seul appel futur, aucun retry ni repli ajoutés ; ni UI, ni route, ni client", () => {
    for (const path of ["lib/email/recipe-drafts.ts", "lib/email/recipe-resolver.ts", "lib/email/recipe-prompts.ts", "lib/email/recipe-brand-context.ts"]) assert.ok(!/retry|retries|maxRetries|fetch\(|setTimeout/.test(code(path)), path)
    assert.equal((code("lib/email/anthropic-v2.ts").match(/messages\.create\(/g) ?? []).length, 1)
  })
})
