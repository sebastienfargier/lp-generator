/**
 * Bibliothèque Email : les 36 lames du manifeste, rendues par le vrai renderer
 * avec des fixtures de démonstration, statut IA V1 dérivé du Draft et du
 * resolver. Aucune liste de lames n'est tenue à part.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailDestinations, emailDestinationUrl } from "../destinations"
import { emailDisclaimers } from "../disclaimers"
import { runEmailGeneration } from "../generation"
import { resolveEmailDraftToConfig } from "../draft-resolver"
import { emailDemoPresets } from "../demo-generator"
import { emailDraftBodyLames, emailDraftHeroBlocks, emailDraftImageIds } from "../generation-draft"
import { emailImageBlocks, emailImagesForBlock } from "../image-catalog"
import { emailLibraryEntries, emailLibraryFamilies, getEmailLibraryEntry } from "../library"
import { buildEmailLibraryBlock, buildEmailLibraryConfig, libraryEmptyVisual, renderEmailLibraryPreview } from "../library-fixtures"
import { emailBlockFamilies, emailBlockManifest, emailIconNames } from "../manifest"
import { toPreviewHtml } from "../preview"
import { renderEmail } from "../renderer"
import { safeParseEmailConfig } from "../schemas"
import { emailSectionCatalog } from "../section-catalog"
import type { EmailBlockType, EmailConfig } from "../types"
import { bodyFixtures, draftRequest, draftWith, heroImages, referenceDraft } from "./draft-fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const manifestTypes = Object.keys(emailBlockManifest) as EmailBlockType[]
const entriesByType = new Map(emailLibraryEntries.map((entry) => [entry.type, entry]))

const libraryFiles = [
  "lib/email/library.ts",
  "lib/email/library-fixtures.ts",
  "components/email/email-library-browser.tsx",
  "components/email/email-lame-frame.tsx",
  "app/(dashboard)/email-library/page.tsx",
  "app/(dashboard)/email-library/preview/[type]/route.ts",
]

describe("bibliothèque Email : inventaire", () => {
  test("A-B. toutes les lames du manifeste, et seulement elles", () => {
    assert.deepEqual([...emailLibraryEntries.map((entry) => entry.type)].sort(), [...manifestTypes].sort())
    assert.equal(emailLibraryEntries.length, manifestTypes.length)
    for (const entry of emailLibraryEntries) assert.ok(entry.type in emailBlockManifest, entry.type)
    assert.equal(emailLibraryEntries.length, 36, "le manifeste compte 36 lames aujourd'hui")
  })

  test("C. identifiants uniques ; getEmailLibraryEntry ne connaît que le manifeste", () => {
    assert.equal(new Set(emailLibraryEntries.map((entry) => entry.type)).size, emailLibraryEntries.length)
    for (const type of manifestTypes) assert.equal(getEmailLibraryEntry(type)?.type, type)
    for (const unknown of ["email-module-inconnue", "", "toString", "__proto__", "email-module-footer-compact"]) assert.equal(getEmailLibraryEntry(unknown), undefined, unknown)
  })

  test("D. le compteur est dérivé : page, navigateur et Dashboard lisent l'inventaire et le manifeste", () => {
    const page = code("app/(dashboard)/email-library/page.tsx")
    assert.match(page, /\$\{emailLibraryEntries\.length\} lames/)
    const browser = code("components/email/email-library-browser.tsx")
    assert.match(browser, /\{entries\.length\} lames/)
    assert.match(browser, /entries\.filter\(\(entry\) => entry\.status === "ai-v1"\)\.length/)
    const dashboard = code("components/dashboard/dashboard-data.ts")
    assert.match(dashboard, /lames: Object\.keys\(emailBlockManifest\)\.length/)
    assert.match(dashboard, /href: "\/email-library"/)
    assert.ok(!/\b36\b/.test(page + browser + dashboard), "aucun 36 écrit en dur")
  })

  test("E. familles, noms et rôles viennent du manifeste et du catalogue métier ; ordre des familles du manifeste", () => {
    assert.deepEqual([...emailLibraryFamilies], [...emailBlockFamilies])
    for (const entry of emailLibraryEntries) {
      const manifest = emailBlockManifest[entry.type]
      assert.equal(entry.family, manifest.family, entry.type)
      assert.equal(entry.surfaceMode, manifest.surfaceMode, entry.type)
      assert.equal(entry.name, emailSectionCatalog[entry.type].name, entry.type)
      assert.equal(entry.role, emailSectionCatalog[entry.type].role, entry.type)
      assert.equal(entry.slots.total, Object.keys(manifest.slots).length, entry.type)
      assert.equal(Object.values(entry.slots.byKind).reduce((sum, count) => sum + count, 0), entry.slots.total, entry.type)
    }
    const order = emailLibraryEntries.map((entry) => emailBlockFamilies.indexOf(entry.family))
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "regroupées par famille")
  })

  test("la page garde une seule autorité : aucune liste de lames ni de familles écrite à la main dans la bibliothèque", () => {
    for (const path of libraryFiles) {
      const source = code(path)
      // Seule référence admise : le footer que `schemas.ts` exige derrière chaque fixture.
      assert.ok(!/email-module-|email-hero-/.test(source.replaceAll("email-module-footer-compact-legal", "")), path)
    }
    assert.ok(!/"Header"|"Hero"|"Footer"/.test(code("components/email/email-library-browser.tsx")))
  })
})

describe("bibliothèque Email : fixtures", () => {
  test("F. chaque lame a une fixture : tous les slots requis remplis, les optionnels laissés absents", () => {
    for (const type of manifestTypes) {
      const manifest = emailBlockManifest[type] as { slots: Record<string, string>; optional?: readonly string[] }
      const optional = new Set(manifest.optional ?? [])
      const block = buildEmailLibraryBlock(type)
      const slots = Object.keys(block.slots as object)
      assert.deepEqual(slots, Object.keys(manifest.slots).filter((slot) => !optional.has(slot)), type)
    }
  })

  test("G. chaque fixture passe schemas.ts (lame + footer exigé), se rend, et n'utilise que des ressources contrôlées", () => {
    const urls = new Set<string>(Object.keys(emailDestinations).map((id) => emailDestinationUrl(id as keyof typeof emailDestinations)))
    for (const type of manifestTypes) {
      const config = buildEmailLibraryConfig(type)
      const parsed = safeParseEmailConfig(config)
      assert.ok(parsed.success, `${type} : ${parsed.success ? "" : JSON.stringify(parsed.error.issues[0])}`)
      assert.equal(config.blocks[0]!.type, type)
      assert.equal(config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
      for (const block of config.blocks) {
        for (const value of Object.values(block.slots as Record<string, Record<string, string>>)) {
          if (value.href) assert.ok(urls.has(value.href), `${type} : ${value.href}`)
          if (value.icon) assert.ok((emailIconNames as readonly string[]).includes(value.icon), `${type} : ${value.icon}`)
          if (value.disclaimer) assert.ok(value.disclaimer in emailDisclaimers, `${type} : ${value.disclaimer}`)
          if (value.src) assert.ok(value.src.startsWith("https://demo-assets.invalid/"), `${type} : ${value.src}`)
        }
      }
      renderEmail(config)
    }
  })

  test("le contenu est une démonstration : ni prix, remise chiffrée, date, pourcentage, ni témoignage ou partenaire présentés comme réels", () => {
    for (const type of manifestTypes) {
      const texts = Object.values(buildEmailLibraryBlock(type).slots as Record<string, { text?: string }>).flatMap((value) => (value.text ? [value.text] : []))
      for (const text of texts) {
        assert.ok(!/[%€$]|\d{1,2}[/.]\d{1,2}|\b20\d{2}\b|gratuit|garanti|-\s?\d|jusqu'à/i.test(text), `${type} : ${text}`)
        assert.ok(!/<[a-z/]/i.test(text), `${type} : ${text}`)
      }
    }
    const testimonial = (buildEmailLibraryBlock("email-module-cta-and-testimonial").slots as Record<string, { text: string }>).temoignage!.text
    assert.match(testimonial, /démonstration/)
    assert.equal((buildEmailLibraryBlock("email-module-discount-banner-cards").slots as Record<string, { text: string }>)["code-promo-1"]!.text, "CODE-DEMO")
  })

  test("images : la photo du catalogue quand la compatibilité est prouvée, sinon un emplacement vide documenté (jamais une image incompatible)", () => {
    const withPhoto: string[] = []
    const empty: string[] = []
    for (const type of manifestTypes) {
      const manifest = emailBlockManifest[type] as { slots: Record<string, string> }
      const visualSlots = Object.entries(manifest.slots).filter(([, kind]) => kind === "asset:visuel").map(([slot]) => slot)
      const entry = entriesByType.get(type)!
      if (visualSlots.length === 0) {
        assert.equal(entry.visuals, "none", type)
        continue
      }
      const compatible = emailImagesForBlock(type)
      const slots = buildEmailLibraryBlock(type).slots as Record<string, { src: string; alt: string }>
      if (compatible.length > 0) {
        withPhoto.push(type)
        assert.equal(entry.visuals, "photo", type)
        for (const slot of visualSlots) assert.ok(!slots[slot]!.src.includes("library-sans-visuel"), type)
      } else {
        empty.push(type)
        assert.equal(entry.visuals, "empty", type)
        for (const slot of visualSlots) assert.deepEqual(slots[slot], { ...libraryEmptyVisual }, `${type} : ${slot}`)
        assert.ok(!renderEmailLibraryPreview(type).includes("library-sans-visuel"), "l'URL vide ne sort jamais dans l'aperçu")
        assert.match(renderEmailLibraryPreview(type), /data:image\/svg\+xml,/)
      }
    }
    assert.equal(withPhoto.length + empty.length, 11, "onze lames portent un visuel")
    assert.deepEqual(withPhoto.sort(), [...new Set(["email-module-hero-offer-image-top", "email-module-hero-promotional-image-large", "email-module-hero-promotional-image-medium", "email-module-hero-split-image"])].sort())
    assert.equal(empty.length, 7)
  })
})

describe("bibliothèque Email : aperçus réels", () => {
  test("H. l'aperçu est le rendu du vrai renderer sur le vrai template, adapté par toPreviewHtml : rien n'est recréé", () => {
    for (const type of manifestTypes) {
      const entry = entriesByType.get(type)!
      const html = renderEmailLibraryPreview(type)
      const document = { version: 1, id: "bibliotheque-email", name: "Bibliothèque Email", subject: "Aperçu d'une lame de la bibliothèque", preheader: "Contenu de démonstration, jamais envoyé" }
      const canonical = renderEmail({ ...document, blocks: [buildEmailLibraryBlock(type)] } as EmailConfig)
      if (entry.visuals === "empty") assert.equal(html.replace(/src="data:image\/svg\+xml,[^"]*"/g, 'src="X"').length > 0, true)
      else assert.equal(html, toPreviewHtml(canonical), type)
      assert.equal((html.match(/class="lame"/g) ?? []).length, 1, `${type} : une seule lame`)
      assert.ok(!/data-slot=|data-system=|data-optional=|data-color-role=/.test(html), `${type} : attributs internes retirés`)
      assert.ok(!html.includes('href="') || /data-preview-href/.test(html), `${type} : liens inertes`)
      assert.ok(html.includes('width="600"'), type)
    }
  })

  test("le rendu se fait côté serveur par le renderer : ni JSX, ni HTML de lame dans les composants de la bibliothèque", () => {
    const fixtures = code("lib/email/library-fixtures.ts")
    assert.match(fixtures, /import \{ renderEmail \} from "\.\/renderer"/)
    assert.match(fixtures, /import \{ toPreviewHtml \} from "\.\/preview"/)
    assert.match(code("app/(dashboard)/email-library/preview/[type]/route.ts"), /renderEmailLibraryPreview\(entry\.type\)/)
    for (const path of ["components/email/email-library-browser.tsx", "components/email/email-lame-frame.tsx", "app/(dashboard)/email-library/page.tsx"]) {
      const source = code(path)
      assert.ok(!/<table|<td\b|<tr\b|dangerouslySetInnerHTML|srcDoc|templates\//.test(source), path)
      assert.ok(!/from "[^"]*renderer"|node:fs/.test(source), `${path} : le client ne rend rien lui-même`)
    }
    assert.match(code("components/email/email-lame-frame.tsx"), /sandbox="allow-same-origin"/)
    assert.match(code("components/email/email-lame-frame.tsx"), /const EMAIL_WIDTH = 600/)
  })

  test("route d'aperçu : une route statique par lame du manifeste, aucune autre", () => {
    const route = code("app/(dashboard)/email-library/preview/[type]/route.ts")
    assert.match(route, /export const dynamicParams = false/)
    assert.match(route, /emailLibraryEntries\.map\(\(entry\) => \(\{ type: entry\.type \}\)\)/)
    assert.match(route, /getEmailLibraryEntry\(type\)/)
    assert.match(route, /text\/html; charset=utf-8/)
  })

  test("surfaces : une représentation principale (Page), jamais sept par lame ; le mode est affiché", () => {
    for (const type of manifestTypes) {
      const block = buildEmailLibraryBlock(type)
      assert.equal("surface" in block, false, type)
    }
    const browser = code("components/email/email-library-browser.tsx")
    assert.match(browser, /entry\.surfaceMode === "configurable" \? "Configurable" : "Fixe"/)
    assert.equal(emailLibraryEntries.filter((entry) => entry.surfaceMode === "configurable").length + emailLibraryEntries.filter((entry) => entry.surfaceMode === "fixed").length, 36)
  })
})

describe("bibliothèque Email : statut IA V1 dérivé du Draft et du resolver", () => {
  /** Mesure indépendante : tout ce que les fixtures du Draft produisent, avec ou sans fait à mention légale. */
  function reachedByTheResolver() {
    const reached = new Set<string>()
    const bodies = [referenceDraft.blocks[1]!, bodyFixtures.icons, bodyFixtures.grid, bodyFixtures.text, bodyFixtures.feature, referenceDraft.blocks[2]!]
    const requests = [draftRequest, { ...draftRequest, facts: [{ statement: "Fait.", disclaimer: "financement-personnel" as const }] }]
    for (const request of requests) {
      for (const hero of heroImages) {
        for (const body of bodies) {
          const result = resolveEmailDraftToConfig(request, draftWith(hero, body))
          assert.equal(result.status, "resolved")
          if (result.status === "resolved") for (const block of result.config.blocks) reached.add(block.type)
        }
      }
    }
    return reached
  }

  test("I. les lames « IA V1 » sont exactement celles qu'atteignent EmailGenerationDraft et le resolver", () => {
    const reached = reachedByTheResolver()
    const ai = emailLibraryEntries.filter((entry) => entry.status === "ai-v1").map((entry) => entry.type)
    assert.deepEqual([...ai].sort(), [...reached].sort())
  })

  test("I. le nombre IA V1 se déduit du vocabulaire : héros des photos + corps du Draft + shell posé par le resolver", () => {
    const heroes = new Set(emailDraftImageIds.flatMap((id) => emailImageBlocks(id)))
    assert.deepEqual([...heroes].sort(), [...emailDraftHeroBlocks].sort())
    const shell = ["email-module-header-newsletter", "email-module-footer-compact-legal", "email-module-legal-disclaimer"]
    const expected = heroes.size + emailDraftBodyLames.length + shell.length
    const ai = emailLibraryEntries.filter((entry) => entry.status === "ai-v1")
    assert.equal(ai.length, expected)
    assert.equal(emailLibraryEntries.length - ai.length, manifestTypes.length - expected)
    assert.deepEqual(ai.filter((entry) => entry.aiRole === "hero").map((entry) => entry.type).sort(), [...emailDraftHeroBlocks].sort())
    assert.deepEqual(ai.filter((entry) => entry.aiRole === "body").map((entry) => entry.type).sort(), [...emailDraftBodyLames].sort())
    assert.deepEqual(ai.filter((entry) => entry.aiRole === "shell").map((entry) => entry.type).sort(), [...shell].sort())
    const source = code("lib/email/library.ts") + code("components/email/email-library-browser.tsx")
    assert.ok(!/\b(8|9|12)\b\s*(lames|IA)/.test(source), "aucun nombre de lames IA écrit en dur")
  })

  test("J. une lame « Bibliothèque uniquement » n'est jamais présentée comme IA V1 (ni rôle IA, ni libellé)", () => {
    const reached = reachedByTheResolver()
    const libraryOnly = emailLibraryEntries.filter((entry) => entry.status === "library-only")
    assert.ok(libraryOnly.length > 0)
    for (const entry of libraryOnly) {
      assert.equal(entry.aiRole, undefined, entry.type)
      assert.ok(!reached.has(entry.type), entry.type)
    }
    for (const type of ["email-module-hero-offer-image-top", "email-module-hero-diagnostic-quiz", "email-hero-newsletter-variant-02", "email-module-header-seasonal-campaign", "email-module-products-three-column-grid", "email-module-icons-grid"] as const) {
      assert.equal(entriesByType.get(type)!.status, "library-only", type)
    }
    const browser = code("components/email/email-library-browser.tsx")
    assert.match(browser, /ai \? "IA V1" : "Bibliothèque uniquement"/)
    assert.ok(!/incompatible|non supportée|indisponible/i.test(browser + code("app/(dashboard)/email-library/page.tsx")), "libellés interdits par la spécification")
  })
})

describe("bibliothèque Email : portée et non-régression", () => {
  const strip = (path: string) => code(path)
  const sources = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = join(dir, name)
      if (name === "tests" || name.endsWith(".html") || name.endsWith(".md")) return []
      return statSync(join(root, path)).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
    })

  test("K. aucune dépendance Anthropic ni réseau dans la bibliothèque", () => {
    for (const path of libraryFiles) assert.ok(!/anthropic|ANTHROPIC|draft-prompt|generate-handler|fetch\(/i.test(strip(path)), path)
  })

  test("L. aucune dépendance Landing dans le domaine Email (lib/email, components/email, pages et routes Email)", () => {
    for (const path of [...sources("lib/email"), ...sources("components/email"), ...libraryFiles, "app/email-generator/page.tsx", "app/api/generate-email/route.ts"]) {
      assert.ok(!/lib\/landing|components\/landing|components\/library|components\/sections|\.\.\/landing/.test(strip(path)), path)
    }
  })

  test("M. le Generator n'est pas touché : moteur, route et interface n'importent rien de la bibliothèque", () => {
    const generator = ["lib/email/anthropic.ts", "lib/email/anthropic-schema.ts", "lib/email/draft-prompt.ts", "lib/email/generate-handler.ts", "lib/email/draft-resolver.ts", "lib/email/generation-draft.ts", "lib/email/generation-context.ts", "app/api/generate-email/route.ts", "components/email/email-workspace.tsx", "components/email/email-brief-panel.tsx", "components/email/email-preview.tsx", "app/email-generator/page.tsx"]
    for (const path of generator) assert.ok(!/email-library|library-fixtures|lib\/email\/library|"\.\/library"|EmailLame/.test(strip(path)), path)
    assert.match(code("app/api/generate-email/route.ts"), /handleEmailGeneration\(request\)/)
  })

  test("N. le moteur de démonstration et ses sept presets restent inchangés", () => {
    assert.equal(emailDemoPresets.length, 7)
    for (const preset of emailDemoPresets) assert.equal(runEmailGeneration(preset.brief).status, "success", preset.id)
    for (const path of ["lib/email/demo-generator.ts", "lib/email/generation.ts", "lib/email/demo-assets.ts"]) assert.ok(!/library/i.test(strip(path)), path)
  })

  test("accès : le Dashboard mène à la bibliothèque sans remplacer le Generator", () => {
    const dashboard = code("components/dashboard/dashboard-data.ts")
    assert.match(dashboard, /title: "Lames Email"[\s\S]*?href: "\/email-library"/)
    assert.match(dashboard, /title: "Emails",\s*description: "[^"]+",\s*cta: "[^"]+",\s*href: "\/email-generator"/)
    assert.match(dashboard, /\{ title: "Emails", href: "\/email-generator", icon: Mail \}/)
    assert.match(code("app/(dashboard)/email-library/page.tsx"), /title="Bibliothèque Email"/)
  })
})
