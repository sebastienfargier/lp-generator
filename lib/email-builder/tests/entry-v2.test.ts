/**
 * Builder Entry V2 : la porte d'entrée (trois chemins de même poids, de vrais emails rendus), l'écran des
 * modèles et l'enveloppe commune de la référence. Aucune logique produit ne change : ces tests le disent,
 * sans se coller aux classes Tailwind. Hors réseau.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { blankPreviewId, entryPreviewHtml, entryPreviewIds } from "../entry-previews"
import { createBlankDocument } from "../document"
import { createShell, shellReducer, type ShellAction } from "../shell-state"
import { builderTemplates } from "../templates"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
const shell = (...actions: ShellAction[]) => actions.reduce(shellReducer, createShell())
const entry = code("components/email-builder/entry-screen.tsx")
const card = code("components/email-builder/creation-path-card.tsx")
const thumb = code("components/email-builder/email-thumb.tsx")
const scenes = code("components/email-builder/entry-scenes.tsx")
const frame = code("components/email-builder/entry-frame.tsx")

describe("Entry V2 — trois chemins, une seule porte, aucune logique changée", () => {
  test("exactement trois chemins, dans l'ordre : zéro, modèle, référence ; chacun garde sa transition de shell", () => {
    const entryMode = entry.slice(entry.indexOf('label="Créer un email"'))
    assert.equal((entryMode.match(/<CreationPathCard/g) ?? []).length, 3)
    assert.ok(entryMode.indexOf('id="blank"') < entryMode.indexOf('id="templates"') && entryMode.indexOf('id="templates"') < entryMode.indexOf('id="reference"'))
    assert.equal(shell({ type: "choose-blank" }).screen, "builder")
    assert.equal(shell({ type: "choose-templates" }).screen, "templates")
    assert.equal(shell({ type: "choose-reference" }).screen, "reference")
    const opened = shell({ type: "choose-blank" })
    assert.deepEqual(opened.screen === "builder" && opened.document, createBlankDocument())
    const builder = code("components/email-builder/builder-shell.tsx")
    for (const piece of ['onBlank={() => dispatch({ type: "choose-blank" })}', 'onTemplates={() => dispatch({ type: "choose-templates" })}', 'onReference={() => dispatch({ type: "choose-reference" })}', "choose-template"]) assert.ok(builder.includes(piece), piece)
  })

  test("même hiérarchie : un seul composant de carte, un micro-CTA identique, aucune variante « principale » ni « recommandée »", () => {
    assert.ok(!/recommand|variant="default"|buttonVariants/.test(entry), "aucun bouton principal ni recommandation")
    assert.ok(!/<Button/.test(entry.slice(entry.indexOf('id="blank"'))), "les chemins ne sont pas des boutons du design system : le seul CTA est celui de la carte")
    assert.ok(!/recommand/i.test(entry + card + scenes))
    assert.equal((card.match(/<button/g) ?? []).length, 1, "un seul élément interactif par carte")
  })

  test("copy principale ; pas de quatrième entrée, de questionnaire ni de prompt libre", () => {
    const raw = read("components/email-builder/entry-screen.tsx")
    for (const text of ["Créons ton prochain email.", "Pars d&apos;une page blanche, d&apos;un modèle Studi ou d&apos;une inspiration.", "Créer depuis une référence", "Importer une capture"]) assert.ok(raw.includes(text), text)
    assert.ok(!/<form|<input|<textarea|\bIA\b|prompt|wizard|onboarding/i.test(entry))
  })

  test("modèles : exactement les 6 d'avant, mêmes identifiants ; l'écran Modèles garde sa logique (un clic = ce modèle)", () => {
    assert.deepEqual(builderTemplates().map((template) => template.id), ["R1-A", "R1-B", "R2-A", "R2-B", "R3-A", "R3-B"])
    assert.match(entry, /onSelect=\{\(\) => onTemplate\(template\)\}/)
    const template = builderTemplates()[0]!
    assert.equal(shell({ type: "choose-templates" }, { type: "choose-template", document: template.document }).screen, "builder")
    assert.equal(shell({ type: "choose-templates" }, { type: "back" }).screen, "entry")
    assert.ok(!/filtre|recherche|catégor|search|filter/i.test(entry))
  })

  test("la page n'injecte aucun rendu : les aperçus sont servis par leur route", () => {
    const page = code("app/email-builder/[assetId]/page.tsx")
    assert.match(page, /<BuilderShell\s+lames=\{builderLames\(\)\}\s+templates=\{builderTemplates\(\)\}/)
    assert.ok(!/renderCanvasHtml|renderDocumentEmail|entryPreviewHtml/.test(page))
  })
})

describe("Entry V2 — aperçus : de vrais emails, en nombre borné", () => {
  test("les identifiants servis : « blank » et les 6 modèles, rien d'autre (jamais les 36 lames)", () => {
    const ids = entryPreviewIds()
    assert.deepEqual(ids, [blankPreviewId, "R1-A", "R1-B", "R2-A", "R2-B", "R3-A", "R3-B"])
    assert.ok(ids.length < 36 && ids.length === 7)
  })

  test("chaque identifiant servi donne un document HTML complet rendu par le renderer ; un identifiant inconnu n'en donne pas", () => {
    for (const id of entryPreviewIds()) {
      const html = entryPreviewHtml(id)
      assert.ok(html && /^<!DOCTYPE html>/i.test(html) && html.includes('class="lame"') && html.includes("<table"), id)
      assert.ok(!html!.includes("data-slot") && !html!.includes("builder-block"), "ni marqueur du Builder, ni attribut interne")
    }
    for (const id of ["inconnu", "", "R9-Z", "../etc/passwd", "email-module-text-only", "R1-A/../R1-B", "BLANK"]) assert.equal(entryPreviewHtml(id), null, id)
  })

  test("la scène « zéro » est un email partiellement construit fait de lames RÉELLES d'un modèle (header + deux lames), pas un faux dessin", () => {
    const html = entryPreviewHtml(blankPreviewId)!
    assert.equal((html.match(/class="lame"/g) ?? []).length, 3)
    assert.ok(!html.includes("[URL_DESABONNEMENT]"), "pas de footer : l'email est en construction")
  })

  test("les aperçus suivent les modèles : ils sont calculés depuis builderTemplates, jamais recopiés", () => {
    const source = code("lib/email-builder/entry-previews.ts")
    assert.match(source, /builderTemplates\(\)/)
    assert.match(source, /renderDocumentEmail/)
    assert.match(source, /toPreviewHtml/)
    assert.ok(!/<table|<td|<div|\.png|\.jpg/.test(source), "aucun HTML ni capture dans le helper")
  })

  test("la route : protégée par la session HCC (rendue à la demande), id inconnu → 404, ensemble borné aux identifiants servis", () => {
    const route = code("app/email-builder/preview/[id]/route.ts")
    assert.match(route, /dynamic = "force-dynamic"/)
    assert.match(route, /guardRequest\(request\)/)
    assert.match(route, /status: 404/)
    assert.match(route, /entryPreviewHtml\(id\)/)
  })

  test("les scènes ne citent que des modèles qui existent ; deux documents DIFFÉRENTS pour la référence (inspiration ≠ sortie)", () => {
    const known = new Set(builderTemplates().map((template) => template.id))
    for (const id of ["R1-A", "R2-A", "R3-A"]) assert.ok(known.has(id), id)
    assert.match(scenes, /referenceSourceId = "R2-A"/)
    assert.match(scenes, /referenceResultId = "R1-A"/)
    assert.notEqual("R2-A", "R1-A")
    const references = (scenes.match(/previewSrc\(/g) ?? []).length
    assert.ok(references <= 8, "les scènes d'entrée restent légères")
    // 4 documents distincts sur l'écran d'entrée au plus : blank + R1-A, R2-A, R3-A
    const distinct = new Set(['"blank"', ...["R1-A", "R2-A", "R3-A"].map((id) => `"${id}"`)])
    assert.equal(distinct.size, 4)
  })

  test("aucune capture statique : pas d'image de modèle dans public/, aucun asset ajouté par les scènes", () => {
    assert.ok(!/\.(png|jpe?g|webp|svg)["'`]/.test(scenes + card + frame + entry), "aucune image référencée par les scènes")
    assert.ok(!/<img|next\/image|background-image:\s*url|url\(/.test(scenes + card + frame + thumb + entry))
  })
})

describe("Entry V2 — accessibilité et mouvement (structure, pas de classes)", () => {
  test("toute la carte est activable par UN seul bouton étendu ; la scène est décorative, inerte, hors de l'arbre d'accessibilité", () => {
    assert.match(card, /after:absolute after:inset-0/)
    assert.match(card, /<div aria-hidden inert/)
    assert.match(card, /<h2 className="text-h2">\{title\}<\/h2>/)
    // la scène n'est pas dans le bouton : une iframe est un contenu interactif
    const button = card.slice(card.indexOf("<button"), card.indexOf("</button>"))
    assert.ok(!/stage|iframe|EmailThumb/.test(button))
  })

  test("plan de titres : un h1 par écran, un h2 par chemin", () => {
    assert.equal((entry.match(/<h1/g) ?? []).length, 2, "un h1 pour l'entrée, un pour les modèles")
    assert.equal((card.match(/<h2/g) ?? []).length, 1)
  })

  test("miniature : iframe isolée, non focusable, sans clic, sans scripts ; le cadre réserve sa place (aucun saut de mise en page)", () => {
    assert.match(thumb, /sandbox="allow-same-origin"/)
    assert.ok(!/allow-scripts/.test(thumb))
    assert.match(thumb, /tabIndex=\{-1\}/)
    assert.match(thumb, /pointer-events-none/)
    assert.match(thumb, /aria-hidden inert/)
    assert.match(thumb, /aspectRatio/)
    assert.match(thumb, /loading=\{lazy \? "lazy" : "eager"\}/)
    assert.match(thumb, /referrerPolicy="no-referrer"/)
  })

  test("prefers-reduced-motion : tout mouvement au survol passe par `motion-safe:` ; aucune animation permanente", () => {
    for (const source of [card, scenes]) {
      const hovers = source.match(/[\w:-]*group-hover:[\w.[\]%-]+/g) ?? []
      assert.ok(hovers.length > 0)
      for (const hover of hovers) assert.ok(/^motion-safe:/.test(hover) || /group-hover:(shadow|ring)/.test(hover), hover)
    }
    assert.match(card, /motion-reduce:transition-none/)
    assert.ok(!/animate-|@keyframes|animation/.test(card + scenes + thumb + frame + entry))
  })

  test("l'enveloppe commune : atmosphère décorative (aria-hidden, sans capture de souris, sans image), header de 48 px aligné sur le contenu", () => {
    assert.match(frame, /aria-hidden/)
    assert.match(frame, /pointer-events-none/)
    assert.match(frame, /h-12/)
    assert.match(frame, /brand-green-soft/)
    assert.match(frame, /accent-1/)
    assert.ok(!/<img|url\(|blur-|filter/.test(frame))
    assert.match(frame, /maxWidth = "max-w-6xl"/)
  })
})

describe("Entry V2 — la référence garde sa logique, dans la même enveloppe", () => {
  test("ReferenceScreen utilise EntryFrame ; dropzone, import, analyse, verrou et erreurs sont intacts", () => {
    const source = code("components/email-builder/reference-screen.tsx")
    assert.match(source, /<EntryFrame/)
    assert.match(source, /maxWidth="max-w-2xl"/)
    for (const piece of ["Glisse une capture ici", "Choisir un fichier", "Analyser et créer", "/api/email-builder/reference", "const busy = useRef(false)", "onDrop", "prepareReferenceImage"]) assert.ok(read("components/email-builder/reference-screen.tsx").includes(piece), piece)
    assert.ok(!/<EmailThumb|entry-scenes/.test(source), "la dropzone n'est pas redessinée")
  })

  test("le Builder, le canvas, l'assistant et le domaine ne dépendent pas de ces écrans", () => {
    for (const path of ["builder-workspace", "builder-canvas", "assistant-panel", "builder-topbar"]) assert.ok(!/entry-frame|entry-scenes|creation-path-card|email-thumb/.test(code(`components/email-builder/${path}.tsx`)), path)
    for (const path of ["lib/email/renderer.ts", "lib/email-builder/document.ts", "lib/email-builder/operations.ts", "lib/email-builder/shell-state.ts"]) assert.ok(!/entry-previews/.test(code(path)), path)
  })

  test("aucune nouvelle dépendance d'animation, de rendu ou de capture", () => {
    const manifest = read("package.json")
    for (const name of ["framer-motion", "motion", "gsap", "lottie", "react-spring", "three", "swiper", "html2canvas", "puppeteer", "playwright", "satori", "sharp"]) assert.ok(!new RegExp(`"${name}"`).test(manifest), name)
  })
})

/**
 * Le comportement RÉEL de la carte : le composant est rendu (react-dom/server), puis relu comme un arbre
 * d'accessibilité minimal (parse5). Aucune dépendance ajoutée : `typescript` transpile le .tsx au chargement.
 */
describe("Entry V2 — nom accessible des cartes (rendu réel)", () => {
  type Parsed = import("parse5").DefaultTreeAdapterTypes.Element
  const walk = (node: { childNodes?: unknown[] }, visit: (element: Parsed) => void) => {
    for (const child of node.childNodes ?? []) {
      if (child && typeof child === "object" && "tagName" in child) {
        visit(child as Parsed)
        walk(child as { childNodes?: unknown[] }, visit)
      }
    }
  }
  const attr = (element: Parsed, name: string) => element.attrs.find((entry) => entry.name === name)?.value
  const textOf = (node: { childNodes?: unknown[] }): string => (node.childNodes ?? []).map((child) => (child && typeof child === "object" && "value" in child ? String((child as { value: string }).value) : textOf(child as { childNodes?: unknown[] }))).join("")

  const render = async (props: { id: string; title: string; description: string; cta: string }) => {
    const ts = (await import("typescript")).default
    type LoadHook = (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown
    const { registerHooks } = (await import("node:module")) as unknown as { registerHooks: (hooks: { load: LoadHook }) => { deregister: () => void } }
    const hooks = registerHooks({
      load(url, context, next) {
        if (url.startsWith("file:") && url.includes("creation-path-card.tsx")) {
          const source = ts.transpileModule(readFileSync(new URL(url.split("?")[0]!), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
          return { format: "module", source, shortCircuit: true } as unknown
        }
        return next(url, context)
      },
    })
    try {
      const { CreationPathCard } = (await import(`../../../components/email-builder/creation-path-card.tsx?v=${props.id}`)) as { CreationPathCard: (props: unknown) => unknown }
      const React = await import("react")
      const { renderToStaticMarkup } = await import("react-dom/server")
      // Une scène qui ressemble à la vraie : une iframe, comme dans EmailThumb.
      const stage = React.createElement("iframe", { src: "/email-builder/preview/blank", tabIndex: -1, title: "" })
      return renderToStaticMarkup(React.createElement(CreationPathCard as never, { ...props, stage, stageClass: "bg-neutral-100", onSelect: () => {} }))
    } finally {
      hooks.deregister()
    }
  }

  const titles = [...entry.matchAll(/title=(?:"([^"]+)"|\{template\.title\})/g)].map((match) => match[1]).filter((title): title is string => !!title)
  const paths = [
    { id: "blank", title: "Partir de zéro", description: "Assemble ton email lame par lame.", cta: "Commencer" },
    { id: "templates", title: "Partir d'un modèle", description: "Une base Studi que tu modifies librement.", cta: "Voir les modèles" },
    { id: "reference", title: "Créer depuis une référence", description: "Importe une inspiration, nous l'adaptons à Studi.", cta: "Importer une capture" },
  ]

  test("les trois titres de l'écran d'entrée sont ceux du contrat", () => {
    assert.deepEqual(titles.slice(0, 3), paths.map((path) => path.title))
  })

  for (const path of paths) {
    test(`« ${path.title} » : un seul contrôle, nommé par son titre ; CTA visuel, h2 et description présents ; aucune iframe focusable`, async () => {
      const { parseFragment } = await import("parse5")
      const fragment = parseFragment(await render(path))
      const buttons: Parsed[] = []
      const frames: Parsed[] = []
      const headings: Parsed[] = []
      const interactive: Parsed[] = []
      let described: Parsed | undefined
      walk(fragment, (element) => {
        if (element.tagName === "button") buttons.push(element)
        if (element.tagName === "iframe") frames.push(element)
        if (element.tagName === "h2") headings.push(element)
        if (["button", "a", "input", "select", "textarea", "iframe"].includes(element.tagName) || attr(element, "tabindex") === "0") interactive.push(element)
        if (attr(element, "id") === `${path.id}-description`) described = element
      })
      // rôle interactif : un seul bouton, c'est la seule action clavier de la carte
      assert.equal(buttons.length, 1)
      assert.equal(attr(buttons[0]!, "type"), "button")
      const focusable = interactive.filter((element) => attr(element, "tabindex") !== "-1")
      assert.deepEqual(focusable.map((element) => element.tagName), ["button"], "une seule action clavier par carte")
      // nom accessible : le titre (aria-label), pas le micro-CTA
      assert.equal(attr(buttons[0]!, "aria-label"), path.title)
      assert.ok(!attr(buttons[0]!, "aria-labelledby"))
      // le CTA reste visible, le h2 reste le titre visuel, la description est reliée
      assert.equal(textOf(buttons[0]!).trim(), path.cta)
      assert.equal(headings.length, 1)
      assert.equal(textOf(headings[0]!).trim(), path.title)
      assert.equal(attr(buttons[0]!, "aria-describedby"), `${path.id}-description`)
      assert.equal(textOf(described!).trim(), path.description)
      // les iframes ne sont jamais focusables et leur scène est cachée aux technologies d'assistance
      assert.ok(frames.length > 0 && frames.every((frame) => attr(frame, "tabindex") === "-1"))
      let hiddenStage = false
      walk(fragment, (element) => {
        if (attr(element, "aria-hidden") === "true" && attr(element, "inert") !== undefined && element.tagName === "div") walk(element, (inner) => void (inner.tagName === "iframe" && (hiddenStage = true)))
      })
      assert.ok(hiddenStage, "la scène (aria-hidden + inert) contient les iframes")
    })
  }
})
