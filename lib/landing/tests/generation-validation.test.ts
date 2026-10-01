/**
 * Validation d'une réponse de modèle simulée : unknown → Zod → contrôles
 * liés au contexte → LandingPageConfig. Sans réseau.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { classifyLandingHref, validateGeneratedLanding } from "../generation-validation"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { landingImages } from "../image-catalog"
import { catalogueUrl, context, image, otherImage, page, picture, props, section, validOutput } from "./fixtures"

const validate = (output: unknown) => validateGeneratedLanding(output, context)
const invalidIssues = (output: unknown) => {
  const result = validate(output)
  assert.equal(result.status, "invalid", JSON.stringify(result))
  return result.status === "invalid" ? result.issues : []
}
const messages = (output: unknown) => JSON.stringify(invalidIssues(output))
const hero = (patch: Record<string, unknown>) => page([section("hero", "editorial-hero", { ...props["editorial-hero"](), ...patch })])
const invented = "/images/photo-inventee.jpg"

describe("réponse valide", () => {
  test("une page conforme devient une LandingPageConfig", () => {
    const result = validate(validOutput())
    assert.equal(result.status, "valid")
    if (result.status === "valid") assert.deepEqual(result.config, validOutput())
  })

  test("déterministe", () => {
    assert.deepEqual(validate(validOutput()), validate(validOutput()))
  })
})

describe("sections", () => {
  test("chaque section candidate est acceptée", () => {
    for (const type of context.sections.map((entry) => entry.type)) {
      const output = page([section("bloc", type, props[type as keyof typeof props]())])
      const result = validate(
        // Le hero immersif vise une ancre : on la rend valide en ajoutant sa cible.
        type === "immersive-hero" ? page([section("bloc", type, props[type]()), section("parcours", "pillars", props.pillars())]) : output
      )
      assert.equal(result.status, "valid", `${type} : ${JSON.stringify(result)}`)
    }
  })

  test("une section non candidate est rejetée, même valide pour Zod", () => {
    const productHero = page([section("hero", "product-hero", { title: "Une formation", visual: picture() })])
    const productGrid = page([section("grille", "product-grid", { products: [{ title: "Formation", href: catalogueUrl, image: picture() }] })])
    for (const [output, type] of [[productHero, "product-hero"], [productGrid, "product-grid"]] as const) {
      assert.match(messages(output), new RegExp(`hors des sections candidates.*|Section "${type}"`))
      assert.ok(invalidIssues(output).some((issue) => issue.path === "sections.0.type"))
    }
  })

  test("hero unique et en tête : toujours contrôlé par Zod", () => {
    const secondHero = page([section("hero", "editorial-hero", props["editorial-hero"]()), section("autre", "editorial-hero", props["editorial-hero"]())])
    assert.match(messages(secondHero), /seul hero/)
    const lateHero = page([section("atouts", "value-props", props["value-props"]()), section("hero", "editorial-hero", props["editorial-hero"]())])
    assert.match(messages(lateHero), /première section/)
  })

  test("ids en double refusés", () => {
    assert.match(messages(page([section("bloc", "pillars", props.pillars()), section("bloc", "value-props", props["value-props"]())])), /en double/)
  })
})

describe("liens", () => {
  test("classification : ancre, destination contrôlée, interdit", () => {
    assert.equal(classifyLandingHref("#parcours", context), "anchor")
    assert.equal(classifyLandingHref(catalogueUrl, context), "destination")
    for (const href of ["https://www.studi.com/fr/inventee", "/formations/mba-manager-strategique-rh", "javascript:alert(1)", `${catalogueUrl}?utm=x`, "https://exemple.com", "mailto:contact@studi.fr"]) {
      assert.equal(classifyLandingHref(href, context), "forbidden", href)
    }
  })

  test("destination candidate acceptée, destination inventée rejetée", () => {
    assert.equal(validate(hero({ primaryAction: { label: "Voir", href: catalogueUrl } })).status, "valid")
    for (const href of ["https://www.studi.com/fr/formation-inventee", "/formations/mba-manager-strategique-rh", "https://exemple.com/", "javascript:alert(1)"]) {
      assert.match(messages(hero({ primaryAction: { label: "Voir", href } })), /destinations contrôlées/, href)
    }
  })

  test("ancre valide acceptée, ancre inexistante rejetée", () => {
    const withTarget = (href: string) => page([section("hero", "editorial-hero", { ...props["editorial-hero"](), primaryAction: { label: "Voir", href } }), section("parcours", "pillars", props.pillars())])
    assert.equal(validate(withTarget("#parcours")).status, "valid")
    assert.match(messages(withTarget("#absente")), /ancre/i)
    assert.match(messages(withTarget("#")), /ancre/i)
  })
})

describe("images", () => {
  test("image candidate acceptée, avec son alt du catalogue", () => {
    for (const candidate of landingImages) assert.equal(validate(hero({ visual: { src: candidate.src, alt: candidate.alt } })).status, "valid", candidate.id)
  })

  test("src inventé ou externe rejeté", () => {
    for (const src of [invented, "https://exemple.com/photo.jpg", "/images/email-demo-reconversion.jpg", "/logos/logo_studi_sombre_lowres.png", `${image.src}?v=2`]) {
      assert.match(messages(hero({ visual: { src, alt: "" } })), /catalogue/, src)
    }
  })

  test("src : correspondance exacte avec le catalogue, dans toutes les structures", () => {
    for (const src of [`${image.src} `, image.src.toUpperCase(), image.src.replace("/images/", "/images/../images/"), `https://localhost:3000${image.src}`]) {
      assert.match(messages(hero({ visual: { src, alt: "" } })), /catalogue/, src)
    }
  })

  test("alt : l'alt du catalogue est une suggestion, un alt généré est accepté", () => {
    for (const alt of ["", "Une personne à son bureau", image.alt, "Apprenante en pleine réflexion, un café à la main"]) {
      assert.equal(validate(hero({ visual: { src: image.src, alt } })).status, "valid", JSON.stringify(alt))
    }
    // Y compris dans les structures imbriquées.
    const carousel = page([section("articles", "content-carousel", { items: [{ title: "Un", image: { src: otherImage.src, alt: "Alt reformulé" } }] })])
    assert.equal(validate(carousel).status, "valid")
  })

  test("alt : soumis au contrat texte, ni URL ni balisage", () => {
    assert.match(messages(hero({ visual: { src: image.src, alt: "Voir https://exemple.com/photo" } })), /URL dans un texte/)
    assert.match(messages(hero({ visual: { src: image.src, alt: "<img src=x onerror=y>" } })), /HTML/)
    // Le contrat Zod reste l'autorité : un alt n'est pas un objet.
    assert.ok(invalidIssues(hero({ visual: { src: image.src, alt: { texte: "x" } } })).length > 0)
    assert.ok(invalidIssues(hero({ visual: { src: image.src } })).length > 0)
  })

  test("subject : une aide au cadrage, jamais une règle de validation", () => {
    const positions = ["left", "center", "right"] as const
    for (const candidate of landingImages) {
      for (const position of positions) {
        const output = page([section("hero", "immersive-hero", { headline: ["Une ligne"], visual: { src: candidate.src, alt: candidate.alt, position } })])
        assert.equal(validate(output).status, "valid", `${candidate.id} / ${position} (subject ${candidate.subject})`)
      }
    }
    const source = readFileSync(join(process.cwd(), "lib/landing/generation-validation.ts"), "utf8")
    assert.ok(!/subject/.test(source.replace(/\/\*[\s\S]*?\*\//g, "")))
  })

  test("images imbriquées contrôlées dans chaque structure qui en contient", () => {
    const bad = { src: invented, alt: "" }
    const cases: [string, unknown][] = [
      ["editorial-hero.visual", hero({ visual: bad })],
      ["immersive-hero.visual", page([section("hero", "immersive-hero", { ...props["immersive-hero"](), primaryAction: undefined, visual: { ...bad, position: "left" } })])],
      ["content-carousel.items.image", page([section("articles", "content-carousel", { items: [{ title: "Un", image: picture(otherImage) }, { title: "Deux", image: bad }] })])],
      ["audience-switcher.items.image", page([section("profils", "audience-switcher", { items: [{ id: "actifs", eyebrow: "En poste", title: "Salariés", description: "Se former.", image: bad }] })])],
    ]
    for (const [name, output] of cases) {
      const issues = invalidIssues(output)
      assert.ok(issues.some((issue) => issue.path.endsWith("src") && /catalogue/.test(issue.message)), `${name} : ${JSON.stringify(issues)}`)
    }
    assert.ok(invalidIssues(cases[2]![1]).some((issue) => issue.path === "sections.0.props.items.1.image.src"))
  })

  test("aucun logo : ressource non fournie, même avec une src du catalogue", () => {
    const withLogo = page([section("hero", "immersive-hero", { ...props["immersive-hero"](), primaryAction: undefined, logo: { ...picture(), width: 100, height: 40 } })])
    assert.match(messages(withLogo), /logo/)
  })
})

describe("contrat LandingPageConfig", () => {
  test("className, style et propriété arbitraire rejetés par Zod", () => {
    assert.ok(invalidIssues(hero({ className: "text-red-500" })).length > 0)
    assert.ok(invalidIssues(hero({ style: { color: "red" } })).length > 0)
    assert.ok(invalidIssues({ ...validOutput(), theme: "dark" }).length > 0)
    assert.ok(invalidIssues(page([{ ...section("hero", "editorial-hero", props["editorial-hero"]()), className: "x" }])).length > 0)
  })

  test("type de section inconnu, version inconnue, sections vides rejetés", () => {
    assert.ok(invalidIssues(page([section("faq", "faq-accordion", { items: [] })])).length > 0)
    assert.ok(invalidIssues({ ...validOutput(), version: 2 }).length > 0)
    assert.ok(invalidIssues(page([])).length > 0)
  })

  test("sortie qui n'est pas un objet : refusée sans lever", () => {
    for (const output of [null, undefined, "```json {} ```", 42, [], [validOutput()]]) {
      assert.equal(validate(output).status, "invalid")
    }
  })

  test("HTML, JSX ou URL dans un texte rejetés", () => {
    assert.match(messages(hero({ title: "Bienvenue <b>ici</b>" })), /HTML/)
    assert.match(messages(hero({ supportingText: "<Hero title='x' />" })), /HTML/)
    assert.match(messages(hero({ supportingText: "Rendez-vous sur https://exemple.com/promo" })), /URL dans un texte/)
    assert.match(messages(hero({ supportingText: "Voir www.exemple.com" })), /URL dans un texte/)
  })
})

describe("limites connues du contrôle structurel", () => {
  test("limite acceptée : un fait inventé dans un texte libre n'est PAS détecté", () => {
    // Prix, remise, durée, statistique, garantie, partenaire : texte libre,
    // seul le prompt et request.facts les encadrent.
    const result = validate(hero({ supportingText: "-50 % jusqu'au 31 décembre, 12 000 apprenants, garanti" }))
    assert.equal(result.status, "valid")
  })
})
