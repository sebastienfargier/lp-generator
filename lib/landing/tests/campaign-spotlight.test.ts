/**
 * Lame CampaignSpotlight : contrat final (une seule par page), action contrôlée,
 * composant, renderer, bibliothèque, et branchement IA : Draft strict (ids
 * contrôlés seulement), résolveur, pipeline, faits événementiels (autorité : le
 * système), catalogue et frontière avec NarrativeSplit, contexte et schéma.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { librarySections } from "../../../components/library/registry"
import { toAnthropicJsonSchema } from "../anthropic-schema"
import { landingDestinations } from "../destinations"
import { landingImages } from "../image-catalog"
import { buildLandingAiPrompt, buildLandingPromptContext, landingSystemPrompt } from "../ai-prompt"
import { resolveLandingDraft } from "../draft-resolver"
import { buildLandingGenerationContext, explainLandingSectionSelection } from "../generation-context"
import { buildLandingDraftJsonSchema, landingDraftSectionTypes, safeParseLandingGenerationDraft } from "../generation-draft"
import { validateGeneratedLanding } from "../generation-validation"
import { safeParseLandingPage } from "../schemas"
import { getSectionCatalogEntry } from "../section-catalog"
import { getSectionGeneration, nonGenerableSections } from "../section-generation"
import { catalogueUrl, context, draftOf, draftSection, page, props, prompt, request, section } from "./fixtures"

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

  test("une seule par page (règle du contrat, comme la clôture) ; le placement reste libre dans le contrat", () => {
    assert.ok(safeParseLandingPage(page([hero(), spotlight()])).success)
    const second = { ...(spotlight({ title: "Autre" }) as object), id: "autre" }
    const result = safeParseLandingPage(page([hero(), spotlight(), second]))
    assert.equal(result.success, false)
    assert.ok(messages([hero(), spotlight(), second]).some((message) => message.includes("une seule CampaignSpotlight")))
    // « jamais en ouverture » est une guidance, pas une règle du contrat : une page manuelle peut commencer par la lame.
    assert.ok(safeParseLandingPage(page([spotlight()])).success)
  })
})

describe("CampaignSpotlight : action contrôlée (sectionActions)", () => {
  test("l'action est exposée aux validations existantes : ancre vers une section absente refusée", () => {
    const withHref = (href: string) => spotlight({ primaryAction: { label: "Voir", href } })
    assert.ok(safeParseLandingPage(page([hero(), withHref("#hero")])).success)
    assert.ok(messages([hero(), withHref("#absente")]).some((message) => message.includes("#absente")))
  })

  test("la lame est candidate : la validation de génération l'accepte avec une destination du projet", () => {
    assert.equal(validateGeneratedLanding(page([hero(), spotlight()]), context).status, "valid")
  })

  test("un lien hors destinations contrôlées est refusé par la validation de génération (primaryAction)", () => {
    const external = spotlight({ primaryAction: { label: "Voir", href: "https://exemple.com/live" } })
    const refused = validateGeneratedLanding(page([hero(), external]), context)
    assert.equal(refused.status, "invalid")
    assert.ok(JSON.stringify(refused).includes("primaryAction"))
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

describe("CampaignSpotlight : bibliothèque, générable par IA", () => {
  test("13 lames, 11 générables par IA, 2 en bibliothèque uniquement : ProductHero et ProductGrid", () => {
    const statuses = librarySections.map((entry) => ({ type: entry.type, status: getSectionGeneration(entry.type).status }))
    assert.equal(librarySections.length, 13)
    assert.equal(statuses.filter((entry) => entry.status === "generable").length, 11)
    assert.deepEqual(statuses.filter((entry) => entry.status === "library-only").map((entry) => entry.type).sort(), ["product-grid", "product-hero"])
  })

  test("CampaignSpotlight : Conversion, exemple, générable, plus de raison « bibliothèque uniquement »", () => {
    const entry = librarySections.find((candidate) => candidate.slug === "campaign-spotlight")!
    assert.equal(entry.name, "CampaignSpotlight")
    assert.equal(entry.category, "Conversion")
    assert.equal(entry.example, "/examples/campaign-spotlight")
    assert.deepEqual(getSectionGeneration("campaign-spotlight"), { status: "generable" })
    assert.ok(!("campaign-spotlight" in nonGenerableSections))
    assert.deepEqual(Object.keys(nonGenerableSections).sort(), ["product-grid", "product-hero"])
  })
})

describe("CampaignSpotlight : Draft IA", () => {
  const draft = (extra: object = {}, omit: string[] = []) => {
    const base = omit.reduce((value, key) => without(value, key), draftSection["campaign-spotlight"]() as object)
    return draftOf(draftSection["editorial-hero"](), { ...base, ...extra })
  }
  const accepted = (value: unknown) => safeParseLandingGenerationDraft(value).success

  test("un Draft valide : title, accent, description, image (id), cta {label, destination}", () => {
    assert.ok(accepted(draft()))
    assert.ok((landingDraftSectionTypes as readonly string[]).includes("campaign-spotlight"))
    assert.equal(landingDraftSectionTypes.length, 11)
  })

  test("title, accent, description, image et cta sont tous requis dans le Draft (même si facultatifs dans le contrat final)", () => {
    for (const key of ["title", "accent", "description", "image", "cta"]) assert.equal(accepted(draft({}, [key])), false, key)
    assert.ok(valid(spotlight({}, ["accent", "description"])), "le contrat final reste permissif pour une page manuelle")
  })

  test("image et destination ne se désignent que par id du catalogue : inconnus, chemins et liens refusés", () => {
    for (const image of ["content-99", "/images/content-4.jpg", "https://exemple.com/x.jpg", "", "Content-4"]) assert.equal(accepted(draft({ image })), false, image)
    const cta = draftSection["campaign-spotlight"]().cta
    for (const destination of ["actualites-studi", "live", "https://www.studi.com/fr/formations", "/fr/formations"]) assert.equal(accepted(draft({ cta: { ...cta, destination } })), false, destination)
    assert.equal(accepted(draft({ cta: { ...cta, href: "https://www.studi.com/fr/formations" } })), false)
    assert.equal(accepted(draft({ cta: { label: cta.label } })), false)
  })

  test("refusés : href, url, src, alt, className, style, couleur, HTML, eyebrow, badge, date, heure, durée, intervenant, second CTA, orientation, côté, layout, champ inconnu", () => {
    const extras: object[] = [
      { href: "https://www.studi.com/fr/formations" }, { url: "https://www.studi.com/fr/formations" }, { src: "/images/content-4.jpg" }, { alt: "x" },
      { className: "x" }, { style: "x" }, { color: "green" }, { html: "<b>x</b>" }, { eyebrow: "À la une" }, { badge: "Live" },
      { date: "15 octobre" }, { time: "18 h" }, { duration: "1 h" }, { speaker: "x" },
      { secondCta: { label: "Replay", destination: "metiers" } }, { secondaryCta: { label: "Replay", destination: "metiers" } },
      { orientation: "right" }, { visualSide: "right" }, { layout: "split" }, { inconnu: 1 },
    ]
    for (const extra of extras) assert.equal(accepted(draft(extra)), false, JSON.stringify(extra))
  })

  test("title et accent sont de simples textes : ni HTML ni structure imposés au modèle", () => {
    assert.equal(typeof draftSection["campaign-spotlight"]().title, "string")
    assert.equal(typeof draftSection["campaign-spotlight"]().accent, "string")
    assert.equal(accepted(draft({ accent: "" })), false)
    assert.equal(accepted(draft({ title: "   " })), false)
  })
})

describe("CampaignSpotlight : résolveur", () => {
  const resolved = (extra: object = {}) => {
    const parsed = safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), { ...draftSection["campaign-spotlight"](), ...extra }))
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    return result.status === "resolved" ? result.config : undefined
  }

  test("image → visual (src et alt du catalogue), destination → URL contrôlée, textes et libellé conservés", () => {
    const config = resolved()!
    const step = config.sections[1]!
    assert.ok(step.type === "campaign-spotlight")
    const image = landingImages.find((candidate) => candidate.id === "content-4")!
    assert.equal(step.id, "campaign-spotlight")
    assert.deepEqual(step.props, {
      title: "Explorez les temps forts",
      accent: "de Studi",
      description: "Découvrez les formations Studi et avancez dans votre projet, à votre rythme.",
      visual: { src: image.src, alt: image.alt },
      primaryAction: { label: "Découvrir les formations", href: catalogueUrl },
    })
    assert.ok(safeParseLandingPage(config).success)
  })

  test("chaque image et chaque destination du catalogue se résolvent vers leur src/alt/URL, rien d'autre", () => {
    for (const image of landingImages) {
      const step = resolved({ image: image.id })!.sections[1]!
      assert.ok(step.type === "campaign-spotlight" && step.props.visual.src === image.src && step.props.visual.alt === image.alt, image.id)
    }
    for (const [id, destination] of Object.entries(landingDestinations)) {
      const step = resolved({ cta: { label: "Voir", destination: id } })!.sections[1]!
      assert.ok(step.type === "campaign-spotlight" && step.props.primaryAction.href === `https://www.studi.com${destination.path}`, id)
    }
  })

  test("aucune logique visuelle dans le résolveur : ni côté, ni icône, ni couleur, ni ancre", () => {
    const step = resolved()!.sections[1]!
    assert.ok(!/visualSide|orientation|"icon"|color|#/.test(JSON.stringify(step.props)))
  })

  test("une destination absente du contexte est signalée, jamais inventée", () => {
    const parsed = safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), draftSection["campaign-spotlight"]()))
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, { ...context, destinations: [] })
    assert.equal(result.status, "unresolvable")
    assert.ok(JSON.stringify(result).includes("cta.destination"))
  })
})

describe("CampaignSpotlight : pipeline sans IA", () => {
  test("EditorialHero → NarrativeSplit → CampaignSpotlight → StepSequence → DestinationCards → FinalCta : Draft, résolveur, validation finale", () => {
    const parsed = safeParseLandingGenerationDraft(
      draftOf(draftSection["editorial-hero"](), draftSection["narrative-split"](), draftSection["campaign-spotlight"](), draftSection["step-sequence"](), draftSection["destination-cards"](), draftSection["final-cta"]())
    )
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    assert.deepEqual(result.config.sections.map((entry) => entry.type), ["editorial-hero", "narrative-split", "campaign-spotlight", "step-sequence", "destination-cards", "final-cta"])
    assert.equal(validateGeneratedLanding(result.config, context).status, "valid")
  })

  test("la clôture reste dernière et unique ; CampaignSpotlight peut la précéder", () => {
    const refused = (sections: unknown[]) => {
      const parsed = safeParseLandingGenerationDraft(draftOf(...sections))
      assert.ok(parsed.success)
      const result = resolveLandingDraft(request, parsed.data, context)
      return result.status === "resolved" ? validateGeneratedLanding(result.config, context).status : result.status
    }
    assert.equal(refused([draftSection["editorial-hero"](), draftSection["final-cta"](), draftSection["campaign-spotlight"]()]), "invalid")
    assert.equal(refused([draftSection["editorial-hero"](), draftSection["campaign-spotlight"](), draftSection["final-cta"]()]), "valid")
  })
})

describe("CampaignSpotlight : faits événementiels", () => {
  const eventFacts = ["date", "heure d'événement", "intervenant", "nombre de places", "gratuité", "replay", "inscription", "urgence", "exclusivité"]

  test("l'exemple de Draft et la configuration finale ne contiennent aucun fait événementiel", () => {
    const draftSpot = draftSection["campaign-spotlight"]()
    const finalSpot = props["campaign-spotlight"]()
    const text = [draftSpot.title, draftSpot.accent, draftSpot.description, draftSpot.cta.label, finalSpot.title, finalSpot.accent, finalSpot.description, finalSpot.primaryAction.label].join(" | ")
    assert.ok(!/\d|heure|intervenant|place|gratuit|replay|inscri|urgen|exclusiv|dernier|limité|offert/i.test(text), text)
  })

  test("les interdits restent dans le système, une seule fois, et dans la source request.facts", () => {
    for (const item of eventFacts) assert.ok(landingSystemPrompt.includes(item), item)
    assert.match(landingSystemPrompt, /sauf s'il figure dans request\.facts, repris à l'identique/)
    assert.equal(prompt.system, landingSystemPrompt)
    for (const item of ["gratuité", "replay", "exclusivité", "nombre de places"]) assert.equal(`${prompt.system}\n${prompt.user}`.split(item).length - 1, 1, item)
  })

  test("la guidance renvoie à request.facts sans recopier la liste ; aucun détecteur lexical n'est ajouté au pipeline", () => {
    const guidance = (getSectionCatalogEntry("campaign-spotlight").guidance ?? []).join(" | ")
    assert.match(guidance, /ne reprends des faits événementiels que depuis request\.facts/)
    for (const item of ["gratuité", "replay", "exclusivité", "intervenant", "nombre de places"]) assert.ok(!guidance.includes(item), item)
    for (const path of ["lib/landing/schemas.ts", "lib/landing/generation-validation.ts", "lib/landing/draft-resolver.ts"]) {
      assert.ok(!/replay|gratuit|intervenant|exclusiv|urgence/i.test(code(path)), path)
    }
  })
})

describe("CampaignSpotlight : catalogue, choix de lame, frontière avec NarrativeSplit", () => {
  const entry = getSectionCatalogEntry("campaign-spotlight")
  const view = buildLandingPromptContext(context)
  const projected = view.sections.find((candidate) => candidate.type === "campaign-spotlight")!

  test("entrée compacte et claire : description, bestFor, avoidWhen, guidance, projetée telle quelle", () => {
    assert.equal(entry.description, "Mise en avant visuelle d'une communication ou annonce précise Studi, avec image et CTA.")
    assert.equal(projected.description, entry.description)
    assert.deepEqual(projected.bestFor, [...entry.bestFor])
    assert.deepEqual(projected.avoidWhen, [...entry.avoidWhen])
    assert.deepEqual(projected.guidance, [...(entry.guidance ?? [])])
    assert.equal(view.sections.filter((candidate) => candidate.type === "campaign-spotlight").length, 1)
    assert.ok(JSON.stringify(projected).length <= 800, `entrée : ${JSON.stringify(projected).length}`)
    assert.equal(entry.category, "conversion")
    assert.ok(!("category" in projected))
  })

  test("USE : un brief qui contient une annonce précise ; AVOID : un brief explicatif sans annonce → narrative-split", () => {
    assert.match(entry.bestFor.join(" "), /annonce explicite : live, événement, actualité, campagne éditoriale ou communication spéciale/)
    assert.match(entry.avoidWhen.join(" "), /le brief ne contient aucune annonce précise à mettre en avant/)
    assert.match(entry.avoidWhen.join(" "), /préférer narrative-split pour développer une idée/)
    assert.match((entry.guidance ?? []).join(" | "), /uniquement si le brief contient une annonce explicite/)
  })

  test("guidance : CTA obligatoire vers une destination existante, une seule, jamais en ouverture, title + accent = une phrase", () => {
    const guidance = (entry.guidance ?? []).join(" | ")
    assert.match(guidance, /CTA obligatoire, vers la destination existante la plus cohérente avec le but de l'annonce/)
    assert.match(guidance, /une seule par page, jamais en ouverture/)
    assert.match(guidance, /title \+ accent forment une phrase naturelle/)
    assert.ok(!/<|span|couleur|markup|html/i.test(guidance), "aucune consigne de mise en forme")
  })

  test("NarrativeSplit reste la lame qui développe une idée, sans aucun CTA ; CampaignSpotlight en exige un", () => {
    const narrative = view.sections.find((candidate) => candidate.type === "narrative-split")!
    assert.ok(!/CTA|bouton|action/i.test(JSON.stringify(narrative)))
    assert.match(narrative.description, /Une idée développée/)
    assert.match(projected.description, /CTA/)
    assert.ok(!getSectionCatalogEntry("narrative-split").description.includes("annonce"))
    assert.ok(Object.keys(props["campaign-spotlight"]()).includes("primaryAction"))
    assert.ok(!Object.keys(props["narrative-split"]()).includes("primaryAction"))
  })
})

describe("CampaignSpotlight : hero, destinations, images, contexte", () => {
  test("elle n'est pas un hero : aucun isHero, les deux seuls heroes restent EditorialHero et ImmersiveHero", () => {
    const view = buildLandingPromptContext(context)
    assert.ok(!("isHero" in view.sections.find((candidate) => candidate.type === "campaign-spotlight")!))
    assert.deepEqual(view.sections.filter((candidate) => "isHero" in candidate).map((candidate) => candidate.type), ["editorial-hero", "immersive-hero"])
    assert.equal(getSectionCatalogEntry("campaign-spotlight").placement, "any")
    const first = safeParseLandingGenerationDraft(draftOf(draftSection["campaign-spotlight"](), draftSection["editorial-hero"]()))
    assert.ok(first.success)
    const result = resolveLandingDraft(request, first.data, context)
    assert.equal(result.status === "resolved" ? validateGeneratedLanding(result.config, context).status : result.status, "invalid", "un hero qui ne serait plus en tête reste refusé")
  })

  test("onze candidates ; la lame exige une image (sectionsNeedingImages) : écartée sans image disponible", () => {
    assert.equal(context.sections.length, 11)
    assert.ok(context.sections.some((candidate) => candidate.type === "campaign-spotlight"))
    const bare = buildLandingGenerationContext(request, { images: [], destinations: [] })
    assert.ok(!bare.sections.some((candidate) => candidate.type === "campaign-spotlight"))
    assert.match(explainLandingSectionSelection({ images: [], destinations: [] })["campaign-spotlight"]!, /aucune image/)
    assert.ok(read("lib/landing/generation-context.ts").includes('"campaign-spotlight"'))
  })

  test("toujours 8 destinations, aucune actualites-studi ; la vue reste compacte", () => {
    assert.equal(Object.keys(landingDestinations).length, 8)
    assert.ok(!("actualites-studi" in landingDestinations))
    assert.equal(context.destinations.length, 8)
    assert.ok(!/actualites/i.test(prompt.user))
    const view = buildLandingPromptContext(context)
    assert.ok(view.destinations.every((destination) => Object.keys(destination).sort().join() === "id,usage"))
    assert.ok(view.images.every((image) => Object.keys(image).sort().join() === "hint,id"))
  })

  test("le schéma Draft et le transport contiennent la branche, sans champ libre", () => {
    const schema = buildLandingDraftJsonSchema(landingDraftSectionTypes)
    const text = JSON.stringify(schema)
    assert.match(text, /"section":\{"type":"string","const":"campaign-spotlight"\}/)
    assert.match(JSON.stringify(toAnthropicJsonSchema(schema)), /"section":\{"type":"string","const":"campaign-spotlight"\}/)
    assert.equal(JSON.stringify(prompt.outputSchema), text)
    const ready = buildLandingAiPrompt(request)
    assert.equal(ready.status, "ready")
  })

  test("le message contient l'entrée de la lame une seule fois", () => {
    assert.equal(prompt.user.split("campaign-spotlight").length - 1, 1)
    assert.equal(prompt.user.split("Mise en avant visuelle d'une communication").length - 1, 1)
  })
})
