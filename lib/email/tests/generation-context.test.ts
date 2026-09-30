/**
 * Contexte compact et destinations contrôlées : sélection déterministe à
 * partir des faits structurés de la requête, sans URL inventée.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { defaultEmailBrief } from "../demo-generator"
import { createHash } from "node:crypto"

import { emailDestinations, emailDestinationUrl, emailExternalOrigins, emailUnconfirmedDestinations, studiOrigin } from "../destinations"
import { emailDisclaimers } from "../disclaimers"
import { buildEmailGenerationContext, explainEmailSectionSelection } from "../generation-context"
import { emailBriefToGenerationRequest, type EmailGenerationRequest } from "../generation-request"
import { emailBlockManifest } from "../manifest"
import { isEmailHref } from "../schemas"
import { getEmailSectionCatalogForPrompt } from "../section-catalog"
import { scenarios } from "./scenarios"

const contexts = Object.fromEntries(
  Object.entries(scenarios).map(([name, request]) => [name, buildEmailGenerationContext(request)])
)
const fullSize = JSON.stringify(getEmailSectionCatalogForPrompt()).length
const manifestTypes = new Set(Object.keys(emailBlockManifest))
const destinationIds = Object.keys(emailDestinations) as (keyof typeof emailDestinations)[]
const isExternal = (id: (typeof destinationIds)[number]) => "origin" in emailDestinations[id]
const studiIds = destinationIds.filter((id) => !isExternal(id))
const externalIds = destinationIds.filter(isExternal)
const types = (context: (typeof contexts)[string]): string[] => context.sections.map((section) => section.type)

describe("destinations contrôlées", () => {
  test("chaque URL studi.com : hôte des sources, chemin /fr/, placeholder UTM, EmailHref valide", () => {
    assert.equal(studiOrigin, "https://www.studi.com")
    for (const id of studiIds) {
      const url = emailDestinationUrl(id)
      assert.ok(url.startsWith(`${studiOrigin}/fr/`) && url.endsWith("?[UTM À DÉFINIR — CRM]") && isEmailHref(url), url)
    }
  })

  test("60 destinations studi.com, chacune avec sa provenance ; 34 filières", () => {
    assert.equal(studiIds.length, 60)
    assert.equal(Object.values(emailDestinations).filter((destination) => destination.group === "filiere").length, 34)
    for (const id of studiIds) assert.match(emailDestinations[id].source, /^(sources-studi\.md|guidelines-communication\.md) §/, id)
  })

  test("non-régression : les 60 destinations studi.com sont identiques à l'état précédent", () => {
    const snapshot = JSON.stringify(studiIds.map((id) => {
      const destination = emailDestinations[id]
      return [id, emailDestinationUrl(id), destination.label, destination.group, destination.usage, destination.source]
    }))
    // Empreinte relevée avant l'ajout des destinations externes (2026-09-30).
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), "4987ad9c1372004cad6a03588d642ce467ffb749cf7985676c4aeafcc8cfe9ee")
  })

  test("destinations externes : uniquement les origines contrôlées, source officielle", () => {
    assert.deepEqual([...emailExternalOrigins], ["https://meet.studi.fr"])
    assert.deepEqual(externalIds, ["studi-meet"])
    for (const id of externalIds) {
      const destination = emailDestinations[id]
      assert.ok("origin" in destination && (emailExternalOrigins as readonly string[]).includes(destination.origin), id)
      assert.equal(destination.source, `${"origin" in destination ? destination.origin : ""}/`)
      const url = emailDestinationUrl(id)
      assert.ok(url.endsWith("?[UTM À DÉFINIR — CRM]") && isEmailHref(url), url)
    }
    assert.equal(emailDestinationUrl("studi-meet"), "https://meet.studi.fr/?[UTM À DÉFINIR — CRM]")
    // Toute URL du catalogue a pour hôte studi.com ou une origine contrôlée.
    const hosts = new Set(destinationIds.map((id) => new URL(emailDestinationUrl(id).split("?")[0]!).origin))
    assert.deepEqual([...hosts].sort(), [studiOrigin, ...emailExternalOrigins].sort())
  })

  test("Studi Meet n'entre dans aucun contexte de génération (mode démo seulement)", () => {
    for (const context of Object.values(contexts)) assert.ok(!context.links.some((link) => link.id === "studi-meet"))
  })

  test("les destinations non confirmées ne sont pas proposables", () => {
    const labels = new Set<string>(Object.values(emailDestinations).map((destination) => destination.label))
    for (const { label } of emailUnconfirmedDestinations) assert.ok(!labels.has(label), label)
  })
})

describe("contexte de génération", () => {
  test("sérialisable, déterministe, sans les données de la requête", () => {
    for (const [name, request] of Object.entries(scenarios)) {
      const serialized = JSON.stringify(contexts[name])
      assert.deepEqual(JSON.parse(serialized), contexts[name])
      assert.equal(JSON.stringify(buildEmailGenerationContext(request)), serialized, name)
      assert.ok(!serialized.includes(request.brief), `${name} : brief répété`)
    }
  })

  test("uniquement des lames connues, sans doublon", () => {
    for (const context of Object.values(contexts)) {
      assert.equal(new Set(types(context)).size, context.sections.length)
      for (const type of types(context)) assert.ok(manifestTypes.has(type), type)
    }
  })

  test("de quoi composer un email complet", () => {
    for (const [name, context] of Object.entries(contexts)) {
      const families = new Set(context.sections.map((section) => section.family))
      for (const family of ["Header", "Hero", "Story", "Footer"] as const) assert.ok(families.has(family), `${name} : ${family}`)
      assert.ok(families.has("Features") || families.has("Benefits"), `${name} : arguments`)
      assert.ok(types(context).includes("email-module-footer-compact-legal"), `${name} : footer`)
    }
  })

  test("lames de promo : uniquement si la requête fournit code, compte à rebours, valeur", () => {
    const editorial = types(contexts.reconversion!)
    for (const type of ["email-module-discount-banner-cards", "email-module-hero-countdown-variant-01", "email-module-banner-full"]) {
      assert.ok(!editorial.includes(type), type)
    }
    const promo = types(contexts.promo!)
    for (const type of ["email-module-discount-banner-cards", "email-module-hero-countdown-variant-02", "email-module-banner-full"]) {
      assert.ok(promo.includes(type), type)
    }
    const noCode = buildEmailGenerationContext({ ...scenarios.promo!, offer: { ...scenarios.promo!.offer!, code: undefined } })
    assert.ok(!types(noCode).includes("email-module-discount-banner-cards"))
    // Un mot « code » dans le brief ne suffit plus : seul le champ compte.
    const cueOnly = buildEmailGenerationContext({ ...scenarios.reconversion!, brief: "Avec un code promo et une date de fin." })
    assert.ok(!types(cueOnly).includes("email-module-discount-banner-cards"))
  })

  test("témoignage et partenaire : uniquement s'ils sont fournis", () => {
    assert.ok(!types(contexts.reconversion!).includes("email-module-cta-and-testimonial"))
    const withTestimonial = buildEmailGenerationContext({ ...scenarios.reconversion!, testimonial: { quote: "…", author: "Apprenant Studi" } })
    assert.ok(types(withTestimonial).includes("email-module-cta-and-testimonial"))
    const withPartner = buildEmailGenerationContext({ ...scenarios.reconversion!, partner: { name: "Le Wagon" }, visuals: [{ src: "https://cdn.studi.com/v.jpg", alt: "" }] })
    assert.ok(types(withPartner).includes("email-module-hero-split-image-dark"))
  })

  test("mentions légales et disclaimers : seulement si un fait ou l'offre l'exigent", () => {
    assert.ok(!types(contexts.reconversion!).includes("email-module-legal-disclaimer"))
    assert.ok(!("disclaimers" in contexts.reconversion!))
    assert.ok(types(contexts.promo!).includes("email-module-legal-disclaimer"))
    const withFact = buildEmailGenerationContext({ ...scenarios.reconversion!, facts: [{ statement: "96 % ont constaté une progression professionnelle", disclaimer: "chiffres-performance" }] })
    assert.ok(types(withFact).includes("email-module-legal-disclaimer"))
    const serialized = JSON.stringify(contexts.promo)
    for (const { text } of Object.values(emailDisclaimers)) assert.ok(!serialized.includes(text.slice(0, 40)))
  })

  test("product-details : seulement avec une offre, limitées à Page ; icons-grid jamais", () => {
    for (const [name, context] of Object.entries(contexts)) {
      assert.ok(!types(context).includes("email-module-icons-grid"))
      for (const section of context.sections) {
        if (section.type.startsWith("email-module-product-details")) {
          assert.equal(name, "promo")
          assert.deepEqual(section.onlySurfaces, ["page"])
        }
      }
    }
    assert.match(explainEmailSectionSelection(scenarios.reconversion!)["email-module-icons-grid"]!, /contraste/)
  })

  test("lames à visuel : autant de visuels fournis que de slots image", () => {
    const withVisuel = (context: (typeof contexts)[string]) =>
      context.sections.filter((section) => section.slots.some((slot) => slot.endsWith(": asset:visuel")))
    for (const context of Object.values(contexts)) assert.deepEqual(withVisuel(context), [])
    const one = buildEmailGenerationContext({ ...scenarios.reconversion!, visuals: [{ src: "https://cdn.studi.com/v.jpg", alt: "Apprenante" }] })
    assert.ok(withVisuel(one).length > 0)
    for (const section of withVisuel(one)) {
      assert.equal(section.slots.filter((slot) => slot.endsWith(": asset:visuel")).length, 1, section.type)
    }
  })

  test("liens : destinations contrôlées, footer toujours, blog selon le type, filières citées", () => {
    const allowed = new Set(destinationIds.map((id) => emailDestinationUrl(id)))
    for (const context of Object.values(contexts)) {
      for (const link of context.links) assert.ok(allowed.has(link.url), link.url)
      for (const id of ["catalogue-formations", "alternance", "trajectoire-magazine"]) assert.ok(context.links.some((link) => link.id === id))
      assert.ok(!/https?:\/\/[a-z0-9]/i.test(JSON.stringify({ ...context, links: [] })))
    }
    assert.ok(!contexts.promo!.links.some((link) => link.id.startsWith("blog")))
    assert.ok(contexts.reconversion!.links.some((link) => link.id === "blog-reconversion-professionnelle"))
    assert.ok(contexts.evolution!.links.some((link) => link.id === "filiere-ressources-humaines-paie"))
    assert.ok(!contexts.accompagnement!.links.some((link) => link.id === "filiere-accompagnement-petite-enfance"))
  })

  test("vocabulaire seulement si nécessaire ; surface recommandée", () => {
    for (const context of Object.values(contexts)) {
      const kinds = new Set(context.sections.flatMap((section) => section.slots.map((slot) => slot.split(": ")[1])))
      assert.equal("iconNames" in context, kinds.has("asset:icone"))
      assert.equal("disclaimers" in context, kinds.has("disclaimer"))
      assert.deepEqual(Object.keys(context.slotKinds).sort(), [...kinds].sort())
    }
    assert.equal(contexts.reconversion!.surfaces.recommended, "marque")
    assert.equal(contexts.promo!.surfaces.recommended, "accent-1")
  })

  test("aucun HTML, classe ni couleur hex ; réduction mesurable", () => {
    for (const [name, context] of Object.entries(contexts)) {
      const serialized = JSON.stringify(context)
      assert.ok(!/<\/?[a-z][a-z0-9-]*[\s>]/i.test(serialized) && !/className|class=|style=/.test(serialized) && !/#[0-9a-f]{6}\b/i.test(serialized))
      assert.ok(serialized.length < fullSize * (name === "promo" ? 0.65 : 0.45), `${name} : ${serialized.length} / ${fullSize}`)
    }
  })

  test("le brief du mode démo s'adapte sans fait inventé", () => {
    const request: EmailGenerationRequest = emailBriefToGenerationRequest(defaultEmailBrief)
    assert.deepEqual(Object.keys(request).sort(), ["audience", "brief", "campaignName", "objective", "subject"])
  })
})
