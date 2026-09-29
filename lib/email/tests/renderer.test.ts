/**
 * Renderer HTML : vrais templates et vrai socle du repo. La source
 * injectable ne sert qu'aux cas de corruption.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailBlockManifest } from "../manifest"
import {
  EmailTemplateError,
  emailFileTemplateSource,
  renderEmail,
  renderEmailFromUnknown,
  type EmailTemplateSource,
} from "../renderer"
import type { EmailBlock } from "../types"
import {
  content,
  disclaimer,
  email,
  footer,
  internalAttribute,
  sampleSlotValues,
  withBlocks,
} from "./fixtures"

const readTemplate = (file: string) =>
  readFileSync(join(process.cwd(), "lib", "email", "templates", file), "utf8")
const count = (html: string, part: string) => html.split(part).length - 1
const lamesOf = (html: string) =>
  html.slice(html.indexOf("===== LAMES"), html.indexOf("===== FIN DES LAMES"))

const html = renderEmail(email)
const lames = lamesOf(html)

describe("renderer — document", () => {
  test("document complet, 4 lames entre les marqueurs", () => {
    assert.ok(html.startsWith("<!DOCTYPE html>"))
    assert.match(html, /<head>[\s\S]*<\/head>[\s\S]*<body[\s\S]*<\/body>/)
    assert.equal(count(lames, 'class="lame"'), 4)
  })

  test("objet et préheader échappés, padding invisible préservé", () => {
    assert.ok(html.includes("<title>Studi &amp; vous : rentrée le 12/10</title>"))
    assert.ok(html.includes("Réponse en &lt;5 min, et vous savez ce qui reste à votre charge\n&#847;&zwnj;&nbsp;"))
    assert.ok(!html.includes("[OBJET DE L'EMAIL]") && !html.includes("[PREHEADER]"))
  })

  test("ordre des lames préservé", () => {
    const positions = ["La communauté pour apprendre", "Rentrée 2026", "Un rythme", "Nos formations"]
      .map((marker) => lames.indexOf(marker))
    assert.ok(positions.every((position, index) => position > 0 && (index === 0 || position > positions[index - 1]!)))
  })

  test("MSO, VML et media queries préservés, en-tête identique au socle", () => {
    const socle = readFileSync(join(process.cwd(), "lib", "email", "socle-email.html"), "utf8")
    const head = (document: string) => document.slice(0, document.indexOf("<body"))
    assert.equal(head(html), head(socle).replace("[OBJET DE L'EMAIL]", "Studi &amp; vous : rentrée le 12/10"))
    assert.ok(html.includes("<!--[if mso]>") && html.includes("<![endif]-->"))
    assert.ok(html.includes('xmlns:v="urn:schemas-microsoft-com:vml"'))
    assert.ok(html.includes("@media only screen and (max-width:599px)"))
  })

  test("aucun script, aucun on*, aucun attribut interne", () => {
    assert.ok(!/<script/i.test(html))
    assert.ok(!/\son[a-z]+=/i.test(html))
    assert.ok(!internalAttribute.test(html))
  })
})

describe("renderer — slots", () => {
  test("texte échappé, guillemets du texte conservés", () => {
    assert.ok(lames.includes(">Studi &amp; vous : &lt;5 min pour démarrer</p>"))
    assert.ok(lames.includes(">x &gt; 5 formations"))
    assert.ok(lames.includes('"votre" projet'))
  })

  test("href injecté, & échappé, UTM préservé ; gabarit à flèche", () => {
    assert.ok(lames.includes('href="https://www.studi.com/fr/bilan?campagne=rentree&amp;[UTM À DÉFINIR — CRM]"'))
    assert.ok(lames.includes(">Faire mon bilan &nbsp;&#8594;</a>"))
  })

  test("Liquid et [URL À CONFIRMER] préservés", () => {
    assert.ok(lames.includes("Bonjour {{ customer.first_name }},"))
    assert.ok(lames.includes('href="{{ event.catalogue_url }}"'))
    assert.ok(lames.includes('href="https://www.studi.com/fr/magazine?id={{ customer.id }}"'))
    assert.ok(lames.includes('href="[URL À CONFIRMER]"'))
  })

  test("image : src et alt injectés, dimensions du template", () => {
    assert.ok(lames.includes('<img src="https://cdn.studi.com/visuels/hero.jpg?w=246&amp;h=456" alt="Apprenante &quot;concentrée&quot; devant son ordinateur" width="229" height="456"'))
  })

  test("éléments système préservés", () => {
    assert.equal(count(lames, '<img src="[URL_CDN_LOGO_STUDI_SOMBRE]"'), 2)
    for (const token of ["[URL_CDN_SOCIAL_01]", "[URL_CDN_SOCIAL_04]", "[URL_DESABONNEMENT]", "[URL_PREFERENCES]"]) {
      assert.ok(lames.includes(token), token)
    }
    assert.ok(lames.includes(">Se désabonner</a>"))
  })

  test("aucun placeholder éditorial restant", () => {
    for (const placeholder of ["Titre principal", "Sous-titre", "Texte descriptif", "Bouton primaire", "[URL_CDN_VISUEL]", "[URL_CTA]"]) {
      assert.ok(!lames.includes(placeholder), placeholder)
    }
  })

  test("disclaimer : astérisque + texte exact ; disclaimer-2 absent supprimé", () => {
    const one = renderEmail(withBlocks(content, disclaimer))
    const lines = (document: string) => count(document, "font-size:11px;line-height:1.55;font-weight:400;color:#79726B")
    assert.ok(one.includes('>*Source : Résultat de l\'enquête Audirep réalisée en janvier 2025 sur un échantillon de 2309 répondants diplômés ayant terminé leur formation entre janvier 2021 et juin 2023.</p>'))
    assert.equal(lines(one), 1)
    assert.ok(!one.includes("Second disclaimer"))

    const two = renderEmail(withBlocks(content, {
      ...disclaimer,
      slots: {
        "disclaimer-1": { disclaimer: "bourse-etudes-30" },
        "disclaimer-2": { disclaimer: "offre-promotionnelle", endDate: "2026-10-31" },
      },
    }))
    assert.equal(lines(two), 2)
    assert.ok(two.includes("valable jusqu'au 31/10/2026."))
    assert.ok(!internalAttribute.test(one) && !internalAttribute.test(two))
  })

  test("icône : jeton interne contrôlé", () => {
    const out = renderEmail(withBlocks({
      id: "avis",
      type: "email-module-cta-and-testimonial",
      slots: {
        "texte-descriptif": { text: "a" },
        "cta-1": { label: "Découvrir", href: "https://www.studi.com" },
        "icone-1": { icon: "graduation-cap" },
        temoignage: { text: "t" },
        "temoignage-auteur": { text: "a" },
      },
    }))
    assert.ok(out.includes('src="[URL_CDN_ICONE:graduation-cap]"'))
    assert.ok(out.includes('>Découvrir</a></td><td align="right"'))
  })
})

describe("renderer — surfaces", () => {
  const wrapper = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:'
  const lameAround = (document: string, marker: string) => {
    const at = document.indexOf(marker)
    const next = document.indexOf(wrapper, at)
    return document.slice(document.lastIndexOf(wrapper, at), next === -1 ? undefined : next)
  }

  test("surface absente : recette Page", () => {
    const block = lameAround(lames, "Un rythme")
    assert.ok(!block.includes("#FAFAF9") && block.includes("background:#FFFFFF"))
  })

  test("surface colorée standard (Marque)", () => {
    const block = lameAround(lames, "Rentrée 2026")
    assert.ok(block.startsWith(`${wrapper}#0D302D`))
    assert.ok(block.includes("background:#EDF878"))
    assert.ok(!/#(FAFAF9|F5F5F4|070A0D|79726B|0C0A09)/.test(block))
  })

  test("lames fixed non recolorées", () => {
    assert.ok(lames.includes(readTemplate("email-module-header-newsletter.html").replace(' data-system="logo"', "").trimEnd()))
    assert.ok(lames.includes("border-top:1px solid #58544D") && lames.includes("color:#0C0A09"))
  })

  const iconsList = (surface?: "marque" | "accent-1"): EmailBlock => ({
    id: "atouts",
    type: "email-module-icons-list",
    ...(surface ? { surface } : {}),
    slots: {
      "titre-section": { text: "Vos atouts" },
      "icone-1": { icon: "laptop" }, "item-1-titre": { text: "A" }, "texte-descriptif-1": { text: "a" },
      "icone-2": { icon: "users" }, "item-2-titre": { text: "B" }, "texte-descriptif-2": { text: "b" },
      "icone-3": { icon: "star" }, "item-3-titre": { text: "C" }, "texte-descriptif-3": { text: "c" },
    },
  })
  const circles = (document: string) =>
    [...document.matchAll(/style="width:44px;background:(#[0-9A-F]{6});border-radius:50%;"/g)].map((match) => match[1]).join()

  test("icon-background protégé : blanc sur Page et Accent 1, Filet sur Marque", () => {
    assert.equal(circles(renderEmail(withBlocks(iconsList()))), "#FFFFFF,#FFFFFF,#FFFFFF")
    assert.equal(circles(renderEmail(withBlocks(iconsList("accent-1")))), "#FFFFFF,#FFFFFF,#FFFFFF")
    const marque = renderEmail(withBlocks(iconsList("marque")))
    assert.equal(circles(marque), "#2F2A28,#2F2A28,#2F2A28")
    assert.ok(marque.includes("background:#0D302D") && !internalAttribute.test(marque))
  })

  const productDetails = (surface?: "marque"): EmailBlock => ({
    id: "detail",
    type: "email-module-product-details-variant-01",
    ...(surface ? { surface } : {}),
    slots: {
      label: { text: "2 formations offertes" },
      "titre-principal": { text: "Inclus dans votre offre" },
      "titre-section": { text: "Inclus" },
      "texte-descriptif": { text: "d" },
      "cta-1": { label: "Profiter de l'offre", href: "https://www.studi.com" },
    },
  })

  test("product-details rendu sur Page : carte blanche, contour encre", () => {
    const out = renderEmail(withBlocks(productDetails()))
    assert.ok(out.includes("background:#FFFFFF;border:1px solid #1D1916;border-radius:12px"))
  })

  test("product-details sur surface colorée : erreur explicite (non supporté)", () => {
    assert.throws(
      () => renderEmail(withBlocks(productDetails("marque"))),
      (error: unknown) => error instanceof EmailTemplateError && /"overlay-card" non établi sur la surface "marque"/.test(error.message)
    )
  })
})

describe("renderer — intégrité", () => {
  const tamper = (file: string, change: (html: string) => string): EmailTemplateSource => ({
    socle: emailFileTemplateSource.socle,
    template: (name) => (name === file ? change(readTemplate(name)) : readTemplate(name)),
  })
  const textOnly = "email-module-text-only.html"
  const cases: [string, EmailTemplateSource, RegExp][] = [
    ["slot du manifeste absent", tamper(textOnly, (s) => s.replace(' data-slot="texte-descriptif"', "")), /absent du template/],
    ["data-slot non déclaré", tamper(textOnly, (s) => s.replace("<p ", '<p data-slot="titre-principal" ')), /non déclaré/],
    ["slot contenant du balisage", tamper(textOnly, (s) => s.replace(/(data-slot="titre-section"[^>]*>)/, "$1<b>x</b>")), /contient des éléments/],
    ["couleur hors recette", tamper(textOnly, (s) => s.replace("background:#FAFAF9", "background:#123456")), /sans rôle/],
    ["jeton système altéré", tamper("email-module-header-newsletter.html", (s) => s.replace("[URL_CDN_LOGO_STUDI_SOMBRE]", "https://evil.example/logo.png")), /jeton/],
  ]
  for (const [name, source, message] of cases) {
    test(name, () => {
      assert.throws(
        () => renderEmail(email, { source }),
        (error: unknown) => error instanceof EmailTemplateError && message.test(error.message)
      )
    })
  }

  test("un autre data-* du template est conservé", () => {
    const out = renderEmail(email, { source: tamper(textOnly, (s) => s.replace("<p ", '<p data-track="x" ')) })
    assert.ok(out.includes('data-track="x"') && !internalAttribute.test(out))
  })

  test("renderEmailFromUnknown : config invalide → aucune sortie", () => {
    assert.throws(() => renderEmailFromUnknown({ ...email, blocks: [] }), { name: "ZodError" })
  })
})

describe("renderer — balayage des 36 lames sur Page", () => {
  const entries = Object.entries(emailBlockManifest) as [string, {
    slots: Record<string, string>
    system?: readonly string[]
  }][]

  test("36 lames au manifeste", () => assert.equal(entries.length, 36))

  for (const [type, entry] of entries) {
    test(type, () => {
      const slots = Object.fromEntries(
        Object.entries(entry.slots).map(([slot, kind]) => [
          slot,
          slot === "disclaimer-2" ? { disclaimer: "salaires-metier" } : sampleSlotValues[kind],
        ])
      )
      const block = { id: "lame", type, slots }
      const isFooter = (entry.system ?? []).includes("lien-desabonnement")
      const out = renderEmailFromUnknown({ ...email, blocks: isFooter ? [block] : [block, footer] })
      assert.ok(!internalAttribute.test(out), "attribut interne restant")
      assert.ok(out.includes("<!--[if mso]>"))
    })
  }
})
