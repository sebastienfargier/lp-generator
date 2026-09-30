/**
 * Photos du mode démo : URL `.invalid` dans l'EmailConfig et le HTML
 * canonique, fichier local dans l'aperçu seulement, par un mapping fermé.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailDemoAssetHost, emailDemoAssetPreviews, emailDemoAssets, type EmailDemoAssetId } from "../demo-assets"
import { emailDemoPresets, generateDemoEmail, type EmailBrief } from "../demo-generator"
import { runEmailGeneration } from "../generation"
import { safeParseEmailGenerationRequest } from "../generation-request"
import { emailBlockManifest } from "../manifest"
import { toPreviewHtml } from "../preview"
import { renderEmail } from "../renderer"
import { ImageAssetSlotSchema } from "../schemas"
import { scenarios } from "./scenarios"

const expected: Record<string, { asset: EmailDemoAssetId; lame: string }> = {
  reconversion: { asset: "reconversion", lame: "email-module-hero-promotional-image-medium" },
  accompagnement: { asset: "accompagnement", lame: "email-module-hero-split-image" },
  evolution: { asset: "evolution", lame: "email-module-hero-promotional-image-large" },
  promotion: { asset: "promotion", lame: "email-module-hero-offer-image-top" },
  "black-friday": { asset: "black-friday", lame: "email-module-hero-promotional-image-large" },
  "studi-days": { asset: "studi-days", lame: "email-module-hero-promotional-image-large" },
  "studi-meet": { asset: "studi-meet", lame: "email-module-hero-promotional-image-medium" },
}
const presets = Object.fromEntries(emailDemoPresets.map((preset) => [preset.id, preset.brief])) as Record<string, EmailBrief>
const srcs = (html: string) => [...html.matchAll(/<img\b[^>]*\ssrc="([^"]*)"/g)].map((match) => match[1]!)
const success = (brief: EmailBrief) => {
  const result = runEmailGeneration(brief)
  if (result.status !== "success") throw new Error(JSON.stringify(result))
  return result
}

describe("photos de démo — contrat canonique", () => {
  test("sept URLs HTTPS sur demo-assets.invalid, valides pour ImageAssetSlot", () => {
    assert.equal(emailDemoAssetHost, "demo-assets.invalid")
    assert.deepEqual(Object.keys(emailDemoAssets), ["reconversion", "accompagnement", "evolution", "promotion", "black-friday", "studi-days", "studi-meet"])
    for (const asset of Object.values(emailDemoAssets)) {
      const url = new URL(asset.src)
      assert.equal(url.protocol, "https:")
      assert.equal(url.hostname, "demo-assets.invalid")
      assert.ok(ImageAssetSlotSchema.safeParse({ src: asset.src, alt: asset.alt }).success, asset.src)
    }
  })

  test("ImageAssetSlot refuse toujours un chemin local", () => {
    for (const src of ["/images/foo.jpg", "/images/email-demo-evolution.jpg", "images/foo.jpg", "http://demo-assets.invalid/x.jpg"]) {
      assert.equal(ImageAssetSlotSchema.safeParse({ src, alt: "" }).success, false, src)
    }
    const request = safeParseEmailGenerationRequest({ ...scenarios.reconversion!, visuals: [{ src: "/images/foo.jpg", alt: "" }] })
    assert.equal(request.success, false)
  })

  test("chaque scénario : sa lame photo, son seul asset, sans chemin local", () => {
    for (const [name, { asset, lame }] of Object.entries(expected)) {
      const config = generateDemoEmail(presets[name]!)
      const hero = config.blocks.find((block) => block.id === "hero")
      assert.equal(hero?.type, lame, name)
      const serialized = JSON.stringify(config)
      const urls = [...serialized.matchAll(/https:\/\/demo-assets\.invalid\/[^"]+/g)].map((match) => match[0])
      assert.deepEqual(urls, [emailDemoAssets[asset].src], name)
      assert.ok(!serialized.includes("/images/"), name)
    }
  })

  test("quatre architectures de hero distinctes pour les scénarios photo", () => {
    const photos = Object.entries(expected).filter(([, { asset }]) => emailDemoAssets[asset].kind === "photo")
    const heroes = photos.map(([name]) => generateDemoEmail(presets[name]!).blocks.find((block) => block.id === "hero")?.type)
    assert.equal(new Set(heroes).size, 4)
  })

  test("aucun visuel déformé : photos à 2x du cadre, créations au ratio exact ; cadre du template", () => {
    for (const asset of Object.values(emailDemoAssets)) {
      const file = join(process.cwd(), "public", asset.preview)
      assert.ok(existsSync(file), file)
      const jpeg = readFileSync(file)
      // Dimensions lues dans le marqueur SOF du JPEG.
      let offset = 2
      let size: { width: number; height: number } | undefined
      while (offset < jpeg.length && !size) {
        const marker = jpeg[offset + 1]!
        const length = jpeg.readUInt16BE(offset + 2)
        if (marker >= 0xc0 && marker <= 0xc3) size = { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }
        offset += 2 + length
      }
      if (asset.kind === "photo") {
        assert.deepEqual(size, { width: asset.frame.width * 2, height: asset.frame.height * 2 }, asset.preview)
      } else {
        // Création fournie à 640 px : ratio du cadre à 0,1 % près, jamais plus étroite que lui.
        const ratio = size!.width / size!.height
        const frame = asset.frame.width / asset.frame.height
        assert.ok(Math.abs(ratio - frame) / frame < 0.001, `${asset.preview} : ${size!.width}×${size!.height}`)
        assert.ok(size!.width >= asset.frame.width, asset.preview)
      }
      const template = readFileSync(join(process.cwd(), "lib/email/templates", emailBlockManifest[asset.lame].file), "utf8")
      assert.ok(template.includes(`width="${asset.frame.width}" height="${asset.frame.height}"`), asset.lame)
    }
  })
})

describe("photos de démo — rendu et aperçu", () => {
  test("HTML canonique : URL .invalid conservée, aucun /images/", () => {
    for (const [name, { asset }] of Object.entries(expected)) {
      const { html } = success(presets[name]!)
      assert.equal(html, renderEmail(generateDemoEmail(presets[name]!)))
      assert.ok(srcs(html).includes(emailDemoAssets[asset].src), name)
      assert.ok(!html.includes("/images/"), name)
    }
  })

  test("aperçu : uniquement l'asset local attendu, plus aucune URL .invalid", () => {
    for (const [name, { asset }] of Object.entries(expected)) {
      const { previewHtml } = success(presets[name]!)
      assert.deepEqual(srcs(previewHtml).filter((src) => src.startsWith("/images/")), [emailDemoAssets[asset].preview], name)
      assert.ok(!previewHtml.includes("demo-assets.invalid"), name)
    }
  })

  test("toPreviewHtml résout exactement les sept mappings", () => {
    assert.equal(emailDemoAssetPreviews.size, 7)
    for (const asset of Object.values(emailDemoAssets)) {
      assert.equal(toPreviewHtml(`<img src="${asset.src}" alt="">`), `<img src="${asset.preview}" alt="">`)
    }
  })

  test("une autre URL demo-assets.invalid n'est pas résolue", () => {
    for (const src of [
      "https://demo-assets.invalid/autre.jpg",
      "https://demo-assets.invalid/email-demo-studi-meet.png",
      "https://demo-assets.invalid/email-demo-black-friday.png",
      "https://demo-assets.invalid/email-demo-reconversion.jpg?v=2",
      "https://demo-assets.invalid/images/email-demo-evolution.jpg",
      "https://cdn.studi.com/email-demo-evolution.jpg",
    ]) {
      const html = `<img src="${src}" alt="">`
      assert.equal(toPreviewHtml(html), html, src)
    }
  })

  test("mobile : la cellule du visuel moyen suit l'image, sans bande sous la photo", () => {
    const socle = readFileSync(join(process.cwd(), "lib/email/socle-email.html"), "utf8")
    assert.ok(socle.includes(".ph270{height:auto!important}"))
  })

  test("footer unique et dernier ; largeur canonique 600", () => {
    for (const name of Object.keys(expected)) {
      const config = generateDemoEmail(presets[name]!)
      assert.equal(config.blocks.at(-1)!.type, "email-module-footer-compact-legal")
      assert.equal(config.blocks.filter((block) => block.type === "email-module-footer-compact-legal").length, 1)
      const { html, previewHtml } = success(presets[name]!)
      for (const output of [html, previewHtml]) {
        assert.equal((output.match(/class="lame" width="600"/g) ?? []).length, config.blocks.length, name)
        assert.ok(!output.includes("640"), name)
      }
    }
  })
})
