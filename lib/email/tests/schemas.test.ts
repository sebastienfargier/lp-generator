/**
 * Contrat EmailConfig : chaque cas est vérifié deux fois. `tsc` (lint, build)
 * contrôle les `@ts-expect-error` ; `node:test` contrôle le verdict de Zod.
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { safeParseEmailConfig } from "../schemas"
import type { EmailBlock, EmailConfig, EmailHref } from "../types"
import { content, disclaimer, email, footer, header, hero, withBlocks } from "./fixtures"

function accepted(config: unknown) {
  const result = safeParseEmailConfig(config)
  assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues))
}

function rejected(config: unknown, message: RegExp) {
  const result = safeParseEmailConfig(config)
  assert.equal(result.success, false, "la config aurait dû être refusée")
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).join(" | ")
    assert.match(messages, message)
  }
}

const withHref = (href: EmailHref): EmailConfig =>
  withBlocks({ ...hero, slots: { ...hero.slots, "cta-1": { label: "Go", href } } })

describe("EmailConfig — acceptés", () => {
  test("email de référence", () => accepted(email))
  test("disclaimer immédiatement avant le footer", () =>
    accepted(withBlocks(content, disclaimer)))
  test("Liquid dans une URL HTTPS", () =>
    accepted(withHref("https://example.com/?campaign={{ campaign.name }}&foo=bar")))
  test("href entièrement Liquid et [URL À CONFIRMER]", () => {
    accepted(withHref("{{ event.cta_url }}"))
    accepted(withHref("[URL À CONFIRMER]"))
  })
  test("texte avec < et > de comparaison", () =>
    accepted(withBlocks({ ...content, slots: { ...content.slots, "titre-section": { text: "Réponse en <5 min, x > 5" } } })))
})

describe("EmailConfig — refusés", () => {
  test("lame inconnue", () =>
    // @ts-expect-error lame absente du manifeste
    rejected(withBlocks({ id: "x", type: "email-module-inconnue", slots: {} }), /Lame inconnue/))
  test("slot inconnu", () =>
    // @ts-expect-error slot non déclaré pour text-only
    rejected(withBlocks({ ...content, slots: { ...content.slots, "titre-principal": { text: "x" } } }), /Slot inconnu/))
  test("slot requis absent", () =>
    // @ts-expect-error texte-descriptif requis
    rejected(withBlocks({ id: "t", type: "email-module-text-only", slots: { "titre-section": { text: "a" } } }), /indéfini/))
  test("élément système fourni par la config", () =>
    // @ts-expect-error logo : élément système
    rejected(withBlocks({ ...header, slots: { logo: { src: "https://a.fr/l.png", alt: "" } } }), /Élément système/))
  test("ids de lame dupliqués", () =>
    rejected(withBlocks(content, { ...content }), /en double/))
  test("footer obligatoire", () =>
    rejected({ ...email, blocks: [header, content] }, /Footer manquant/))
  test("footer en dernière position", () =>
    rejected({ ...email, blocks: [footer, content] }, /dernière lame/))
  test("disclaimer immédiatement avant le footer", () =>
    rejected(withBlocks(disclaimer, content), /immédiatement avant le footer/))
  test("href dangereux", () => {
    // @ts-expect-error javascript: n'est pas un EmailHref
    rejected(withHref("javascript:alert(1)"), /Lien invalide/)
    // @ts-expect-error data: n'est pas un EmailHref
    rejected(withHref("data:text/html,<script>alert(1)</script>"), /Lien invalide/)
    // @ts-expect-error http: n'est pas un EmailHref
    rejected(withHref("http://www.studi.com"), /Lien invalide/)
    rejected(withHref("https://a.fr/?id={{ customer.id }"), /Lien invalide/)
  })
  test("surface invalide", () =>
    // @ts-expect-error surface hors des 7 surfaces fermées
    rejected(withBlocks({ ...content, surface: "#0D302D" }), /Surface inconnue/))
  test("surface sur une lame fixed", () => {
    // @ts-expect-error header : surface non configurable
    const colored: EmailBlock = { id: "header", type: "email-module-header-newsletter", surface: "marque", slots: {} }
    rejected(withBlocks(colored, content), /Surface non configurable/)
  })
  test("HTML réel dans un texte", () =>
    rejected(withBlocks({ ...content, slots: { ...content.slots, "titre-section": { text: "<strong>Bonjour</strong>" } } }), /HTML interdit/))
  test("disclaimer libre", () =>
    // @ts-expect-error un disclaimer est un identifiant du catalogue
    rejected(withBlocks(content, { ...disclaimer, slots: { "disclaimer-1": { text: "*Emploi garanti." } } }), /Disclaimer inconnu/))
  test("clés html / style / className", () => {
    // @ts-expect-error clé inconnue au niveau de l'email
    const withHtml: EmailConfig = { ...email, html: "<table></table>" }
    rejected(withHtml, /Clé non reconnue/)
    // @ts-expect-error clé inconnue au niveau de la lame
    rejected(withBlocks({ ...content, className: "rouge" }), /Clé non reconnue/)
  })
})
