/**
 * Banque d'images Email V2 : douze photos, quatre intentions, des dérivés
 * réels aux dimensions exactes des cadres, deux frises prédéfinies, une
 * résolution déterministe et une vue pour l'IA qui ne montre ni fichier, ni
 * URL, ni alt, ni dimension. Les sources brutes restent hors runtime.
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailImageIds } from "../image-catalog"
import {
  buildEmailPortraitStripView,
  buildEmailVisualIntentView,
  EmailImageBankError,
  emailBank,
  emailBankDerivative,
  emailBankImageBlocks,
  emailBankImageIds,
  emailBankPreviews,
  emailBankStripDerivative,
  emailImageFormats,
  emailImageScale,
  emailImagesForIntent,
  emailPortraitStripBlock,
  emailPortraitStripFrames,
  emailPortraitStripIds,
  emailPortraitStrips,
  emailVisualIntents,
  isEmailBankImageId,
  pickEmailBankImage,
  resolveEmailBankImage,
  resolveEmailPortraitStrip,
  type EmailImageFormat,
} from "../image-bank"
import { emailBlockManifest } from "../manifest"
import { ImageAssetSlotSchema } from "../schemas"
import type { EmailBlockType } from "../types"

const root = process.cwd()
const outDir = join(root, "public/images/email/v2")
const crops = JSON.parse(readFileSync(join(root, "scripts/email-image-bank/crops.json"), "utf8")) as {
  output: { sourceWidth: number; sourceHeight: number; scale: number }
  frames: Record<string, [number, number]>
  sources: Record<string, { file: string; md5: string }>
  derivatives: { image: string; format: string; rect: [number, number, number, number] }[]
}

const blockTypes = Object.keys(emailBlockManifest) as EmailBlockType[]
const formats = Object.keys(emailImageFormats) as EmailImageFormat[]
const entries = Object.entries(emailBank)

/** Cadres (`width`, `height`) des visuels d'un template, dans l'ordre des slots. */
function frames(type: EmailBlockType) {
  const template = readFileSync(join(root, "lib/email/templates", emailBlockManifest[type].file), "utf8")
  return [...template.matchAll(/<img\b[^>]*data-slot="image-\d+"[^>]*\swidth="(\d+)"\s+height="(\d+)"/g)].map((match) => ({
    width: Number(match[1]),
    height: Number(match[2]),
  }))
}

/** Dimensions d'un JPEG, lues dans le premier marqueur « start of frame » (sans dépendance). */
function jpegSize(path: string) {
  const bytes = readFileSync(path)
  assert.equal(bytes[0], 0xff, path)
  assert.equal(bytes[1], 0xd8, `${path} : pas un JPEG`)
  let offset = 2
  while (offset < bytes.length) {
    assert.equal(bytes[offset], 0xff, `${path} : marqueur attendu`)
    const marker = bytes[offset + 1]!
    const length = bytes.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  throw new Error(`${path} : dimensions introuvables`)
}

/** Tous les dérivés attendus : un par format déclaré, plus un par position de frise. */
const expectedFiles = [
  ...emailBankImageIds.flatMap((id) => emailBank[id].formats.map((format) => `${id}--${format}.jpg`)),
  ...emailPortraitStripIds.flatMap((stripId) => emailPortraitStrips[stripId].images.map((id, index) => `${id}--strip-${index + 1}.jpg`)),
]

const bannedAlt = /\d|\bans\b|âgée|âgé|jeune|étudiant|salarié|cadre|mère|père|chômeu|reconversion|retraité|souriant|heureu|triste|stress|fatigu|sourire|femme|homme|fille|garçon|enfant/i

describe("banque d'images Email V2 : contenu", () => {
  test("exactement 12 images actives, aux identifiants stables en minuscules et tirets", () => {
    assert.equal(emailBankImageIds.length, 12)
    assert.deepEqual(
      [...emailBankImageIds].sort(),
      [
        "arret-bus-bleu", "bureau-lampe-bleu", "canape-lumiere", "couloir-verriere-a", "ecouteur-exterieur", "echange-motif-bleu",
        "marche-rideau-metal", "mur-clair-debout", "portrait-mur-rose", "quai-gare", "table-fenetre", "tablette-interieur",
      ].sort()
    )
    for (const id of emailBankImageIds) assert.match(id, /^[a-z][a-z0-9-]*$/)
    assert.equal(new Set(emailBankImageIds).size, 12)
  })

  test("exactement 4 intentions, 3 images chacune, selon la répartition validée", () => {
    assert.deepEqual([...emailVisualIntents], ["warm-reassurance", "editorial-work", "career-movement", "campaign-portrait"])
    const byIntent = Object.fromEntries(emailVisualIntents.map((intent) => [intent, emailBankImageIds.filter((id) => emailBank[id].intent === intent)]))
    assert.deepEqual(byIntent, {
      "warm-reassurance": ["tablette-interieur", "canape-lumiere", "ecouteur-exterieur"],
      "editorial-work": ["bureau-lampe-bleu", "table-fenetre", "echange-motif-bleu"],
      "career-movement": ["quai-gare", "arret-bus-bleu", "marche-rideau-metal"],
      "campaign-portrait": ["portrait-mur-rose", "couloir-verriere-a", "mur-clair-debout"],
    })
    for (const intent of emailVisualIntents) assert.equal(byIntent[intent]!.length, 3, intent)
    for (const [id, entry] of entries) assert.ok(emailVisualIntents.includes(entry.intent), id)
  })

  test("chaque image a un id, un alt, une intention, un cluster et une provenance (à confirmer : aucune n'est approuvée)", () => {
    for (const [id, entry] of entries) {
      assert.ok(entry.alt.trim().length >= 20 && entry.alt.length <= 110, id)
      assert.ok(entry.cluster.length > 0, id)
      assert.ok(entry.formats.length >= 1, id)
      assert.equal(entry.provenance, "a-confirmer", `${id} : sources sans licence connue`)
    }
  })

  test("les alts sont factuels : ni âge, genre, métier, origine, statut, situation ni émotion", () => {
    for (const [id, entry] of entries) {
      assert.ok(!bannedAlt.test(entry.alt), `${id} : ${entry.alt}`)
      assert.ok(entry.alt.endsWith("."), id)
      assert.ok(ImageAssetSlotSchema.safeParse({ src: emailBankDerivative(id, entry.formats[0]!).src, alt: entry.alt }).success, id)
    }
    assert.equal(new Set(entries.map(([, entry]) => entry.alt)).size, 12, "alts distincts")
  })

  test("le catalogue du moteur actuel est inchangé et ne dépend pas de la banque", () => {
    assert.deepEqual(emailImageIds, ["tablette-interieur", "ecouteur-exterieur", "canape-lumiere", "duo-ciel-bleu"])
    for (const file of ["image-catalog", "draft-prompt", "draft-resolver", "generation-draft", "anthropic", "anthropic-schema", "generate-handler", "generation-context"]) {
      const source = readFileSync(join(root, `lib/email/${file}.ts`), "utf8")
      assert.ok(!/image-bank/.test(source), `${file}.ts ne doit pas dépendre de la banque V2`)
    }
  })
})

describe("banque d'images Email V2 : formats et cadres réels", () => {
  test("chaque format est le cadre exact de ses lames, et aucune autre lame n'a ce cadre seul", () => {
    const visualBlocks = blockTypes.filter((type) => Object.values<string>(emailBlockManifest[type].slots).includes("asset:visuel"))
    for (const format of formats) {
      const { frame, blocks } = emailImageFormats[format]
      for (const type of blocks) assert.deepEqual(frames(type), [frame], `${format} : ${type}`)
      const sameFrame = visualBlocks.filter((type) => {
        const slots = frames(type)
        return slots.length === 1 && slots[0]!.width === frame.width && slots[0]!.height === frame.height
      })
      assert.deepEqual([...blocks].sort(), sameFrame.sort(), `${format} : compatibilité ni sous-déclarée ni étendue`)
    }
  })

  test("les cinq cadres de la frise sont ceux de hero-newsletter-variant-01", () => {
    assert.deepEqual(frames(emailPortraitStripBlock), [...emailPortraitStripFrames])
    assert.equal(emailPortraitStripFrames.length, 5)
  })

  test("les formats couvrent medium, large, split, la bannière 520×174 des deux lames et le hero d'offre 600×300", () => {
    assert.deepEqual(
      formats.map((format) => [format, emailImageFormats[format].frame.width, emailImageFormats[format].frame.height]),
      [["medium", 600, 270], ["large", 600, 534], ["split", 229, 456], ["band", 520, 174], ["offer", 600, 300]]
    )
    assert.deepEqual([...emailImageFormats.band.blocks], ["email-hero-newsletter-variant-02", "email-module-text-and-cta-variant-02"])
    assert.deepEqual([...emailImageFormats.offer.blocks], ["email-module-hero-offer-image-top"])
  })
})

describe("banque d'images Email V2 : dérivés", () => {
  test("chaque compatibilité a un dérivé réel, aux dimensions exactes (2x le cadre)", () => {
    for (const id of emailBankImageIds) {
      for (const format of emailBank[id].formats) {
        const derivative = emailBankDerivative(id, format)
        const path = join(outDir, derivative.file)
        assert.ok(existsSync(path), `${id} / ${format} : dérivé absent`)
        const { frame } = emailImageFormats[format]
        assert.deepEqual(jpegSize(path), { width: frame.width * emailImageScale, height: frame.height * emailImageScale }, `${id} / ${format}`)
        assert.deepEqual({ width: derivative.width, height: derivative.height }, { width: frame.width * 2, height: frame.height * 2 })
      }
    }
  })

  test("chaque position de frise a un dérivé réel au cadre exact de sa position", () => {
    for (const stripId of emailPortraitStripIds) {
      emailPortraitStrips[stripId].images.forEach((id, index) => {
        const derivative = emailBankStripDerivative(id, index + 1)
        const frame = emailPortraitStripFrames[index]!
        assert.deepEqual(jpegSize(join(outDir, derivative.file)), { width: frame.width * 2, height: frame.height * 2 }, `${stripId} / ${index + 1}`)
      })
    }
  })

  test("aucun dérivé orphelin : les fichiers du dossier sont exactement ceux du catalogue et du manifeste de recadrage", () => {
    const onDisk = readdirSync(outDir).sort()
    assert.deepEqual(onDisk, [...expectedFiles].sort())
    assert.equal(new Set(expectedFiles).size, expectedFiles.length, "pas de nom en double")
    assert.deepEqual(
      crops.derivatives.map((entry) => `${entry.image}--${entry.format}.jpg`).sort(),
      [...expectedFiles].sort()
    )
    for (const file of onDisk) assert.match(file, /^[a-z0-9-]+--(medium|large|split|band|offer|strip-[1-5])\.jpg$/)
  })

  test("poids raisonnable : aucun dérivé au-delà de 250 Ko, ensemble sous 5 Mo", () => {
    const sizes = readdirSync(outDir).map((file) => statSync(join(outDir, file)).size)
    assert.ok(Math.max(...sizes) < 250_000, `plus gros : ${Math.max(...sizes)} octets`)
    assert.ok(sizes.reduce((sum, size) => sum + size, 0) < 5_000_000)
  })

  test("manifeste de recadrage : rectangles dans la source, au bon ratio, sans agrandissement", () => {
    const { sourceWidth, sourceHeight, scale } = crops.output
    assert.deepEqual([sourceWidth, sourceHeight, scale], [2016, 1344, emailImageScale])
    for (const { image, format, rect } of crops.derivatives) {
      const label = `${image}--${format}`
      const [x, y, w, h] = rect
      const frame = format.startsWith("strip-") ? emailPortraitStripFrames[Number(format.slice(6)) - 1]! : emailImageFormats[format as EmailImageFormat].frame
      assert.deepEqual(crops.frames[format], [frame.width, frame.height], label)
      assert.ok(x >= 0 && y >= 0 && x + w <= sourceWidth && y + h <= sourceHeight, `${label} : hors de la source`)
      assert.ok(Math.abs(w / h - frame.width / frame.height) < 0.005, `${label} : ratio`)
      assert.ok(w >= frame.width * scale, `${label} : agrandi`)
    }
    assert.deepEqual(Object.keys(crops.sources).sort(), [...emailBankImageIds].sort())
    const files = Object.values(crops.sources).map((source) => source.file)
    assert.equal(new Set(files).size, 12, "douze sources distinctes")
    for (const source of Object.values(crops.sources)) assert.match(source.md5, /^[0-9a-f]{32}$/)
  })
})

describe("banque d'images Email V2 : compatibilités et résolution", () => {
  test("images par intention et lame : compatibilités exactes", () => {
    const expectations: [string, EmailBlockType, string[]][] = [
      ["warm-reassurance", "email-module-hero-promotional-image-medium", ["tablette-interieur", "canape-lumiere", "ecouteur-exterieur"]],
      ["warm-reassurance", "email-module-hero-promotional-image-large", ["tablette-interieur", "canape-lumiere", "ecouteur-exterieur"]],
      ["warm-reassurance", "email-module-hero-split-image", ["canape-lumiere", "ecouteur-exterieur"]],
      ["warm-reassurance", "email-hero-newsletter-variant-02", ["tablette-interieur", "canape-lumiere"]],
      ["editorial-work", "email-module-hero-promotional-image-medium", ["bureau-lampe-bleu", "table-fenetre", "echange-motif-bleu"]],
      ["editorial-work", "email-module-hero-split-image", []],
      ["editorial-work", "email-module-text-and-cta-variant-02", ["bureau-lampe-bleu", "table-fenetre", "echange-motif-bleu"]],
      ["career-movement", "email-module-hero-split-image", ["quai-gare", "arret-bus-bleu", "marche-rideau-metal"]],
      ["career-movement", "email-hero-newsletter-variant-02", ["quai-gare", "arret-bus-bleu", "marche-rideau-metal"]],
      ["campaign-portrait", "email-module-hero-promotional-image-medium", ["portrait-mur-rose", "mur-clair-debout"]],
      ["campaign-portrait", "email-module-hero-split-image", ["couloir-verriere-a", "mur-clair-debout"]],
      ["campaign-portrait", "email-hero-newsletter-variant-02", ["portrait-mur-rose", "couloir-verriere-a", "mur-clair-debout"]],
      ["campaign-portrait", "email-module-text-only", []],
      ["campaign-portrait", emailPortraitStripBlock, []],
    ]
    for (const [intent, block, expected] of expectations) assert.deepEqual(emailImagesForIntent(intent, block), expected, `${intent} / ${block}`)
    for (const intent of emailVisualIntents) {
      assert.equal(emailImagesForIntent(intent, "email-module-hero-promotional-image-large").length, 3, `${intent} / large : couverture complète`)
      for (const block of ["email-module-hero-promotional-image-medium", "email-hero-newsletter-variant-02"]) {
        assert.ok(emailImagesForIntent(intent, block).length >= 2, `${intent} / ${block} : au moins deux images`)
      }
    }
  })

  test("la lame de la frise n'accepte aucune image seule : elle passe par une frise prédéfinie", () => {
    for (const id of emailBankImageIds) {
      assert.ok(!emailBankImageBlocks(id).includes(emailPortraitStripBlock), id)
      assert.throws(() => resolveEmailBankImage(id, emailPortraitStripBlock), (error) => error instanceof EmailImageBankError && error.code === "incompatible-block")
    }
  })

  test("image + lame compatible → URL canonique et alt contrôlé, valides pour ImageAssetSlot, déterministes", () => {
    for (const id of emailBankImageIds) {
      for (const block of emailBankImageBlocks(id)) {
        const image = resolveEmailBankImage(id, block)
        assert.ok(ImageAssetSlotSchema.safeParse(image).success, `${id} / ${block}`)
        assert.equal(image.alt, emailBank[id].alt)
        assert.match(image.src, /^https:\/\/demo-assets\.invalid\/email-v2\/[a-z0-9-]+--(medium|large|split|band|offer)\.jpg$/)
        assert.deepEqual(resolveEmailBankImage(id, block), image, "déterministe")
      }
    }
    assert.equal(resolveEmailBankImage("quai-gare", "email-module-hero-split-image").src, "https://demo-assets.invalid/email-v2/quai-gare--split.jpg")
    assert.equal(
      resolveEmailBankImage("portrait-mur-rose", "email-module-text-and-cta-variant-02").src,
      resolveEmailBankImage("portrait-mur-rose", "email-hero-newsletter-variant-02").src,
      "les deux lames 520×174 partagent le même dérivé"
    )
  })

  test("erreurs explicites : image inconnue, intention inconnue, frise inconnue, lame incompatible, dérivé absent", () => {
    for (const unknown of ["", "reconversion", "duo-ciel-bleu", "/images/email/v2/quai-gare--large.jpg", "https://exemple.com/a.jpg", "toString", "__proto__"]) {
      assert.throws(() => resolveEmailBankImage(unknown, "email-module-hero-promotional-image-large"), (error) => error instanceof EmailImageBankError && error.code === "unknown-image", unknown)
    }
    for (const unknown of ["", "promo", "toString", "__proto__", "warm-reassurance "]) {
      assert.throws(() => emailImagesForIntent(unknown, "email-module-hero-promotional-image-large"), (error) => error instanceof EmailImageBankError && error.code === "unknown-intent", unknown)
      assert.throws(() => pickEmailBankImage(unknown, "email-module-hero-promotional-image-large"), (error) => error instanceof EmailImageBankError && error.code === "unknown-intent", unknown)
    }
    for (const unknown of ["", "portrait-strip-mixed-03", "toString", "__proto__"]) {
      assert.throws(() => resolveEmailPortraitStrip(unknown), (error) => error instanceof EmailImageBankError && error.code === "unknown-strip", unknown)
    }
    assert.throws(
      () => resolveEmailBankImage("tablette-interieur", "email-module-hero-split-image"),
      (error) => error instanceof EmailImageBankError && error.code === "incompatible-block" && error.message.includes("tablette-interieur") && error.message.includes("email-module-hero-split-image")
    )
    assert.throws(() => resolveEmailBankImage("quai-gare", "email-module-text-only"), (error) => error instanceof EmailImageBankError && error.code === "incompatible-block")
    assert.throws(() => pickEmailBankImage("editorial-work", "email-module-hero-split-image"), (error) => error instanceof EmailImageBankError && error.code === "incompatible-block")
    assert.throws(() => emailBankDerivative("portrait-mur-rose", "split"), (error) => error instanceof EmailImageBankError && error.code === "missing-derivative")
    assert.throws(() => emailBankDerivative("portrait-mur-rose", "poster"), (error) => error instanceof EmailImageBankError && error.code === "missing-derivative")
    assert.throws(() => emailBankStripDerivative("portrait-mur-rose", 1), (error) => error instanceof EmailImageBankError && error.code === "missing-derivative")
    assert.throws(() => emailBankStripDerivative("quai-gare", 2), (error) => error instanceof EmailImageBankError && error.code === "missing-derivative")
    assert.throws(() => emailBankStripDerivative("quai-gare", 6), (error) => error instanceof EmailImageBankError && error.code === "missing-derivative")
  })

  test("choix par intention : déterministe pour une même graine, toujours une image de l'intention et de la lame", () => {
    for (const intent of emailVisualIntents) {
      for (const block of ["email-module-hero-promotional-image-large", "email-hero-newsletter-variant-02", "email-module-hero-promotional-image-medium"]) {
        const candidates = emailImagesForIntent(intent, block)
        for (const seed of ["", "a", "campagne-rentree", "Trouver sa voie"]) {
          const picked = pickEmailBankImage(intent, block, seed)
          assert.equal(picked, pickEmailBankImage(intent, block, seed))
          assert.ok(candidates.includes(picked))
        }
      }
    }
    assert.equal(pickEmailBankImage("warm-reassurance", "email-module-hero-promotional-image-large"), pickEmailBankImage("warm-reassurance", "email-module-hero-promotional-image-large", ""))
  })

  test("l'aperçu : chaque URL canonique a un fichier local réel, et aucune autre", () => {
    assert.equal(emailBankPreviews.size, expectedFiles.length)
    for (const [src, preview] of emailBankPreviews) {
      assert.match(src, /^https:\/\/demo-assets\.invalid\/email-v2\//)
      assert.ok(existsSync(join(root, "public", preview)), preview)
    }
  })
})

describe("banque d'images Email V2 : frises de portraits", () => {
  test("deux frises de cinq images distinctes, jamais deux du même cluster", () => {
    assert.deepEqual(emailPortraitStripIds, ["portrait-strip-mixed-01", "portrait-strip-mixed-02"])
    for (const stripId of emailPortraitStripIds) {
      const { images } = emailPortraitStrips[stripId]
      assert.equal(images.length, 5, stripId)
      assert.equal(new Set(images).size, 5, `${stripId} : pas de répétition`)
      for (const id of images) assert.ok(isEmailBankImageId(id), `${stripId} : ${id}`)
      assert.equal(new Set(images.map((id) => emailBank[id].cluster)).size, 5, `${stripId} : un seul portrait par cluster`)
    }
  })

  test("chaque frise se résout en cinq visuels valides, dans l'ordre des slots, déterministes", () => {
    for (const stripId of emailPortraitStripIds) {
      const strip = resolveEmailPortraitStrip(stripId)
      assert.equal(strip.length, 5)
      strip.forEach((image, index) => {
        assert.ok(ImageAssetSlotSchema.safeParse(image).success, `${stripId} / ${index + 1}`)
        assert.equal(image.alt, emailBank[emailPortraitStrips[stripId].images[index]!].alt)
        assert.match(image.src, new RegExp(`--strip-${index + 1}\\.jpg$`))
      })
      assert.equal(new Set(strip.map((image) => image.src)).size, 5)
      assert.deepEqual(resolveEmailPortraitStrip(stripId), strip)
    }
    const slots = Object.keys(emailBlockManifest[emailPortraitStripBlock].slots).filter((slot) => /^image-\d+$/.test(slot))
    assert.deepEqual(slots, ["image-1", "image-2", "image-3", "image-4", "image-5"])
  })

  test("les deux frises sont différentes et leurs recadrages de frise existent exactement", () => {
    const [first, second] = emailPortraitStripIds.map((id) => emailPortraitStrips[id].images)
    assert.notDeepEqual(first, second)
    for (let position = 0; position < 5; position += 1) assert.notEqual(first![position], second![position], `position ${position + 1}`)
    const stripCrops = crops.derivatives.filter((entry) => entry.format.startsWith("strip-")).map((entry) => `${entry.image}@${entry.format.slice(6)}`).sort()
    const fromStrips = emailPortraitStripIds.flatMap((id) => emailPortraitStrips[id].images.map((image, index) => `${image}@${index + 1}`))
    assert.deepEqual(stripCrops, [...new Set(fromStrips)].sort())
  })
})

describe("banque d'images Email V2 : surface publique et vue pour l'IA", () => {
  test("la vue IA ne contient que des intentions et des indications courtes", () => {
    const view = buildEmailVisualIntentView()
    assert.deepEqual(JSON.parse(JSON.stringify(view)), view)
    assert.deepEqual(view.map((entry) => entry.intent), [...emailVisualIntents])
    for (const entry of view) {
      assert.deepEqual(Object.keys(entry), ["intent", "hint"])
      assert.ok(entry.hint.length > 10 && entry.hint.length < 60, entry.intent)
    }
    const strips = buildEmailPortraitStripView()
    assert.deepEqual(strips.map((entry) => entry.id), [...emailPortraitStripIds])
    for (const entry of strips) assert.deepEqual(Object.keys(entry), ["id", "hint"])

    const serialized = JSON.stringify([view, strips])
    assert.ok(!/https?:|demo-assets|\.invalid|\.jpe?g|\.png|\/images\/|\/public|ressources|assets\/|hf_|preview|\bsrc\b|\balt\b|\bcrop|\bframe|width|height|filename|\bfile\b|derivative|cluster|provenance|px\b|\d{3,}/i.test(serialized), serialized)
    for (const id of emailBankImageIds) assert.ok(!serialized.includes(id), `la vue ne donne pas l'identifiant d'image ${id}`)
    for (const [, entry] of entries) assert.ok(!serialized.includes(entry.alt))
    assert.ok(serialized.length < 700, `vue : ${serialized.length} caractères`)
  })

  test("la vue se restreint aux lames candidates ; sans lame à image, elle est vide", () => {
    assert.deepEqual(buildEmailVisualIntentView(["email-module-hero-split-image"]).map((entry) => entry.intent), ["warm-reassurance", "career-movement", "campaign-portrait"])
    assert.deepEqual(buildEmailVisualIntentView(["email-module-text-only"]), [])
    assert.deepEqual(buildEmailVisualIntentView([]), [])
    assert.equal(buildEmailVisualIntentView(["email-module-hero-promotional-image-large"]).length, 4)
  })

  test("aucune source brute ni chemin de ressources n'est exposé au runtime public", () => {
    const source = readFileSync(join(root, "lib/email/image-bank.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    assert.ok(!/ressources|images-banq|hf_|\.png|node:fs|fetch\(|landing|anthropic/i.test(source))
    assert.ok(!/"\/images\//.test(source.replace(/previewPath = .*/, "")), "le chemin local n'apparaît que dans la fonction d'aperçu")
    const exposed = JSON.stringify([
      emailBank,
      emailPortraitStrips,
      buildEmailVisualIntentView(),
      buildEmailPortraitStripView(),
      emailBankImageIds.flatMap((id) => emailBankImageBlocks(id).map((block) => resolveEmailBankImage(id, block))),
      emailPortraitStripIds.map((id) => resolveEmailPortraitStrip(id)),
      [...emailBankPreviews.keys()],
    ])
    assert.ok(!/ressources|email\/assets|images-banq|hf_|\.png/i.test(exposed))
    // Les sources vivent uniquement dans le manifeste de recadrage, hors runtime.
    assert.ok(Object.values(crops.sources).every((entry) => entry.file.startsWith("hf_")))
  })

  test("module autonome : ni Landing, ni Anthropic, ni réseau", () => {
    const source = readFileSync(join(root, "lib/email/image-bank.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1])
    assert.deepEqual(imports.sort(), ["./demo-assets", "./types"])
  })
})
