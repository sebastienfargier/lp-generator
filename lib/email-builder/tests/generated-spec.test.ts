/**
 * V2.9.1 : le vocabulaire des lames générées locales, son schéma et sa validation.
 * Pur : aucun réseau, aucun rendu, aucun HTML. Une spec invalide est rejetée entière.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emailImageFormats } from "../../email/image-bank"
import { emailBlockManifest } from "../../email/manifest"
import { emailSystemElements } from "../../email/system"
import { safeParseEmailConfig } from "../../email/schemas"
import { slotProtection } from "../assistant-proposal"
import { referenceRoles } from "../document"
import { availableImageFormats, buttonMaxLength, columnRatios, sectionPaddingX, sectionPaddingY, futureImageFormats, generatedLimits, maxGeneratedBlocksPerEmail, radii, spacerSizes, stackGaps, textMaxLength } from "../generated/tokens"
import { deriveGeneratedSlots, slotNameProblem } from "../generated/slots"
import { deriveGeneratedCapabilities, generatedSpecBytes, validateGeneratedBlockSpec } from "../generated/validate"
import { controlledSlotStems, isControlledSlotName } from "../slot-roles"
import { bannerOverlapCard, generatedFixtures, heroImageText, itemGrid, statBanner, textSection, threeCards } from "./generated-fixtures"

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
const clone = <T>(value: T): T => structuredClone(value)

const ok = (input: unknown) => {
  const result = validateGeneratedBlockSpec(input)
  assert.equal(result.ok, true, JSON.stringify(result.ok ? "" : result.issues))
  return result as Extract<typeof result, { ok: true }>
}
const refused = (input: unknown, code?: string) => {
  const result = validateGeneratedBlockSpec(input)
  assert.equal(result.ok, false, "entrée refusée attendue")
  if (!result.ok && code) assert.ok(result.issues.some((entry) => entry.code === code), `${code} attendu : ${JSON.stringify(result.issues)}`)
  return result
}
/** Une spec valide dont on modifie une copie. */
const mutated = (change: (spec: Json) => void) => {
  const spec = clone(textSection) as Json
  change(spec)
  return spec
}
const stackOf = (spec: Json) => spec.root.children[0] as Json
const txt = (slot: string) => ({ t: "text", slot, style: "body", align: "start", tone: "text" })

describe("V2.9.1 — specs valides de référence (le DSL, sans renderer)", () => {
  test("A. texte simple, B. hero, C. trois cartes, D. image + carte qui chevauche, E. grille, F. preuve : toutes valides", () => {
    for (const spec of Object.values(generatedFixtures)) ok(spec)
    assert.equal(Object.keys(generatedFixtures).length, 6)
  })

  test("les slots dérivés : noms, genres (alignés sur le manifest), éditeur court/long, formats, ordre du document", () => {
    const slots = ok(textSection).slots
    assert.deepEqual(slots.map((slot) => slot.name), Object.values(slots).map((slot) => slot.name))
    assert.equal(new Set(slots.map((slot) => slot.name)).size, slots.length)
    for (const slot of slots) assert.ok(["texte", "cta", "cta:fleche", "asset:visuel", "asset:icone"].includes(slot.kind))
  })

  test("deriveGeneratedSlots est pure et déterministe ; le bouton avec flèche est « cta:fleche », sans flèche « cta » ; image et icône", () => {
    const hero = ok(heroImageText).slots
    assert.deepEqual(hero.map((slot) => [slot.name, slot.kind]), [["image", "asset:visuel"], ["sur-titre", "texte"], ["titre", "texte"], ["texte", "texte"], ["cta", "cta:fleche"]])
    assert.equal(hero[0]!.format, "large")
    assert.equal(hero[1]!.maxLength, textMaxLength.eyebrow)
    assert.equal(hero[4]!.maxLength, buttonMaxLength)
    const cards = ok(threeCards).slots
    assert.deepEqual(cards.filter((slot) => slot.kind === "cta").map((slot) => slot.name), ["lien-1", "lien-2", "lien-3"], "bouton sans flèche")
    const grid = ok(itemGrid).slots
    assert.deepEqual(grid.filter((slot) => slot.kind === "asset:icone").map((slot) => slot.name), ["icone-1", "icone-2", "icone-3", "icone-4"])
    assert.deepEqual(deriveGeneratedSlots(ok(itemGrid).spec), deriveGeneratedSlots(clone(ok(itemGrid).spec)))
    assert.equal(grid.length, 12)
  })

  test("trois cartes SANS images : la structure est valide ; une vignette demanderait un format qui n'existe pas encore, donc elle est REFUSÉE", () => {
    const withImage = clone(threeCards) as Json
    withImage.root.children[0].children[0].children[0].children.unshift({ t: "image", slot: "image-1", format: "card", radius: 12, align: "center" })
    const result = refused(withImage, "schema")
    assert.match(JSON.stringify(result), /« card » n'existe pas encore dans la banque/)
    assert.ok(!availableImageFormats.includes("card" as never) && (futureImageFormats as readonly string[]).includes("card"))
    // un format inconnu : un autre message
    const unknown = clone(withImage) as Json
    unknown.root.children[0].children[0].children[0].children[0].format = "xl"
    assert.match(JSON.stringify(refused(unknown, "schema")), /Format d'image inconnu/)
    // les formats disponibles sont ceux de la banque, lus à la source
    assert.deepEqual([...availableImageFormats], Object.keys(emailImageFormats))
  })

  test("chevauchement : image + carte `overlap` 40 valide au niveau du DSL ; la capacité est dérivée, sans message de compatibilité dans la spec", () => {
    const { spec } = ok(bannerOverlapCard)
    assert.deepEqual(deriveGeneratedCapabilities(spec), { usesOverlap: true, maxColumns: 1, imageFormats: ["band"] })
    assert.deepEqual(deriveGeneratedCapabilities(ok(threeCards).spec), { usesOverlap: false, maxColumns: 3, imageFormats: [] })
    assert.ok(!/compat|degrad|outlook|approx/i.test(JSON.stringify(bannerOverlapCard)))
    for (const overlap of [0, 24, 40, 56]) {
      const copy = clone(bannerOverlapCard) as Json
      copy.root.children[1].overlap = overlap
      ok(copy)
    }
  })

  test("`repeat` n'existe pas : les éléments répétés sont des enfants explicites (dérivation des slots et validation sans magie)", () => {
    const withRepeat = mutated((spec) => stackOf(spec).children.push({ t: "repeat", count: 3, children: [txt("x")] }))
    refused(withRepeat, "schema")
    assert.ok(!/repeat/.test(code("lib/email-builder/generated/schema.ts")))
  })
})

describe("V2.9.1 — limites et frontières", () => {
  test("profondeur : 4 niveaux sous la racine acceptés, le 5e refusé (la racine est au niveau 0, ses enfants au niveau 1)", () => {
    const chain = (containers: number) => {
      let node: Json = txt("t")
      for (let i = 0; i < containers; i += 1) node = { t: "stack", gap: 8, align: "start", children: [node] }
      return node
    }
    const spec = (containers: number) => ({ specVersion: 1, role: "text", root: { t: "section", padX: 0, padY: 0, children: [chain(containers)] } })
    assert.equal(ok(spec(3)).stats.depth, 4, "3 conteneurs + la feuille = niveau 4")
    refused(spec(4), "depth")
    assert.equal(ok(spec(0)).stats.depth, 1)
  })

  test("40 nœuds acceptés, le 41e refusé", () => {
    const stacks = (spacersPerStack: number[]) => ({
      specVersion: 1,
      role: "text",
      root: { t: "section", padX: 0, padY: 0, children: spacersPerStack.map((count) => ({ t: "stack", gap: 8, align: "start", children: Array.from({ length: count }, () => ({ t: "spacer", size: 8 })) })) },
    })
    assert.equal(ok(stacks([7, 7, 7, 7, 7])).stats.nodes, 40)
    refused(stacks([8, 7, 7, 7, 7]), "nodes")
  })

  test("24 slots acceptés, le 25e refusé", () => {
    const texts = (count: number) => Array.from({ length: count }, (_, index) => txt(`texte-${index + 1}`))
    const spec = (counts: number[]) => {
      let n = 0
      return { specVersion: 1, role: "text", root: { t: "section", padX: 0, padY: 0, children: counts.map((count) => ({ t: "stack", gap: 8, align: "start", children: texts(count).map((node) => ({ ...node, slot: `texte-${++n}` })) })) } }
    }
    assert.equal(ok(spec([8, 8, 8])).stats.slots, 24)
    refused(spec([8, 8, 8, 1]), "slots")
  })

  test("taille : mesurée en OCTETS UTF-8, pas en caractères ; contrôlée avant tout parcours ; une spec valide en est loin", () => {
    const chars = 3100
    const payload = { ...clone(textSection), note: "é".repeat(chars) }
    assert.ok(JSON.stringify(payload).length < generatedLimits.maxBytes, "moins de 6 144 caractères…")
    assert.ok(generatedSpecBytes(payload) > generatedLimits.maxBytes, "… mais plus de 6 144 octets")
    const result = refused(payload, "size")
    assert.equal(!result.ok && result.issues.length, 1, "la taille seule est signalée (rien n'a été parcouru)")
    assert.equal(generatedSpecBytes({ a: "é" }), generatedSpecBytes({ a: "e" }) + 1)
    assert.equal(generatedSpecBytes({ a: "😀" }), generatedSpecBytes({ a: "e" }) + 3)
    for (const spec of Object.values(generatedFixtures)) assert.ok(generatedSpecBytes(spec) < 2500)
    assert.equal(generatedLimits.maxBytes, 6144)
  })

  test("colonnes : le nombre d'enfants suit le ratio ; 1 ou 5 colonnes, un ratio inconnu, refusés", () => {
    const columns = (ratio: string, count: number) => ({
      specVersion: 1,
      role: "text",
      root: { t: "section", padX: 0, padY: 0, children: [{ t: "columns", ratio, gap: 16, align: "top", children: Array.from({ length: count }, (_, index) => ({ t: "stack", gap: 8, align: "start", children: [txt(`texte-${index + 1}`)] })) }] },
    })
    for (const [ratio, count] of Object.entries(columnRatios)) ok(columns(ratio, count))
    refused(columns("1:1", 3), "schema")
    refused(columns("1:1:1", 2), "schema")
    refused(columns("1:1", 1), "schema")
    refused(columns("1:1:1:1", 5), "schema")
    refused(columns("1:3", 2), "schema")
    refused(columns("2:2", 2), "schema")
    assert.deepEqual(Object.keys(columnRatios), ["1:1", "1:2", "2:1", "1:1:1", "1:1:1:1"])
  })

  test("racine : exactement une section ; pas de section imbriquée ; rôle du vocabulaire de ReferenceAnalysis", () => {
    refused(mutated((spec) => (spec.root.t = "stack")), "schema")
    refused(mutated((spec) => stackOf(spec).children.push({ t: "section", padX: 0, padY: 0, children: [txt("x")] })), "schema")
    refused(mutated((spec) => (spec.role = "landing")), "schema")
    for (const role of referenceRoles) ok(mutated((spec) => (spec.role = role)))
    refused(mutated((spec) => (spec.root.children = [])), "schema")
  })

  test("chevauchement : seulement sur une carte placée juste après une image ; valeur hors {0, 24, 40, 56} refusée", () => {
    const first = clone(bannerOverlapCard) as Json
    first.root.children.reverse()
    refused(first, "overlap")
    const afterText = clone(bannerOverlapCard) as Json
    afterText.root.children.splice(0, 1, txt("avant"))
    refused(afterText, "overlap")
    const badValue = clone(bannerOverlapCard) as Json
    badValue.root.children[1].overlap = 30
    refused(badValue, "schema")
    const negative = clone(bannerOverlapCard) as Json
    negative.root.children[1].overlap = -40
    refused(negative, "schema")
  })
})

describe("V2.9.1 — noms de slots", () => {
  test("grammaire : minuscules, chiffres, tirets ; commence par une lettre ; 32 caractères au plus", () => {
    for (const name of ["titre", "titre-2", "a", "a".repeat(32)]) ok(mutated((spec) => (stackOf(spec).children[0].slot = name)))
    for (const name of ["Titre", "1titre", "-titre", "titre_2", "titre 2", "titre.2", "titre/2", "a".repeat(33), "", "titré", "😀", "titre<b>", "titre\n"]) refused(mutated((spec) => (stackOf(spec).children[0].slot = name)))
  })

  test("unicité : un slot partagé entre deux nœuds (même genre ou genres différents) est refusé", () => {
    refused(mutated((spec) => (stackOf(spec).children[1].slot = "titre")), "slot-duplicate")
    refused(mutated((spec) => (stackOf(spec).children[2].slot = "titre")), "slot-duplicate")
  })

  test("noms réservés : valeur de référence (valeur-cle, code-promo-*), éléments système, mentions légales ; racines aussi", () => {
    for (const name of ["valeur-cle", "code-promo-1", "code-promo-12", "code-promo", "valeur-cle-2", "logo", "social-1", "social-9", "lien-desabonnement", "lien-preferences", "disclaimer-1", "disclaimer"]) {
      const result = refused(mutated((spec) => (stackOf(spec).children[0].slot = name)), "slot-reserved")
      assert.ok(!result.ok && result.issues.some((entry) => entry.code === "slot-reserved"), name)
    }
    for (const name of ["valeur", "code", "promo-code", "lien-1", "titre-valeur"]) ok(mutated((spec) => (stackOf(spec).children[0].slot = name)))
  })

  test("la protection n'est PAS dupliquée : tout slot protégé par rôle dans le manifest est réservé ici, et la règle est partagée (aucune régression V2.5.2)", () => {
    let checked = 0
    for (const [type, entry] of Object.entries(emailBlockManifest)) {
      for (const slot of Object.keys((entry as unknown as { slots: Record<string, string> }).slots)) {
        const role = slotProtection(type as never, slot)
        if (role === "valeur de référence") {
          assert.ok(isControlledSlotName(slot), `${type}:${slot}`)
          assert.equal(slotNameProblem(slot)?.problem, "reserved", `${type}:${slot}`)
          checked += 1
        }
        if (isControlledSlotName(slot)) assert.equal(role === "valeur de référence" || role === "mention légale" || role === "système", true, `${type}:${slot}`)
      }
    }
    assert.ok(checked >= 8, `${checked} slots protégés vérifiés`)
    for (const key of Object.keys(emailSystemElements)) assert.equal(slotNameProblem(key)?.problem, "reserved", key)
    // la source unique : les racines et la règle exacte restent cohérentes
    for (const stem of controlledSlotStems) assert.ok(isControlledSlotName(stem === "code-promo" ? "code-promo-1" : stem), stem)
    // V2.9.3 : la protection par rôle vit à côté de la règle de nom (`slot-roles.ts`) ; l'assistant la ré-exporte, sans la recopier.
    assert.ok(code("lib/email-builder/slot-roles.ts").includes("isControlledSlotName(slot)") && !/valeur-cle\|code-promo/.test(code("lib/email-builder/assistant-proposal.ts")))
    assert.ok(/export \{ slotProtection/.test(code("lib/email-builder/assistant-proposal.ts")))
    assert.ok(!/valeur-cle|code-promo/.test(code("lib/email-builder/generated/slots.ts")), "aucune liste recopiée")
  })

  test("V2.5.2 inchangée : la protection par rôle renvoie les mêmes valeurs pour les cas connus", () => {
    assert.equal(slotProtection("email-module-hero-offer-image-top", "valeur-cle"), "valeur de référence")
    assert.equal(slotProtection("email-module-hero-offer-image-top", "code-promo-1"), "valeur de référence")
    assert.equal(slotProtection("email-module-hero-offer-image-top", "lien-1"), "système")
    assert.equal(slotProtection("email-module-legal-disclaimer", "disclaimer-1"), "mention légale")
    assert.equal(slotProtection("email-module-header-seasonal-campaign", "label"), "système")
    assert.equal(slotProtection("email-module-text-and-cta-variant-01", "titre-section"), undefined)
  })
})

describe("V2.9.1 — corpus malveillant : tout est refusé, entier", () => {
  const payloads: Record<string, string> = {
    html: "<script>alert(1)</script>",
    jsUrl: "javascript:alert(1)",
    url: "https://evil.example/pixel.png",
    hex: "#ff0000",
    rgb: "rgb(255, 0, 0)",
    calc: "calc(100% - 20px)",
    px: "-12px",
    font: "Comic Sans MS, cursive",
  }
  const unknownKeys = ["style", "className", "class", "id", "href", "src", "url", "color", "backgroundColor", "background", "width", "height", "position", "zIndex", "margin", "marginTop", "fontFamily", "fontSize", "html", "innerHTML", "onclick", "script", "tailwind", "css"]
  const levels: [string, (spec: Json) => Json][] = [
    ["spec", (spec) => spec],
    ["racine", (spec) => spec.root],
    ["stack", (spec) => stackOf(spec)],
    ["texte", (spec) => stackOf(spec).children[0]],
    ["bouton", (spec) => stackOf(spec).children[2]],
  ]

  test("des clés inconnues (style, className, couleur, largeur, position, z-index, marge, police…) à chaque niveau de l'arbre : toujours refusées", () => {
    let count = 0
    for (const [, target] of levels) {
      for (const key of unknownKeys) {
        for (const value of Object.values(payloads)) {
          refused(mutated((spec) => (target(spec)[key] = value)))
          count += 1
        }
      }
    }
    assert.ok(count > 800, `${count} variantes`)
  })

  test("des valeurs dangereuses dans les champs ENUM (alignement, style, ton, variante, gap, padding, rayon, format) : refusées", () => {
    const enumFields: [string, (spec: Json) => Json, string][] = [
      ["align", (spec) => stackOf(spec).children[0], "align"],
      ["style", (spec) => stackOf(spec).children[0], "style"],
      ["tone", (spec) => stackOf(spec).children[0], "tone"],
      ["variant", (spec) => stackOf(spec).children[2], "variant"],
      ["gap", (spec) => stackOf(spec), "gap"],
      ["padX", (spec) => spec.root, "padX"],
      ["padY", (spec) => spec.root, "padY"],
      ["role", (spec) => spec, "role"],
    ]
    for (const [, target, key] of enumFields) for (const value of [...Object.values(payloads), 12.5, -1, 9999, null, true, {}, []]) refused(mutated((spec) => (target(spec)[key] = value)))
    refused(mutated((spec) => (stackOf(spec).children[2].arrow = "oui")))
    refused(mutated((spec) => (stackOf(spec).children[2].arrow = "true")))
    // les rayons, paddings de carte et espaceurs, hors vocabulaire
    for (const radius of [1, 8, 20, 50, 9999, "50%", "12px"]) refused({ ...clone(bannerOverlapCard), root: { ...(bannerOverlapCard.root as Json), children: [{ ...(bannerOverlapCard.root as Json).children[0], radius }, (bannerOverlapCard.root as Json).children[1]] } })
    assert.deepEqual([...radii], [0, 12, 16])
  })

  test("primitives inconnues ou interdites : html, iframe, script, raw, style, link, table, repeat…", () => {
    for (const t of ["html", "iframe", "script", "raw", "style", "link", "table", "div", "span", "a", "img", "video", "embed", "repeat", "Stack", "section", ""]) refused(mutated((spec) => stackOf(spec).children.push({ t, children: [] })))
    refused(mutated((spec) => stackOf(spec).children.push({ slot: "x" })))
    refused(mutated((spec) => stackOf(spec).children.push("<b>texte</b>")))
    refused(mutated((spec) => stackOf(spec).children.push(null)))
  })

  test("version : inconnue, absente, en chaîne ou négative : refusée sans être interprétée", () => {
    for (const version of [2, 0, -1, "1", null, 1.5]) refused(mutated((spec) => (spec.specVersion = version)), "version")
    refused(mutated((spec) => delete spec.specVersion), "schema")
  })

  test("des entrées qui ne sont pas des specs : null, tableau, chaîne, nombre, JSON non sérialisable (BigInt, cycle)", () => {
    for (const input of [null, undefined, [], "texte", 42, true, {}, { specVersion: 1 }]) refused(input)
    refused({ ...clone(textSection), big: BigInt(10) }, "schema")
    const cyclic: Json = clone(textSection)
    cyclic.self = cyclic
    refused(cyclic, "schema")
  })

  test("texte libre là où un enum est attendu ; contenu dans la spec : aucun champ de contenu n'existe", () => {
    refused(mutated((spec) => (stackOf(spec).children[0].text = "Un titre")))
    refused(mutated((spec) => (stackOf(spec).children[0].value = "Un titre")))
    refused(mutated((spec) => (stackOf(spec).children[2].label = "Cliquez")))
    refused(mutated((spec) => (stackOf(spec).children[2].destination = "catalogue-formations")))
    refused(mutated((spec) => (stackOf(spec).children[0].content = "x")))
  })

  test("une spec invalide est rejetée ENTIÈRE et n'est jamais modifiée", () => {
    const input = mutated((spec) => ((stackOf(spec).children[1].slot = "titre"), (stackOf(spec).children[2].slot = "valeur-cle")))
    const before = JSON.stringify(input)
    const result = refused(input)
    assert.equal(!result.ok && result.issues.length, 2, "toutes les raisons sont rapportées")
    assert.equal(JSON.stringify(input), before)
  })
})

describe("V2.9.1 — frontières du module", () => {
  test("pas de HTML, pas de compilateur, pas de renderer, pas d'IA, pas de React : un vocabulaire pur", () => {
    const dir = "lib/email-builder/generated"
    for (const file of readdirSync(join(root, dir))) {
      const source = code(`${dir}/${file}`)
      assert.ok(!/from "react"|anthropic|renderer|renderEmail|compile|dangerouslySetInnerHTML|innerHTML|<table|<td|<div|<p /i.test(source), file)
      assert.ok(!/from "\.\.\/(composition|operations|assistant-|reference-|builder-state|document-ops)/.test(source), `${file} : aucune intégration`)
    }
    assert.ok(!/maxGeneratedBlocksPerEmail/.test(code(`${dir}/validate.ts`)), "la limite par email n'est pas une validation de lame")
  })

  test("policy : 3 lames générées au plus PAR EMAIL, exportée pour l'intégration ; elle ne concerne pas une spec seule", () => {
    assert.equal(maxGeneratedBlocksPerEmail, 3)
    for (const spec of [textSection, heroImageText, threeCards, bannerOverlapCard, itemGrid, statBanner]) ok(spec)
  })

  test("aucune intégration : le contrat des lames, le manifest et les documents ne connaissent pas « generated »", () => {
    assert.equal(Object.keys(emailBlockManifest).length, 36)
    assert.ok(!("generated" in emailBlockManifest))
    const config = { version: 1, id: "x", name: "X", subject: "S", preheader: "P", blocks: [{ id: "g", type: "generated", spec: textSection, slots: {} }] }
    assert.equal(safeParseEmailConfig(config).success, false)
    assert.ok(!/type:\s*"generated"|generated-block|GeneratedEmailBlock/.test(code("lib/email/schemas.ts") + code("lib/email/types.ts") + code("lib/email/manifest.ts")))
  })

  test("le vocabulaire vient du repo : écarts, espaceurs et rayons observés dans les templates", () => {
    const dir = join(root, "lib/email/templates")
    const html = readdirSync(dir).map((file) => readFileSync(join(dir, file), "utf8")).join("\n")
    for (const gap of stackGaps) assert.ok(new RegExp(`height="${gap}"`).test(html), `espaceur ${gap}`)
    for (const size of spacerSizes) assert.ok(new RegExp(`height="${size}"`).test(html), `espaceur ${size}`)
    for (const radius of radii.filter((value) => value > 0)) assert.ok(new RegExp(`border-radius:${radius}px`).test(html), `rayon ${radius}`)
    assert.deepEqual([...Object.keys(emailImageFormats)], [...availableImageFormats])
  })
})

describe("V2.9.2.1 — `inset` (padding contrôlé)", () => {
  const inset = (spec: Json) => spec.root.children[1] as Json
  const hero = () => clone(heroImageText) as Json

  test("valide : mêmes échelles que la section ; compté dans la profondeur et les nœuds ; aucun slot", () => {
    const result = ok(heroImageText)
    assert.deepEqual(result.slots.map((slot) => slot.name), ["image", "sur-titre", "titre", "texte", "cta"])
    assert.equal(result.stats.nodes, 7, "image + inset + stack + 3 textes + bouton")
    assert.equal(result.stats.depth, 3, "inset → stack → feuille")
    for (const x of sectionPaddingX) for (const y of sectionPaddingY) {
      const spec = hero()
      Object.assign(inset(spec), { padX: x, padY: y })
      ok(spec)
    }
  })

  test("refusés : enfants vides, trop nombreux ; padding hors vocabulaire ; clés inconnues ; champs de style", () => {
    const empty = hero()
    inset(empty).children = []
    refused(empty, "schema")
    const many = hero()
    inset(many).children = Array.from({ length: 9 }, (_, i) => ({ t: "spacer", size: 8 + 0 * i }))
    refused(many, "schema")
    for (const bad of [0.5, 41, -1, "40", "#fff", "calc(1px)", null, true, {}, []]) for (const key of ["padX", "padY"]) {
      const spec = hero()
      inset(spec)[key] = bad
      refused(spec, "schema")
    }
    for (const key of ["style", "className", "id", "href", "background", "backgroundColor", "radius", "border", "margin", "width", "height", "align", "gap", "fill", "slot", "position", "zIndex", "html"]) for (const value of ["<script>alert(1)</script>", "javascript:alert(1)", "#ff0000", "calc(100% - 20px)", "-12px", 12]) {
      const spec = hero()
      inset(spec)[key] = value
      refused(spec, "schema")
    }
    const missing = hero()
    delete inset(missing).padX
    refused(missing, "schema")
  })

  test("limites : l'inset consomme de la profondeur (4 niveaux au plus) et des nœuds (40 au plus)", () => {
    const nest = (insets: number) => {
      let node: Json = { t: "text", slot: "t", style: "body", align: "start", tone: "text" }
      for (let i = 0; i < insets; i += 1) node = { t: "inset", padX: 20, padY: 0, children: [node] }
      return { specVersion: 1, role: "text", root: { t: "section", padX: 0, padY: 0, children: [node] } }
    }
    assert.equal(ok(nest(3)).stats.depth, 4)
    refused(nest(4), "depth")
    const wide = (perInset: number) => ({ specVersion: 1, role: "text", root: { t: "section", padX: 0, padY: 0, children: Array.from({ length: 5 }, () => ({ t: "inset", padX: 20, padY: 0, children: Array.from({ length: perInset }, () => ({ t: "spacer", size: 8 })) })) } })
    assert.equal(ok(wide(7)).stats.nodes, 40)
    refused(wide(8), "nodes")
  })

  test("l'inset ne rend pas un slot réservé acceptable et ne contourne pas l'overlap : la règle suit dans les sous-arbres", () => {
    const spec = hero()
    inset(spec).children[0].children[1].slot = "valeur-cle"
    refused(spec, "slot-reserved")
    const lone = clone(bannerOverlapCard) as Json
    lone.root.children = [{ t: "inset", padX: 40, padY: 0, children: [lone.root.children[1]] }]
    refused(lone, "overlap")
  })

  test("capacités : l'inset n'ajoute aucune exigence (ni overlap, ni colonnes)", () => {
    assert.deepEqual(deriveGeneratedCapabilities(ok(heroImageText).spec), { usesOverlap: false, maxColumns: 1, imageFormats: ["large"] })
  })
})
