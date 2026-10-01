/**
 * Header global : shell du renderer, jamais une section. Il n'est ni dans le
 * contrat, ni dans le Draft, ni dans le catalogue de composition IA, ni une
 * exclusion de génération ; il est présenté à part dans /library.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { libraryShellCategory, libraryShellNote, libraryShellParts, librarySections } from "../../../components/library/registry"
import { resolveLandingDraft } from "../draft-resolver"
import { landingDestinations, landingDestinationUrl } from "../destinations"
import { buildLandingGenerationContext } from "../generation-context"
import { landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { LandingPageSectionSchema, safeParseLandingPage } from "../schemas"
import { sectionCatalog } from "../section-catalog"
import { getSectionGeneration, nonGenerableSections } from "../section-generation"
import { demoLandingPage } from "../demo"
import { context, draftOf, draftSection, request } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
/** Source sans commentaires : on teste le code, pas ce qu'il raconte. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const headerPath = "components/landing/landing-header.tsx"
const header = code(headerPath)
const shell = libraryShellParts.find((part) => part.slug === "landing-header")!

describe("LandingHeader : composant", () => {
  test("composant serveur, hors de components/sections, sans Anthropic ni code client inutile", () => {
    assert.ok(!/^["']use client["']/.test(read(headerPath).trimStart()))
    assert.ok(!existsSync(join(root, "components/sections/landing-header")))
    assert.ok(!/anthropic|generate-client|generate-handler|useState|useEffect|process\.env/i.test(header))
  })

  test("utilise l'asset Studi officiel, avec son ratio natif, via next/image", () => {
    assert.match(header, /import Image from "next\/image"/)
    assert.match(header, /src="\/logos\/logo_studi_sombre_highres\.png"/)
    assert.match(header, /alt="Studi"/)
    assert.match(header, /width=\{1007\}/)
    assert.match(header, /height=\{338\}/)
    assert.ok(existsSync(join(root, "public/logos/logo_studi_sombre_highres.png")))
    assert.ok(!/<svg|<img\b/.test(header))
  })

  test("primitives du projet : PageContainer, Button outline ; aucune valeur arbitraire", () => {
    assert.match(header, /<header className="bg-background py-4">/)
    assert.match(header, /<PageContainer className="flex items-center justify-between gap-4">/)
    assert.match(header, /import \{ PageContainer \} from "@\/components\/layout\/page-container"/)
    assert.match(header, /import \{ Button \} from "@\/components\/ui\/button"/)
    assert.match(header, /variant="outline"/)
    assert.match(header, /size="xl"/)
    assert.match(header, /border-foreground/)
    assert.match(header, /shadow-none/)
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(header), "hex")
    assert.ok(!/style=/.test(header), "style inline")
    assert.ok(!/\b(absolute|fixed|sticky|relative)\b/.test(header), "positionnement")
    assert.ok(!/\b(h|w|min-h|max-w|p[xytblr]?|m[xytblr]?|gap)-\[/.test(header), "valeur arbitraire")
    assert.ok(!/shadow-(?!none)|border-b|divide-/.test(header), "ni ombre ni filet")
  })

  test("CTA : placeholder « CTA », bouton non navigant, aucun lien, aucune destination, aucun contrôle de Claude", () => {
    assert.match(header, /<Button\s+type="button"/)
    assert.match(header, />\s*CTA\s*</)
    assert.ok(!/next\/link|<Link|href|render=|nativeButton|destination|landingDestination|https?:\/\/|studi\.com|\/fr\//.test(header))
    assert.ok(!/Découvrir|formations|catalogue/i.test(header))
  })

  test("aucun menu, aucune navigation, aucun téléphone : uniquement le logo et le CTA", () => {
    assert.ok(!/<nav|<ul|<li\b|Formations|MBA|Financement|propos|questions|\d{2} \d{2} \d{2}/i.test(header))
    assert.equal((header.match(/<Image\b/g) ?? []).length, 1)
    assert.equal((header.match(/<Button\b/g) ?? []).length, 1)
  })
})

describe("LandingHeader : shell du renderer", () => {
  const renderer = code("components/landing/landing-page-renderer.tsx")

  test("rendu automatiquement par LandingPageRenderer, avant <main> et hors de sections[]", () => {
    assert.match(renderer, /import \{ LandingHeader \} from "\.\/landing-header"/)
    const headerAt = renderer.indexOf("<LandingHeader />")
    const mainAt = renderer.indexOf("<main>")
    const mainEnd = renderer.indexOf("</main>")
    assert.ok(headerAt > -1 && headerAt < mainAt, "header avant main")
    assert.ok(mainEnd > mainAt && !renderer.slice(mainAt, mainEnd).includes("LandingHeader"), "header hors de main")
  })

  test("l'aperçu du générateur et l'exemple généré passent par le même renderer, sans ajouter le header à la main", () => {
    assert.match(code("components/generator/preview-frame.tsx"), /<LandingPageRenderer config=\{config\} \/>/)
    assert.match(code("app/examples/generated-landing/page.tsx"), /<LandingPageRenderer config=\{demoLandingPage\} \/>/)
    for (const path of ["components/generator/preview-frame.tsx", "components/generator/landing-preview.tsx", "app/examples/generated-landing/page.tsx"]) {
      assert.ok(!/LandingHeader/.test(code(path)), path)
    }
  })
})

describe("LandingHeader : hors du contrat et de la décision IA", () => {
  const contractTypes = LandingPageSectionSchema.options.map((option) => option.shape.type.value) as string[]
  const headerNames = ["header", "landing-header", "footer", "shell"]

  test("pas un type de section, pas au catalogue de composition, pas au Draft, pas une exclusion", () => {
    for (const name of headerNames) {
      assert.ok(!contractTypes.includes(name), `contrat : ${name}`)
      assert.ok(!sectionCatalog.some((entry) => entry.type === name), `catalogue : ${name}`)
      assert.ok(!(landingDraftSectionTypes as readonly string[]).includes(name), `Draft : ${name}`)
      assert.ok(!(name in nonGenerableSections), `exclusion : ${name}`)
      assert.ok(!context.sections.some((section) => section.type === name), `contexte : ${name}`)
    }
    assert.throws(() => getSectionGeneration("landing-header" as never), /sans décision de génération/)
  })

  test("le contrat et le Draft refusent un header (clé inconnue) : Claude ne peut pas en fournir", () => {
    assert.equal(safeParseLandingPage({ ...demoLandingPage, header: { cta: { label: "X", href: "https://exemple.com" } } }).success, false)
    const draft = draftOf(draftSection["editorial-hero"]())
    assert.ok(safeParseLandingGenerationDraft(draft).success)
    assert.equal(safeParseLandingGenerationDraft({ ...draft, header: { cta: "x" } }).success, false)
    assert.equal(safeParseLandingGenerationDraft(draftOf({ section: "landing-header", cta: draftSection["editorial-hero"]().cta })).success, false)
  })

  test("le contrat, le Draft et le résolveur ne mentionnent ni header ni logo de page", () => {
    for (const path of ["lib/landing/schemas.ts", "lib/landing/generation-draft.ts", "lib/landing/draft-resolver.ts", "lib/landing/section-catalog.ts"]) {
      assert.ok(!/landing-header|LandingHeader/.test(read(path)), path)
    }
  })
})

describe("pas de logo en double dans le parcours IA", () => {
  test("le Draft n'a pas de logo et le résolveur n'en produit jamais, même avec un hero immersif", () => {
    assert.ok(!/logo/i.test(code("lib/landing/generation-draft.ts")))
    assert.ok(!/logo/i.test(code("lib/landing/draft-resolver.ts")))
    const draft = safeParseLandingGenerationDraft(draftOf(draftSection["immersive-hero"](), draftSection["audience-switcher"]()))
    assert.ok(draft.success)
    const result = resolveLandingDraft(request, draft.data, buildLandingGenerationContext(request))
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    const hero = result.config.sections[0]!
    assert.equal(hero.type, "immersive-hero")
    assert.equal("logo" in hero.props, false)
    assert.ok(!JSON.stringify(result.config).includes("/logos/"))
  })

  test("le Draft refuse un logo fourni par Claude", () => {
    assert.equal(safeParseLandingGenerationDraft(draftOf({ ...draftSection["immersive-hero"](), logo: "studi" })).success, false)
  })
})

describe("LandingHeader dans /library : shell global, pas une lame", () => {
  test("déclaré comme pièce du shell, séparé des lames du contrat", () => {
    assert.equal(shell.example, "/examples/landing-header")
    assert.equal(shell.importPath, "@/components/landing/landing-header")
    assert.ok(!librarySections.some((entry) => entry.slug === shell.slug || entry.name === shell.name))
    assert.equal(libraryShellCategory, "Shell global")
    assert.equal(libraryShellNote, "Présent automatiquement sur chaque landing page")
    assert.ok(shell.description.trim() !== "" && shell.usage.includes("<LandingHeader"))
  })

  test("sa page d'exemple rend le vrai composant", () => {
    const example = code("app/examples/landing-header/page.tsx")
    assert.match(example, /import \{ LandingHeader \} from "@\/components\/landing\/landing-header"/)
    assert.match(example, /<LandingHeader \/>/)
  })

  test("la galerie et le détail l'affichent comme Shell global, jamais avec un statut IA", () => {
    const gallery = code("app/library/page.tsx")
    assert.match(gallery, /libraryShellParts\.map/)
    assert.match(gallery, /libraryShellCategory/)
    assert.match(gallery, /libraryShellNote/)
    assert.match(gallery, /\{librarySections\.length\} lames/)
    // Le statut IA n'est rendu que pour une lame.
    const shellSection = gallery.slice(gallery.indexOf("libraryShellParts.map"))
    assert.ok(!/GenerationStatus|Générable par IA|Bibliothèque uniquement/.test(shellSection))
    const detail = code("app/library/[slug]/page.tsx")
    assert.match(detail, /lame \? \(\s*<GenerationStatus type=\{lame\.type\} showReason \/>\s*\) : \(/)
    assert.match(detail, /libraryShellNote/)
  })
})
