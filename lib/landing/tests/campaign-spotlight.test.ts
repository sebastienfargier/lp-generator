/**
 * Lame CampaignSpotlight (phase visuelle) : contrat final, action unique
 * contrôlée, composant, renderer, bibliothèque, et ABSENCE totale du domaine IA
 * (lame temporairement « bibliothèque uniquement » : ni Draft, ni résolveur, ni
 * candidate, ni contexte, ni prompt, ni schéma Anthropic).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { librarySections } from "../../../components/library/registry"
import { toAnthropicJsonSchema } from "../anthropic-schema"
import { buildLandingPromptContext } from "../ai-prompt"
import { buildLandingGenerationContext } from "../generation-context"
import { buildLandingDraftJsonSchema, landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { validateGeneratedLanding } from "../generation-validation"
import { safeParseLandingPage } from "../schemas"
import { getSectionCatalogEntry, getSectionCatalogForPrompt } from "../section-catalog"
import { getSectionGeneration, nonGenerableSections } from "../section-generation"
import { catalogueUrl, context, draftOf, draftSection, page, props, prompt, section } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Copie d'un objet sans une clé. */
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

const hero = () => section("hero", "editorial-hero", props["editorial-hero"]())
const spotlight = (patch: object = {}, omit: string[] = []) => {
  const base = omit.reduce((value, key) => without(value, key), props["campaign-spotlight"]() as object)
  return section("temps-forts", "campaign-spotlight", { ...base, ...patch })
}
const valid = (value: unknown) => safeParseLandingPage(page([hero(), value])).success
const messages = (sections: unknown[]) => {
  const result = safeParseLandingPage(page(sections))
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("CampaignSpotlight : contrat final", () => {
  test("valide avec titre, accent, description, visuel et action", () => {
    assert.ok(valid(spotlight()))
  })

  test("accent et description sont facultatifs ; titre, visuel et action sont requis", () => {
    assert.ok(valid(spotlight({}, ["accent"])))
    assert.ok(valid(spotlight({}, ["description"])))
    assert.ok(valid(spotlight({}, ["accent", "description"])))
    for (const key of ["title", "visual", "primaryAction"]) assert.equal(valid(spotlight({}, [key])), false, key)
  })

  test("l'action et le visuel sont complets : libellé et lien, src et alt", () => {
    assert.equal(valid(spotlight({ primaryAction: { label: "Découvrir" } })), false)
    assert.equal(valid(spotlight({ primaryAction: { href: catalogueUrl } })), false)
    assert.equal(valid(spotlight({ visual: { src: "/images/content-4.jpg" } })), false)
    assert.ok(valid(spotlight({ primaryAction: { label: "Découvrir", href: catalogueUrl, icon: null } })))
  })

  test("refusés : eyebrow, badge, date, heure, durée, intervenant, label Live, second CTA, mise en page, style, champ inconnu", () => {
    const extras: object[] = [
      { eyebrow: "À la une" },
      { badge: { label: "Nouveau" } },
      { date: "15 octobre" },
      { time: "18 h" },
      { duration: "1 h" },
      { speaker: "Une intervenante" },
      { live: true },
      { secondaryAction: { label: "Replay", href: catalogueUrl } },
      { secondAction: { label: "Replay", href: catalogueUrl } },
      { orientation: "right" },
      { visualSide: "right" },
      { layout: "split" },
      { className: "x" },
      { style: { color: "red" } },
      { color: "green" },
      { html: "<b>x</b>" },
      { inconnu: 1 },
    ]
    for (const extra of extras) assert.equal(valid(spotlight(extra)), false, JSON.stringify(extra))
  })

  test("aucune règle de page nouvelle : placement et répétition libres dans le contrat", () => {
    assert.ok(safeParseLandingPage(page([spotlight()])).success)
    assert.ok(safeParseLandingPage(page([hero(), spotlight(), spotlight({ title: "Autre" })].map((entry, index) => (index === 2 ? { ...(entry as object), id: "autre" } : entry)))).success)
  })
})

describe("CampaignSpotlight : action contrôlée (sectionActions)", () => {
  test("l'action est exposée aux validations existantes : ancre vers une section absente refusée", () => {
    const withHref = (href: string) => spotlight({ primaryAction: { label: "Voir", href } })
    assert.ok(safeParseLandingPage(page([hero(), withHref("#hero")])).success)
    assert.ok(messages([hero(), withHref("#absente")]).some((message) => message.includes("#absente")))
  })

  test("la validation de génération refuse la lame (hors candidates) : un modèle ne peut pas la produire", () => {
    const result = validateGeneratedLanding(page([hero(), spotlight()]), context)
    assert.equal(result.status, "invalid")
    assert.ok(JSON.stringify(result).includes("hors des sections candidates"))
  })

  test("si la lame devenait candidate, les liens resteraient contrôlés : action hors destinations refusée, destination du projet acceptée", () => {
    const candidate = getSectionCatalogForPrompt().sections.find((entry) => entry.type === "campaign-spotlight")!
    const hypothetical = { ...context, sections: [...context.sections, candidate] }
    const external = spotlight({ primaryAction: { label: "Voir", href: "https://exemple.com/live" } })
    const refused = validateGeneratedLanding(page([hero(), external]), hypothetical)
    assert.equal(refused.status, "invalid")
    assert.ok(JSON.stringify(refused).includes("primaryAction"))
    assert.equal(validateGeneratedLanding(page([hero(), spotlight()]), hypothetical).status, "valid")
  })

  test("le contrat final accepte une action déjà résolue : aucun lien n'est écrit par Claude", () => {
    assert.ok(!/campaign-spotlight|CampaignSpotlight/.test(code("lib/landing/draft-resolver.ts")))
    assert.ok(!/campaign-spotlight|CampaignSpotlight/.test(code("lib/landing/generation-draft.ts")))
  })
})

describe("CampaignSpotlight : composant, renderer, exemple", () => {
  const component = code("components/sections/campaign-spotlight/campaign-spotlight.tsx")

  test("structure : section nommée, un conteneur, un seul grand panneau, un h2, une image", () => {
    assert.match(component, /aria-labelledby=\{titleId\}/)
    assert.match(component, /bg-neutral-100 py-8 text-foreground md:py-12/)
    assert.equal((component.match(/<PageContainer>/g) ?? []).length, 1)
    assert.equal((component.match(/<h2\b/g) ?? []).length, 1)
    assert.equal((component.match(/<Image\b/g) ?? []).length, 1)
    assert.match(component, /overflow-hidden rounded-xl bg-background/)
    assert.match(component, /lg:grid-cols-12/)
    assert.match(component, /lg:col-span-5/)
    assert.match(component, /lg:col-span-7/)
  })

  test("visuel : ratios contrôlés, jamais de hauteur fixe, toujours à gauche, remplit sa colonne", () => {
    assert.match(component, /aspect-3\/2[^"]*sm:aspect-video[^"]*lg:aspect-auto/)
    assert.match(component, /<Image[\s\S]*?fill[\s\S]*?object-cover object-center/)
    assert.ok(!/\bh-\d|min-h-|max-h-|\bh-\[|\bw-\[|style=/.test(component.replace(/h-full/g, "")))
    assert.ok(!/order-|flex-row-reverse|visualSide|side/i.test(component), "aucun contrôle du côté")
  })

  test("titre et accent : un seul h2, deux fragments séparés par une espace, sans HTML injecté", () => {
    assert.match(component, /\{title\}\s*\{accent && \(\s*<>\s*\{" "\}\s*<span className="text-brand-green">\{accent\}<\/span>\s*<\/>\s*\)\}/)
    assert.ok(!/dangerouslySetInnerHTML|<br|line-clamp|truncate|text-ellipsis/.test(component))
    assert.match(component, /text-h1 text-balance/)
  })

  test("CTA unique : Button default xl, flèche inline-end, via le lien du projet", () => {
    assert.equal((component.match(/<Button\b/g) ?? []).length, 1)
    assert.equal((component.match(/<Link\b/g) ?? []).length, 1)
    assert.match(component, /size="xl"/)
    assert.ok(!/variant=/.test(component), "variante par défaut")
    assert.match(component, /nativeButton=\{false\}\s*render=\{<Link href=\{primaryAction\.href\} \/>\}/)
    assert.match(component, /w-full sm:w-auto sm:self-start/)
    assert.match(component, /primaryAction\.icon === undefined \? ArrowRightIcon/)
  })

  test("aucune interaction ni décor promotionnel : pas de badge, vidéo, compte à rebours, hover de panneau, animation", () => {
    assert.ok(!/<Badge|<video|countdown|play|hover:|transition|animate|useState|useEffect|"use client"/i.test(component))
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(component), "hex")
    assert.ok(!/text-display|shadow|border-/.test(component))
  })

  test("le renderer branche la lame avec le helper d'action existant, sans cast", () => {
    const renderer = code("components/landing/section-renderer.tsx")
    assert.match(renderer, /case "campaign-spotlight": \{\s*const \{ primaryAction, \.\.\.props \} = section\.props\s*return \(\s*<CampaignSpotlight\s*\{\.\.\.props\}\s*primaryAction=\{toHeroAction\(primaryAction\)\}/)
    assert.ok(!/\bas any\b|\bas unknown\b/.test(renderer))
    assert.match(renderer, /assertNever\(section\)/)
  })

  test("l'exemple : composant réel, destination contrôlée par le helper du projet, aucun fait d'événement", () => {
    const example = code("app/examples/campaign-spotlight/page.tsx")
    assert.match(example, /import \{ CampaignSpotlight \} from "@\/components\/sections\/campaign-spotlight"/)
    assert.match(example, /landingDestinationUrl\("catalogue-formations"\)/)
    assert.ok(!/https?:\/\//.test(example))
    // Textes affichés seulement (valeurs entre guillemets) : ni live, ni date, ni offre, ni urgence.
    const shown = [...example.matchAll(/(?:title|accent|description|label)=?:?\s*[=:]?\s*"([^"]+)"/g)].map((match) => match[1]).join(" | ")
    assert.ok(shown.length > 40, shown)
    assert.ok(!/live|webinaire|replay|gratuit|places|date|heure|intervenant|remise|offre|urgence|exclusiv|\d+ ?h\b|\d{1,2} (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i.test(shown), shown)
  })
})

describe("CampaignSpotlight : bibliothèque, bibliothèque uniquement", () => {
  test("13 lames, 10 générables par IA, 3 en bibliothèque uniquement : ProductHero, ProductGrid, CampaignSpotlight", () => {
    const statuses = librarySections.map((entry) => ({ type: entry.type, status: getSectionGeneration(entry.type).status }))
    assert.equal(librarySections.length, 13)
    assert.equal(statuses.filter((entry) => entry.status === "generable").length, 10)
    assert.deepEqual(statuses.filter((entry) => entry.status === "library-only").map((entry) => entry.type).sort(), ["campaign-spotlight", "product-grid", "product-hero"])
  })

  test("entrée Library : catégorie Conversion, exemple, raison claire ; le shell global ne change pas", () => {
    const entry = librarySections.find((candidate) => candidate.slug === "campaign-spotlight")!
    assert.equal(entry.name, "CampaignSpotlight")
    assert.equal(entry.category, "Conversion")
    assert.equal(entry.example, "/examples/campaign-spotlight")
    assert.equal(entry.importPath, "@/components/sections/campaign-spotlight")
    const generation = getSectionGeneration("campaign-spotlight")
    assert.equal(generation.status, "library-only")
    assert.match(generation.status === "library-only" ? generation.reason : "", /Intégration IA différée/)
    assert.ok("campaign-spotlight" in nonGenerableSections)
  })
})

describe("CampaignSpotlight : absente du domaine IA (bibliothèque uniquement)", () => {
  const needles = /campaign-spotlight|CampaignSpotlight|mise à l'affiche/

  test("l'entrée de catalogue existe (typage), mais n'est jamais candidate ni envoyée au modèle", () => {
    assert.equal(getSectionCatalogEntry("campaign-spotlight").name, "CampaignSpotlight")
    assert.ok(getSectionCatalogForPrompt().sections.some((entry) => entry.type === "campaign-spotlight"))
    assert.ok(!context.sections.some((entry) => entry.type === "campaign-spotlight"))
    assert.ok(!buildLandingGenerationContext({ ...{ projectName: "x", brief: "y", audience: "z", objective: "discover-trainings" as const } }).sections.some((entry) => entry.type === "campaign-spotlight"))
    assert.equal(context.sections.length, 10)
  })

  test("ni dans le Draft (union, branche), ni dans le résolveur, ni dans le générateur de contexte", () => {
    assert.ok(!(landingDraftSectionTypes as readonly string[]).includes("campaign-spotlight"))
    assert.equal(landingDraftSectionTypes.length, 10)
    assert.equal(safeParseLandingGenerationDraft(draftOf({ section: "campaign-spotlight", ...without(draftSection["final-cta"](), "section") })).success, false)
    for (const path of ["lib/landing/generation-draft.ts", "lib/landing/draft-resolver.ts", "lib/landing/generation-context.ts", "lib/landing/ai-prompt.ts", "lib/landing/anthropic-schema.ts", "lib/landing/destinations.ts"]) {
      assert.ok(!/campaign-spotlight|CampaignSpotlight/.test(read(path)), path)
    }
  })

  test("ni dans le JSON Schema du Draft, ni dans le schéma de transport, ni dans le prompt envoyé", () => {
    const schema = buildLandingDraftJsonSchema(landingDraftSectionTypes)
    assert.ok(!needles.test(JSON.stringify(schema)))
    assert.ok(!needles.test(JSON.stringify(toAnthropicJsonSchema(schema))))
    assert.ok(!needles.test(JSON.stringify(prompt.outputSchema)))
    assert.ok(!needles.test(prompt.system))
    assert.ok(!needles.test(prompt.user))
    assert.ok(!needles.test(JSON.stringify(buildLandingPromptContext(context))))
  })

  test("le texte de guidance propre à la lame n'apparaît nulle part dans le contexte", () => {
    const text = (getSectionCatalogEntry("campaign-spotlight").guidance ?? []).join(" | ")
    for (const line of (getSectionCatalogEntry("campaign-spotlight").guidance ?? [])) assert.ok(!prompt.user.includes(line), line)
    assert.ok(text.length > 0)
    assert.ok(!prompt.user.includes(getSectionCatalogEntry("campaign-spotlight").description))
  })

  test("aucun plafond ni destination ajoutés : le contexte garde sa taille et ses 8 destinations", () => {
    assert.equal(context.destinations.length, 8)
    assert.ok(prompt.user.length < 11500)
    assert.ok(!/actualites|campagne/i.test(JSON.stringify(context.destinations)))
  })
})
