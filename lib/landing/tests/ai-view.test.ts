/**
 * Vue IA (ai-view.ts) : projection compacte du contexte envoyé à Claude.
 * Elle ne réécrit aucun texte de lame : ces tests prouvent que tout ce qui
 * guide le choix des lames, les garde-fous factuels, `no-contact` et les
 * ressources contrôlées sont conservés, et pourquoi chaque règle retirée de la
 * vue reste couverte ailleurs. Ils ne dépendent d'aucun appel au modèle.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { aiViewCompositionRuleIds, aiViewResourceRuleIds, buildLandingAiView } from "../ai-view"
import { buildLandingAiPrompt, landingSystemPrompt } from "../ai-prompt"
import { resolveLandingDraft } from "../draft-resolver"
import { landingDestinations, landingDestinationUrl, landingOrigin } from "../destinations"
import { safeParseLandingGenerationDraft } from "../generation-draft"
import { landingImages } from "../image-catalog"
import { safeParseLandingPage } from "../schemas"
import { compositionRules, getSectionCatalogEntry, sectionCatalog } from "../section-catalog"
import { getSectionGeneration } from "../section-generation"
import { context, draftOf, draftSection, page, props, prompt, request, section } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const view = buildLandingAiView(context)
const count = (text: string, needle: string) => text.split(needle).length - 1
const hero = () => section("hero", "editorial-hero", props["editorial-hero"]())
const finalCta = (id: string) => section(id, "final-cta", props["final-cta"]())

describe("ai-view : sections", () => {
  const candidates = context.sections.map((entry) => entry.type)

  test("les 11 candidates (dont CampaignSpotlight, une seule fois), dans l'ordre du catalogue source", () => {
    assert.equal(view.sections.length, 11)
    assert.deepEqual(view.sections.map((entry) => entry.type), candidates)
    assert.deepEqual(candidates, sectionCatalog.filter((entry) => getSectionGeneration(entry.type).status === "generable").map((entry) => entry.type))
    assert.equal(view.sections.filter((entry) => entry.type === "campaign-spotlight").length, 1)
    assert.equal(prompt.user.split("campaign-spotlight").length - 1, 1)
    assert.ok(!prompt.user.includes("CampaignSpotlight"), "le nom de composant n'est pas envoyé")
  })

  test("les 10 candidates historiques sont inchangées par l'ajout de CampaignSpotlight (même texte, mêmes champs)", () => {
    const historical = ["editorial-hero", "immersive-hero", "value-props", "pillars", "content-carousel", "audience-switcher", "narrative-split", "step-sequence", "destination-cards", "final-cta"]
    assert.deepEqual(view.sections.filter((entry) => entry.type !== "campaign-spotlight").map((entry) => entry.type), historical)
    // Taille des 10 anciennes entrées : 6 562 avec la vue V2, puis 6 522 après l'alignement de ContentCarousel
    // (bestFor sans témoignages) ; toute autre entrée est restée identique.
    assert.equal(JSON.stringify(view.sections.filter((entry) => entry.type !== "campaign-spotlight")).length, 6522)
  })

  test("ContentCarousel : collection de contenus éditoriaux génériques, sans témoignage, avis ni contenu nommé", () => {
    const carousel = view.sections.find((entry) => entry.type === "content-carousel")!
    const text = JSON.stringify(carousel)
    assert.ok(!/témoignage|\bavis\b|success.?stor/i.test(text), "pas de témoignage, d'avis ni de success story")
    assert.ok(!/articles?\b|guides?\b|ressources?\b|actualités?|études? de cas/i.test(carousel.bestFor.join(" ")), "aucun contenu nommé comme usage")
    assert.deepEqual(carousel.bestFor, ["thèmes", "sujets", "inspiration"])
    assert.match(carousel.description, /^Carrousel horizontal de contenus éditoriaux/)
    assert.match(carousel.description, /catégorie, un titre et une photo/)
    assert.ok(!("guidance" in carousel), "aucune guidance ajoutée")
  })

  test("ContentCarousel reste distinct d'AudienceSwitcher (aucun terme d'audience, usages disjoints)", () => {
    const carousel = view.sections.find((entry) => entry.type === "content-carousel")!
    const switcher = view.sections.find((entry) => entry.type === "audience-switcher")!
    assert.ok(!/audience|persona|profil|situation/i.test(JSON.stringify(carousel)))
    assert.ok(carousel.bestFor.every((usage) => !switcher.bestFor.includes(usage)))
  })

  test("CampaignSpotlight : ni hero, ni category, guidance présente, textes du catalogue", () => {
    const spotlight = view.sections.find((entry) => entry.type === "campaign-spotlight")!
    assert.ok(!("isHero" in spotlight) && !("category" in spotlight))
    assert.ok((spotlight.guidance ?? []).length >= 4)
    assert.match(spotlight.avoidWhen.join(" "), /préférer narrative-split/)
  })

  test("INVARIANT : description, bestFor, avoidWhen et guidance sont identiques à la source, mot pour mot", () => {
    for (const projected of view.sections) {
      const source = getSectionCatalogEntry(projected.type as never) as ReturnType<typeof getSectionCatalogEntry>
      assert.equal(projected.description, source.description, `${projected.type} description`)
      assert.deepEqual(projected.bestFor, [...source.bestFor], `${projected.type} bestFor`)
      assert.deepEqual(projected.avoidWhen, [...source.avoidWhen], `${projected.type} avoidWhen`)
      if (source.guidance && source.guidance.length > 0) assert.deepEqual(projected.guidance, [...source.guidance], `${projected.type} guidance`)
      else assert.ok(!("guidance" in projected), `${projected.type} : guidance vide omise`)
    }
  })

  test("hero : isHero:true exactement sur editorial-hero et immersive-hero, jamais isHero:false", () => {
    assert.deepEqual(view.sections.filter((entry) => "isHero" in entry).map((entry) => entry.type), ["editorial-hero", "immersive-hero"])
    assert.ok(view.sections.every((entry) => !("isHero" in entry) || entry.isHero === true))
    assert.ok(!JSON.stringify(view).includes('"isHero":false'))
  })

  test("placement conservé : `first` de la source ⇔ isHero:true, `any` ⇔ champ absent", () => {
    for (const projected of view.sections) {
      const placement = getSectionCatalogEntry(projected.type as never).placement
      assert.equal("isHero" in projected, placement === "first", projected.type)
    }
  })

  test("category n'est plus envoyée, mais reste dans la source", () => {
    assert.ok(!JSON.stringify(view.sections).includes('"category"'))
    assert.ok(context.sections.every((entry) => typeof entry.category === "string"))
    assert.equal(getSectionCatalogEntry("final-cta").category, "conversion")
  })

  test("Pillars (principes parallèles) et StepSequence (progression ordonnée) restent distinctes", () => {
    const pillars = view.sections.find((entry) => entry.type === "pillars")!
    const steps = view.sections.find((entry) => entry.type === "step-sequence")!
    assert.match((pillars.guidance ?? []).join(" "), /principes parallèles/)
    assert.match((pillars.guidance ?? []).join(" "), /ordre des items est l'ordre de numérotation/)
    assert.ok(!/étapes d'un parcours/.test(JSON.stringify(pillars)), "Pillars ne revendique plus les étapes")
    assert.match(steps.description, /progression ordonnée/)
    assert.match(steps.bestFor.join(" "), /séquentiel/)
    assert.match(steps.avoidWhen.join(" "), /idées parallèles ou bénéfices : préférer pillars ou value-props/)
    assert.match((steps.guidance ?? []).join(" "), /ne présente jamais comme processus Studi/)
  })

  test("FinalCta : l'information « au plus une, dernière » reste donnée à Claude, et la validation reste l'autorité", () => {
    const closing = view.rules.composition.find((rule) => /clôture/.test(rule))!
    assert.match(closing, /dernière section/)
    assert.match(closing, /qu'une fois/)
    assert.match(view.sections.find((entry) => entry.type === "final-cta")!.description, /clôture/)
    assert.equal(safeParseLandingPage(page([hero(), finalCta("a"), finalCta("b")])).success, false)
    assert.equal(safeParseLandingPage(page([hero(), finalCta("a"), section("v", "value-props", props["value-props"]())])).success, false)
    assert.ok(safeParseLandingPage(page([hero(), finalCta("a")])).success)
  })
})

describe("ai-view : règles", () => {
  const source = [...context.rules.composition, ...context.rules.resources]
  const retired = ["single-hero", "hero-first", "short-and-coherent", "images-only", "image-framing", "destination-only", "facts-only"]

  test("format : des chaînes seulement (les ids restent dans la source)", () => {
    assert.ok(view.rules.composition.every((rule) => typeof rule === "string"))
    assert.ok(view.rules.resources.every((rule) => typeof rule === "string"))
    assert.ok(source.every((rule) => typeof rule.id === "string" && rule.id.length > 0))
    assert.ok(!JSON.stringify(view.rules).includes('"id"'))
  })

  test("liste blanche par ids stables : 5 règles de composition et 3 de ressources, textes exacts de la source", () => {
    assert.deepEqual([...aiViewCompositionRuleIds], ["hero-by-message", "closing-last", "no-exhaustive-use", "editorial-purpose", "no-redundancy"])
    assert.deepEqual([...aiViewResourceRuleIds], ["image-reuse", "cta-label", "no-contact"])
    const byId = new Map(source.map((rule) => [rule.id, rule.rule]))
    for (const id of [...aiViewCompositionRuleIds, ...aiViewResourceRuleIds]) assert.ok(byId.has(id), `id absent de la source : ${id}`)
    assert.deepEqual(view.rules.composition, aiViewCompositionRuleIds.map((id) => byId.get(id)))
    assert.deepEqual(view.rules.resources, aiViewResourceRuleIds.map((id) => byId.get(id)))
  })

  test("les règles retirées de la vue restent dans la source, intactes, et sont absentes de la vue", () => {
    for (const id of retired) {
      const rule = source.find((entry) => entry.id === id)
      assert.ok(rule, `${id} : conservée dans la source`)
      assert.ok(!JSON.stringify(view.rules).includes(rule!.rule), `${id} : absente de la vue`)
    }
    assert.equal(compositionRules.length, 10)
    assert.ok(!view.rules.composition.some((rule) => /href|ids de section/.test(rule)), "règles d'ids et d'ancres : côté résolveur")
  })

  test("pourquoi : « un seul hero, en première section » est porté par le système ET par LandingPageSchema", () => {
    assert.match(landingSystemPrompt, /Le hero, s'il y en a un, est la première section, et il n'y en a qu'un/)
    const second = section("hero2", "immersive-hero", props["immersive-hero"]())
    assert.equal(safeParseLandingPage(page([hero(), second])).success, false, "deux heroes refusés")
    assert.equal(safeParseLandingPage(page([section("v", "value-props", props["value-props"]()), hero()])).success, false, "hero hors tête refusé")
  })

  test("pourquoi : « page courte et cohérente » est dans le système, et no-exhaustive-use reste envoyée", () => {
    assert.match(landingSystemPrompt, /une page courte et cohérente vaut mieux qu'une page remplie/)
    assert.ok(view.rules.composition.some((rule) => /Ne pas utiliser toutes les sections par défaut/.test(rule)))
  })

  test("pourquoi : « désigner images et destinations par id » est dans le système ET imposé par le schéma du Draft", () => {
    assert.match(landingSystemPrompt, /images : désigne chaque image par son id, pris dans context\.images/)
    assert.match(landingSystemPrompt, /CTA : désigne la destination par son id, pris dans context\.destinations ; tu n'écris aucun lien/)
    const schema = JSON.stringify(prompt.outputSchema)
    for (const image of landingImages) assert.ok(schema.includes(`"${image.id}"`), image.id)
    for (const id of Object.keys(landingDestinations)) assert.ok(schema.includes(`"${id}"`), id)
    const cta = draftSection["editorial-hero"]().cta
    assert.equal(safeParseLandingGenerationDraft(draftOf({ ...draftSection["editorial-hero"](), image: "/images/hero-bilan.jpg" })).success, false)
    assert.equal(safeParseLandingGenerationDraft(draftOf({ ...draftSection["editorial-hero"](), cta: { ...cta, href: "https://www.studi.com/fr/formations" } })).success, false)
  })

  test("pourquoi : le cadrage des images est une affaire d'application, pas de modèle", () => {
    assert.equal(safeParseLandingGenerationDraft(draftOf({ ...draftSection["editorial-hero"](), position: "left" })).success, false)
    assert.match(read("lib/landing/draft-resolver.ts"), /positionFor\(image\?\.subject\)/)
  })
})

describe("ai-view : faits, no-contact", () => {
  const factsRule = context.rules.resources.find((rule) => rule.id === "facts-only")!.rule
  const factItems = factsRule
    .slice(0, factsRule.indexOf(" n'apparaît"))
    .replace(/^Un /, "")
    .split(/, | ou /)
    .map((item) => item.replace(/^(un|une) /, "").trim())

  test("le contenu de sécurité de facts-only (toutes ses entrées, lues dans la source) est dans le système", () => {
    assert.equal(factItems.length, 13, factItems.join(" | "))
    for (const item of factItems) assert.ok(landingSystemPrompt.includes(item), `interdit manquant dans le système : ${item}`)
    assert.match(landingSystemPrompt, /nombre d'apprenants/)
    assert.match(landingSystemPrompt, /sauf s'il figure dans request\.facts, repris à l'identique/)
  })

  test("les faits événementiels de CampaignSpotlight sont déjà interdits sans request.facts", () => {
    for (const item of ["date", "heure d'événement", "intervenant", "nombre de places", "gratuité", "replay", "inscription", "urgence", "exclusivité"]) {
      assert.ok(landingSystemPrompt.includes(item), item)
    }
  })

  test("les autres restrictions du système sont intactes : formation, diplôme, métier, lien, image, produit", () => {
    assert.match(landingSystemPrompt, /aucune formation, aucun diplôme ni aucun métier nommé qui ne figure pas dans request/)
    assert.match(landingSystemPrompt, /aucun lien, aucune image ni aucun produit hors context/)
  })

  test("une seule liste factuelle dans le payload : aucun doublon entre le système et le message", () => {
    const payload = `${prompt.system}\n${prompt.user}`
    for (const term of ["code promo", "pourcentage", "classement", "nombre d'apprenants"]) assert.equal(count(payload, term), 1, term)
    assert.ok(!prompt.user.includes(factsRule))
    assert.ok(!view.rules.resources.some((rule) => /request\.facts/.test(rule)))
  })

  test("no-contact : texte inchangé, envoyé une seule fois dans le payload (dans la vue, pas dans le système)", () => {
    const noContact = context.rules.resources.find((rule) => rule.id === "no-contact")!.rule
    assert.equal(noContact, "Aucune destination de contact, de formulaire ni de téléchargement n'existe : aucun CTA ne promet un contact, un formulaire ou un téléchargement.")
    assert.ok(view.rules.resources.includes(noContact))
    assert.equal(count(`${prompt.system}\n${prompt.user}`, "Aucune destination de contact"), 1)
    assert.ok(!prompt.system.includes("Aucune destination de contact"))
  })
})

describe("ai-view : images", () => {
  // Textes alternatifs de la page finale, figés : le hint est une autre donnée, `alt` ne doit jamais bouger.
  const frozenAlt: Record<string, string> = {
    "hero-apprenante": "Femme souriante assise sur un canapé, le regard tourné vers la lumière",
    "hero-bilan": "Femme aux cheveux bouclés travaillant sur un ordinateur portable, un casque autour du cou, une tasse jaune près d'elle",
    "hero-parent-enfant": "Femme accroupie jouant avec un jeune enfant dans une pièce lumineuse",
    "audience-1": "Homme souriant, assis à son bureau devant un ordinateur, une tasse jaune posée devant lui",
    "audience-2": "Homme à lunettes montant un escalier, un classeur jaune sous le bras",
    "audience-3": "Femme assise par terre dans son salon, souriante, qui consulte une tablette",
    "content-1": "Femme en tablier rose, souriante, travaillant sur un ordinateur portable dans sa cuisine",
    "content-2": "Femme assise à l'extérieur, un écouteur à l'oreille, qui consulte une tablette",
    "content-3": "Femme debout dans une pièce lumineuse, une tablette à la main, devant un ordinateur portable",
    "content-4": "Deux femmes souriantes sous un ciel bleu, l'une tenant un téléphone",
  }

  test("10 images, aucun ajout ni retrait, ids inchangés", () => {
    assert.deepEqual(landingImages.map((image) => image.id), Object.keys(frozenAlt))
    assert.equal(view.images.length, 10)
    assert.deepEqual(view.images.map((image) => image.id), landingImages.map((image) => image.id))
  })

  test("chaque image a un hint non vide, court et distinctif ; la projection est exactement { id, hint }", () => {
    const hints = landingImages.map((image) => image.hint)
    assert.ok(hints.every((hint) => hint.trim().length > 0 && hint.length <= 70), hints.join(" | "))
    assert.equal(new Set(hints).size, 10)
    assert.ok(landingImages.every((image) => String(image.hint) !== String(image.alt)))
    assert.deepEqual(view.images, landingImages.map(({ id, hint }) => ({ id, hint })))
    assert.ok(view.images.every((image) => Object.keys(image).sort().join() === "hint,id"))
    assert.ok(!JSON.stringify(view.images).includes('"alt"') && !JSON.stringify(view.images).includes('"description"'))
  })

  test("aucun alt modifié, et le résolveur recopie toujours l'alt d'origine dans la page finale", () => {
    for (const image of landingImages) {
      assert.equal(image.alt, frozenAlt[image.id], image.id)
      const parsed = safeParseLandingGenerationDraft(draftOf({ ...draftSection["narrative-split"](), image: image.id }))
      assert.ok(parsed.success, image.id)
      const result = resolveLandingDraft(request, parsed.data, context)
      assert.equal(result.status, "resolved")
      if (result.status !== "resolved") return
      const split = result.config.sections[0]!
      assert.ok(split.type === "narrative-split" && split.props.visual.alt === frozenAlt[image.id] && split.props.visual.src === image.src, image.id)
    }
  })

  test("le système parle du hint, jamais du alt", () => {
    assert.match(landingSystemPrompt, /son hint t'aide à choisir celle qui convient/)
  })
})

describe("ai-view : destinations", () => {
  const paths: Record<string, string> = {
    "catalogue-formations": "/fr/formations",
    metiers: "/fr/metiers",
    diplomes: "/fr/diplomes",
    certificats: "/fr/certificats",
    financement: "/fr/financement",
    "parcours-decouverte": "/fr/parcours-decouverte",
    accompagnement: "/fr/accompagnement",
    methode: "/fr/methode",
  }

  test("8 destinations, mêmes ids, mêmes URLs : ni ajout, ni modification", () => {
    assert.deepEqual(Object.keys(landingDestinations), Object.keys(paths))
    for (const [id, path] of Object.entries(paths)) {
      assert.equal(landingDestinations[id as keyof typeof landingDestinations].path, path, id)
      assert.equal(landingDestinationUrl(id as keyof typeof landingDestinations), `${landingOrigin}${path}`, id)
    }
    assert.ok(!("actualites-studi" in landingDestinations))
  })

  test("la projection est { id, usage } : pas de label, pas d'URL ; le label reste dans la source", () => {
    assert.deepEqual(view.destinations, context.destinations.map(({ id, usage }) => ({ id, usage })))
    assert.ok(view.destinations.every((destination) => Object.keys(destination).sort().join() === "id,usage"))
    assert.ok(!JSON.stringify(view.destinations).includes('"label"') && !JSON.stringify(view.destinations).includes("http"))
    assert.ok(Object.values(landingDestinations).every((destination) => destination.label.length > 0))
  })

  test("diplomes et methode restent compréhensibles sans label", () => {
    const usage = (id: string) => view.destinations.find((destination) => destination.id === id)!.usage
    assert.equal(usage("diplomes"), "Choisir une formation par niveau de diplôme.")
    assert.equal(usage("methode"), "Expliquer la méthode et la pédagogie Studi.")
  })

  test("parcours-decouverte conserve sa règle spéciale (lien secondaire, jamais second bouton)", () => {
    assert.match(view.destinations.find((destination) => destination.id === "parcours-decouverte")!.usage, /lien secondaire, jamais second bouton/)
  })

  test("la résolution d'une destination en URL est inchangée", () => {
    const parsed = safeParseLandingGenerationDraft(draftOf(draftSection["editorial-hero"](), { ...draftSection["final-cta"](), cta: { label: "Voir les métiers", destination: "metiers" } }))
    assert.ok(parsed.success)
    const result = resolveLandingDraft(request, parsed.data, context)
    assert.equal(result.status, "resolved")
    if (result.status !== "resolved") return
    const closing = result.config.sections.at(-1)!
    assert.ok(closing.type === "final-cta" && closing.props.primaryAction.href === "https://www.studi.com/fr/metiers")
  })
})

describe("ai-view : contexte statique et request mesurés séparément", () => {
  test("le message est exactement { request, vue } ; la vue ne dépend pas de request", () => {
    assert.equal(prompt.user, JSON.stringify({ request: prompt.request, context: view }))
    const longBrief = "Un brief long et légitime. ".repeat(140)
    const other = buildLandingAiPrompt({ ...request, brief: longBrief, facts: [{ label: "Fait", value: "Un fait validé." }] })
    assert.equal(other.status, "ready")
    if (other.status !== "ready") return
    const otherContext = JSON.parse(other.user).context
    assert.deepEqual(otherContext, JSON.parse(prompt.user).context)
    assert.ok(other.user.length > prompt.user.length + 3000, "request varie, le message grandit, la vue non")
    assert.equal(other.system, prompt.system)
  })

  test("le contexte statique tient dans son budget de régression (la taille de request n'y compte pas)", () => {
    const staticContext = JSON.stringify(view).length
    // Baseline V2 avant CampaignSpotlight : 9 013 ; avec la candidate : 9 744 ; budget relevé ponctuellement à 9 800.
    assert.ok(staticContext < 9800, `contexte statique : ${staticContext}`)
    // Non-régression de l'alignement ContentCarousel : le contexte ne dépasse jamais sa baseline d'avant le fix (9 744).
    assert.ok(staticContext <= 9744, `contexte statique : ${staticContext}`)
    assert.ok(staticContext > 8000, "le test détecte aussi un contexte anormalement vide")
  })

  test("la vue est sérialisable, déterministe et sans HTML, JSX, CSS ni chemin d'image", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(view)), view)
    assert.deepEqual(buildLandingAiView(context), view)
    assert.ok(!/<\/?[a-z]|className|tailwind|style=|\/images\/|https?:\/\//i.test(JSON.stringify(view)))
  })

  test("la vue n'ajoute rien au schéma Draft (il ne dépend que des branches)", () => {
    assert.ok(!JSON.stringify(prompt.outputSchema).includes("hint"))
    assert.ok(!JSON.stringify(prompt.outputSchema).includes("hint") && !JSON.stringify(prompt.outputSchema).includes("usage"))
  })
})
