/**
 * Aperçu HTML pour le HCC (`POST /api/hcc/v1/render`) : signature HMAC à clé dérivée (HKDF), validation du document,
 * HTML sans repères ni scripts, médias absolus, liens inertes, aucun réseau. Vecteur partageable avec le HCC.
 */
import assert from "node:assert/strict"
import { createHash, createHmac, hkdfSync } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, describe, mock, test } from "node:test"

import { toPreviewHtml, transparentPixel } from "../../email/preview"
import { buildDemoDocument } from "../demo-document"
import { createBlankDocument, type EmailDocument } from "../document"
import { applyDocumentOperation, type DocumentOperation } from "../operations"
import { renderDocumentEmail } from "../render"
import { resetRateLimits } from "../../hcc/guard"
import { handleHccRender, isAllowedPreviewSource, RENDER_MAX_BODY_BYTES, unsafePreviewReasons } from "../../hcc/render-handler"
import { deriveRenderKey, RENDER_KEY_INFO, RENDER_KEY_LENGTH, RENDER_KEY_SALT, resetSeenNonces } from "../../hcc/verify"
import { generatedFixtures } from "./generated-fixtures"
import { fixtureContents } from "./generated-html-content"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "aucun appel réseau (ni HCC, ni Anthropic)")
  fetchGuard.mock.restore()
})
beforeEach(() => {
  resetSeenNonces()
  resetRateLimits()
})

const root = process.cwd()
const code = (path: string) => readFileSync(join(root, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

/** Clé FICTIVE du vecteur partagé : 32 octets 0x01…0x20 (jamais une clé réelle). */
const VECTOR_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1))
const BASE = "https://email-builder.example"
const env = {
  HCC_API_URL: "https://hcc.example",
  HCC_CLIENT_ID: "email-builder-poc",
  HCC_SIGNING_KEY_ID: "k1",
  HCC_SIGNING_KEY: VECTOR_KEY.toString("base64url"),
  BUILDER_SESSION_SECRET: Buffer.alloc(32, 9).toString("base64url"),
  EMAIL_ASSETS_BASE_URL: BASE,
  NODE_ENV: "production",
}
const URL_RENDER = `${BASE}/api/hcc/v1/render`
const T0 = 1_791_465_600_000

/** Signe comme le HCC : même chaîne que le contrat, clé de rendu dérivée INDÉPENDAMMENT ici (HKDF de node). */
function signed(body: string, over: { method?: string; path?: string; timestamp?: number; nonce?: string | null; clientId?: string; keyId?: string; key?: Buffer; extra?: Record<string, string>; url?: string } = {}) {
  const key = over.key ?? Buffer.from(hkdfSync("sha256", VECTOR_KEY, Buffer.from("hcc-email-builder-v1"), Buffer.from("hcc-to-builder:render"), 32))
  const timestamp = String(Math.floor((over.timestamp ?? T0) / 1000))
  const nonce = over.nonce === undefined ? `n${Math.random().toString(36).slice(2).padEnd(24, "x")}` : over.nonce
  const clientId = over.clientId ?? "email-builder-poc"
  const chain = [over.method ?? "POST", over.path ?? "/api/hcc/v1/render", timestamp, nonce ?? "", createHash("sha256").update(body, "utf8").digest("hex"), clientId, ""].join("\n")
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HCC-Client-Id": clientId,
    "HCC-Key-Id": over.keyId ?? "k1",
    "HCC-Timestamp": timestamp,
    "HCC-Signature": `v1=${createHmac("sha256", key).update(chain).digest("hex")}`,
    ...(nonce === null ? {} : { "HCC-Nonce": nonce }),
    ...over.extra,
  }
  return new Request(over.url ?? URL_RENDER, { method: "POST", headers, body })
}
const call = (request: Request, now = T0, overEnv: Record<string, string | undefined> = {}) => handleHccRender(request, { env: { ...env, ...overEnv }, now: () => now, log: () => {} })
const bodyOf = (document: unknown) => JSON.stringify({ document })
const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code

/** Un document complet : lames officielles (images de la banque, liens, icônes) et une lame générée avec visuel. */
function richDocument(): EmailDocument {
  const added = applyDocumentOperation(buildDemoDocument(), { type: "add-generated-block", spec: structuredClone(generatedFixtures.heroImageText), slots: structuredClone(fixtureContents.heroImageText) } as DocumentOperation)
  assert.ok(added.ok)
  return added.value
}

describe("HCC render — clé dérivée HKDF et vecteur partageable", () => {
  test("paramètres exacts : HKDF-SHA256, salt « hcc-email-builder-v1 », info « hcc-to-builder:render », 32 octets", () => {
    assert.equal(RENDER_KEY_SALT, "hcc-email-builder-v1")
    assert.equal(RENDER_KEY_INFO, "hcc-to-builder:render")
    assert.equal(RENDER_KEY_LENGTH, 32)
  })
  test("vecteur : clé fictive 0x01…0x20 → clé de rendu, chaîne et signature fixes", () => {
    const renderKey = deriveRenderKey(VECTOR_KEY)
    assert.equal(renderKey.toString("hex"), "0f174bb17c0c4efe41cc9555653f7d9da6d3e0f87b92bcb241cff913bbeb75b2")
    const body = '{"document":{}}'
    assert.equal(createHash("sha256").update(body).digest("hex"), "577fb1126636075a0283c21bc2eb10e101cdf16837c11cee50bb82e6241dec9e")
    const chain = ["POST", "/api/hcc/v1/render", "1791465600", "AAAAAAAAAAAAAAAAAAAAAA", "577fb1126636075a0283c21bc2eb10e101cdf16837c11cee50bb82e6241dec9e", "email-builder-poc", ""].join("\n")
    assert.equal(`v1=${createHmac("sha256", renderKey).update(chain).digest("hex")}`, "v1=c028b7d24b628f006771e30d59b5966bad97f1063a36baef9d2d57579efddc22")
  })
  test("la clé brute k1 (sens Builder → HCC) ne signe PAS une requête de rendu valide", async () => {
    const response = await call(signed(bodyOf(richDocument()), { key: VECTOR_KEY }))
    assert.equal(response.status, 401)
    assert.equal(await errorCode(response), "invalid_client")
  })
})

describe("HCC render — authentification", () => {
  test("signature valide : 200 { html, contractVersion: 1 }, en-têtes no-store, nosniff, no-referrer", async () => {
    const response = await call(signed(bodyOf(richDocument())))
    assert.equal(response.status, 200)
    const body = (await response.json()) as { html: string; contractVersion: number }
    assert.equal(body.contractVersion, 1)
    assert.match(body.html, /^<!DOCTYPE html>/i)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal(response.headers.get("x-content-type-options"), "nosniff")
    assert.equal(response.headers.get("referrer-policy"), "no-referrer")
    assert.deepEqual(Object.keys(body).sort(), ["contractVersion", "html"])
  })
  test("refus 401 : méthode ou chemin signés différents, corps altéré d'un octet, horodatage hors fenêtre, client ou kid inconnus, signature mal formée", async () => {
    const body = bodyOf(richDocument())
    const altered = signed(body)
    const tampered = new Request(URL_RENDER, { method: "POST", headers: altered.headers, body: body.replace("}", " }") })
    const cases: Request[] = [
      signed(body, { method: "PUT" }),
      signed(body, { path: "/api/hcc/v1/autre" }),
      signed(body, { path: "/api/hcc/v1/render?x=1" }),
      tampered,
      signed(body, { timestamp: T0 - 301_000 }),
      signed(body, { timestamp: T0 + 301_000 }),
      signed(body, { clientId: "email-builder-local" }),
      signed(body, { keyId: "k2" }),
      new Request(URL_RENDER, { method: "POST", headers: { ...Object.fromEntries(signed(body).headers), "hcc-signature": "v1=zz" }, body }),
    ]
    for (const request of cases) {
      const response = await call(request)
      assert.equal(response.status, 401)
      assert.equal(await errorCode(response), "invalid_client")
      assert.equal(response.headers.get("www-authenticate"), 'HCC-HMAC error="invalid_client"')
    }
  })
  test("nonce absent, trop court, de caractères interdits, ou REJOUÉ : 401", async () => {
    const body = bodyOf(richDocument())
    for (const nonce of [null, "court", "x".repeat(65), "contient des espaces !!!!!"]) assert.equal((await call(signed(body, { nonce }))).status, 401, String(nonce))
    const once = signed(body, { nonce: "AAAAAAAAAAAAAAAAAAAAAA" })
    const replay = new Request(URL_RENDER, { method: "POST", headers: once.headers, body })
    assert.equal((await call(once)).status, 200)
    assert.equal((await call(replay)).status, 401, "rejeu refusé")
  })
  test("appel depuis un navigateur (Origin) : 403 avant toute lecture ; aucune session Builder nécessaire ni lue", async () => {
    const response = await call(signed(bodyOf(richDocument()), { extra: { Origin: "https://hcc.example" } }))
    assert.equal(response.status, 403)
    assert.equal(await errorCode(response), "origin_refusee")
    assert.ok(!/SESSION_COOKIE|guardRequest|openSession/.test(code("lib/hcc/render-handler.ts")))
  })
  test("configuration absente (clé, base des médias) ou base non HTTPS en production : 503", async () => {
    const body = bodyOf(richDocument())
    for (const over of [{ HCC_SIGNING_KEY: undefined }, { EMAIL_ASSETS_BASE_URL: undefined }, { EMAIL_ASSETS_BASE_URL: "http://email-builder.example" }, { EMAIL_ASSETS_BASE_URL: "http://localhost:3100" }]) {
      const response = await call(signed(body), T0, over)
      assert.equal(response.status, 503, JSON.stringify(Object.keys(over)))
      assert.equal(await errorCode(response), "client_non_configure")
    }
  })
})

describe("HCC render — document", () => {
  test("document invalide, schemaVersion 2, type de lame inconnu : 422 invalid_document ; vide : 422 empty_document", async () => {
    const v2 = { ...buildDemoDocument(), schemaVersion: 2 }
    const unknown = structuredClone(buildDemoDocument()) as unknown as { config: { blocks: { type: string }[] } }
    unknown.config.blocks[0]!.type = "email-module-inconnu"
    for (const document of [{}, null, "x", v2, unknown]) assert.equal(await errorCode(await call(signed(bodyOf(document)))), "invalid_document")
    const empty = await call(signed(bodyOf(createBlankDocument())))
    assert.equal(empty.status, 422)
    assert.equal(await errorCode(empty), "empty_document")
  })
  test("ancien manifestVersion : rendu accepté (simple recommandation dans le Builder)", async () => {
    const old = { ...buildDemoDocument(), registry: { manifestVersion: "0.0/0.1" } }
    assert.equal((await call(signed(bodyOf(old)))).status, 200)
  })
  test("corps : JSON invalide ou clé en plus → 400 ; au-delà de 600 Ko → 413", async () => {
    assert.equal(await errorCode(await call(signed("{"))), "invalid_request")
    assert.equal(await errorCode(await call(signed(JSON.stringify({ document: buildDemoDocument(), extra: 1 })))), "invalid_request")
    const big = JSON.stringify({ document: buildDemoDocument(), pad: "x".repeat(RENDER_MAX_BODY_BYTES) })
    assert.equal((await call(signed(big))).status, 413)
  })
})

describe("HCC render — HTML produit", () => {
  test("fidèle au renderer : même HTML que le Builder, adapté à l'aperçu (sans repères, liens inertes, médias absolus)", async () => {
    const document = richDocument()
    const { html } = (await (await call(signed(bodyOf(document)))).json()) as { html: string }
    assert.equal(html, toPreviewHtml(renderDocumentEmail(document), { assetsBase: BASE }))
    assert.ok(!/data-slot|builder-block/.test(html), "aucun repère d'édition")
    assert.ok(!/<script|\son[a-z]+\s*=|javascript:/i.test(html.replace(/<style[\s\S]*?<\/style>/gi, "")), "aucun script, aucun événement")
    assert.ok(!/\shref\s*=/i.test(html.replace(/<style[\s\S]*?<\/style>/gi, "")), "liens inertes")
    assert.match(html, /data-preview-href="https:\/\//)
    assert.ok(!/demo-assets\.invalid|\[URL_CDN/.test(html))
    const sources = [...html.matchAll(/\ssrc="([^"]*)"/g)].map((match) => match[1]!)
    assert.ok(sources.length > 3)
    for (const src of sources) assert.ok(src.startsWith(`${BASE}/`) || src.startsWith("data:image/gif;base64,"), src)
    assert.ok(sources.some((src) => src.startsWith(`${BASE}/images/email/v2/`)), "images de la banque, dont la lame générée")
    assert.ok(sources.some((src) => src.startsWith(`${BASE}/logos/`)), "logo")
    assert.match(html, /@media only screen and \(max-width:599px\)/, "responsive conservé")
    assert.deepEqual(unsafePreviewReasons(html, BASE), [])
  })
  test("le filet final refuse un HTML dangereux (scripts, événements, liens actifs, repères, images hors base)", () => {
    for (const html of ['<script>x</script>', `<img src="${BASE}/images/a.jpg" onerror="x">`, '<a href="https://x">', '<img src="http://x/a.png">', '<p data-slot="x">', "https://demo-assets.invalid/a", "<iframe></iframe>", "javascript:alert(1)"]) assert.notDeepEqual(unsafePreviewReasons(html, BASE), [], html)
    assert.deepEqual(unsafePreviewReasons(`<img src="${BASE}/images/email/v2/a--medium.jpg"><img src="${transparentPixel}">`, BASE), [])
  })
  test("images : SEULEMENT la base validée (origine exacte, dossiers de médias) ou le pixel transparent prévu", () => {
    const local = "http://localhost:3100"
    const production = "https://email-builder-poc-studi.vercel.app"
    // acceptées
    assert.equal(isAllowedPreviewSource(`${local}/images/email/v2/canape-lumiere--medium.jpg`, local), true, "base locale HTTP validée")
    assert.equal(isAllowedPreviewSource(`${production}/logos/logo_studi_sombre_lowres.png`, production), true, "base de production HTTPS")
    assert.equal(isAllowedPreviewSource(`${production}/icones/award.png`, production), true)
    assert.equal(isAllowedPreviewSource(transparentPixel, production), true, "pixel prévu")
    // refusées
    for (const src of [
      "https://cdn.example/images/a.jpg",
      `https://email-builder-poc-studi.vercel.app.evil.test/images/a.jpg`,
      `https://evil-email-builder-poc-studi.vercel.app/images/a.jpg`,
      `${production}.evil.test/images/a.jpg`,
      `${production}@evil.test/images/a.jpg`,
      `https://user:pass@email-builder-poc-studi.vercel.app/images/a.jpg`,
      `${production}/images/../api/hcc/v1/render`,
      `${production}/images/%2e%2e/secret`,
      `${production}/images\\a.jpg`,
      `${production}/images/a.jpg?x=1`,
      `${production}/images/a.jpg#x`,
      `${production}/api/email-builder/render`,
      `${production}/`,
      `${production}`,
      "http://email-builder-poc-studi.vercel.app/images/a.jpg",
      "data:image/png;base64,AAAA",
      "data:image/gif;base64,AAAA",
      "javascript:alert(1)",
      "/images/email/v2/a.jpg",
      "",
    ]) assert.equal(isAllowedPreviewSource(src, production), false, src)
    assert.equal(isAllowedPreviewSource(`${local}/images/a.jpg`, production), false, "une base locale n'est pas acceptée quand la base validée est celle de production")
  })
  test("base locale HTTP (hors production) : la route rend 200 avec des images absolues http://localhost:3100", async () => {
    const response = await call(signed(bodyOf(richDocument())), T0, { EMAIL_ASSETS_BASE_URL: "http://localhost:3100", NODE_ENV: "development" })
    assert.equal(response.status, 200)
    const { html, contractVersion } = (await response.json()) as { html: string; contractVersion: number }
    assert.equal(contractVersion, 1)
    for (const [, src] of html.matchAll(/\ssrc="([^"]*)"/g)) assert.ok(src!.startsWith("http://localhost:3100/") || src === transparentPixel, src)
  })
  test("non-régression : sans option, toPreviewHtml garde ses chemins relatifs historiques (aperçus du Builder inchangés)", () => {
    const html = toPreviewHtml(renderDocumentEmail(buildDemoDocument()))
    assert.match(html, /src="\/logos\/logo_studi_sombre_lowres\.png"/)
    assert.match(html, /src="\/images\/email\/v2\//)
    assert.ok(!html.includes(BASE))
  })
})

describe("HCC render — frontières", () => {
  test("la route est hors du filtre du proxy (pas de session) mais sa vérification HMAC est toujours exécutée", () => {
    const proxy = code("proxy.ts")
    assert.ok(!/\/api\/hcc/.test(proxy), "le proxy ne s'applique pas à /api/hcc/v1/*")
    assert.match(code("app/api/hcc/v1/render/route.ts"), /handleHccRender\(request\)/)
    const handler = code("lib/hcc/render-handler.ts")
    assert.ok(handler.indexOf("verifyHccSignature(") < handler.indexOf("JSON.parse(body)"), "signature vérifiée avant toute lecture du document")
  })
  test("aucun appel réseau, aucune écriture, aucun Anthropic, aucun secret journalisé ; gabarits embarqués dans le bundle de la route", () => {
    for (const path of ["lib/hcc/render-handler.ts", "lib/hcc/verify.ts"]) {
      const source = code(path)
      assert.ok(!/fetch\(|anthropic|writeFile|prisma|neon/i.test(source), path)
      assert.ok(!/console\.(log|error)\([^)]*(signature|nonce|body|document|key)/i.test(source), path)
    }
    const config = readFileSync(join(root, "next.config.ts"), "utf8")
    assert.match(config, /"\/api\/hcc\/v1\/render": \["\.\/lib\/email\/socle-email\.html", "\.\/lib\/email\/templates\/\*\*\/\*\.html"\]/)
  })
})
