/**
 * HTML canonique (renderEmail) contre HTML d'aperçu (toPreviewHtml) : la
 * preview adapte l'affichage sans jamais toucher à la sortie envoyable.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { defaultEmailBrief } from "../demo-generator"
import { runEmailGeneration } from "../generation"
import { emailIconNames } from "../manifest"
import { EmailPreviewError, toPreviewHtml } from "../preview"
import { renderEmail } from "../renderer"
import type { EmailBlock } from "../types"
import { email, header, internalAttribute, withBlocks } from "./fixtures"

const iconsList: EmailBlock = {
  id: "atouts",
  type: "email-module-icons-list",
  slots: {
    "titre-section": { text: "Vos atouts" },
    "icone-1": { icon: "laptop" }, "item-1-titre": { text: "A" }, "texte-descriptif-1": { text: "a" },
    "icone-2": { icon: "users" }, "item-2-titre": { text: "B" }, "texte-descriptif-2": { text: "b" },
    "icone-3": { icon: "graduation-cap" }, "item-3-titre": { text: "C" }, "texte-descriptif-3": { text: "c" },
  },
}

const canonical = renderEmail(withBlocks(header, iconsList))
const preview = toPreviewHtml(canonical)
const count = (html: string, part: string) => html.split(part).length - 1
const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]*)"/g)].map((match) => match[1])
const socialTokens = ["[URL_CDN_SOCIAL_01]", "[URL_CDN_SOCIAL_02]", "[URL_CDN_SOCIAL_03]", "[URL_CDN_SOCIAL_04]"]

describe("HTML canonique", () => {
  test("conserve logo, icônes et réseaux sociaux en jetons", () => {
    assert.equal(count(canonical, 'src="[URL_CDN_LOGO_STUDI_SOMBRE]"'), 2)
    assert.ok(canonical.includes('src="[URL_CDN_ICONE:laptop]"'))
    for (const token of socialTokens) assert.ok(canonical.includes(`src="${token}"`), token)
  })

  test("conserve ses vrais href, sans chemin local", () => {
    assert.ok(hrefs(canonical).includes("https://www.studi.com/fr/magazine?id={{ customer.id }}"))
    assert.ok(hrefs(canonical).includes("[URL_DESABONNEMENT]"))
    assert.ok(!/\/(logos|icones)\//.test(canonical))
    assert.ok(!canonical.includes("data-preview-href"))
  })
})

describe("HTML d'aperçu", () => {
  test("logo sombre résolu vers l'asset local", () => {
    assert.equal(count(preview, 'src="/logos/logo_studi_sombre_lowres.png"'), 2)
    assert.ok(!preview.includes("[URL_CDN_LOGO_STUDI_SOMBRE]"))
  })

  test("chacun des 40 noms d'icône est résolu", () => {
    for (const icon of emailIconNames) {
      const html = toPreviewHtml(`<img src="[URL_CDN_ICONE:${icon}]" alt="">`)
      assert.equal(html, `<img src="/icones/${icon}.png" alt="">`)
    }
  })

  test("nom d'icône inconnu : erreur explicite", () => {
    assert.throws(
      () => toPreviewHtml('<img src="[URL_CDN_ICONE:rocket]" alt="">'),
      (error: unknown) => error instanceof EmailPreviewError && /rocket/.test(error.message)
    )
  })

  test("réseaux sociaux : pixel transparent, aucune identité inventée", () => {
    for (const token of socialTokens) assert.ok(!preview.includes(token), token)
    assert.equal(count(preview, 'src="data:image/gif;base64,'), 4)
    assert.ok(!/facebook|instagram|linkedin|youtube|tiktok|twitter/i.test(preview))
  })

  test("liens inertes, destinations inspectables", () => {
    assert.deepEqual(hrefs(preview), [])
    assert.ok(preview.includes('data-preview-href="https://www.studi.com/fr/magazine?id={{ customer.id }}"'))
    assert.ok(preview.includes('data-preview-href="[URL_DESABONNEMENT]"'))
    assert.equal(count(preview, "data-preview-href="), hrefs(canonical).length)
  })

  test("aucun script, aucun on*, aucun attribut interne", () => {
    assert.ok(!/<script/i.test(preview))
    assert.ok(!/\son[a-z]+=/i.test(preview))
    assert.ok(!internalAttribute.test(preview))
  })

  test("structure inchangée : objet, préheader, MSO, media queries", () => {
    const head = (html: string) => html.slice(0, html.indexOf("<body"))
    assert.equal(head(preview), head(canonical))
    assert.ok(preview.includes("<!--[if mso]>") && preview.includes("@media only screen and (max-width:599px)"))
    const preheader = (html: string) => html.slice(html.indexOf("<body"), html.indexOf("===== LAMES"))
    assert.equal(preheader(preview), preheader(canonical))
  })

  test("seuls src des jetons et href changent", () => {
    const normalize = (html: string) =>
      html
        .replaceAll("data-preview-href=", "href=")
        .replaceAll("/logos/logo_studi_sombre_lowres.png", "[URL_CDN_LOGO_STUDI_SOMBRE]")
        .replace(/\/icones\/([a-z-]+)\.png/g, "[URL_CDN_ICONE:$1]")
    const socials = [...canonical.matchAll(/src="(\[URL_CDN_SOCIAL_0\d\])"/g)].map((match) => match[1])
    let restored = normalize(preview)
    for (const token of socials) restored = restored.replace(/src="data:image\/gif;base64,[^"]+"/, `src="${token}"`)
    assert.equal(restored, canonical)
  })
})

describe("génération : html canonique + previewHtml", () => {
  test("les deux sorties sont fournies, sans mélange", () => {
    const result = runEmailGeneration(defaultEmailBrief)
    assert.equal(result.status, "success")
    if (result.status !== "success") return
    assert.ok(result.html.includes("[URL_CDN_LOGO_STUDI_SOMBRE]") && result.html.includes(' href="https://www.studi.com/fr/formations'))
    assert.ok(result.previewHtml.includes("/logos/logo_studi_sombre_lowres.png"))
    assert.deepEqual(hrefs(result.previewHtml), [])
    assert.equal(result.previewHtml, toPreviewHtml(result.html))
  })

  test("un seul CTA principal dans la démo (hero)", () => {
    const result = runEmailGeneration(defaultEmailBrief)
    if (result.status !== "success") throw new Error("génération en échec")
    assert.equal(count(result.html, "&nbsp;&#8594;</a>"), 1)
  })

  test("email de référence : canonique inchangé par la preview", () => {
    const html = renderEmail(email)
    toPreviewHtml(html)
    assert.equal(renderEmail(email), html)
  })
})
