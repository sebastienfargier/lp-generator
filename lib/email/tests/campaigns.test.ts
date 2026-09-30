/**
 * Campagnes visuelles du mode démo : un email autour d'une création fournie.
 * Le texte de la création lui appartient : ni extrait, ni recopié, ni
 * transformé en données. Studi Meet est un service d'apprentissage en ligne
 * (source : https://meet.studi.fr/), pas un événement.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailDemoAssetPreviews, emailDemoAssets } from "../demo-assets"
import {
  emailDemoPresets,
  emailDemoVisualNotices,
  emailDemoVisuals,
  generateDemoEmail,
  type EmailBrief,
} from "../demo-generator"
import { emailDestinations, emailDestinationUrl } from "../destinations"
import { runEmailGeneration } from "../generation"
import { emailBriefToGenerationRequest, safeParseEmailGenerationRequest } from "../generation-request"
import { emailBlockManifest } from "../manifest"
import { safeParseEmailConfig } from "../schemas"

const campaignPresets = emailDemoPresets.filter((preset) => preset.group === "campagne")
const briefs = Object.fromEntries(campaignPresets.map((preset) => [preset.id, preset.brief])) as Record<string, EmailBrief>
const blackFriday = briefs["black-friday"]!
const studiDays = briefs["studi-days"]!
const studiMeet = briefs["studi-meet"]!
const types = (brief: EmailBrief) => generateDemoEmail(brief).blocks.map((block) => block.type)
const heroOf = (brief: EmailBrief) => generateDemoEmail(brief).blocks.find((block) => block.id === "hero")!
const surfaceOf = (brief: EmailBrief) => {
  const hero = heroOf(brief)
  return "surface" in hero ? hero.surface : undefined
}
const slots = (brief: EmailBrief) => heroOf(brief).slots as Record<string, unknown>
const texts = (brief: EmailBrief) => {
  const config = generateDemoEmail(brief)
  return [
    config.subject,
    config.preheader,
    ...config.blocks.flatMap((block) =>
      Object.values(block.slots as Record<string, { text?: string; label?: string; alt?: string }>).flatMap((value) => [value.text, value.label, value.alt])
    ),
  ].filter((value): value is string => typeof value === "string")
}
const success = (brief: EmailBrief) => {
  const result = runEmailGeneration(brief)
  if (result.status !== "success") throw new Error(JSON.stringify(result))
  return result
}
const allowedUrls = new Set<string>((Object.keys(emailDestinations) as (keyof typeof emailDestinations)[]).map((id) => emailDestinationUrl(id)))
const socle = readFileSync(join(process.cwd(), "lib/email/socle-email.html"), "utf8")

describe("campagnes visuelles — presets", () => {
  test("les quatre scénarios historiques sont inchangés et sans visuel", () => {
    const scenarios = emailDemoPresets.filter((preset) => preset.group === "scenario")
    assert.deepEqual(scenarios.map((preset) => preset.id), ["reconversion", "accompagnement", "evolution", "promotion"])
    for (const preset of scenarios) assert.ok(!("visual" in preset.brief), preset.id)
  })

  test("trois campagnes visuelles : Black Friday, Studi Days, Studi Meet ; sept presets", () => {
    assert.deepEqual(campaignPresets.map((preset) => [preset.id, preset.label]), [["black-friday", "Black Friday"], ["studi-days", "Studi Days"], ["studi-meet", "Studi Meet"]])
    assert.deepEqual([...emailDemoVisuals], ["black-friday", "studi-days", "studi-meet"])
    assert.equal(emailDemoPresets.length, 7)
    for (const preset of emailDemoPresets) assert.equal(runEmailGeneration(preset.brief).status, "success", preset.id)
  })

  test("chaque campagne : son visuel, avant l'objectif ; l'audience ne change pas ses surfaces", () => {
    assert.equal(blackFriday.visual, "black-friday")
    assert.equal(studiDays.visual, "studi-days")
    assert.deepEqual(types({ ...blackFriday, objective: "accompagnement" }), types(blackFriday))
    assert.deepEqual(generateDemoEmail({ ...studiDays, audience: "Demandeurs d'emploi" }).blocks.map((block) => ("surface" in block ? block.surface : undefined)), [undefined, "marque", undefined, undefined])
  })
})

describe("campagnes visuelles — champ visual interne à la démo", () => {
  test("absent de l'EmailConfig, du HTML et de la requête de génération", () => {
    for (const brief of [blackFriday, studiDays, studiMeet]) {
      const config = generateDemoEmail(brief)
      assert.ok(!("visual" in config) && !JSON.stringify(config).includes('"visual"'))
      const { html, previewHtml } = success(brief)
      // Mot entier : le socle contient « prévisualisation ».
      assert.ok(!/\bvisual\b/i.test(html) && !/\bvisual\b/i.test(previewHtml))
      const request = emailBriefToGenerationRequest(brief)
      assert.ok(!("visual" in request))
      assert.equal(safeParseEmailGenerationRequest({ ...request, visual: brief.visual }).success, false)
    }
  })
})

describe("Black Friday", () => {
  test("header newsletter, grand visuel en Accent 1, footer", () => {
    assert.deepEqual(types(blackFriday), ["email-module-header-newsletter", "email-module-hero-promotional-image-large", "email-module-footer-compact-legal"])
    assert.equal(surfaceOf(blackFriday), "accent-1")
  })

  test("le visuel n'est pas recopié : ni BLACK FRIDAY, ni -40 %, ni remise dans les textes du hero", () => {
    // Textes visibles seulement : l'alt nomme la campagne, pour l'accessibilité.
    const visible = ["sous-titre", "titre-principal", "texte-descriptif", "cta-1"].map((slot) => JSON.stringify(slots(blackFriday)[slot]))
    for (const value of visible) assert.ok(!/black friday|remise|jusqu'à|diplômantes|40/i.test(value), value)
  })

  test("aucune offre extraite : ni -40 %, ni DEMO40, ni code, date, countdown, prix ou disclaimer", () => {
    const all = texts(blackFriday).join(" ")
    assert.ok(!/\d|%|€|\beuros?\b|DEMO|prix|gratuit/i.test(all), all)
    assert.ok(!/jusqu'au|avant le|derniers? jours?|limitée?|profitez|conditions|non cumulable/i.test(all), all)
    for (const block of generateDemoEmail(blackFriday).blocks) {
      assert.ok(!/countdown|discount|offer|banner|legal-disclaimer/.test(block.type), block.type)
      for (const slot of Object.keys(block.slots)) assert.ok(!/code-promo|compteur|valeur-cle|disclaimer/.test(slot), slot)
    }
    const request = emailBriefToGenerationRequest(blackFriday)
    assert.equal(request.offer, undefined)
  })

  test("astérisque sans renvoi : signalé en démo, jamais inventé dans l'email", () => {
    assert.match(emailDemoVisualNotices["black-friday"]!, /astérisque/)
    assert.match(emailDemoVisualNotices["black-friday"]!, /pas prêt pour un envoi réel/)
    const { html } = success(blackFriday)
    assert.ok(!/astérisque|conditions|\*/.test(html.slice(html.indexOf("<body"))))
  })

  test("CTA catalogue", () => {
    assert.deepEqual(slots(blackFriday)["cta-1"], { label: "Découvrir les formations", href: emailDestinationUrl("catalogue-formations") })
  })
})

describe("Studi Days", () => {
  test("header newsletter, grand visuel en Marque, atouts, footer", () => {
    assert.deepEqual(types(studiDays), [
      "email-module-header-newsletter",
      "email-module-hero-promotional-image-large",
      "email-module-icons-list",
      "email-module-footer-compact-legal",
    ])
    assert.equal(surfaceOf(studiDays), "marque")
  })

  test("CTA « Découvrir Studi » vers la méthode ; aucune page Studi Days inventée", () => {
    assert.deepEqual(slots(studiDays)["cta-1"], { label: "Découvrir Studi", href: emailDestinationUrl("methode") })
    for (const [, href] of JSON.stringify(generateDemoEmail(studiDays)).matchAll(/"href":"([^"]+)"/g)) assert.ok(!/days/i.test(href!), href)
    assert.ok(!texts(studiDays).some((value) => /\d|%|€|date|inscri/i.test(value)))
  })
})

describe("Studi Meet", () => {
  const all = () => texts(studiMeet).join(" ")

  test("header newsletter, visuel moyen en Encre, atouts, footer", () => {
    assert.deepEqual(types(studiMeet), [
      "email-module-header-newsletter",
      "email-module-hero-promotional-image-medium",
      "email-module-icons-list",
      "email-module-footer-compact-legal",
    ])
    assert.equal(surfaceOf(studiMeet), "encre")
  })

  test("CTA « Découvrir Studi Meet » vers la destination contrôlée studi-meet", () => {
    assert.deepEqual(slots(studiMeet)["cta-1"], { label: "Découvrir Studi Meet", href: emailDestinationUrl("studi-meet") })
    assert.equal(emailDestinationUrl("studi-meet"), "https://meet.studi.fr/?[UTM À DÉFINIR — CRM]")
    const hrefs = [...JSON.stringify(generateDemoEmail(studiMeet)).matchAll(/"href":"([^"]+)"/g)].map((match) => match[1]!)
    const footerHrefs: string[] = (["catalogue-formations", "alternance", "trajectoire-magazine"] as const).map((id) => emailDestinationUrl(id))
    // Hors footer (liens figés de la lame), aucune destination de substitution.
    for (const href of hrefs.filter((href) => !footerHrefs.includes(href))) {
      assert.equal(href, emailDestinationUrl("studi-meet"))
    }
    const heroHrefs = JSON.stringify(heroOf(studiMeet).slots)
    for (const id of ["trajectoire-magazine", "catalogue-formations", "methode"] as const) assert.ok(!heroHrefs.includes(emailDestinationUrl(id)), id)
  })

  test("service, pas un événement : ni date, lieu, programme, intervenant ni réservation", () => {
    assert.ok(!/\d|€|\$|%/.test(all()), all())
    assert.ok(!/(^|[^a-zà-ÿ])(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)([^a-zà-ÿ]|$)/i.test(all()))
    assert.ok(!/rendez-vous|réserv|inscri|votre place|programme|intervenant|salon|lieu|adresse|événement|evenement|conférence|atelier/i.test(all()), all())
  })

  test("aucune promesse non sourcée", () => {
    assert.ok(!/personnalisé|coach dédié|24\/7|garanti|immédiat|particulier|certifi|gratuit|essai/i.test(all()), all())
  })

  test("pas de second titre « studi MEET » par-dessus le visuel", () => {
    assert.ok(!/meet/i.test(JSON.stringify(slots(studiMeet)["titre-principal"])))
  })

  test("recadrage : 640 × 288, ratio exact du cadre 600 × 270", () => {
    const asset = emailDemoAssets["studi-meet"]
    assert.deepEqual(asset.frame, { width: 600, height: 270 })
    const jpeg = readFileSync(join(process.cwd(), "public", asset.preview))
    let offset = 2
    let size: [number, number] | undefined
    while (offset < jpeg.length && !size) {
      const marker = jpeg[offset + 1]!
      if (marker >= 0xc0 && marker <= 0xc3) size = [jpeg.readUInt16BE(offset + 7), jpeg.readUInt16BE(offset + 5)]
      offset += 2 + jpeg.readUInt16BE(offset + 2)
    }
    assert.deepEqual(size, [640, 288])
  })
})

describe("campagnes visuelles — rendu, aperçu, largeur", () => {
  for (const [name, brief] of [["Black Friday", blackFriday], ["Studi Days", studiDays], ["Studi Meet", studiMeet]] as const) {
    const asset = emailDemoAssets[brief.visual!]

    test(`${name} : EmailConfig valide, 3 à 5 lames, footer unique et dernier`, () => {
      const config = generateDemoEmail(brief)
      const parsed = safeParseEmailConfig(config)
      assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues))
      assert.ok(config.blocks.length >= 3 && config.blocks.length <= 5)
      assert.equal(config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
      assert.equal(config.blocks.filter((block) => block.type === "email-module-footer-compact-legal").length, 1)
    })

    test(`${name} : asset de campagne, URL .invalid canonique, fichier local en aperçu`, () => {
      assert.equal(asset.kind, "campaign")
      assert.equal(asset.lame, heroOf(brief).type)
      assert.deepEqual(slots(brief)["image-1"], { src: asset.src, alt: asset.alt })
      assert.equal(emailDemoAssetPreviews.get(asset.src), asset.preview)
      const { html, previewHtml } = success(brief)
      assert.ok(html.includes(`src="${asset.src}"`) && !html.includes("/images/"))
      assert.ok(previewHtml.includes(`src="${asset.preview}"`) && !previewHtml.includes("demo-assets.invalid"))
    })

    test(`${name} : largeur 600, breakpoint 599`, () => {
      const { html } = success(brief)
      assert.equal((html.match(/class="lame" width="600"/g) ?? []).length, generateDemoEmail(brief).blocks.length)
      assert.ok(html.includes("@media only screen and (max-width:599px)") && !html.includes("640"))
    })

    test(`${name} : à 390 px, l'image reste plus haute que la cellule mobile (aucune bande)`, () => {
      const template = readFileSync(join(process.cwd(), "lib/email/templates", emailBlockManifest[asset.lame].file), "utf8")
      const phClass = /class="(ph\d+)"[^>]*>\s*<img data-slot="image-1"/.exec(template)?.[1]
      assert.ok(phClass, asset.lame)
      const rule = new RegExp(`\\.${phClass}\\{height:(\\d+)px!important\\}`).exec(socle)
      const mobileCell = rule ? Number(rule[1]) : 0
      // Contenu 390 px : les lames pleine largeur (padding 0 sur l'image).
      const imageHeight = 390 / (asset.frame.width / asset.frame.height)
      assert.ok(imageHeight >= mobileCell, `${phClass} : image ${imageHeight.toFixed(0)} px < cellule ${mobileCell} px`)
    })

    test(`${name} : uniquement des destinations contrôlées`, () => {
      for (const [, href] of JSON.stringify(generateDemoEmail(brief)).matchAll(/"href":"([^"]+)"/g)) assert.ok(allowedUrls.has(href!), href)
    })

    test(`${name} : déterministe`, () => {
      assert.deepEqual(generateDemoEmail({ ...brief }), generateDemoEmail(brief))
      assert.equal(success(brief).html, success(brief).html)
      assert.equal(success(brief).previewHtml, success(brief).previewHtml)
    })
  }
})
