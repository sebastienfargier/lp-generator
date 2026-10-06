/**
 * Export HTML : transformation, validation, route et téléchargement. Hors
 * ligne, sans Anthropic : `fetch` est interdit, aucun module de modèle n'est
 * importé par l'export. Les valeurs de l'offre R4 (20 %, DEMO20, dates) sont des
 * données d'illustration.
 *
 * Ce que ces tests figent : l'export est une transformation déterministe de
 * l'email validé ; il ne contient que l'email, avec des assets et des liens
 * absolus et contrôlés ; il suit la version affichée ; le client ne peut ni
 * injecter du HTML, ni une URL, ni changer une valeur protégée.
 */
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import { parse } from "parse5"

import { emailDestinations, emailDestinationUrl } from "../destinations"
import { setDraftTexts } from "../edit-fields"
import { currentVersion, emailEditorReducer, initialEmailEditorState, type EmailEditorAction, type EmailEditorState } from "../editor-state"
import {
  buildExportableEmailHtml,
  EmailExportError,
  exportAssetsEnvVar,
  exportDeferredPlaceholders,
  exportFilename,
  exportLinkHosts,
  exportLogoPath,
  resolveExportAssetsBase,
  validateExportHtml,
} from "../export-html"
import { describeExportError, describeExportNotice, downloadHtmlFile, exportButtonLabel, readExportResult, toEmailExportBody } from "../export-client"
import { handleEmailExport } from "../export-handler"
import { emailGeneratorExamples } from "../generator-examples"
import { toEmailRequestBody } from "../generator-form"
import { emailPromotionFixtures } from "../promotion-fixtures"
import { resolvePromotionDraft } from "../promotion-resolver"
import { emailRecipeDraftFixtures } from "../recipe-draft-fixtures"
import { renderEmail } from "../renderer"
import type { EmailConfig } from "../types"

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const base = "https://assets.example.test"
const prefixed = "https://cdn.example.test/studi-assets"
const farFuture = "2099-12-31"

const recipeFixture = (id: string) => emailRecipeDraftFixtures.find((entry) => entry.id === id)!
const configs: Record<string, () => EmailConfig> = {}
for (const id of ["D-R1-A", "D-R1-B", "D-R2-A", "D-R2-B", "D-R3-A", "D-R3-B"]) {
  configs[id] = () => {
    // Résolution par le resolver de la recette (via les fixtures de Draft) : un EmailConfig validé.
    const result = resolveRecipe(id)
    return result
  }
}
import { resolveEmailRecipeDraftFixture } from "../recipe-draft-fixtures"
function resolveRecipe(id: string): EmailConfig {
  const { resolution } = resolveEmailRecipeDraftFixture(id as never)
  if (resolution.status !== "resolved") throw new Error(`${id} : ${resolution.status}`)
  return resolution.config
}
for (const id of ["R4-A", "R4-B", "R4-C"]) {
  configs[id] = () => {
    const fixture = emailPromotionFixtures.find((entry) => entry.id === id)!
    const resolution = resolvePromotionDraft(fixture.request as never, fixture.draft)
    if (resolution.status !== "resolved") throw new Error(`${id} : ${resolution.status}`)
    return resolution.config
  }
}
const allIds = Object.keys(configs)

const exported = (id: string, assetsBase = base) => buildExportableEmailHtml(renderEmail(configs[id]!()), assetsBase)
const visibleText = (html: string) => {
  const parts: string[] = []
  const walk = (node: { nodeName: string; value?: string; childNodes?: unknown[] }) => {
    if (node.nodeName === "#text") parts.push(node.value ?? "")
    if (node.nodeName === "style" || node.nodeName === "title" || node.nodeName === "#comment") return
    for (const child of node.childNodes ?? []) walk(child as never)
  }
  walk(parse(html) as never)
  return parts.join("").replace(/\s+/g, " ").trim()
}
const attributes = (html: string, tag: string, name: string) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`, "g"))].map((match) => match[1]!)

/* -------------------------------------------------------------------------- */
/* Base des assets                                                            */
/* -------------------------------------------------------------------------- */

describe("export — base publique des assets (configuration serveur)", () => {
  test("variable explicite, aucune valeur par défaut : sans configuration, l'export refuse", () => {
    assert.equal(exportAssetsEnvVar, "EMAIL_ASSETS_BASE_URL")
    for (const env of [{}, { EMAIL_ASSETS_BASE_URL: "" }, { EMAIL_ASSETS_BASE_URL: "   " }]) {
      const result = resolveExportAssetsBase(env)
      assert.equal(result.ok, false)
      assert.equal(!result.ok && result.reason, "missing")
    }
  })

  test("HTTPS, origine normalisée, préfixe de chemin admis, barre finale retirée", () => {
    assert.deepEqual(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "https://assets.example.test" }), { ok: true, base: "https://assets.example.test", local: false })
    assert.deepEqual(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "https://assets.example.test/" }), { ok: true, base: "https://assets.example.test", local: false })
    assert.deepEqual(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: " https://cdn.example.test/studi-assets// " }), { ok: true, base: "https://cdn.example.test/studi-assets", local: false })
  })

  test("refus : URL invalide, identifiants, requête, fragment, http hors local, protocole autre", () => {
    for (const bad of ["pas une url", "ftp://assets.example.test", "javascript:alert(1)", "data:text/html,x", "https://user:pass@assets.example.test", "https://assets.example.test/?a=1", "https://assets.example.test/#x"]) {
      assert.equal(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: bad }).ok, false, bad)
    }
    const insecure = resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "http://assets.example.test" })
    assert.equal(!insecure.ok && insecure.reason, "insecure")
  })

  test("mode POC : une origine locale n'est admise que hors production, et elle est signalée", () => {
    assert.deepEqual(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "http://localhost:3000", NODE_ENV: "development" }), { ok: true, base: "http://localhost:3000", local: true })
    assert.deepEqual(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "http://127.0.0.1:3000" }), { ok: true, base: "http://127.0.0.1:3000", local: true })
    const production = resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "http://localhost:3000", NODE_ENV: "production" })
    assert.equal(!production.ok && production.reason, "local-in-production")
    assert.equal(resolveExportAssetsBase({ EMAIL_ASSETS_BASE_URL: "https://localhost", NODE_ENV: "production" }).ok, false)
  })

  test("aucune origine n'est écrite en dur : ni localhost, ni préversion, ni domaine de déploiement dans le module", () => {
    const source = code("lib/email/export-html.ts")
    assert.ok(!/localhost:\d|vercel\.app|\.vercel\.|https:\/\/assets\.|NEXT_PUBLIC/.test(source.replace(/new Set\(\["localhost"[^)]*\)/, "")))
    assert.ok(!/process\.env/.test(source), "le module est pur : l'environnement lui est passé")
  })
})

/* -------------------------------------------------------------------------- */
/* Nom de fichier                                                             */
/* -------------------------------------------------------------------------- */

describe("export — nom de fichier", () => {
  test("slug contrôlé, préfixe studi, .html, accents retirés", () => {
    assert.equal(exportFilename("Offre rentrée alternance"), "studi-offre-rentree-alternance.html")
    assert.equal(exportFilename("Newsletter, apprendre à côté du quotidien"), "studi-newsletter-apprendre-a-cote-du-quotidien.html")
    assert.equal(exportFilename("Studi, des repères pour choisir"), "studi-des-reperes-pour-choisir.html")
  })

  test("repli si la campagne est vide ou sans caractère sûr ; jamais de séparateur de chemin ni de point", () => {
    for (const empty of ["", "   ", "!!!", "///", "...", undefined]) assert.equal(exportFilename(empty), "studi-email.html", String(empty))
    for (const hostile of ["../../etc/passwd", "..\\windows\\system32", "a/b\\c", "nom.exe", "<script>x</script>", "x\u0000y", "A".repeat(500)]) {
      const name = exportFilename(hostile)
      assert.match(name, /^[a-z0-9-]+\.html$/, hostile)
      assert.ok(name.length <= 75, hostile)
      assert.ok(!name.includes("..") && !name.includes("/") && !name.includes("\\"))
    }
    assert.equal(exportFilename("A".repeat(500)).endsWith("-.html"), false)
  })
})

/* -------------------------------------------------------------------------- */
/* Transformation                                                             */
/* -------------------------------------------------------------------------- */

describe("export — document HTML complet, assets et liens absolus", () => {
  for (const id of allIds) {
    test(`${id} : document complet, sans erreur de validation, déterministe, EmailConfig non mutée`, () => {
      const config = configs[id]!()
      const before = structuredClone(config)
      const canonical = renderEmail(config)
      const first = buildExportableEmailHtml(canonical, base)
      assert.deepEqual(config, before, "l'EmailConfig n'est jamais mutée")
      assert.deepEqual(validateExportHtml(first.html, { assetsBase: base, local: false }), [])
      assert.equal(buildExportableEmailHtml(canonical, base).html, first.html, "déterministe")
      assert.match(first.html, /^<!DOCTYPE html>/i)
      for (const tag of ["<html", "<head", "<body", "</html>"]) assert.ok(first.html.includes(tag), tag)
    })

    test(`${id} : chaque image est absolue sous la base, existe dans public/, avec alt et dimensions`, () => {
      const html = exported(id).html
      const srcs = attributes(html, "img", "src")
      assert.ok(srcs.length >= 2)
      for (const src of srcs) {
        assert.ok(src.startsWith(`${base}/`), src)
        const path = src.slice(base.length)
        assert.ok(existsSync(join(root, "public", path)), `asset accessible : ${path}`)
        assert.ok(/^\/(?:logos|icones|images)\//.test(path), path)
      }
      assert.ok(srcs.includes(`${base}${exportLogoPath}`), "le logo haute définition")
      assert.equal((html.match(/<img\b/g) ?? []).length, srcs.length)
      for (const tag of html.match(/<img\b[^>]*>/g) ?? []) assert.ok(/\salt="/.test(tag) && /\swidth="/.test(tag) && /\sheight="/.test(tag), tag.slice(0, 80))
    })

    test(`${id} : liens absolus sur les destinations contrôlées, sans suivi inventé ; jetons d'abonnement explicites`, () => {
      const config = configs[id]!()
      const html = exported(id).html
      const hrefs = attributes(html, "a", "href")
      const allowed = new Set<string>([...Object.keys(emailDestinations).map((destination) => emailDestinationUrl(destination as never).replace(/\?.*$/, "")), ...exportDeferredPlaceholders])
      for (const href of hrefs) {
        assert.ok(allowed.has(href), href)
        if (!href.startsWith("[")) assert.ok((exportLinkHosts as readonly string[]).includes(new URL(href).hostname), href)
      }
      assert.ok(!html.includes("UTM") && !html.includes("?["), "aucun suivi inventé")
      for (const token of exportDeferredPlaceholders) assert.ok(hrefs.includes(token), token)
      // Chaque lien de l'email figure dans l'export, à son URL propre.
      const fromConfig = JSON.stringify(config).match(/https:\/\/www\.studi\.com\/[^"?]*/g) ?? []
      for (const url of new Set(fromConfig)) assert.ok(hrefs.includes(url), url)
    })

    test(`${id} : même texte visible que l'email canonique ; réseaux sociaux retirés sans rangée vide ; responsive conservé`, () => {
      const canonical = renderEmail(configs[id]!())
      const html = exported(id).html
      assert.equal(visibleText(html), visibleText(canonical))
      assert.ok(!/SOCIAL|social-/.test(html))
      assert.equal(attributes(html, "img", "src").filter((src) => /social/i.test(src)).length, 0)
      assert.equal((html.match(/class="lame" width="600"/g) ?? []).length, (canonical.match(/class="lame" width="600"/g) ?? []).length)
      assert.ok(html.includes("@media only screen and (max-width:599px)") && html.includes('name="viewport"'))
      assert.ok(html.includes(`<title>${configs[id]!().subject.replace(/&/g, "&amp;")}</title>`) || /<title>[^<]+<\/title>/.test(html))
    })

    test(`${id} : aucune marque du builder, aucun Draft, aucune donnée de fournisseur, aucun script, aucun commentaire de gabarit`, () => {
      const html = exported(id).html
      for (const forbidden of [/<script/i, /javascript:/i, /<iframe/i, /anthropic|claude/i, /\bdraft\b/i, /visualIntent|promoCode|offerValue/, /data-(?:slot|system|preview)/, /__next|studi generator|email generator/i, /api\/(?:generate|edit|export)/, /demo-assets\.invalid/, /localhost|127\.0\.0\.1/, /coller ici|PREHEADER :|FIN DES LAMES/]) {
        assert.ok(!forbidden.test(html), String(forbidden))
      }
      assert.deepEqual(
        [...html.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]!.trim().slice(0, 7)),
        ["[if mso"],
        "seul le commentaire conditionnel Outlook est conservé"
      )
    })
  }

  test("un préfixe de chemin (CDN) est conservé pour toutes les images ; le mode local est admis par la validation", () => {
    const html = exported("D-R2-B", prefixed).html
    for (const src of attributes(html, "img", "src")) assert.ok(src.startsWith(`${prefixed}/`), src)
    assert.deepEqual(validateExportHtml(html, { assetsBase: prefixed, local: false }), [])
    const local = exported("R4-B", "http://localhost:3000").html
    assert.deepEqual(validateExportHtml(local, { assetsBase: "http://localhost:3000", local: true }), [])
    assert.ok(validateExportHtml(local, { assetsBase: "http://localhost:3000", local: false }).some((issue) => issue.code === "localhost"), "hors mode local, localhost est interdit")
  })

  test("jetons laissés à la plateforme d'envoi : exactement le désabonnement et les préférences", () => {
    for (const id of allIds) assert.deepEqual(exported(id).placeholders, ["[URL_DESABONNEMENT]", "[URL_PREFERENCES]"], id)
    assert.deepEqual([...exportDeferredPlaceholders], ["[URL_DESABONNEMENT]", "[URL_PREFERENCES]"])
  })
})

/* -------------------------------------------------------------------------- */
/* Intégrité du contenu                                                       */
/* -------------------------------------------------------------------------- */

describe("export — aucune mutation du contenu", () => {
  test("R4 Promo : -20 %*, DEMO20, dates, périmètre, légal, boutons, lien secondaire et image, à l'identique", () => {
    const html = exported("R4-B").html
    const text = visibleText(html)
    assert.ok(text.includes("-20 %*") || text.includes("-20 %*"))
    assert.equal((text.match(/DEMO20/g) ?? []).length, 1)
    assert.ok(text.includes("Offre valable jusqu'au 15 novembre 2026") && text.includes("jusqu'au 15/11/2026"))
    assert.ok(text.includes("Offre valable sur les formations en alternance."))
    assert.ok(text.includes("*Offre soumise à conditions d'éligibilité, pour toute inscription à une formation diplômante. Offre non cumulable avec toute autre offre en cours, réservée aux particuliers et valable jusqu'au 15/11/2026."))
    assert.deepEqual(attributes(html, "a", "href").filter((href) => href.includes("cfa-studi")).length >= 3, true, "deux boutons et le footer alternance")
    assert.ok(attributes(html, "a", "href").includes("https://www.studi.com/fr/parcours-decouverte"))
    assert.ok(attributes(html, "img", "src").some((src) => /\/images\/email\/v2\/[a-z-]+--offer\.jpg$/.test(src)))
    // Les trois promotions : valeur et code exacts.
    assert.ok(visibleText(exported("R4-A").html).includes("-500 €*") && !visibleText(exported("R4-A").html).includes("Code"))
    assert.ok(visibleText(exported("R4-C").html).includes("-300 €*") && visibleText(exported("R4-C").html).includes("DEMO-CERTIF"))
  })

  test("R3 Brand Proof : chiffres et libellés exacts, identiques à l'email canonique, légal et pied de page conservés", () => {
    const canonical = visibleText(renderEmail(configs["D-R3-B"]!()))
    const text = visibleText(exported("D-R3-B").html)
    assert.equal(text, canonical)
    assert.ok(/59[\s ]000/.test(text) && text.includes("apprenants en cours de formation"))
    assert.ok(text.includes("01 85 53 75 52") && text.includes("Se désabonner") && text.includes("Gérer mes préférences"))
    const three = visibleText(exported("D-R3-A").html)
    assert.equal(three, visibleText(renderEmail(configs["D-R3-A"]!())))
  })

  test("R2 : bandeau et frise de portraits, toutes les images (cinq portraits de la frise) existent et sont absolues", () => {
    const banner = attributes(exported("D-R2-A").html, "img", "src").filter((src) => src.includes("/images/email/v2/"))
    assert.ok(banner.length >= 2)
    const strip = attributes(exported("D-R2-B").html, "img", "src").filter((src) => /--strip-[1-5]\.jpg$/.test(src))
    assert.equal(strip.length, 5)
    for (const src of [...banner, ...strip]) assert.ok(existsSync(join(root, "public", src.slice(base.length))), src)
  })

  test("R1 : image du hero, icônes des appuis et liens des deux boutons", () => {
    const html = exported("D-R1-A").html
    assert.ok(attributes(html, "img", "src").filter((src) => src.includes("/icones/")).length >= 3)
    assert.ok(attributes(html, "img", "src").some((src) => src.includes("/images/email/v2/")))
    assert.ok(attributes(html, "a", "href").includes("https://www.studi.com/fr/metiers"))
  })
})

/* -------------------------------------------------------------------------- */
/* Sécurité : URL, HTML, jetons                                               */
/* -------------------------------------------------------------------------- */

describe("export — sécurité", () => {
  const canonical = () => renderEmail(configs["R4-B"]!())

  test("une image hors des assets contrôlés ou une icône inconnue fait échouer la transformation", () => {
    for (const evil of ["https://evil.example/pixel.png", "/images/secret.png", "data:image/png;base64,AAAA", "http://169.254.169.254/latest", "javascript:alert(1)"]) {
      const html = canonical().replace("[URL_CDN_ICONE:magnifying-glass]", evil)
      assert.throws(() => buildExportableEmailHtml(html, base), (error: unknown) => error instanceof EmailExportError && error.code === "unknown-asset", evil)
    }
    assert.throws(() => buildExportableEmailHtml(canonical().replace("[URL_CDN_ICONE:magnifying-glass]", "[URL_CDN_ICONE:../../etc/passwd]"), base), (error: unknown) => error instanceof EmailExportError && error.code === "unknown-icon")
  })

  test("un lien « à confirmer » fait échouer la transformation ; un lien hors studi.com échoue à la validation", () => {
    const toConfirm = canonical().replace("https://www.studi.com/fr/cfa-studi?[UTM À DÉFINIR — CRM]", "[URL À CONFIRMER]")
    assert.throws(() => buildExportableEmailHtml(toConfirm, base), (error: unknown) => error instanceof EmailExportError && error.code === "url-to-confirm")
    for (const evil of ["https://evil.example/", "http://www.studi.com/fr/formations", "https://www.studi.com.evil.example/", "https://user:x@www.studi.com/", "javascript:alert(1)", "/fr/formations", "mailto:a@b.fr"]) {
      const html = buildExportableEmailHtml(canonical(), base).html.replace("https://www.studi.com/fr/formations", evil)
      assert.ok(validateExportHtml(html, { assetsBase: base, local: false }).some((issue) => issue.code === "link"), evil)
    }
  })

  test("la validation détecte script, javascript:, gestionnaire, iframe, jeton non résolu, démo, localhost, image relative, marque du builder, Draft", () => {
    const good = buildExportableEmailHtml(canonical(), base).html
    const codes = (html: string) => validateExportHtml(html, { assetsBase: base, local: false }).map((issue) => issue.code)
    assert.deepEqual(codes(good), [])
    assert.ok(codes(good.replace("</body>", "<script>alert(1)</script></body>")).includes("script"))
    assert.ok(codes(good.replace("</body>", '<a href="javascript:alert(1)">x</a></body>')).includes("javascript"))
    assert.ok(codes(good.replace("<body ", '<body onload="x()" ')).includes("handler"))
    assert.ok(codes(good.replace("</body>", '<iframe src="https://assets.example.test/x"></iframe></body>')).includes("embed"))
    assert.ok(codes(good.replace("</body>", "[URL_CDN_LOGO_STUDI_SOMBRE]</body>")).includes("token"))
    assert.ok(codes(good.replace(`${base}/images`, "https://demo-assets.invalid/images")).includes("asset"))
    assert.ok(codes(good.replace(base, "https://other.example.test")).includes("asset"))
    assert.ok(codes(good.replace(`${base}/logos`, "/logos")).includes("asset"))
    assert.ok(codes(good.replace("</body>", "<p>localhost</p></body>")).includes("localhost"))
    assert.ok(codes(good.replace("</body>", '<p data-slot="x">x</p></body>')).includes("builder"))
    assert.ok(codes(good.replace("</body>", "<!-- visualIntent -->visualIntent</body>")).includes("builder"))
    assert.ok(codes(good.replace("</body>", "<p>claude</p></body>")).includes("builder"))
    assert.ok(codes(good.replace("<!DOCTYPE html>", "")).includes("doctype"))
    assert.ok(codes(good.replace(/<title>[^<]*<\/title>/, "<title></title>")).includes("title"))
    assert.ok(codes(good.replace(/@media only screen and \(max-width:599px\)/, "@media print")).includes("responsive"))
    assert.ok(codes(good.replace(/ alt="[^"]*"/, "")).includes("alt"))
    assert.ok(codes(good.replace("<head>", '<head><link rel="stylesheet" href="https://www.studi.com/x.css">')).includes("external"))
  })

  test("le HTML fourni par l'appelant n'est jamais repris tel quel : la transformation ne lit que les attributs src et href, dans les catalogues", () => {
    const withInjection = canonical().replace("</body>", '<img src="https://evil.example/x.png"></body>')
    assert.throws(() => buildExportableEmailHtml(withInjection, base))
    assert.ok(!code("lib/email/export-handler.ts").includes("html:") || /body\.html|parsed\.data\.html/.test(code("lib/email/export-handler.ts")) === false)
  })
})

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

describe("route /api/export-email", () => {
  const env = { EMAIL_ASSETS_BASE_URL: base, NODE_ENV: "production" } as const
  const form = (id: string) => {
    const example = emailGeneratorExamples.find((entry) => entry.id === id)!.form
    return id === "promotion" ? { ...example, promotion: { ...example.promotion, endDate: farFuture } } : example
  }
  const promoDraft = (): Json => {
    const draft = structuredClone(emailPromotionFixtures.find((entry) => entry.id === "R4-B")!.draft) as Json
    draft.subject = "-20 % sur les formations"
    draft.offer.text = "Vous développez vos compétences à côté du travail ? Cette offre vous aide à vous lancer."
    draft.preheader = "Une offre de rentrée à découvrir dans le catalogue des formations concernées."
    draft.closing = { title: "À vous de choisir", text: "Le catalogue détaille chaque formation. Comparez-les, puis retenez celle qui vous convient.", ctaLabel: "Parcourir le catalogue" }
    draft.support = { title: "Avant de vous décider", items: [{ icon: "magnifying-glass", title: "Repérez", text: "Parcourez le catalogue et notez ce qui vous intéresse." }, { icon: "handshake-simple", title: "Pensez à votre quotidien", text: "Repérez ce qui s'accorde avec votre activité." }, { icon: "stopwatch", title: "Comparez", text: "Lisez le détail de chaque formation avant de choisir." }] }
    return draft
  }
  const post = (payload: unknown) => new Request("http://localhost/api/export-email", { method: "POST", body: JSON.stringify(payload) })
  async function exportOf(payload: unknown, options: Parameters<typeof handleEmailExport>[1] = { env, log: () => {} }) {
    const response = await handleEmailExport(post(payload), options)
    return { response, json: (await response.json()) as Json }
  }
  const body = (draft: Json, id = "promotion") => ({ generation: toEmailRequestBody(form(id)), draft })

  test("succès : un fichier complet, nom propre, jetons à la plateforme d'envoi, aucun contenu interne", async () => {
    const { response, json } = await exportOf(body(promoDraft()))
    assert.equal(response.status, 200, JSON.stringify(json))
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.deepEqual(Object.keys(json).sort(), ["filename", "html", "placeholders", "status", "warnings"])
    assert.equal(json.filename, "studi-offre-de-rentree.html")
    assert.deepEqual(json.placeholders, ["[URL_DESABONNEMENT]", "[URL_PREFERENCES]"])
    assert.deepEqual(json.warnings, [])
    assert.deepEqual(validateExportHtml(json.html, { assetsBase: base, local: false }), [])
    assert.ok(json.html.includes("DEMO20") && json.html.includes("31 décembre 2099") && json.html.includes("31/12/2099"))
    for (const leak of ["recipe", "provenance", "inputTokens", "msg_", "output_config", "diagnostics"]) assert.ok(!json.html.includes(leak), leak)
  })

  test("origine locale (mode POC) : le fichier est produit, avec l'avertissement ; en production, refus", async () => {
    const local = await exportOf(body(promoDraft()), { env: { EMAIL_ASSETS_BASE_URL: "http://localhost:3000", NODE_ENV: "development" }, log: () => {} })
    assert.equal(local.response.status, 200)
    assert.deepEqual(local.json.warnings, ["assets-local"])
    assert.ok(local.json.html.includes("http://localhost:3000/logos/logo_studi_sombre_highres.png"))
    const production = await exportOf(body(promoDraft()), { env: { EMAIL_ASSETS_BASE_URL: "http://localhost:3000", NODE_ENV: "production" }, log: () => {} })
    assert.equal(production.response.status, 503)
    assert.equal(production.json.code, "configuration")
  })

  test("sans configuration des assets : 503 propre, aucun fichier, aucun détail interne", async () => {
    for (const bad of [{}, { EMAIL_ASSETS_BASE_URL: "n'importe quoi" }, { EMAIL_ASSETS_BASE_URL: "http://assets.example.test" }]) {
      const { response, json } = await exportOf(body(promoDraft()), { env: bad, log: () => {} })
      assert.equal(response.status, 503)
      assert.equal(json.code, "configuration")
      assert.equal(json.status, "error")
      assert.ok(!("html" in json) && !JSON.stringify(json).includes("EMAIL_ASSETS_BASE_URL"))
    }
  })

  test("le client ne peut pas imposer du HTML, une base d'assets, une URL, un nom de fichier : tout champ en trop est refusé", async () => {
    for (const extra of [{ html: "<script>alert(1)</script>" }, { previewHtml: "<p>x</p>" }, { assetsBase: "https://evil.example" }, { baseUrl: "https://evil.example" }, { filename: "../../x.html" }, { links: ["https://evil.example"] }]) {
      const { response, json } = await exportOf({ ...body(promoDraft()), ...extra })
      assert.equal(response.status, 400, JSON.stringify(extra))
      assert.equal(json.code, "invalid-request")
    }
    for (const bad of [{ draft: promoDraft() }, { generation: toEmailRequestBody(form("promotion")) }, body(promoDraft(), "promotion") && { ...body(promoDraft()), draft: "texte" }, { ...body(promoDraft()), draft: [] }]) {
      assert.equal((await exportOf(bad)).response.status, 400)
    }
    const provider = await handleEmailExport(new Request("http://localhost/api/export-email", { method: "POST", body: "pas du json" }), { env, log: () => {} })
    assert.equal(provider.status, 400)
    assert.equal((await handleEmailExport(new Request("http://localhost/api/export-email", { method: "POST", body: "x".repeat(100_001) }), { env, log: () => {} })).status, 400)
  })

  test("un Draft falsifié est refusé comme à la génération : valeur, code, URL, champ en trop ; une promotion expirée aussi", async () => {
    const cases: [string, (draft: Json) => void][] = [
      ["valeur libre dans la copie", (draft) => (draft.offer.text = "Une remise de 30 % pour vous.")],
      ["code dans le texte", (draft) => (draft.closing.text = "Utilise DEMO20 pour en profiter.")],
      ["champ en trop (code)", (draft) => (draft.promoCode = "FAUX99")],
      ["URL dans le texte", (draft) => (draft.closing.text = "Voir https://evil.example")],
      ["HTML dans le texte", (draft) => (draft.offer.text = "<script>alert(1)</script>")],
    ]
    for (const [label, change] of cases) {
      const draft = promoDraft()
      change(draft)
      const { response, json } = await exportOf(body(draft))
      assert.equal(response.status, 422, label)
      assert.equal(json.code, "unresolvable", label)
      assert.ok(!("html" in json), label)
    }
    const expired = { generation: { ...toEmailRequestBody(form("promotion")), promotion: { ...toEmailRequestBody(form("promotion")).promotion, endDate: "2020-01-01" } }, draft: promoDraft() }
    assert.equal((await exportOf(expired)).response.status, 400)
  })

  test("les valeurs de l'offre viennent de la demande, pas du client : le Draft n'en porte aucune, l'export les recompose", async () => {
    const draft = promoDraft()
    assert.ok(!/DEMO20|2099|promoCode|endDate/.test(JSON.stringify(draft)))
    const { json } = await exportOf(body(draft))
    assert.ok(json.html.includes("-20&nbsp;%*") || json.html.includes("-20 %*") || json.html.includes("-20 %*"))
    // Une autre valeur d'offre dans la demande donne un autre email : la demande fait foi.
    draft.subject = "Une offre pour vous"
    draft.preheader = "Une offre de rentrée à découvrir dans le catalogue."
    const other = body(draft)
    other.generation = { ...other.generation, promotion: { ...other.generation.promotion, offer: { type: "percent", percent: 25 } } } as never
    const changed = (await exportOf(other)).json.html as string
    assert.ok(changed.includes("-25") && !changed.includes("-20"))
  })

  test("export des quatre familles depuis les exemples de l'interface et les Drafts de fixtures", async () => {
    const cases: [string, string][] = [["orientation", "D-R1-A"], ["newsletter", "D-R2-A"], ["newsletter", "D-R2-B"], ["preuves", "D-R3-B"], ["preuves", "D-R3-A"]]
    for (const [example, draftId] of cases) {
      const { response, json } = await exportOf({ generation: toEmailRequestBody(form(example)), draft: recipeFixture(draftId).draft })
      assert.equal(response.status, 200, `${draftId} : ${JSON.stringify(json)}`)
      assert.deepEqual(validateExportHtml(json.html, { assetsBase: base, local: false }), [], draftId)
    }
  })

  test("aucun appel de modèle : ni module Anthropic, ni messages.create, ni clé dans l'export", () => {
    for (const name of ["export-html.ts", "export-handler.ts", "export-client.ts"]) {
      const source = code(`lib/email/${name}`)
      assert.ok(!/@anthropic-ai|messages\.create|ANTHROPIC|anthropic-v2|createClient|edit-prompt|edit-patch/.test(source), name)
    }
    assert.ok(!/ANTHROPIC|anthropic/i.test(code("app/api/export-email/route.ts")))
  })
})

/* -------------------------------------------------------------------------- */
/* Version affichée : V1, V2, annuler, rétablir                               */
/* -------------------------------------------------------------------------- */

describe("export — toujours la version affichée", () => {
  const form = () => {
    const example = emailGeneratorExamples.find((entry) => entry.id === "promotion")!.form
    return { ...example, promotion: { ...example.promotion, endDate: farFuture } }
  }
  const draftV1 = (): Json => {
    const draft = structuredClone(emailPromotionFixtures.find((entry) => entry.id === "R4-B")!.draft) as Json
    draft.subject = "-20 % sur les formations"
    draft.preheader = "Une offre de rentrée à découvrir dans le catalogue des formations concernées."
    draft.offer = { eyebrow: "Offre rentrée", text: "Vous développez vos compétences à côté du travail ? Cette offre vous aide à vous lancer.", ctaLabel: "Voir les formations" }
    draft.closing = { title: "À vous de choisir", text: "Le catalogue détaille chaque formation. Comparez-les, puis retenez celle qui vous convient.", ctaLabel: "Parcourir le catalogue" }
    draft.support = { title: "Avant de vous décider", items: [{ icon: "magnifying-glass", title: "Repérez", text: "Parcourez le catalogue et notez ce qui vous intéresse." }, { icon: "handshake-simple", title: "Pensez à votre quotidien", text: "Repérez ce qui s'accorde avec votre activité." }, { icon: "stopwatch", title: "Comparez", text: "Lisez le détail de chaque formation avant de choisir." }] }
    return draft
  }
  const email = (draft: unknown) => ({ status: "success" as const, subject: "S", preheader: "P", blockCount: 6, html: "<p/>", previewHtml: "<p/>", draft })
  const run = (state: EmailEditorState, ...actions: EmailEditorAction[]) => actions.reduce(emailEditorReducer, state)
  const env = { EMAIL_ASSETS_BASE_URL: base, NODE_ENV: "production" } as const
  /** Ce que fait le bouton : le corps d'export de la version affichée, envoyé à la vraie route. */
  async function exportDisplayed(state: EmailEditorState) {
    const response = await handleEmailExport(new Request("http://localhost/api/export-email", { method: "POST", body: JSON.stringify(toEmailExportBody(state)) }), { env, log: () => {} })
    assert.equal(response.status, 200)
    return ((await response.json()) as Json).html as string
  }

  test("V1 → modification → V2 → export = V2 ; annuler → export = V1 (identique octet pour octet) ; rétablir → export = V2", async () => {
    const v1 = draftV1()
    const v2 = setDraftTexts(v1, [{ path: "offer.text", text: "Cap sur la rentrée : vous développez vos compétences, et cette offre vous donne un coup d'élan." }, { path: "closing.text", text: "Comparez, puis choisissez." }]) as Json
    let state = run(initialEmailEditorState, { type: "generated", email: email(v1), generation: toEmailRequestBody(form()) })
    const exportV1 = await exportDisplayed(state)
    state = run(state, { type: "edit-start" }, { type: "edit-success", email: email(v2), instruction: "Rends l'accroche plus dynamique.", summary: "Accroche" })
    const exportV2 = await exportDisplayed(state)
    assert.notEqual(exportV1, exportV2)
    assert.ok(visibleTextOf(exportV2).includes("Cap sur la rentrée") && !visibleTextOf(exportV2).includes("Le catalogue détaille chaque formation"))
    assert.ok(visibleTextOf(exportV1).includes("Cette offre vous aide à vous lancer") && !visibleTextOf(exportV1).includes("Cap sur la rentrée"))
    state = run(state, { type: "undo" })
    assert.equal(currentVersion(state)!.number, 1)
    assert.equal(await exportDisplayed(state), exportV1, "annuler : le fichier est V1")
    state = run(state, { type: "redo" })
    assert.equal(await exportDisplayed(state), exportV2, "rétablir : le fichier est V2")
    // Les valeurs protégées sont identiques d'une version à l'autre.
    for (const html of [exportV1, exportV2]) assert.ok(html.includes("DEMO20") && html.includes("31/12/2099") && html.includes("-20"))
    assert.equal(attributes(exportV1, "a", "href").join("|"), attributes(exportV2, "a", "href").join("|"))
    assert.equal(attributes(exportV1, "img", "src").join("|"), attributes(exportV2, "img", "src").join("|"))
    assert.equal(fetchGuard.mock.callCount(), 0, "aucun appel : l'export ne passe pas par un modèle")
  })

  test("après une erreur d'édition, l'export reste la dernière version valide ; une nouvelle génération repart de V1", async () => {
    const v1 = draftV1()
    let state = run(initialEmailEditorState, { type: "generated", email: email(v1), generation: toEmailRequestBody(form()) })
    const before = await exportDisplayed(state)
    state = run(state, { type: "edit-start" }, { type: "edit-failure", error: { code: "provider-error", issues: [] } })
    assert.equal(await exportDisplayed(state), before)
    assert.deepEqual(toEmailExportBody(state), { generation: toEmailRequestBody(form()), draft: v1 })
    const again = run(state, { type: "generated", email: email(setDraftTexts(v1, [{ path: "closing.text", text: "Comparez, puis choisissez." }])), generation: toEmailRequestBody(form()) })
    assert.notEqual(await exportDisplayed(again), before)
  })

  test("le corps d'export ne contient ni HTML, ni URL, ni prévisualisation : la génération d'origine et le Draft seulement", () => {
    const state = run(initialEmailEditorState, { type: "generated", email: email(draftV1()), generation: toEmailRequestBody(form()) })
    const exportBody = toEmailExportBody(state)
    assert.deepEqual(Object.keys(exportBody), ["generation", "draft"])
    assert.ok(!/<\w+|previewHtml|https?:\/\//.test(JSON.stringify(exportBody)))
  })
})

const visibleTextOf = (html: string) => {
  const parts: string[] = []
  const walk = (node: { nodeName: string; value?: string; childNodes?: unknown[] }) => {
    if (node.nodeName === "#text") parts.push(node.value ?? "")
    if (node.nodeName === "style" || node.nodeName === "title" || node.nodeName === "#comment") return
    for (const child of node.childNodes ?? []) walk(child as never)
  }
  walk(parse(html) as never)
  return parts.join("").replace(/\s+/g, " ").trim()
}

/* -------------------------------------------------------------------------- */
/* Téléchargement et interface                                                */
/* -------------------------------------------------------------------------- */

describe("export — téléchargement navigateur et câblage", () => {
  test("downloadHtmlFile : un Blob text/html, un lien `download` au nom du fichier, un clic, puis libération", async () => {
    const created: { blob?: Blob; revoked: string[]; clicks: number; appended: unknown[] } = { revoked: [], clicks: 0, appended: [] }
    const anchor: Record<string, unknown> & { click(): void; remove(): void } = { style: {}, click: () => void (created.clicks += 1), remove: () => void created.appended.pop() }
    downloadHtmlFile("studi-offre.html", "<!DOCTYPE html><p>x</p>", {
      document: { createElement: () => anchor as never, body: { appendChild: (node: unknown) => (created.appended.push(node), node) } as never },
      createObjectURL: (blob) => ((created.blob = blob), "blob:test-1"),
      revokeObjectURL: (url) => void created.revoked.push(url),
    })
    assert.equal(created.clicks, 1)
    assert.equal(anchor.download, "studi-offre.html")
    assert.equal(anchor.href, "blob:test-1")
    assert.equal(created.blob!.type, "text/html;charset=utf-8")
    assert.equal(await created.blob!.text(), "<!DOCTYPE html><p>x</p>")
    assert.ok(!("target" in anchor), "ni nouvelle fenêtre ni onglet")
    await new Promise((resolve) => setTimeout(resolve, 1100))
    assert.deepEqual(created.revoked, ["blob:test-1"])
  })

  test("lecture de la réponse, messages : succès, erreur publique, réponse illisible ; jamais un détail interne", () => {
    const success = readExportResult({ status: "success", filename: "studi-x.html", html: "<html></html>", placeholders: ["[URL_DESABONNEMENT]"], warnings: ["assets-local"] })
    assert.ok("html" in success)
    if (!("html" in success)) return
    const notice = describeExportNotice(success)
    assert.equal(notice[0], "HTML téléchargé : studi-x.html.")
    assert.ok(notice.some((line) => /désabonnement.*plateforme d'envoi.*pas prêt à l'envoi/.test(line)))
    assert.ok(notice.some((line) => /origine locale/.test(line)))
    assert.deepEqual(describeExportNotice({ ...success, placeholders: [], warnings: [] }), ["HTML téléchargé : studi-x.html."])
    assert.deepEqual(readExportResult(null), { code: "network", issues: [] })
    assert.deepEqual(readExportResult({ status: "success", filename: 1 }), { code: "network", issues: [] })
    assert.deepEqual(readExportResult({ status: "error", code: "configuration", issues: [] }), { code: "configuration", issues: [] })
    for (const code of ["configuration", "unresolvable", "rendering", "export-invalid", "internal", "network"] as const) {
      const message = describeExportError({ code, issues: [{ path: "a.b", message: "détail interne" }] })
      assert.ok(message.length > 20 && !/détail interne|a\.b|EMAIL_ASSETS/.test(message), code)
    }
    assert.equal(exportButtonLabel, "Télécharger le HTML")
  })

  test("le bouton : visible seulement avec un email exportable, désactivé pendant une génération, une modification ou un export, sans effet de bord", () => {
    const workspace = code("components/email/email-workspace.tsx")
    const preview = code("components/email/email-preview.tsx")
    assert.match(workspace, /exportAction=\{shown\?\.email\.draft \?/)
    assert.match(workspace, /disabled: pending \|\| editing \|\| exportResult\?\.exporting === true/)
    assert.match(workspace, /generating=\{pending \|\| exportResult\?\.exporting === true\}/, "pas d'édition pendant un export")
    assert.match(workspace, /postEmailExport\(toEmailExportBody\(editor\)\)/, "l'export suit la version affichée")
    assert.match(workspace, /downloadHtmlFile\(result\.filename, result\.html\)/)
    assert.match(workspace, /exportResult\.version === shown\.number/, "le résultat n'est montré que pour la version qui l'a produit")
    assert.match(workspace, /setExportResult\(null\)/, "une nouvelle génération efface l'ancien résultat")
    assert.equal((workspace.match(/fetch\(/g) ?? []).length, 1, "le composant garde un seul fetch, celui de la génération")
    assert.ok(!/useEffect|setTimeout|setInterval|localStorage/.test(workspace))
    assert.match(preview, /\{exportAction && \(/)
    assert.ok(!/window\.open|target="_blank"/.test(`${workspace}${preview}`), "ni nouvelle fenêtre ni nouvel onglet")
    assert.match(code("lib/email/export-client.ts"), /fetch\("\/api\/export-email"/)
    assert.ok(!/previewHtml|\.html\b.*JSON/.test(code("lib/email/export-client.ts").replace(/html: string/g, "")), "l'export n'envoie pas l'aperçu")
  })

  test("l'éditeur et la génération ne sont pas modifiés par l'export : seuls des exports additifs ont été ajoutés", () => {
    const engine = code("lib/email/edit-engine.ts")
    assert.match(engine, /export \{ prepare as prepareEmailRequest, resolveFamily as resolveEmailFamilyDraft \}/)
    for (const name of ["edit-fields.ts", "edit-guard.ts", "edit-patch.ts", "edit-prompt.ts", "edit-protect.ts", "editor-state.ts", "recipes.ts", "recipe-drafts.ts", "recipe-prompts.ts", "recipe-resolver.ts", "promotion-resolver.ts", "anthropic-v2.ts", "generate-handler.ts"]) {
      assert.ok(!/export-html|export-handler|export-client|buildExportableEmailHtml/.test(code(`lib/email/${name}`)), name)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Fichiers réellement écrits                                                 */
/* -------------------------------------------------------------------------- */

describe("export — fichiers écrits sur disque", () => {
  test("R2 et R4 : le fichier écrit est relu à l'identique, complet et autonome (aucune dépendance à l'application pour le balisage)", () => {
    const directory = join(tmpdir(), "studi-email-export-test")
    mkdirSync(directory, { recursive: true })
    for (const [id, name] of [["D-R2-B", "R2"], ["R4-B", "R4"]] as const) {
      const html = exported(id).html
      const path = join(directory, `${name}-${exportFilename(configs[id]!().name)}`)
      writeFileSync(path, html, "utf8")
      const back = readFileSync(path, "utf8")
      assert.equal(back, html)
      assert.ok(back.length > 10_000 && back.startsWith("<!DOCTYPE html>") && back.trimEnd().endsWith("</html>"))
      assert.deepEqual(validateExportHtml(back, { assetsBase: base, local: false }), [])
      // Le seul lien vers l'extérieur du fichier : les assets (base configurée) et les destinations studi.com.
      for (const url of back.match(/https?:\/\/[^"'\s)<>]+/g) ?? []) {
        assert.ok(url.startsWith(base) || new URL(url).hostname === "www.studi.com" || url.startsWith("http://schemas.microsoft.com") || url.startsWith("urn:") || /w3\.org|schemas\.microsoft/.test(url), url)
      }
    }
  })
})
