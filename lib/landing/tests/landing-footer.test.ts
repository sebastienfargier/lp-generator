/**
 * Footer global : shell du renderer, jamais une section. Contenu fixe, liens
 * dérivés des destinations contrôlées, mentions légales sur une URL validée,
 * absent du contrat, du Draft, du catalogue, du contexte et du schéma IA.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { libraryShellCategory, libraryShellParts, librarySections } from "../../../components/library/registry"
import { demoLandingPage } from "../demo"
import { landingDestinations, landingDestinationUrl } from "../destinations"
import { landingFooterNavigationGroups, landingLegalLinks } from "../footer-links"
import { landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { describeGeneratedPage } from "../generator-state"
import { LandingPageSectionSchema, safeParseLandingPage } from "../schemas"
import { sectionCatalog } from "../section-catalog"
import { getSectionGeneration, nonGenerableSections } from "../section-generation"
import { context, draftOf, draftSection, prompt } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
/** Source sans commentaires : on teste le code, pas ce qu'il raconte. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const footerPath = "components/landing/landing-footer.tsx"
const footer = code(footerPath)

describe("LandingFooter : liens fixes", () => {
  test("deux groupes, six liens, dans l'ordre : Explorer puis Votre projet", () => {
    assert.deepEqual(
      landingFooterNavigationGroups.map((group) => [group.label, group.links.map((link) => link.label)]),
      [
        ["Explorer", ["Formations", "Diplômes", "Certificats"]],
        ["Votre projet", ["Métiers", "Financement", "Accompagnement"]],
      ]
    )
    assert.deepEqual(
      landingFooterNavigationGroups.flatMap((group) => group.links.map((link) => link.destination)),
      ["catalogue-formations", "diplomes", "certificats", "metiers", "financement", "accompagnement"]
    )
  })

  test("chaque lien vient d'une destination contrôlée existante, via landingDestinationUrl", () => {
    for (const link of landingFooterNavigationGroups.flatMap((group) => group.links)) {
      assert.ok(link.destination in landingDestinations, link.destination)
      assert.equal(link.href, landingDestinationUrl(link.destination))
      assert.ok(context.destinations.some((destination) => destination.url === link.href), link.href)
      assert.ok(!link.href.includes("?") && !link.href.includes("#"), link.href)
    }
  })

  test("le module est pur et n'écrit aucune URL de destination à la main", () => {
    const source = code("lib/landing/footer-links.ts")
    assert.ok(!/from "react"|next\/|use client/.test(source))
    assert.ok(!/studi\.com\/fr\/(?!mentions-legales)/.test(source))
    assert.match(source, /landingDestinationUrl\(destination\)/)
  })

  test("mentions légales : URL officielle exacte, https absolue, sans suivi, seul lien légal", () => {
    assert.deepEqual(landingLegalLinks, [{ label: "Mentions légales", href: "https://www.studi.com/fr/mentions-legales" }])
    const url = new URL(landingLegalLinks[0]!.href)
    assert.equal(url.protocol, "https:")
    assert.equal(url.search, "")
    assert.equal(url.hash, "")
  })

  test("le lien légal n'entre ni dans destinations.ts ni dans le contexte envoyé au modèle", () => {
    assert.ok(!read("lib/landing/destinations.ts").includes("mentions-legales"))
    assert.ok(!context.destinations.some((destination) => destination.url.includes("mentions-legales")))
    assert.ok(!prompt.user.includes("mentions-legales") && !prompt.system.includes("mentions-legales"))
  })

  test("aucun autre lien légal : confidentialité, cookies, CGU, CGV, accessibilité, RGPD", () => {
    const text = JSON.stringify([landingLegalLinks, landingFooterNavigationGroups]) + footer
    assert.ok(!/confidentialit|cookie|\bcgu\b|\bcgv\b|accessibilit|rgpd/i.test(text))
  })
})

describe("LandingFooter : composant", () => {
  test("composant serveur, hors de components/sections, sans Anthropic", () => {
    assert.ok(!/^["']use client["']/.test(read(footerPath).trimStart()))
    assert.ok(!existsSync(join(root, "components/sections/landing-footer")))
    assert.ok(!/useState|useEffect|<script|anthropic|generate-client|process\.env/i.test(footer))
  })

  test("un seul footer, un seul PageContainer, rendu depuis les données fixes", () => {
    assert.equal((footer.match(/<footer\b/g) ?? []).length, 1)
    assert.equal((footer.match(/<PageContainer\b/g) ?? []).length, 1)
    assert.match(footer, /import \{ landingFooterNavigationGroups, landingLegalLinks \} from "@\/lib\/landing\/footer-links"/)
    assert.match(footer, /landingFooterNavigationGroups\.map/)
    assert.match(footer, /landingLegalLinks\.map/)
  })

  test("logo clair existant, alt Studi, non cliquable, sans nouvel asset", () => {
    assert.match(footer, /src="\/logos\/logo_studi_clair_highres\.png"/)
    assert.match(footer, /alt="Studi"/)
    assert.ok(existsSync(join(root, "public/logos/logo_studi_clair_highres.png")))
    assert.equal((footer.match(/<Image\b/g) ?? []).length, 1)
    assert.ok(!/<svg|<img\b/.test(footer))
    const imageTag = footer.match(/<Image[\s\S]*?\/>/)![0]
    assert.ok(!/href/.test(imageTag))
    assert.ok(!/<Link[^>]*>\s*<Image/.test(footer))
  })

  test("deux navigations nommées ; titres de groupe en texte, listes étiquetées", () => {
    assert.match(footer, /<nav aria-label="Studi"/)
    assert.match(footer, /<nav aria-label="Informations légales"/)
    assert.equal((footer.match(/<nav\b/g) ?? []).length, 2)
    assert.match(footer, /<p id=\{`\$\{id\}-\$\{index\}`\}/)
    assert.match(footer, /<ul role="list" aria-labelledby=\{`\$\{id\}-\$\{index\}`\}/)
    assert.ok(!/<h[1-6]\b/.test(footer))
  })

  test("copyright sans année ; mentions légales rendues depuis la donnée fixe", () => {
    assert.match(footer, /<p>© Studi<\/p>/)
    assert.ok(!/getFullYear|new Date|©\s*\{|©\s*\d/.test(footer))
    assert.ok(!/href="#"|href=""/.test(footer))
    assert.ok(!/https?:\/\//.test(footer))
  })

  test("tokens existants seulement : neutral-950, 0/300/400/800, text-body, text-caption", () => {
    for (const token of ["bg-neutral-950", "text-neutral-0", "text-neutral-300", "text-neutral-400", "border-neutral-800", "text-body", "text-caption", "font-semibold", "focus-visible:outline-neutral-0"]) {
      assert.ok(footer.includes(token), token)
    }
    assert.ok(!/brand-green|text-display/.test(footer))
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(footer), "hex")
    assert.ok(!/style=/.test(footer), "style inline")
    assert.ok(!/\b(fixed|sticky|absolute)\b/.test(footer), "positionnement")
  })

  test("hover discret : transition coupée si mouvement réduit", () => {
    assert.match(footer, /hover:text-neutral-0/)
    assert.match(footer, /motion-reduce:transition-none/)
  })
})

describe("LandingFooter : shell du renderer", () => {
  const renderer = code("components/landing/landing-page-renderer.tsx")

  test("Header, puis main, puis Footer : chacun une seule fois, dans cet ordre", () => {
    assert.equal((renderer.match(/<LandingHeader \/>/g) ?? []).length, 1)
    assert.equal((renderer.match(/<LandingFooter \/>/g) ?? []).length, 1)
    assert.equal((renderer.match(/<main\b/g) ?? []).length, 1)
    const header = renderer.indexOf("<LandingHeader />")
    const main = renderer.indexOf("<main")
    const mainEnd = renderer.indexOf("</main>")
    const foot = renderer.indexOf("<LandingFooter />")
    assert.ok(header < main && main < mainEnd && mainEnd < foot)
    assert.ok(!renderer.slice(main, mainEnd).includes("LandingFooter"))
    assert.match(renderer, /import \{ LandingFooter \} from "\.\/landing-footer"/)
  })

  test("page courte : colonne flex d'au moins la hauteur du viewport, main qui absorbe l'espace libre", () => {
    assert.match(renderer, /<div className="flex min-h-dvh flex-col">/)
    assert.match(renderer, /<main className="flex-1">/)
    assert.ok(!/\b(fixed|sticky)\b|useEffect|useState|innerHeight|style=/.test(renderer))
    assert.ok(!/\[\d+(px|vh|rem)\]/.test(renderer))
  })

  test("aperçu, exemple généré et pages d'exemple de lames : aucun footer ajouté à la main", () => {
    for (const path of ["components/generator/preview-frame.tsx", "components/generator/landing-preview.tsx", "app/examples/generated-landing/page.tsx"]) {
      assert.ok(!/LandingFooter/.test(code(path)), path)
    }
    for (const type of landingDraftSectionTypes) {
      assert.ok(!/LandingFooter|LandingHeader/.test(code(`app/examples/${type}/page.tsx`)), type)
    }
    assert.match(code("app/examples/landing-footer/page.tsx"), /<LandingFooter \/>/)
  })

  test("le compteur de la légende ne compte ni le header ni le footer", () => {
    const five = { ...demoLandingPage, sections: demoLandingPage.sections.slice(0, 5) }
    assert.equal(describeGeneratedPage(five), `Page générée · ${five.sections.length} ${five.sections.length > 1 ? "sections" : "section"}`)
    assert.equal(describeGeneratedPage({ ...demoLandingPage, sections: demoLandingPage.sections.slice(0, 1) }), "Page générée · 1 section")
    assert.ok(!/footer|header/i.test(code("lib/landing/generator-state.ts")))
  })
})

describe("LandingFooter : Library", () => {
  test("pièce du shell global, comme LandingHeader, jamais une lame", () => {
    assert.equal(libraryShellCategory, "Shell global")
    assert.deepEqual(libraryShellParts.map((part) => part.slug), ["landing-header", "landing-footer"])
    const part = libraryShellParts.find((candidate) => candidate.slug === "landing-footer")!
    assert.equal(part.name, "LandingFooter")
    assert.equal(part.example, "/examples/landing-footer")
    assert.equal(part.importPath, "@/components/landing/landing-footer")
    assert.ok(!librarySections.some((entry) => /footer/i.test(entry.slug) || /footer/i.test(entry.type)))
  })

  test("compteurs de lames inchangés par le footer : 13, dont 11 générables et 2 en bibliothèque uniquement", () => {
    const statuses = librarySections.map((entry) => getSectionGeneration(entry.type).status)
    assert.equal(librarySections.length, 13)
    assert.equal(statuses.filter((status) => status === "generable").length, 11)
    assert.equal(statuses.filter((status) => status === "library-only").length, 2)
  })
})

describe("LandingFooter : hors du contrat et de la décision IA", () => {
  const contractTypes = LandingPageSectionSchema.options.map((option) => option.shape.type.value) as string[]
  const names = ["footer", "landing-footer", "LandingFooter"]

  test("pas un type de section, pas au catalogue, pas au Draft, pas une exclusion, pas une candidate", () => {
    for (const name of names) {
      assert.ok(!contractTypes.includes(name), `contrat : ${name}`)
      assert.ok(!sectionCatalog.some((entry) => entry.type === name || entry.name === name), `catalogue : ${name}`)
      assert.ok(!(landingDraftSectionTypes as readonly string[]).includes(name), `Draft : ${name}`)
      assert.ok(!(name in nonGenerableSections), `exclusion : ${name}`)
      assert.ok(!context.sections.some((section) => section.type === name), `contexte : ${name}`)
    }
    assert.throws(() => getSectionGeneration("landing-footer" as never), /sans décision de génération/)
  })

  test("le contrat et le Draft refusent un footer : Claude ne peut pas en fournir", () => {
    assert.equal(safeParseLandingPage({ ...demoLandingPage, footer: { links: [] } }).success, false)
    const draft = draftOf(draftSection["editorial-hero"]())
    assert.equal(safeParseLandingGenerationDraft({ ...draft, footer: { links: [] } }).success, false)
    assert.equal(safeParseLandingGenerationDraft(draftOf({ section: "landing-footer" })).success, false)
  })

  test("ni le contrat, ni le Draft, ni le résolveur, ni le catalogue ne connaissent le footer", () => {
    for (const path of ["lib/landing/schemas.ts", "lib/landing/generation-draft.ts", "lib/landing/draft-resolver.ts", "lib/landing/section-catalog.ts", "lib/landing/section-generation.ts", "lib/landing/ai-prompt.ts", "lib/landing/generation-context.ts"]) {
      assert.ok(!/landing-footer|LandingFooter|footer-links|mentions[- ]l[ée]gales/i.test(read(path)), path)
    }
  })

  test("le prompt et le schéma de sortie envoyés au modèle ne contiennent rien du footer", () => {
    const sent = JSON.stringify([prompt.system, prompt.user, prompt.outputSchema])
    assert.ok(!/footer|mentions[- ]l[ée]gales|Informations légales/i.test(sent))
  })
})
