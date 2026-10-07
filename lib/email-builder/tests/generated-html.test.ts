/**
 * V2.9.2 : compilateur déterministe des lames générées. Aucun HTML ne vient de la spec
 * ni du contenu ; le résultat est contrôlé par parse5. Pur, hors réseau.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { parseFragment, type DefaultTreeAdapterTypes } from "parse5"

import { emailDestinationUrl } from "../../email/destinations"
import { emailBank, emailBankDerivative, emailImageFormats, type EmailBankImageId } from "../../email/image-bank"
import { emailBlockManifest } from "../../email/manifest"
import { emailSurfaceRecipes, emailSurfaces } from "../../email/surfaces"
import { compileGeneratedBlock, renderGeneratedBlock } from "../generated-html/compile"
import { lintGeneratedHtml } from "../generated-html/hygiene"
import { bannerOverlapCard, generatedFixtures, heroImageText, itemGrid, textSection, threeCards } from "./generated-fixtures"
import { fixtureContents } from "./generated-html-content"

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type El = DefaultTreeAdapterTypes.Element
const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
const clone = <T>(value: T): T => structuredClone(value)

const render = (name: string, options: { surface?: unknown; slotMarkers?: boolean; content?: unknown; spec?: unknown } = {}) =>
  renderGeneratedBlock({ spec: "spec" in options ? options.spec : generatedFixtures[name], content: "content" in options ? options.content : fixtureContents[name], surface: options.surface, slotMarkers: options.slotMarkers })
const ok = (name: string, options: Parameters<typeof render>[1] = {}) => {
  const result = render(name, options)
  assert.equal(result.ok, true, JSON.stringify(result.ok ? "" : result.issues))
  return result as Extract<typeof result, { ok: true }>
}
const refused = (name: string, options: Parameters<typeof render>[1], code?: string) => {
  const result = render(name, options)
  assert.equal(result.ok, false)
  if (!result.ok && code) assert.ok(result.issues.some((issue) => issue.code === code), `${code} attendu : ${JSON.stringify(result.issues)}`)
  return result
}
const withContent = (name: string, change: (content: Json) => void) => {
  const content = clone(fixtureContents[name]) as Json
  change(content)
  return content
}
const all = (html: string): El[] => {
  const out: El[] = []
  const visit = (node: DefaultTreeAdapterTypes.ParentNode) => {
    for (const child of node.childNodes ?? []) {
      if ("tagName" in child) {
        out.push(child)
        visit(child)
      }
    }
  }
  visit(parseFragment(html))
  return out
}
const attr = (element: El, name: string) => element.attrs.find((entry) => entry.name === name)?.value
const textOf = (element: El): string => element.childNodes.map((child) => ("value" in child ? child.value : "tagName" in child ? textOf(child) : "")).join("")
const slotText = (html: string, slot: string) => {
  const element = all(html).find((entry) => attr(entry, "data-slot") === slot)
  assert.ok(element, slot)
  return textOf(element!)
}
const visibleText = (html: string) => all(html).filter((entry) => entry.tagName === "p" || entry.tagName === "a").map(textOf).join(" | ")

describe("V2.9.2 — les six fixtures rendent réellement", () => {
  test("A–F : ok, hygiène, 600 px, contenu présent dans l'ordre du document", () => {
    for (const name of Object.keys(generatedFixtures)) {
      const { html, slots } = ok(name, { slotMarkers: true })
      assert.equal(all(html).filter((e) => e.tagName === "table" && attr(e, "class")?.split(" ").includes("lame")).map((e) => attr(e, "width")).join(), "600", name)
      const order = all(html).map((e) => attr(e, "data-slot")).filter(Boolean)
      assert.deepEqual(order, slots.map((slot) => slot.name), `${name} : l'ordre du document`)
      assert.deepEqual(lintGeneratedHtml(html, { slotMarkers: true }), [])
    }
  })

  test("le texte visible est exactement le contenu fourni, dans l'ordre (texte, boutons avec flèche)", () => {
    const { html } = ok("textSection")
    assert.equal(visibleText(html), "Reprenez votre parcours | Un accompagnement pensé pour avancer à votre rythme, étape par étape. | Découvrir les formations \u00a0→")
    assert.equal(visibleText(ok("threeCards").html).split(" | ").length, 9)
    assert.match(visibleText(ok("statBanner").html), /^RÉSULTATS|Résultats \| 92 %/)
  })

  test("déterminisme : même spec + contenu + surface → exactement le même HTML, quel que soit l'ordre des clés du contenu", () => {
    for (const name of Object.keys(generatedFixtures)) {
      const a = ok(name).html
      assert.equal(a, ok(name).html)
      const shuffled = Object.fromEntries(Object.entries(fixtureContents[name]!).reverse())
      assert.equal(a, ok(name, { content: shuffled }).html, name)
      const compiled = compileGeneratedBlock(generatedFixtures[name])
      const again = compileGeneratedBlock(clone(generatedFixtures[name]))
      assert.deepEqual(compiled.ok && compiled.compiled.parts, again.ok && again.compiled.parts)
    }
    const source = code("lib/email-builder/generated-html/compile.ts") + code("lib/email-builder/generated-html/hygiene.ts")
    assert.ok(!/Math\.random|Date\.now|new Date|randomUUID|crypto/.test(source))
  })

  test("trois cartes SANS images : une vraie structure 3 colonnes (table) qui s'empile sur mobile ; avec le format futur « card », impossible", () => {
    const { html } = ok("threeCards")
    const cols = all(html).filter((e) => e.tagName === "table" && attr(e, "class") === "cols")
    assert.equal(cols.length, 1)
    assert.match(attr(cols[0]!, "style")!, /table-layout:fixed/)
    const cells = all(html).filter((e) => e.tagName === "td" && attr(e, "class") === "stack stack-gap")
    assert.equal(cells.length, 3)
    assert.equal(all(html).filter((e) => attr(e, "class") === "hide-m").length, 2)
    assert.equal(cells.map((e) => Number(attr(e, "width"))).reduce((a, b) => a + b, 0) + 2 * 24, 600 - 2 * 40, "3 colonnes + 2 écarts = zone utile")
    const withImage = clone(threeCards) as Json
    withImage.root.children[0].children[0].children[0].children.unshift({ t: "image", slot: "image-1", format: "card", radius: 12, align: "center" })
    refused("threeCards", { spec: withImage }, "spec")
  })
})

describe("V2.9.2 — colonnes et responsive", () => {
  const columnsSpec = (ratio: string, count: number, gap = 16) => ({
    specVersion: 1,
    role: "text",
    root: { t: "section", padX: 40, padY: 32, children: [{ t: "columns", ratio, gap, align: "top", children: Array.from({ length: count }, (_, i) => ({ t: "stack", gap: 8, align: "start", children: [{ t: "text", slot: `texte-${i + 1}`, style: "body", align: "start", tone: "text" }] })) }] },
  })
  const contentFor = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`texte-${i + 1}`, { text: `Colonne ${i + 1}` }]))

  test("1:1, 1:2, 2:1, 1:1:1, 1:1:1:1 : proportions exactes, somme = largeur utile, écarts « hide-m », empilement « stack »", () => {
    const expected: Record<string, number[]> = { "1:1": [1, 1], "1:2": [1, 2], "2:1": [2, 1], "1:1:1": [1, 1, 1], "1:1:1:1": [1, 1, 1, 1] }
    for (const [ratio, units] of Object.entries(expected)) {
      for (const gap of [16, 20, 24]) {
        const result = renderGeneratedBlock({ spec: columnsSpec(ratio, units.length, gap), content: contentFor(units.length) })
        assert.equal(result.ok, true, ratio)
        if (!result.ok) continue
        const cells = all(result.html).filter((e) => e.tagName === "td" && attr(e, "class") === "stack stack-gap")
        const widths = cells.map((e) => Number(attr(e, "width")))
        const free = 520 - gap * (units.length - 1)
        assert.equal(widths.reduce((a, b) => a + b, 0), free, `${ratio}/${gap}`)
        const total = units.reduce((a, b) => a + b, 0)
        widths.forEach((width, i) => assert.ok(Math.abs(width - (free * units[i]!) / total) < units.length, `${ratio} col ${i}`))
        assert.equal(all(result.html).filter((e) => attr(e, "class") === "hide-m").length, units.length - 1)
        assert.ok(all(result.html).filter((e) => attr(e, "class") === "hide-m").every((e) => attr(e, "width") === String(gap)))
      }
    }
  })

  test("aucune mise en page web : ni flex, ni grid, ni float, ni position:absolute ; seules les classes du socle servent à l'empilement", () => {
    for (const name of Object.keys(generatedFixtures)) {
      const { html } = ok(name)
      assert.ok(!/display:\s*(flex|grid|inline-flex)|float:|position:\s*absolute|@media|<style/i.test(html), name)
    }
    const socle = readFileSync(join(root, "lib/email/socle-email.html"), "utf8")
    for (const cls of ["cols", "stack", "stack-gap", "hide-m", "lame", "fs28", "fs38", "fs48", "px40", "py48"]) assert.ok(new RegExp(`\\.${cls}\\{`).test(socle), `.${cls} du socle`)
  })

  test("colonnes imbriquées : la largeur utile suit (grille 2×2 dans une section à 40 px)", () => {
    const { html } = ok("itemGrid")
    const widths = all(html).filter((e) => e.tagName === "td" && attr(e, "class") === "stack stack-gap").map((e) => Number(attr(e, "width")))
    assert.deepEqual(widths, [248, 248, 248, 248])
  })
})

describe("V2.9.2 — surfaces", () => {
  test("la même spec garde sa structure et change ses rôles de couleur ; aucune couleur hors rôles", () => {
    const strip = (html: string) => html.replace(/(?<!&)#[0-9A-F]{6}/g, "#")
    for (const name of Object.keys(generatedFixtures)) {
      const base = strip(ok(name, { surface: "page" }).html)
      for (const surface of emailSurfaces) assert.equal(strip(ok(name, { surface }).html), base, `${name}/${surface}`)
    }
    const palette = new Set<string>(Object.values(emailSurfaceRecipes).flatMap((recipe) => Object.values(recipe)))
    for (const surface of emailSurfaces) for (const name of Object.keys(generatedFixtures)) for (const hex of ok(name, { surface }).html.match(/(?<!&)#[0-9A-Fa-f]{3,8}\b/g) ?? []) assert.ok(palette.has(hex.toUpperCase()), `${hex} (${name}/${surface})`)
  })

  test("page, marque, encre : fond de section, titre, bouton lus dans la recette de la surface", () => {
    for (const surface of ["page", "marque", "encre", "bloc", "accent-1", "accent-2-soft", "accent-2"] as const) {
      const html = ok("textSection", { surface }).html
      const recipe = emailSurfaceRecipes[surface]
      assert.ok(html.includes(`background:${recipe.fond};padding:48px 40px`), surface)
      assert.ok(html.includes(`color:${recipe.titre};margin:0`), surface)
      assert.ok(html.includes(`background:${recipe.fondCta};border:none`), surface)
      assert.ok(html.includes(`color:${recipe.libelleCta};white-space:nowrap`), surface)
    }
    assert.notEqual(ok("textSection", { surface: "page" }).html, ok("textSection", { surface: "marque" }).html)
  })

  test("une surface inconnue est refusée, sans repli", () => {
    for (const surface of ["neon", "", "#ff0000", "PAGE", null, 3, {}]) refused("textSection", { surface }, "surface")
    assert.equal(ok("textSection", { surface: undefined }).html, ok("textSection", { surface: "page" }).html)
  })

  test("une carte est une surface imbriquée : texte lisible sur section sombre (carte « soft » lue comme Bloc)", () => {
    const html = ok("statBanner", { surface: "encre" }).html
    assert.ok(html.includes(`background:${emailSurfaceRecipes.bloc.fond};border:1px solid ${emailSurfaceRecipes.bloc.filet}`))
    assert.ok(html.includes(`color:${emailSurfaceRecipes.bloc.titre};margin:0`))
  })
})

describe("V2.9.2 — images", () => {
  test("image valide : src canonique du dérivé de la banque, alt contrôlé, dimensions du format ; jamais d'URL du contenu", () => {
    const { html } = ok("heroImageText")
    const img = all(html).find((e) => e.tagName === "img")!
    assert.equal(attr(img, "src"), emailBankDerivative("canape-lumiere", "large").src)
    assert.equal(attr(img, "alt"), emailBank["canape-lumiere"].alt)
    assert.equal(attr(img, "width"), "600", "hero pleine largeur : hors de l'inset")
    assert.equal(attr(img, "height"), "534")
    for (const name of ["heroImageText", "bannerOverlapCard"]) for (const src of all(ok(name).html).filter((e) => e.tagName === "img").map((e) => attr(e, "src")!)) assert.match(src, /^https:\/\/demo-assets\.invalid\/email-v2\/[a-z0-9-]+--(medium|large|split|band|offer)\.jpg$/)
    assert.equal(emailImageFormats.band.frame.width, 520)
  })

  test("imageId inconnu, absent, mal typé ; image sans dérivé pour ce format ; clé supplémentaire (src, url, alt) : refusés", () => {
    refused("heroImageText", { content: withContent("heroImageText", (c) => (c.image = { imageId: "inconnue" })) }, "image-unknown")
    refused("heroImageText", { content: withContent("heroImageText", (c) => (c.image = { imageId: "<script>" })) }, "image-unknown")
    refused("heroImageText", { content: withContent("heroImageText", (c) => (c.image = { imageId: 42 })) }, "image-unknown")
    refused("heroImageText", { content: withContent("heroImageText", (c) => (c.image = {})) }, "kind")
    for (const extra of [{ src: "https://evil.example/x.png" }, { url: "https://evil.example/x.png" }, { alt: "<b>x</b>" }, { width: 9999 }, { style: "x" }]) refused("heroImageText", { content: withContent("heroImageText", (c) => (c.image = { imageId: "canape-lumiere", ...extra })) }, "kind")
    const noSplit = (Object.keys(emailBank) as EmailBankImageId[]).find((id) => !(emailBank[id].formats as readonly string[]).includes("split"))
    assert.ok(noSplit, "une image de la banque sans format « split »")
    const split = clone(heroImageText) as Json
    split.root.children[0].format = "split"
    refused("heroImageText", { spec: split, content: withContent("heroImageText", (c) => (c.image = { imageId: noSplit })) }, "image-incompatible")
    ok("heroImageText", { spec: split, content: withContent("heroImageText", (c) => (c.image = { imageId: "canape-lumiere" })) })
  })

  test("l'alt vient de la banque (échappé en attribut) ; le contenu ne peut pas en fournir un", () => {
    const { html } = ok("bannerOverlapCard")
    const alt = attr(all(html).find((e) => e.tagName === "img")!, "alt")
    assert.equal(alt, emailBank["bureau-lampe-bleu"].alt)
    assert.ok(!/alt="[^"]*"[^>]*alt=/.test(html))
  })
})

describe("V2.9.2 — boutons, destinations, icônes", () => {
  test("destination contrôlée : l'href est l'URL de la destination (UTM à définir), jamais une valeur libre", () => {
    const { html } = ok("textSection")
    assert.equal(attr(all(html).find((e) => e.tagName === "a")!, "href"), emailDestinationUrl("catalogue-formations"))
    for (const bad of ["https://evil.example", "javascript:alert(1)", "catalogue", "", "__proto__", "constructor", null, 5, { id: "catalogue-formations" }]) {
      refused("textSection", { content: withContent("textSection", (c) => (c.cta = { label: "Aller", destination: bad })) }, "destination")
    }
    refused("textSection", { content: withContent("textSection", (c) => (c.cta = { label: "Aller", destination: "catalogue-formations", href: "https://evil.example" })) }, "kind")
    refused("textSection", { content: withContent("textSection", (c) => (c.cta = { label: "Aller" })) }, "kind")
  })

  test("libellé échappé ; flèche selon la spec ; variantes et alignement", () => {
    const { html } = ok("textSection", { content: withContent("textSection", (c) => (c.cta = { label: 'A & B <i>"x"</i>', destination: "catalogue-formations" })) })
    assert.ok(html.includes('A &amp; B &lt;i&gt;"x"&lt;/i&gt; &nbsp;&#8594;</a>'))
    assert.ok(!html.includes("<i>"))
    assert.ok(!ok("threeCards").html.includes("&#8594;"), "bouton sans flèche")
    const variant = (v: string, align = "start", surface = "page") => {
      const spec = clone(textSection) as Json
      Object.assign(spec.root.children[0].children[2], { variant: v, align })
      return ok("textSection", { spec, surface }).html
    }
    assert.ok(variant("primary").includes("background:#1D1916;border:none"))
    assert.ok(variant("inverse").includes("background:#FFFFFF;border:none"))
    assert.ok(variant("accent").includes(`background:${emailSurfaceRecipes["accent-1"].fond};border:none`))
    assert.ok(variant("accent", "start", "accent-1").includes(`background:${emailSurfaceRecipes["accent-1"].fondCta};border:none`), "accent sur accent-1 : bouton primaire")
    assert.ok(!variant("link").includes("border-radius:9999px") && variant("link").includes("display:block"))
    assert.ok(variant("primary", "start").includes('align="left"') && variant("primary", "center").includes('align="center"'))
  })

  test("icône : nom du catalogue, jeton d'icône ; cadre « none » et « circle » ; nom inconnu ou injecté refusé", () => {
    const { html } = ok("itemGrid")
    const icons = all(html).filter((e) => e.tagName === "img").map((e) => attr(e, "src"))
    assert.deepEqual(icons, ["rocket-launch", "users", "award", "laptop"].map((name) => `[URL_CDN_ICONE:${name}]`))
    assert.ok(html.includes("border-radius:50%"))
    const spec = clone(itemGrid) as Json
    for (const column of spec.root.children[0].children) for (const item of column.children) item.children[0].frame = "none"
    assert.ok(!ok("itemGrid", { spec }).html.includes("border-radius:50%"))
    for (const bad of ["inconnue", "<svg onload=x>", "../../etc", "", 3, null]) refused("itemGrid", { content: withContent("itemGrid", (c) => (c["icone-1"] = { icon: bad })) }, "icon")
    refused("itemGrid", { content: withContent("itemGrid", (c) => (c["icone-1"] = { icon: "star", src: "https://evil.example/a.svg" })) }, "kind")
  })

  test("séparateur et espaceur : fragments constants", () => {
    const spec = { specVersion: 1, role: "divider", root: { t: "section", padX: 40, padY: 32, children: [{ t: "divider" }, { t: "spacer", size: 24 }, { t: "text", slot: "titre", style: "title", align: "start", tone: "title" }] } }
    const { html } = renderGeneratedBlock({ spec, content: { titre: { text: "Titre" } } }) as Extract<ReturnType<typeof renderGeneratedBlock>, { ok: true }>
    assert.ok(html.includes('height="1" style="height:1px;line-height:1px;font-size:0;background:#E7E5E4;"'))
    assert.ok(html.includes('<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>'))
  })
})

describe("V2.9.2 — sécurité du contenu", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<a href=javascript:alert(1)>clic</a>",
    "</td><script>alert(1)</script>",
    '" onmouseover="alert(1)" x="',
    "'; DROP TABLE emails; --",
    "{{ user.password }} ${process.env.SECRET} [URL_CDN_VISUEL]",
    "R&D &lt;b&gt; &amp; 100% <3 > 2",
    "Été — 漢字 — 😀 — ‮evil",
    "<!-- commentaire --><svg onload=alert(1)>",
  ]

  test("un contenu hostile reste du TEXTE visible : jamais un élément, un attribut ni un événement", () => {
    for (const attack of attacks) {
      for (const markers of [true, false]) {
        const { html } = ok("textSection", { slotMarkers: markers, content: withContent("textSection", (c) => ((c.titre = { text: attack }), (c.cta = { label: attack.slice(0, 40), destination: "catalogue-formations" }))) })
        const tags = new Set(all(html).map((e) => e.tagName))
        assert.deepEqual([...tags].sort(), ["a", "p", "table", "tbody", "td", "tr"].sort(), attack)
        assert.ok(all(html).every((e) => !e.attrs.some((a) => /^on/i.test(a.name))), attack)
        if (markers) assert.equal(slotText(html, "titre"), attack)
        assert.deepEqual(lintGeneratedHtml(html, { slotMarkers: markers }), [], attack)
        assert.ok(!/<script|<img src=x|<svg|<!--/.test(html), attack)
      }
    }
  })

  test("texte très long : à la limite du slot, échappé ; au-delà, refusé", () => {
    const max = (ok("textSection").slots.find((slot) => slot.name === "titre")!.maxLength)!
    const edge = "<".repeat(max)
    assert.equal(slotText(ok("textSection", { slotMarkers: true, content: withContent("textSection", (c) => (c.titre = { text: edge })) }).html, "titre"), edge)
    refused("textSection", { content: withContent("textSection", (c) => (c.titre = { text: "a".repeat(max + 1) })) }, "text")
    refused("textSection", { content: withContent("textSection", (c) => (c.titre = { text: "x".repeat(100_000) })) }, "text")
  })

  test("texte vide, espaces seuls, caractères de contrôle, mauvais type : refusés", () => {
    for (const bad of ["", "   ", "a\u0000b", "a\u001Bb", 5, null, ["x"], { toString: () => "x" }]) refused("textSection", { content: withContent("textSection", (c) => (c.titre = { text: bad })) }, "text")
  })

  test("aucune valeur de contenu ne devient un attribut : src, href et alt viennent du système", () => {
    for (const name of Object.keys(generatedFixtures)) {
      const { html } = ok(name)
      for (const element of all(html)) {
        if (element.tagName === "a") assert.match(attr(element, "href")!, /^https:\/\/(www\.studi\.com|meet\.studi\.fr)\//)
        if (element.tagName === "img") assert.match(attr(element, "src")!, /^(https:\/\/demo-assets\.invalid\/email-v2\/|\[URL_CDN_ICONE:)/)
      }
    }
  })
})

describe("V2.9.2 — fail closed", () => {
  test("spec invalide (toute la validation V2.9.1 s'applique) : refusée entière", () => {
    for (const spec of [null, {}, "x", { ...clone(textSection), style: "color:red" }, { ...clone(textSection), specVersion: 2 }]) refused("textSection", { spec }, "spec")
    const tampered = clone(textSection) as Json
    tampered.root.padX = 41
    refused("textSection", { spec: tampered }, "spec")
    const css = clone(textSection) as Json
    css.root.children[0].children[0].style = "title; background:url(//evil)"
    refused("textSection", { spec: css }, "spec")
    const color = clone(textSection) as Json
    color.root.children[0].children[0].tone = "#ff0000"
    refused("textSection", { spec: color }, "spec")
  })

  test("slot manquant, slot en trop, mauvais genre, contenu absent ou non objet : refusés, sans contenu inventé", () => {
    refused("textSection", { content: withContent("textSection", (c) => delete c.texte) }, "slot-missing")
    refused("textSection", { content: withContent("textSection", (c) => (c.surprise = { text: "x" })) }, "slot-extra")
    refused("textSection", { content: withContent("textSection", (c) => (c.titre = { label: "x", destination: "catalogue-formations" })) }, "kind")
    refused("textSection", { content: withContent("textSection", (c) => (c.cta = { text: "x" })) }, "kind")
    refused("textSection", { content: withContent("textSection", (c) => (c.titre = "texte brut")) }, "kind")
    refused("textSection", { content: withContent("textSection", (c) => (c.titre = { text: "x", html: "<b>" })) }, "kind")
    for (const content of [undefined, null, [], "x", 3, {}]) refused("textSection", { content })
  })

  test("le HTML produit est relu par l'hygiène avant d'être rendu : un rendu qui dériverait est refusé", () => {
    const { html } = ok("textSection")
    const bad = (mutate: (html: string) => string, slotMarkers = false) => lintGeneratedHtml(mutate(html), { slotMarkers })
    assert.deepEqual(bad((h) => h), [])
    assert.ok(bad((h) => h.replace("<p ", "<script>alert(1)</script><p ")).length > 0)
    assert.ok(bad((h) => h.replace("<p ", '<iframe src="https://x"></iframe><p ')).length > 0)
    assert.ok(bad((h) => h.replace("<p ", '<p onclick="x" ')).length > 0)
    assert.ok(bad((h) => h.replace('style="', 'style="background:url(https://evil/x.png);')).length > 0)
    assert.ok(bad((h) => h.replace("color:#1D1916", "color:#ff0000")).length > 0)
    assert.ok(bad((h) => h.replace(/href="[^"]+"/, 'href="javascript:alert(1)"')).length > 0)
    assert.ok(bad((h) => h.replace(/href="[^"]+"/, 'href="https://evil.example/"')).length > 0)
    assert.ok(bad((h) => h.replace("<p ", '<p data-slot="x" ')).length > 0, "data-slot hors mode marqueurs")
    assert.ok(bad((h) => h.replace('width="600"', 'width="700"')).length > 0)
    assert.ok(bad((h) => h.replace("<p ", '<p class="evil" ')).length > 0)
    assert.ok(bad((h) => h.replace("</td></tr>\n</table>", "</td>\n</table>")).length > 0)
    assert.ok(bad((h) => `texte libre${h}`).length > 0)
    assert.ok(bad((h) => h.replace("Reprenez", "{{ x }}").replace('font-size:28px', 'font-size:undefinedpx')).length > 0)
    const img = ok("heroImageText").html
    assert.ok(lintGeneratedHtml(img.replace(/src="[^"]+"/, 'src="https://evil.example/p.png"'), { slotMarkers: false }).length > 0)
    assert.ok(lintGeneratedHtml(img.replace(/ alt="[^"]*"/, ""), { slotMarkers: false }).length > 0)
  })

  test("le renderer ne peut pas être détourné via le prototype ou des clés spéciales du contenu", () => {
    const content = JSON.parse('{"titre":{"text":"x"},"texte":{"text":"y"},"cta":{"label":"z","destination":"catalogue-formations"},"__proto__":{"text":"p"}}')
    refused("textSection", { content })
    refused("textSection", { content: withContent("textSection", (c) => (c.cta = { label: "z", destination: "toString" })) }, "destination")
  })
})

describe("V2.9.2 — marqueurs de slots", () => {
  test("avec marqueurs : un data-slot par slot dérivé ; sans : AUCUN attribut interne ; le HTML est identique au marqueur près", () => {
    for (const name of Object.keys(generatedFixtures)) {
      const marked = ok(name, { slotMarkers: true })
      const clean = ok(name, { slotMarkers: false })
      assert.ok(!/data-/.test(clean.html), name)
      assert.equal(marked.html.replace(/ data-slot="[a-z0-9-]+"/g, ""), clean.html, name)
      assert.equal((marked.html.match(/data-slot=/g) ?? []).length, marked.slots.length, name)
    }
    assert.equal(ok("textSection").html, ok("textSection", { slotMarkers: false }).html, "sans option = sans marqueurs")
  })

  test("les marqueurs sont sur les mêmes éléments que les lames officielles : p (texte), a (bouton), img (visuel, icône)", () => {
    const { html } = ok("heroImageText", { slotMarkers: true })
    const by = Object.fromEntries(all(html).filter((e) => attr(e, "data-slot")).map((e) => [attr(e, "data-slot")!, e.tagName]))
    assert.deepEqual(by, { image: "img", "sur-titre": "p", titre: "p", texte: "p", cta: "a" })
    assert.equal(Object.values(emailBlockManifest).some((entry) => "generated" in entry), false)
  })
})

describe("V2.9.2 — overlap et compatibilité dérivée", () => {
  test("image + carte `overlap` 40 : « degraded » (raison « overlap ») ; les autres fixtures : « robust » ; la spec ne porte aucun statut", () => {
    const result = ok("bannerOverlapCard")
    assert.equal(result.compatibility, "degraded")
    assert.deepEqual(result.compatibilityReasons, ["overlap"])
    for (const name of ["textSection", "heroImageText", "threeCards", "itemGrid", "statBanner"]) {
      const robust = ok(name)
      assert.equal(robust.compatibility, "robust", name)
      assert.deepEqual(robust.compatibilityReasons, [])
    }
    assert.ok(!/compat|degrad|robust/i.test(JSON.stringify(bannerOverlapCard)))
  })

  test("technique contrôlée : marge négative sur un bloc positionné ; 24/40/56 ; 0 = comportement normal ; replis lisibles", () => {
    for (const overlap of [24, 40, 56]) {
      const spec = clone(bannerOverlapCard) as Json
      spec.root.children[1].overlap = overlap
      const { html, compatibility } = ok("bannerOverlapCard", { spec })
      assert.ok(html.includes(`position:relative;margin:-${overlap}px 24px 0 24px;`), String(overlap))
      assert.equal(compatibility, "degraded")
      assert.ok(!/position:\s*absolute|z-index/.test(html), "pas d'absolute : sans overlap le contenu reste en flux")
    }
    const none = clone(bannerOverlapCard) as Json
    none.root.children[1].overlap = 0
    const result = ok("bannerOverlapCard", { spec: none })
    assert.equal(result.compatibility, "robust")
    assert.ok(!result.html.includes("margin:-"))
  })
})

describe("V2.9.2 — frontières", () => {
  test("frontière (V2.9.3) : le contrat OFFICIEL des lames, le manifest et le renderer historique ne connaissent pas « generated » ; l'intégration est côté Builder", () => {
    assert.equal(Object.keys(emailBlockManifest).length, 36)
    for (const file of ["lib/email/schemas.ts", "lib/email/types.ts", "lib/email/manifest.ts", "lib/email/renderer.ts"]) {
      assert.ok(!/generated-html|renderGeneratedBlock|type:\s*"generated"|generated-block/i.test(code(file)), file)
    }
    // Les composants n'appellent jamais le compilateur : ils reçoivent le HTML rendu par le serveur.
    for (const file of readdirSync(join(root, "components/email-builder"))) assert.ok(!/generated-html|renderGeneratedBlock/.test(code(`components/email-builder/${file}`)), file)
  })

  test("pas d'IA, pas de réseau, pas de React dans le compilateur ; seule extraction : escapeText / escapeAttribute exportés", () => {
    for (const file of readdirSync(join(root, "lib/email-builder/generated-html"))) assert.ok(!/anthropic|from "react"|fetch\(|XMLHttpRequest|process\.env/i.test(code(`lib/email-builder/generated-html/${file}`)), file)
    assert.ok(/export function escapeText/.test(code("lib/email/renderer.ts")) && /export function escapeAttribute/.test(code("lib/email/renderer.ts")))
  })

  test("le HTML du compilateur n'utilise aucune valeur libre : tous les nombres CSS passent par une liste fermée (source)", () => {
    const source = code("lib/email-builder/generated-html/compile.ts")
    assert.ok(/closed\(stackGaps/.test(source) && /closed\(spacerSizes/.test(source) && /closed\(radii/.test(source) && /closed\(cardPaddings/.test(source) && /closed\(overlaps/.test(source) && /closed\(columnGaps/.test(source))
    assert.ok(!/\$\{(n|root|spec)\.(gap|pad|padX|padY|size|radius|overlap)\}/.test(source), "aucune interpolation brute d'une valeur de la spec")
  })
})

describe("V2.9.2.1 — `inset` : un padding contrôlé sur un groupe d'enfants", () => {
  test("hero : image pleine largeur (600) puis contenu paddé (520 utiles) ; classes pxN/pyN du socle ; aucun fond, bordure ni marge", () => {
    const { html, compatibility } = ok("heroImageText")
    assert.equal(compatibility, "robust")
    const img = all(html).find((e) => e.tagName === "img")!
    assert.equal(attr(img, "width"), "600")
    const insets = all(html).filter((e) => e.tagName === "td" && /px40/.test(attr(e, "class") ?? ""))
    assert.equal(insets.length, 1, "un seul td paddé (la section est à 0)")
    assert.equal(attr(insets[0]!, "class"), "px40", "40 vertical : pas de classe py40 dans le socle, la valeur reste fixe")
    assert.equal(attr(insets[0]!, "style"), "padding:40px 40px;", "uniquement du padding")
    const sectionTd = all(html).find((e) => e.tagName === "td" && /padding:0px 0px/.test(attr(e, "style") ?? ""))
    assert.ok(sectionTd && !attr(sectionTd, "class"), "section sans padding ni classe")
    assert.deepEqual(lintGeneratedHtml(html, { slotMarkers: false }), [])
  })

  test("responsive : l'inset réutilise les classes du socle (px40 → 20 px sur mobile, py32/py48/py56/py64 réduits) ; aucune nouvelle règle", () => {
    const socle = readFileSync(join(root, "lib/email/socle-email.html"), "utf8")
    assert.match(socle, /\.px40\{padding-left:20px!important;padding-right:20px!important\}/)
    for (const [x, y, cls] of [[48, 48, "px48 py48"], [20, 32, "px20 py32"], [56, 64, "px56 py64"], [0, 0, ""]] as const) {
      const spec = clone(heroImageText) as Json
      Object.assign(spec.root.children[1], { padX: x, padY: y })
      const td = all(ok("heroImageText", { spec }).html).find((e) => e.tagName === "td" && attr(e, "style") === `padding:${y}px ${x}px;` && e !== undefined && (attr(e, "class") ?? "") === cls && attr(e, "align") === undefined)
      assert.ok(td, `${x}/${y}`)
    }
    assert.ok(!/@media/.test(ok("heroImageText").html), "pas de nouveau CSS responsive")
  })

  test("la largeur utile suit : inset dans une colonne (1:2) ; image dans l'inset réduite par le padding", () => {
    const spec = {
      specVersion: 1,
      role: "text",
      root: { t: "section", padX: 40, padY: 32, children: [{ t: "columns", ratio: "1:2", gap: 24, align: "top", children: [
        { t: "stack", gap: 8, align: "start", children: [{ t: "text", slot: "a", style: "body", align: "start", tone: "text" }] },
        { t: "inset", padX: 20, padY: 0, children: [{ t: "image", slot: "image", format: "medium", radius: 12, align: "start" }] },
      ] }] },
    }
    const result = renderGeneratedBlock({ spec, content: { a: { text: "A" }, image: { imageId: "canape-lumiere" } } })
    assert.equal(result.ok, true)
    if (!result.ok) return
    const free = 520 - 24
    const colTwo = Math.floor((free * 2) / 3) + (free - Math.floor(free / 3) - Math.floor((free * 2) / 3))
    const img = all(result.html).find((e) => e.tagName === "img")!
    assert.equal(attr(img, "width"), String(colTwo - 40))
    assert.equal(result.compatibility, "robust")
  })

  test("`inset` ne produit ni slot ni marqueur ; les marqueurs du hero restent corrects", () => {
    const { html, slots } = ok("heroImageText", { slotMarkers: true })
    assert.deepEqual(slots.map((slot) => slot.name), ["image", "sur-titre", "titre", "texte", "cta"])
    assert.equal((html.match(/data-slot=/g) ?? []).length, 5)
    assert.equal(ok("heroImageText").html, html.replace(/ data-slot="[a-z0-9-]+"/g, ""))
  })

  test("surfaces : le hero garde sa structure ; l'inset est transparent (le fond est celui de la section)", () => {
    const strip = (h: string) => h.replace(/(?<!&)#[0-9A-F]{6}/g, "#")
    const base = strip(ok("heroImageText").html)
    for (const surface of emailSurfaces) assert.equal(strip(ok("heroImageText", { surface }).html), base, surface)
    const dark = ok("heroImageText", { surface: "marque" }).html
    assert.ok(dark.includes(`background:${emailSurfaceRecipes.marque.fond};padding:0px 0px`))
    assert.ok(!/class="px40" style="background/.test(dark))
  })

  test("l'overlap reste dégradé, même dans un inset ; l'inset seul reste robuste", () => {
    const spec = clone(bannerOverlapCard) as Json
    spec.root.children = [{ t: "inset", padX: 40, padY: 0, children: spec.root.children }]
    spec.root.padX = 0
    const nested = ok("bannerOverlapCard", { spec })
    assert.equal(nested.compatibility, "degraded")
    assert.deepEqual(nested.compatibilityReasons, ["overlap"])
  })
})
