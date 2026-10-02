/**
 * Choix du hero : les deux heros générables sont décrits par la STRUCTURE du
 * message qu'ils portent, pas par un secteur ni un objectif, et rien ne
 * favorise l'un d'eux (ni mot générique, ni ordre promu en règle, ni tirage au
 * sort). Le choix reste sémantique : Claude interprète le brief.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { buildLandingPromptContext, landingSystemPrompt } from "../ai-prompt"
import { landingDraftSectionTypes, LandingGenerationDraftSchema } from "../generation-draft"
import { compositionRules, getSectionCatalogEntry, getSectionCatalogForPrompt } from "../section-catalog"
import { context } from "./fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

const view = buildLandingPromptContext(context)
const editorial = view.sections.find((section) => section.type === "editorial-hero")!
const immersive = view.sections.find((section) => section.type === "immersive-hero")!
const everything = (entry: { description: string; bestFor: string[]; avoidWhen: string[]; guidance?: string[] }) =>
  [entry.description, ...entry.bestFor, ...entry.avoidWhen, ...(entry.guidance ?? [])].join(" | ")

describe("deux heros, deux structures de message", () => {
  test("les deux sont candidats et présentés au modèle", () => {
    assert.ok(editorial?.isHero && immersive?.isHero)
    assert.deepEqual(view.sections.filter((section) => section.isHero).map((section) => section.type).sort(), ["editorial-hero", "immersive-hero"])
  })

  test("critères distincts : aucun bestFor ni avoidWhen en commun", () => {
    for (const key of ["bestFor", "avoidWhen"] as const) {
      const shared = editorial[key].filter((entry) => immersive[key].includes(entry))
      assert.deepEqual(shared, [], key)
    }
  })

  test("editorial : comprendre, contexte et réassurance, pédagogie, texte secondaire", () => {
    const best = editorial.bestFor.join(" | ")
    assert.match(best, /comprendre/)
    assert.match(best, /contexte|réassurance/)
    assert.match(best, /pédagogique|explicative/)
    assert.match(best, /texte secondaire/)
  })

  test("immersive : impact visuel, promesse courte et forte, émotion, lignes courtes, grande image", () => {
    const best = immersive.bestFor.join(" | ")
    assert.match(best, /impact visuel/)
    assert.match(best, /promesse courte et forte/)
    assert.match(best, /émotionnelle/)
    assert.match(best, /lignes courtes/)
    assert.match(best, /grande image/)
  })

  test("chaque hero s'écarte de ce que l'autre porte (avoidWhen symétriques)", () => {
    assert.match(editorial.avoidWhen.join(" "), /promesse très courte/)
    assert.match(immersive.avoidWhen.join(" "), /expliqué ou nuancé/)
  })
})

describe("aucun mot générique ne favorise editorial", () => {
  const generic = /découverte|reconversion|audience spécifique|orientation|formation(s)? disponible/i

  test("ni secteur, ni objectif business, ni « campagne » dans editorial-hero", () => {
    assert.ok(!generic.test(everything(editorial)), everything(editorial))
    assert.ok(!/campagne/i.test(everything(editorial)), everything(editorial))
  })

  test("ni l'un ni l'autre ne s'appuie sur un secteur ou l'objectif exposé", () => {
    assert.ok(!generic.test(everything(immersive)), everything(immersive))
  })

  test("immersive peut convenir à une campagne dynamique ou promotionnelle SI le brief l'exprime : jamais une règle « promo = immersive »", () => {
    assert.match(immersive.bestFor.join(" "), /campagne dynamique, y compris promotionnelle, lorsque le brief l'exprime/)
    for (const entry of [editorial, immersive]) {
      assert.ok(!/toujours|systématiquement|obligatoire|doit être choisi/i.test(everything(entry)), entry.type)
    }
    assert.ok(!/promo/i.test(everything(editorial)))
  })
})

describe("information incorrecte retirée", () => {
  test("aucun badge, logo ni icône dans ce que le modèle lit des sections candidates", () => {
    const seen = JSON.stringify(view.sections)
    assert.ok(!/badge|logo|icône/i.test(seen), seen.match(/.{30}(badge|logo|icône).{30}/i)?.[0])
    assert.ok(!/badge/i.test(getSectionCatalogEntry("immersive-hero").description))
  })

  test("le Draft continue de refuser un badge : la description et le schéma disent la même chose", () => {
    const hero = { section: "immersive-hero", headline: ["Une ligne"], description: "Court.", image: "hero-bilan", cta: { label: "Voir", destination: "catalogue-formations" } }
    assert.ok(LandingGenerationDraftSchema.safeParse({ sections: [hero] }).success)
    assert.equal(LandingGenerationDraftSchema.safeParse({ sections: [{ ...hero, badge: { label: "Nouveau" } }] }).success, false)
  })
})

describe("prompt : le brief est la source du ton et de l'intention", () => {
  test("plus de ton « clair et sobre » imposé", () => {
    assert.ok(!/sobre/i.test(landingSystemPrompt))
    assert.ok(!/ton clair et sobre/i.test(landingSystemPrompt))
  })

  test("respecter le ton et l'intention du brief, clair et crédible, sans neutraliser", () => {
    assert.match(landingSystemPrompt, /respectes le ton et l'intention exprimés dans le brief/)
    assert.match(landingSystemPrompt, /clair et crédible/)
    assert.match(landingSystemPrompt, /sans neutraliser un ton que le brief demande explicitement/)
  })

  test("pas de liste de styles à choisir", () => {
    assert.ok(!/dynamique|émotionnel|institutionnel|pédagogique|promotionnel/i.test(landingSystemPrompt))
  })

  test("les garde-fous contre l'invention de faits restent intacts", () => {
    assert.match(landingSystemPrompt, /Tu n'inventes rien/)
    assert.match(landingSystemPrompt, /aucun prix, remise, pourcentage/)
    assert.match(landingSystemPrompt, /Respecte context\.rules/)
  })
})

describe("règle neutre de choix du hero", () => {
  const rule = compositionRules.find((entry) => entry.id === "hero-by-message")

  test("présente dans le contexte donné au modèle", () => {
    assert.ok(rule)
    assert.ok(view.rules.composition.includes(rule!.rule), "la vue envoie le texte exact de la règle")
    assert.deepEqual(getSectionCatalogForPrompt().rules.map((entry) => entry.id), compositionRules.map((entry) => entry.id))
  })

  test("le choix suit la manière de présenter le message, jamais l'ordre de la liste", () => {
    assert.match(rule!.rule, /manière dont le message doit être présenté/)
    assert.match(rule!.rule, /explication et réassurance/)
    assert.match(rule!.rule, /impact visuel et promesse courte/)
    assert.match(rule!.rule, /jamais parce qu'un hero est listé en premier/)
    assert.match(rule!.rule, /aucun n'est un choix par défaut/)
    assert.match(rule!.rule, /Interpréter le brief/)
  })

  test("pas une règle rigide : aucun « si X alors hero Y »", () => {
    assert.ok(!/\b(si|quand|lorsque)\b[^.]*(→|alors|=>)/i.test(rule!.rule))
    assert.ok(!/(editorial-hero|immersive-hero|EditorialHero|ImmersiveHero)/.test(rule!.rule))
  })
})

describe("aucun hasard, aucune rotation, aucun changement du Draft", () => {
  test("ni tirage, ni alternance dans le prompt, le catalogue ou le contexte", () => {
    // \b ne connaît pas les lettres accentuées (« numérotation » contient « rotation ») : bornes Unicode.
    const words = /(?<![\p{L}])(aléatoire|aléatoirement|hasard|random|alterne|alterner|alternance|alternativement|rotation|tour à tour|un sur deux)(?![\p{L}])|Math\.random/iu
    const seen = [landingSystemPrompt, JSON.stringify(view), JSON.stringify(getSectionCatalogForPrompt()), read("lib/landing/section-catalog.ts"), read("lib/landing/generation-context.ts"), read("lib/landing/ai-prompt.ts")].join("\n")
    assert.ok(!words.test(seen), seen.match(words)?.[0])
  })

  test("l'ordre du schéma et du catalogue n'a pas été modifié pour provoquer de la variété", () => {
    assert.deepEqual(landingDraftSectionTypes, ["editorial-hero", "immersive-hero", "value-props", "pillars", "content-carousel", "audience-switcher", "narrative-split", "step-sequence", "destination-cards", "campaign-spotlight", "final-cta"])
    assert.deepEqual(view.sections.map((section) => section.type), [...landingDraftSectionTypes])
  })

  test("le Draft des deux heros garde exactement ses champs", () => {
    const draftSource = read("lib/landing/generation-draft.ts")
    assert.match(draftSource, /section: z\.literal\("editorial-hero"\),\s*title: text,\s*supportingText: text,\s*image: DraftImageIdSchema,\s*cta: DraftCtaSchema,/)
    assert.match(draftSource, /section: z\.literal\("immersive-hero"\),\s*\/\*\* Une entrée par ligne affichée\. \*\/\s*headline: nonEmpty\(text\),\s*description: text,\s*image: DraftImageIdSchema,\s*cta: DraftCtaSchema,/)
    assert.ok(!/hero-by-message|badge/i.test(draftSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")))
  })
})
