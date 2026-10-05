/**
 * Resolver déterministe du Draft Email : shell, ids, liens, image, surface ;
 * EmailConfig et le renderer réel restent l'autorité.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailDestinations, emailDestinationUrl } from "../destinations"
import { resolveEmailDraftToConfig, resolveEmailGenerationDraft } from "../draft-resolver"
import { emailDraftDestinations, safeParseEmailGenerationDraft } from "../generation-draft"
import type { EmailGenerationRequest } from "../generation-request"
import { emailImageCatalog, resolveEmailImage } from "../image-catalog"
import { emailBlockManifest } from "../manifest"
import { toPreviewHtml } from "../preview"
import { renderEmail } from "../renderer"
import { safeParseEmailConfig } from "../schemas"
import type { EmailBlock, EmailConfig } from "../types"
import { bodyFixtures, draftRequest, draftWith, heroImages, referenceDraft } from "./draft-fixtures"

function resolve(request: EmailGenerationRequest, draft: unknown = referenceDraft) {
  const result = resolveEmailDraftToConfig(request, draft)
  if (result.status !== "resolved") assert.fail(JSON.stringify(result))
  return result.config
}

const types = (config: EmailConfig) => config.blocks.map((block) => block.type.replace(/^email-(module-)?/, ""))
const surfaceOf = (block: EmailBlock) => ("surface" in block ? block.surface : undefined)
const isColored = (block: EmailBlock) => surfaceOf(block) !== undefined && surfaceOf(block) !== "page"
const colored = (config: EmailConfig) => config.blocks.filter(isColored)
const slotText = (block: EmailBlock, slot: string) => (block.slots as Record<string, { text?: string } | undefined>)[slot]?.text

describe("resolver : la fixture de référence, de bout en bout", () => {
  const config = resolve(draftRequest)

  test("Draft → resolver → EmailConfig valide (schemas.ts) → renderer réel → aperçu", () => {
    assert.ok(safeParseEmailConfig(config).success)
    const html = renderEmail(config)
    assert.ok(html.startsWith("<!DOCTYPE") || html.includes("<html"))
    assert.ok(html.includes("Préparez votre prochaine étape, à votre rythme"))
    assert.equal((html.match(/class="lame" width="600"/g) ?? []).length, config.blocks.length)
    const preview = toPreviewHtml(html)
    assert.ok(preview.includes("/images/email-demo-reconversion.jpg") && !preview.includes("demo-assets.invalid"))
    assert.ok(html.includes("https://demo-assets.invalid/email-demo-reconversion.jpg") && !html.includes("/images/"))
  })

  test("composition : header, hero, corps du Draft, footer ; un seul hero photo", () => {
    assert.deepEqual(types(config), ["header-newsletter", "hero-promotional-image-medium", "numbered-list", "text-and-cta-variant-01", "footer-compact-legal"])
    assert.deepEqual(config.blocks.map((block) => block.id), ["header", "hero", "etapes", "action", "footer"])
    assert.deepEqual([config.version, config.id, config.name], [1, "orientation-et-reconversion", draftRequest.campaignName])
  })

  test("textes recopiés tels quels, sans reformulation ni ajout éditorial", () => {
    const hero = config.blocks[1]!
    assert.equal(slotText(hero, "titre-principal"), referenceDraft.blocks[0]!.type === "hero" ? referenceDraft.blocks[0]!.title : "")
    assert.equal(config.subject, referenceDraft.subject)
    assert.equal(config.preheader, referenceDraft.preheader)
    const texts = JSON.stringify(config).match(/"text":"[^"]*"/g) ?? []
    const draftTexts = JSON.stringify(referenceDraft)
    for (const entry of texts) assert.ok(draftTexts.includes(entry.slice(8, -1)), entry)
  })

  test("le surtitre du hero moyen, sans slot, est ignoré ; les héros large et vertical l'affichent", () => {
    assert.ok(!("sous-titre" in config.blocks[1]!.slots))
    for (const image of ["ecouteur-exterieur", "canape-lumiere"] as const) {
      const hero = resolve(draftRequest, draftWith(image, referenceDraft.blocks[1])).blocks[1]!
      assert.equal(slotText(hero, "sous-titre"), "Orientation", image)
    }
  })
})

describe("resolver : ressources par identifiant", () => {
  test("destination → URL contrôlée de destinations.ts (UTM placeholder), pour chaque CTA", () => {
    const config = resolve(draftRequest)
    const hero = config.blocks[1]!.slots as { "cta-1": { label: string; href: string } }
    assert.deepEqual(hero["cta-1"], { label: "Découvrir les formations", href: emailDestinationUrl("catalogue-formations") })
    const action = config.blocks[3]!.slots as { "cta-1": { href: string } }
    assert.equal(action["cta-1"].href, emailDestinationUrl("metiers"))
    for (const id of emailDraftDestinations) {
      const draft = draftWith("canape-lumiere", { ...referenceDraft.blocks[2], cta: { label: "Voir", destination: id } })
      const body = resolve(draftRequest, draft).blocks.find((block) => block.id === "action")!
      assert.equal((body.slots as { "cta-1": { href: string } })["cta-1"].href, emailDestinationUrl(id), id)
    }
  })

  test("aucun lien libre dans le résultat : toutes les URLs viennent des destinations ; pas de Liquid ni de placeholder d'URL", () => {
    const allowed = new Set(Object.keys(emailDestinations).map((id) => emailDestinationUrl(id as keyof typeof emailDestinations)))
    for (const hero of heroImages) {
      const serialized = JSON.stringify(resolve(draftRequest, draftWith(hero, referenceDraft.blocks[1], bodyFixtures.feature)))
      const urls = serialized.match(/"https?:\/\/[^"]+"/g) ?? []
      for (const url of urls) assert.ok(allowed.has(JSON.parse(url)) || JSON.parse(url).startsWith("https://demo-assets.invalid/"), url)
      assert.ok(!serialized.includes("{{") && !serialized.includes("[URL À CONFIRMER]"))
    }
  })

  test("image → src canonique et alt du catalogue, via resolveEmailImage et la lame de l'image", () => {
    const expected = { tablette: "hero-promotional-image-medium", ecouteur: "hero-split-image", canape: "hero-promotional-image-large" }
    const byImage = [
      ["tablette-interieur", expected.tablette],
      ["ecouteur-exterieur", expected.ecouteur],
      ["canape-lumiere", expected.canape],
    ] as const
    for (const [image, lame] of byImage) {
      const hero = resolve(draftRequest, draftWith(image, referenceDraft.blocks[1])).blocks[1]!
      assert.equal(hero.type, `email-module-${lame}`)
      assert.deepEqual((hero.slots as { "image-1": unknown })["image-1"], resolveEmailImage(image, hero.type))
      assert.equal(((hero.slots as { "image-1": { alt: string } })["image-1"]).alt, emailImageCatalog[image].alt)
    }
  })

  test("une image refusée par le catalogue ne se résout pas : le Draft la refuse avant le resolver", () => {
    const result = resolveEmailDraftToConfig(draftRequest, draftWith("duo-ciel-bleu" as never, referenceDraft.blocks[1]))
    assert.equal(result.status, "invalid-draft")
  })
})

describe("resolver : shell, ids, mentions légales", () => {
  test("footer : exactement un, en dernier, trois liens contrôlés (libellés des destinations)", () => {
    for (const hero of heroImages) {
      const config = resolve(draftRequest, draftWith(hero, referenceDraft.blocks[1]))
      assert.equal(config.blocks.filter((block) => block.type === "email-module-footer-compact-legal").length, 1)
      assert.equal(config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
      assert.deepEqual(config.blocks.at(-1)!.slots, {
        "lien-1": { label: "Catalogue Studi", href: emailDestinationUrl("catalogue-formations") },
        "lien-2": { label: "Catalogue Alternance", href: emailDestinationUrl("alternance") },
        "lien-3": { label: "Magazine Trajectoire", href: emailDestinationUrl("trajectoire-magazine") },
      })
    }
  })

  test("header : newsletter par défaut ; campagne (étiquette = nom de campagne) pour un email promo ; jamais choisi par le Draft", () => {
    assert.equal(resolve(draftRequest).blocks[0]!.type, "email-module-header-newsletter")
    for (const emailType of ["newsletter", "lifecycle-debut", "lifecycle-fin", "transactionnel"] as const) {
      assert.equal(resolve({ ...draftRequest, emailType }).blocks[0]!.type, "email-module-header-newsletter", emailType)
    }
    const promo = resolve({ ...draftRequest, emailType: "promo" }).blocks[0]!
    assert.equal(promo.type, "email-module-header-seasonal-campaign")
    assert.equal(slotText(promo, "label"), draftRequest.campaignName)
  })

  test("ids techniques : uniques, au format attendu, hors du Draft", () => {
    const full = draftWith("canape-lumiere", referenceDraft.blocks[1], bodyFixtures.icons, bodyFixtures.grid, bodyFixtures.feature)
    const config = resolve({ ...draftRequest, facts: [{ statement: "Un fait.", disclaimer: "financement-personnel" }] }, full)
    const ids = config.blocks.map((block) => block.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/)
    assert.equal(JSON.stringify(referenceDraft).includes('"id"'), false)
    assert.equal(resolve({ ...draftRequest, campaignName: "2026 : Été !" }).id, "email-2026-ete")
    assert.equal(resolve({ ...draftRequest, campaignName: "Été Studi" }).id, "ete-studi")
  })

  test("mentions légales : absentes par défaut ; ajoutées avant le footer seulement si des faits appellent un disclaimer", () => {
    assert.ok(!types(resolve(draftRequest)).includes("legal-disclaimer"))
    assert.ok(!types(resolve({ ...draftRequest, facts: [{ statement: "Un fait sans mention." }] })).includes("legal-disclaimer"))
    const config = resolve({ ...draftRequest, facts: [{ statement: "Le paiement peut être échelonné.", disclaimer: "financement-personnel" }] })
    assert.deepEqual(types(config).slice(-2), ["legal-disclaimer", "footer-compact-legal"])
    assert.deepEqual(config.blocks.at(-2)!.slots, { "disclaimer-1": { disclaimer: "financement-personnel" } })
    assert.ok(renderEmail(config).includes("Voir les conditions."))
    const two = resolve({
      ...draftRequest,
      facts: [{ statement: "A.", disclaimer: "financement-personnel" }, { statement: "B.", disclaimer: "financement-cpf-100" }, { statement: "C.", disclaimer: "financement-personnel" }],
    })
    assert.deepEqual(Object.keys(two.blocks.at(-2)!.slots), ["disclaimer-1", "disclaimer-2"])
  })

  test("mentions légales : une date de fin exigée vient de l'offre, sinon le Draft ne se résout pas ; au plus deux disclaimers", () => {
    const facts = [{ statement: "Remise.", disclaimer: "offre-promotionnelle" as const }]
    const without = resolveEmailDraftToConfig({ ...draftRequest, facts }, referenceDraft)
    assert.equal(without.status, "unresolvable")
    assert.ok(without.status === "unresolvable" && without.issues[0]!.path === "request.offer.endDate")
    const offer = { summary: "Offre de rentrée.", endDate: "2026-10-31", disclaimer: "offre-promotionnelle" as const }
    const config = resolve({ ...draftRequest, facts, offer })
    assert.deepEqual(config.blocks.at(-2)!.slots, { "disclaimer-1": { disclaimer: "offre-promotionnelle", endDate: "2026-10-31" } })
    const many = resolveEmailDraftToConfig(
      { ...draftRequest, facts: ["financement-personnel", "financement-cpf-100", "financement-100-general"].map((disclaimer) => ({ statement: "x", disclaimer: disclaimer as never })) },
      referenceDraft
    )
    assert.equal(many.status, "unresolvable")
  })

  test("l'objet imposé par la requête l'emporte sur celui du Draft", () => {
    assert.equal(resolve({ ...draftRequest, subject: "Objet imposé par la demande" }).subject, "Objet imposé par la demande")
    assert.equal(resolve(draftRequest).subject, referenceDraft.subject)
  })
})

describe("resolver : surfaces", () => {
  const requests: [string, EmailGenerationRequest, string][] = [
    ["défaut", draftRequest, "marque"],
    ["newsletter", { ...draftRequest, emailType: "newsletter" }, "marque"],
    ["promo", { ...draftRequest, emailType: "promo" }, "accent-1"],
    ["transactionnel", { ...draftRequest, emailType: "transactionnel" }, "bloc"],
    ["empathie", { ...draftRequest, audience: "Demandeurs d'emploi en recherche d'emploi" }, "accent-2-soft"],
  ]

  test("une seule zone colorée, sur le hero, de la surface recommandée par la requête", () => {
    for (const [label, request, surface] of requests) {
      const config = resolve(request)
      assert.equal(colored(config).length, 1, label)
      assert.equal(surfaceOf(config.blocks[1]!), surface, label)
      assert.equal(config.blocks[1]!.id, "hero")
    }
  })

  test("jamais deux surfaces colorées à la suite, quels que soient le hero, le corps et la requête ; le shell reste en Page", () => {
    const bodies = [[referenceDraft.blocks[1]], [bodyFixtures.icons, bodyFixtures.grid], [bodyFixtures.feature, bodyFixtures.text, bodyFixtures.icons, referenceDraft.blocks[1]]]
    for (const [, request] of requests) {
      for (const hero of heroImages) {
        for (const body of bodies) {
          const config = resolve(request, draftWith(hero, ...body))
          assert.ok(colored(config).length <= 1)
          config.blocks.forEach((block, index) => {
            if (emailBlockManifest[block.type].surfaceMode === "fixed") assert.equal("surface" in block, false, block.id)
            const previous = config.blocks[index - 1]
            assert.ok(!(previous && isColored(previous) && isColored(block)), `${previous?.id} puis ${block.id}`)
          })
          assert.ok(safeParseEmailConfig(config).success)
          renderEmail(config)
        }
      }
    }
  })

  test("la surface colorée se rend sur chaque hero V1 et chaque surface recommandée", () => {
    for (const [, request] of requests) for (const hero of heroImages) assert.ok(renderEmail(resolve(request, draftWith(hero, referenceDraft.blocks[1]))).length > 1000)
  })

  test("le Draft n'a aucune prise sur la surface : seul le resolver en pose", () => {
    assert.equal(JSON.stringify(referenceDraft).includes("surface"), false)
    assert.equal(safeParseEmailGenerationDraft({ ...referenceDraft, blocks: [{ ...referenceDraft.blocks[0]!, surface: "encre" }, referenceDraft.blocks[1]] }).success, false)
  })
})

describe("resolver : déterminisme et pipeline", () => {
  test("même Draft + même requête → même EmailConfig, même HTML ; l'entrée n'est pas modifiée", () => {
    const snapshot = JSON.stringify(referenceDraft)
    const first = resolve(draftRequest)
    const second = resolve(draftRequest)
    assert.deepEqual(first, second)
    assert.equal(renderEmail(first), renderEmail(second))
    assert.equal(JSON.stringify(referenceDraft), snapshot)
  })

  test("Draft invalide → « invalid-draft » avec chemins, sans résolution partielle", () => {
    const result = resolveEmailDraftToConfig(draftRequest, { ...referenceDraft, blocks: [{ type: "footer" }] })
    assert.equal(result.status, "invalid-draft")
    assert.ok(result.status === "invalid-draft" && result.issues.length > 0 && result.issues.every((issue) => issue.path && issue.message))
    assert.equal(resolveEmailDraftToConfig(draftRequest, null).status, "invalid-draft")
    assert.equal(resolveEmailDraftToConfig(draftRequest, "texte").status, "invalid-draft")
  })

  test("le resolver pur renvoie un EmailConfig que seul schemas.ts valide ; l'entrée du pipeline est validée avant", () => {
    const parsed = safeParseEmailGenerationDraft(referenceDraft)
    assert.ok(parsed.success)
    const resolution = resolveEmailGenerationDraft(draftRequest, parsed.data)
    assert.equal(resolution.status, "resolved")
    assert.deepEqual(resolution.status === "resolved" && resolution.config, resolve(draftRequest))
  })

  test("toutes les combinaisons de corps V1 produisent un email valide et rendu (un hero, un à quatre blocs)", () => {
    const pool = [referenceDraft.blocks[1]!, bodyFixtures.icons, bodyFixtures.grid, bodyFixtures.text, bodyFixtures.feature, referenceDraft.blocks[2]!]
    let count = 0
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const body = pool.filter((_, index) => mask & (1 << index))
      if (body.length > 4) continue
      const withCta = body.filter((block) => block.type === "feature" || block.type === "cta")
      if (withCta.length > 1) continue
      for (const hero of heroImages) {
        const config = resolve(draftRequest, draftWith(hero, ...body))
        assert.ok(safeParseEmailConfig(config).success)
        renderEmail(config)
        count += 1
      }
    }
    assert.ok(count > 100, `${count} combinaisons`)
  })
})

describe("resolver : portée", () => {
  test("domaine Email seul : ni Landing, ni Anthropic, ni réseau ; la démo ne dépend pas du Draft", () => {
    const strip = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    for (const path of ["lib/email/draft-resolver.ts", "lib/email/generation-draft.ts"]) assert.ok(!/lib\/landing|@\/components|anthropic|fetch\(/i.test(strip(path)), path)
    for (const path of ["lib/email/demo-generator.ts", "lib/email/generation.ts", "app/api/generate-email/route.ts"]) {
      assert.ok(!/draft-resolver|generation-draft|image-catalog/.test(strip(path)), path)
    }
  })
})
