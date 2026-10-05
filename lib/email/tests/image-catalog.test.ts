/**
 * Catalogue d'images contrôlé : quatre photos génériques, jamais les créations
 * de campagne ; compatibilité par lame prouvée sur les templates ; résolution
 * déterministe par identifiant ; vue compacte pour le futur contexte du modèle.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailDemoAssets } from "../demo-assets"
import { emailDemoPresets, generateDemoEmail } from "../demo-generator"
import {
  buildEmailImageView,
  EmailImageError,
  emailImageBlocks,
  emailImageCatalog,
  emailImageIds,
  emailImagesForBlock,
  isEmailImageId,
  resolveEmailImage,
} from "../image-catalog"
import { emailBlockManifest } from "../manifest"
import { ImageAssetSlotSchema } from "../schemas"
import type { EmailBlockType } from "../types"

const blockTypes = Object.keys(emailBlockManifest) as EmailBlockType[]
const entries = Object.entries(emailImageCatalog)
const campaigns = ["black-friday", "studi-days", "studi-meet"] as const

/** Cadres (`width`, `height`) des visuels d'un template, dans l'ordre des slots. */
function frames(type: EmailBlockType) {
  const template = readFileSync(join(process.cwd(), "lib/email/templates", emailBlockManifest[type].file), "utf8")
  return [...template.matchAll(/<img\b[^>]*data-slot="image-\d+"[^>]*\swidth="(\d+)"\s+height="(\d+)"/g)].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
  }))
}

const visualBlocks = blockTypes.filter((type) => Object.values<string>(emailBlockManifest[type].slots).includes("asset:visuel"))

describe("catalogue d'images Email : contenu", () => {
  test("A. exactement quatre images, issues des quatre photos génériques", () => {
    assert.equal(emailImageIds.length, 4)
    assert.deepEqual(entries.map(([, entry]) => entry.asset).sort(), ["accompagnement", "evolution", "promotion", "reconversion"])
    for (const [, entry] of entries) assert.equal(emailDemoAssets[entry.asset].kind, "photo")
  })

  test("B. identifiants uniques, stables, en minuscules et tirets", () => {
    assert.deepEqual(emailImageIds, ["tablette-interieur", "ecouteur-exterieur", "canape-lumiere", "duo-ciel-bleu"])
    assert.equal(new Set(emailImageIds).size, emailImageIds.length)
    for (const id of emailImageIds) assert.match(id, /^[a-z][a-z0-9-]*$/)
    assert.equal(new Set(entries.map(([, entry]) => entry.asset)).size, 4, "une image par photo source")
  })

  test("C. les trois créations de campagne sont absentes : ni identifiant, ni source, ni résolution", () => {
    const assets = entries.map(([, entry]) => entry.asset as string)
    for (const campaign of campaigns) {
      assert.ok(!emailImageIds.includes(campaign as never), campaign)
      assert.ok(!assets.includes(campaign), campaign)
      assert.equal(isEmailImageId(campaign), false)
      assert.throws(() => resolveEmailImage(campaign, "email-module-hero-promotional-image-large"), EmailImageError)
    }
    const serialized = JSON.stringify([buildEmailImageView(), entries])
    for (const campaign of campaigns) assert.ok(!serialized.includes(`email-demo-${campaign}`), campaign)
    // Les créations restent disponibles pour la démo.
    for (const campaign of campaigns) assert.equal(emailDemoAssets[campaign].kind, "campaign")
  })

  test("D. chaque image a un alt contrôlé non vide, factuel, valide pour ImageAssetSlot", () => {
    for (const [id, entry] of entries) {
      assert.ok(entry.alt.trim().length >= 20 && entry.alt.length <= 110, id)
      assert.ok(ImageAssetSlotSchema.safeParse({ src: emailDemoAssets[entry.asset].src, alt: entry.alt }).success, id)
      // Ni âge, ni identité, ni métier, ni situation personnelle.
      assert.ok(!/\d|ans\b|âgée|jeune|étudiant|salarié|cadre|mère|chômeuse|reconversion|en poste|son salon|chez elle/i.test(entry.alt), `${id} : ${entry.alt}`)
    }
  })
})

describe("catalogue d'images Email : compatibilité par lame", () => {
  test("E. chaque image a au moins une compatibilité réelle", () => {
    for (const id of emailImageIds) {
      assert.ok(emailImageBlocks(id).length >= 1, id)
      for (const type of emailImageBlocks(id)) assert.ok(type in emailBlockManifest, `${id} : ${type}`)
    }
  })

  test("F. aucune compatibilité déclarée ne passe par une lame sans slot visuel", () => {
    for (const id of emailImageIds) {
      for (const type of emailImageBlocks(id)) assert.ok(visualBlocks.includes(type), `${id} : ${type}`)
    }
  })

  test("compatibilité prouvée : la lame déclarée a un seul visuel, au cadre exact de la photo (2x)", () => {
    for (const id of emailImageIds) {
      const asset = emailDemoAssets[emailImageCatalog[id].asset]
      for (const type of emailImageBlocks(id)) {
        assert.equal(type, asset.lame)
        assert.deepEqual(frames(type), [asset.frame], `${id} : cadre du template`)
      }
    }
  })

  test("aucune autre lame n'a le même cadre : la compatibilité n'est pas sous-déclarée, ni étendue à tort", () => {
    for (const id of emailImageIds) {
      const { frame } = emailDemoAssets[emailImageCatalog[id].asset]
      const sameFrame = visualBlocks.filter((type) => {
        const slots = frames(type)
        return slots.length === 1 && slots[0]!.width === frame.width && slots[0]!.height === frame.height
      })
      assert.deepEqual([...emailImageBlocks(id)].sort(), sameFrame.sort(), id)
    }
  })

  test("images autorisées par lame : une pour chaque lame d'une photo, aucune pour les autres lames à visuel", () => {
    assert.deepEqual(emailImagesForBlock("email-module-hero-promotional-image-medium"), ["tablette-interieur"])
    assert.deepEqual(emailImagesForBlock("email-module-hero-split-image"), ["ecouteur-exterieur"])
    assert.deepEqual(emailImagesForBlock("email-module-hero-promotional-image-large"), ["canape-lumiere"])
    assert.deepEqual(emailImagesForBlock("email-module-hero-offer-image-top"), ["duo-ciel-bleu"])
    const served = new Set(emailImageIds.flatMap((id) => emailImageBlocks(id)))
    for (const type of blockTypes.filter((candidate) => !served.has(candidate))) assert.deepEqual(emailImagesForBlock(type), [], type)
    assert.deepEqual(emailImagesForBlock("email-module-text-only"), [])
  })
})

describe("catalogue d'images Email : résolution déterministe", () => {
  test("G. identifiant + lame compatible → l'asset attendu (URL canonique et alt contrôlé)", () => {
    for (const id of emailImageIds) {
      for (const type of emailImageBlocks(id)) {
        const entry = emailImageCatalog[id]
        const image = resolveEmailImage(id, type)
        assert.deepEqual(image, { src: emailDemoAssets[entry.asset].src, alt: entry.alt })
        assert.ok(ImageAssetSlotSchema.safeParse(image).success)
        assert.deepEqual(resolveEmailImage(id, type), image, "déterministe")
      }
    }
    const image = resolveEmailImage("canape-lumiere", "email-module-hero-promotional-image-large")
    assert.equal(image.src, "https://demo-assets.invalid/email-demo-evolution.jpg")
    assert.ok(!JSON.stringify(image).includes("/images/"), "jamais un chemin local")
  })

  test("H. identifiant inconnu → EmailImageError « unknown-image »", () => {
    for (const unknown of ["", "reconversion", "inconnu", "/images/email-demo-evolution.jpg", "https://exemple.com/a.jpg", "toString", "__proto__"]) {
      assert.throws(
        () => resolveEmailImage(unknown, "email-module-hero-promotional-image-large"),
        (error) => error instanceof EmailImageError && error.code === "unknown-image",
        unknown
      )
    }
  })

  test("I. image connue + lame incompatible → EmailImageError « incompatible-block », lame sans visuel comprise", () => {
    const cases: [string, EmailBlockType][] = [
      ["tablette-interieur", "email-module-hero-promotional-image-large"],
      ["canape-lumiere", "email-module-hero-promotional-image-medium"],
      ["duo-ciel-bleu", "email-module-hero-promotional-image-medium"],
      ["ecouteur-exterieur", "email-hero-newsletter-variant-02"],
      ["canape-lumiere", "email-module-text-only"],
    ]
    for (const [id, type] of cases) {
      assert.throws(
        () => resolveEmailImage(id, type),
        (error) => error instanceof EmailImageError && error.code === "incompatible-block" && error.message.includes(id) && error.message.includes(type),
        `${id} / ${type}`
      )
    }
  })
})

describe("catalogue d'images Email : vue compacte pour l'IA", () => {
  test("J. sérialisable, sans URL, sans chemin, sans alt ni donnée d'aperçu : id, indication, lames", () => {
    const view = buildEmailImageView()
    assert.deepEqual(JSON.parse(JSON.stringify(view)), view)
    assert.equal(view.length, 4)
    for (const entry of view) assert.deepEqual(Object.keys(entry), ["id", "hint", "blocks"])
    const serialized = JSON.stringify(view)
    assert.ok(!/https?:|demo-assets|\.invalid|\.jpg|\/images\/|\/public|preview|frame|\balt\b|asset|kind|width|height/i.test(serialized), serialized)
    for (const [id, entry] of entries) assert.ok(!serialized.includes(entry.alt), id)
    assert.ok(serialized.length < 900, `vue : ${serialized.length} caractères`)
    assert.deepEqual(view.map((entry) => entry.id), [...emailImageIds])
    for (const entry of view) {
      assert.ok(entry.hint.length > 10 && entry.hint.length < 80, entry.id)
      assert.deepEqual(entry.blocks, emailImageBlocks(entry.id))
    }
  })

  test("la vue se restreint aux lames candidates ; une image sans lame candidate disparaît", () => {
    const view = buildEmailImageView(["email-module-hero-split-image", "email-module-text-only"])
    assert.deepEqual(view.map((entry) => entry.id), ["ecouteur-exterieur"])
    assert.deepEqual(buildEmailImageView(["email-module-text-only"]), [])
    assert.deepEqual(buildEmailImageView([]), [])
  })

  test("module autonome : ni Landing, ni Anthropic, ni réseau, ni chemin local", () => {
    const source = readFileSync(join(process.cwd(), "lib/email/image-catalog.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    assert.ok(!/landing|anthropic|fetch\(|node:fs/i.test(source))
    assert.ok(!/"\/images\//.test(source))
  })
})

describe("catalogue d'images Email : la démo est inchangée", () => {
  test("K. les sept visuels de démo existent toujours, dont les trois campagnes", () => {
    assert.deepEqual(Object.keys(emailDemoAssets), ["reconversion", "accompagnement", "evolution", "promotion", "black-friday", "studi-days", "studi-meet"])
    assert.deepEqual(Object.values(emailDemoAssets).map((asset) => asset.kind), ["photo", "photo", "photo", "photo", "campaign", "campaign", "campaign"])
  })

  test("L. le moteur déterministe produit toujours les mêmes scénarios (lames, surfaces, visuels)", () => {
    const strip = (type: string) => type.replace(/^email-(module-)?/, "")
    const expected: Record<string, string> = {
      reconversion: "preheader > header-newsletter > hero-promotional-image-medium[marque] > numbered-list > text-only > footer-compact-legal",
      accompagnement: "header-newsletter > hero-split-image > icons-list > text-and-feature-card[marque] > footer-compact-legal",
      evolution: "header-seasonal-campaign > hero-promotional-image-large[encre] > numbererd-grid > text-only > footer-compact-legal",
      promotion: "header-seasonal-campaign > hero-offer-image-top > icons-list[accent-1] > footer-compact-legal",
      "black-friday": "header-newsletter > hero-promotional-image-large[accent-1] > footer-compact-legal",
      "studi-days": "header-newsletter > hero-promotional-image-large[marque] > icons-list > footer-compact-legal",
      "studi-meet": "header-newsletter > hero-promotional-image-medium[encre] > icons-list > footer-compact-legal",
    }
    assert.deepEqual(emailDemoPresets.map((preset) => preset.id), Object.keys(expected))
    for (const preset of emailDemoPresets) {
      const config = generateDemoEmail(preset.brief)
      const sequence = config.blocks.map((block) => strip(block.type) + ("surface" in block && block.surface ? `[${block.surface}]` : "")).join(" > ")
      assert.equal(sequence, expected[preset.id], preset.id)
      assert.deepEqual(generateDemoEmail(preset.brief), config, `${preset.id} : déterministe`)
    }
  })
})
