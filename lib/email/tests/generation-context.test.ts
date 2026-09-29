/**
 * Contexte compact et destinations contrôlées : sélection déterministe, sans
 * URL inventée, assez de lames pour composer un email complet.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { defaultEmailBrief, type EmailBrief } from "../demo-generator"
import {
  emailDestinations,
  emailDestinationUrl,
  emailUnconfirmedDestinations,
  studiOrigin,
} from "../destinations"
import { emailDisclaimers } from "../disclaimers"
import {
  buildEmailGenerationContext,
  explainEmailSectionSelection,
  sendableVisuals,
  type EmailGenerationContextOptions,
} from "../generation-context"
import { emailBlockManifest } from "../manifest"
import { isEmailHref } from "../schemas"
import { getEmailSectionCatalogForPrompt } from "../section-catalog"

const sourcesStudi = (() => {
  try {
    return readFileSync(join(process.env.EMAIL_SOURCES_DIR ?? "", "sources-studi.md"), "utf8")
  } catch {
    return null
  }
})()

const briefs: Record<string, [EmailBrief, EmailGenerationContextOptions]> = {
  reconversion: [defaultEmailBrief, {}],
  accompagnement: [
    { ...defaultEmailBrief, brief: "Présenter l'accompagnement Studi à des personnes qui hésitent à se former seules.", objective: "accompagnement" },
    { emailType: "lifecycle-debut" },
  ],
  evolution: [
    { ...defaultEmailBrief, brief: "Encourager des salariés à monter en compétences en management ou en ressources humaines.", audience: "Salariés qui veulent évoluer", objective: "evolution-carriere" },
    { emailType: "newsletter" },
  ],
  promo: [
    { ...defaultEmailBrief, brief: "Email promo de rentrée : bourse d'études jusqu'à -30 %, avec code promo et date de fin.", objective: "decouverte-formations" },
    { emailType: "promo" },
  ],
}
const contexts = Object.fromEntries(
  Object.entries(briefs).map(([name, [brief, options]]) => [name, buildEmailGenerationContext(brief, options)])
)
const fullSize = JSON.stringify(getEmailSectionCatalogForPrompt()).length
const manifestTypes = new Set(Object.keys(emailBlockManifest))

describe("destinations contrôlées", () => {
  test("chaque URL : hôte des sources, chemin /fr/, placeholder UTM, EmailHref valide", () => {
    for (const id of Object.keys(emailDestinations) as (keyof typeof emailDestinations)[]) {
      const url = emailDestinationUrl(id)
      assert.ok(url.startsWith(`${studiOrigin}/fr/`), url)
      assert.ok(url.endsWith("?[UTM À DÉFINIR — CRM]"), url)
      assert.ok(isEmailHref(url), url)
    }
    assert.equal(studiOrigin, "https://www.studi.com")
  })

  test("chaque chemin a une provenance, et figure dans sources-studi.md si disponible", (context) => {
    for (const destination of Object.values(emailDestinations)) {
      assert.match(destination.source, /^(sources-studi\.md|guidelines-communication\.md) §/)
    }
    if (!sourcesStudi) return context.skip("EMAIL_SOURCES_DIR non défini : vérification des chemins ignorée")
    for (const destination of Object.values(emailDestinations)) {
      if (destination.source.startsWith("sources-studi.md")) {
        assert.ok(sourcesStudi.includes(`\`${destination.path}\``), destination.path)
      }
    }
  })

  test("les destinations non confirmées ne sont pas proposables", () => {
    assert.ok(emailUnconfirmedDestinations.length > 0)
    const labels = new Set<string>(Object.values(emailDestinations).map((destination) => destination.label))
    for (const { label } of emailUnconfirmedDestinations) assert.ok(!labels.has(label), label)
  })
})

describe("contexte de génération", () => {
  test("sérialisable et déterministe", () => {
    for (const [name, [brief, options]] of Object.entries(briefs)) {
      const serialized = JSON.stringify(contexts[name])
      assert.deepEqual(JSON.parse(serialized), contexts[name])
      assert.equal(JSON.stringify(buildEmailGenerationContext(brief, options)), serialized, name)
    }
  })

  test("uniquement des lames connues, sans doublon", () => {
    for (const context of Object.values(contexts)) {
      const types = context.sections.map((section) => section.type)
      assert.equal(new Set(types).size, types.length)
      for (const type of types) assert.ok(manifestTypes.has(type), type)
    }
  })

  test("assez de lames pour composer un email complet", () => {
    for (const [name, context] of Object.entries(contexts)) {
      const families = new Set(context.sections.map((section) => section.family))
      const types = new Set(context.sections.map((section) => section.type))
      assert.ok(types.has("email-module-footer-compact-legal"), `${name} : footer`)
      assert.ok(families.has("Header"), `${name} : header`)
      assert.ok(families.has("Hero"), `${name} : hero`)
      assert.ok(families.has("Story"), `${name} : contenu`)
      assert.ok(families.has("Features") || families.has("Benefits"), `${name} : arguments`)
      assert.ok(context.sections.length >= 8 && context.sections.length <= 18, `${name} : ${context.sections.length}`)
    }
  })

  test("mentions légales seulement quand le brief peut en appeler", () => {
    const has = (name: string) => contexts[name]!.sections.some((section) => section.type === "email-module-legal-disclaimer")
    assert.equal(has("reconversion"), false)
    assert.equal(has("promo"), true)
    assert.ok(!("disclaimers" in contexts.reconversion!))
    assert.ok("disclaimers" in contexts.promo!)
  })

  test("disclaimers : identifiants et intitulés, jamais le texte juridique", () => {
    const serialized = JSON.stringify(contexts.promo)
    for (const { text } of Object.values(emailDisclaimers)) assert.ok(!serialized.includes(text.slice(0, 40)))
  })

  test("product-details : jamais hors promo, toujours limité à Page", () => {
    for (const [name, context] of Object.entries(contexts)) {
      for (const section of context.sections) {
        if (section.type.startsWith("email-module-product-details")) {
          assert.equal(name, "promo")
          assert.deepEqual(section.onlySurfaces, ["page"])
        }
      }
    }
  })

  test("icons-grid jamais proposé (contraste non résolu)", () => {
    for (const context of Object.values(contexts)) {
      assert.ok(!context.sections.some((section) => section.type === "email-module-icons-grid"))
    }
    assert.match(explainEmailSectionSelection(defaultEmailBrief)["email-module-icons-grid"]!, /contraste/)
  })

  test("lames à visuel écartées sans visuel HTTPS ; chemins locaux jamais envoyables", () => {
    const withVisuel = (context: (typeof contexts)[string]) =>
      context.sections.filter((section) => section.slots.some((slot) => slot.endsWith(": asset:visuel")))
    for (const context of Object.values(contexts)) assert.deepEqual(withVisuel(context), [])

    assert.deepEqual(sendableVisuals(["/images/hero-bilan.jpg", "/logos/logo_studi_sombre_lowres.png", "/icones/star.png", "http://a.fr/x.jpg"]), [])
    const local = buildEmailGenerationContext(defaultEmailBrief, { visuals: ["/images/hero-bilan.jpg"] })
    assert.deepEqual(withVisuel(local), [])

    const one = buildEmailGenerationContext(defaultEmailBrief, { visuals: ["https://cdn.studi.com/v.jpg", "/images/hero-bilan.jpg"] })
    assert.deepEqual(one.visuals, ["https://cdn.studi.com/v.jpg"])
    assert.ok(withVisuel(one).length > 0)
    for (const section of withVisuel(one)) {
      assert.equal(section.slots.filter((slot) => slot.endsWith(": asset:visuel")).length, 1, section.type)
    }
  })

  test("liens : uniquement des destinations contrôlées", () => {
    const allowed = new Set((Object.keys(emailDestinations) as (keyof typeof emailDestinations)[]).map((id) => emailDestinationUrl(id)))
    for (const context of Object.values(contexts)) {
      assert.ok(context.links.length > 0)
      for (const link of context.links) assert.ok(allowed.has(link.url), link.url)
      // Hors liens et visuels, aucune URL avec un hôte n'est proposée.
      const rest = JSON.stringify({ ...context, links: [], visuals: [] })
      assert.ok(!/https?:\/\/[a-z0-9]/i.test(rest), rest.match(/https?:\/\/[^"\s]*/)?.[0])
    }
  })

  test("liens : footer toujours, blog seulement pour les types qui l'admettent, filières citées", () => {
    for (const context of Object.values(contexts)) {
      for (const id of ["catalogue-formations", "alternance", "trajectoire-magazine"]) {
        assert.ok(context.links.some((link) => link.id === id), id)
      }
    }
    assert.ok(!contexts.promo!.links.some((link) => link.id.startsWith("blog")))
    assert.ok(contexts.reconversion!.links.some((link) => link.id === "blog-reconversion-professionnelle"))
    const evolutionIds = contexts.evolution!.links.map((link) => link.id)
    assert.ok(evolutionIds.includes("filiere-ressources-humaines-paie"))
    assert.ok(!contexts.accompagnement!.links.some((link) => link.id === "filiere-accompagnement-petite-enfance"))
  })

  test("vocabulaire seulement si nécessaire", () => {
    for (const context of Object.values(contexts)) {
      const kinds = new Set(context.sections.flatMap((section) => section.slots.map((slot) => slot.split(": ")[1])))
      assert.equal("iconNames" in context, kinds.has("asset:icone"))
      assert.equal("disclaimers" in context, kinds.has("disclaimer"))
      assert.deepEqual(Object.keys(context.slotKinds).sort(), [...kinds].sort())
    }
  })

  test("surface recommandée selon le type et l'audience", () => {
    assert.equal(contexts.reconversion!.surfaces.recommended, "marque")
    assert.equal(contexts.promo!.surfaces.recommended, "accent-1")
    assert.equal(buildEmailGenerationContext({ ...defaultEmailBrief, audience: "Demandeurs d'emploi" }).surfaces.recommended, "accent-2-soft")
  })

  test("aucun HTML, classe ni couleur hex", () => {
    for (const context of Object.values(contexts)) {
      const serialized = JSON.stringify(context)
      assert.ok(!/<\/?[a-z][a-z0-9-]*[\s>]/i.test(serialized))
      assert.ok(!/className|class=|style=/.test(serialized))
      assert.ok(!/#[0-9a-f]{6}\b/i.test(serialized))
    }
  })

  test("réduction mesurable par rapport au catalogue complet", () => {
    for (const [name, context] of Object.entries(contexts)) {
      const size = JSON.stringify(context).length
      const limit = name === "promo" ? 0.65 : 0.45
      assert.ok(size < fullSize * limit, `${name} : ${size} / ${fullSize}`)
    }
  })
})
