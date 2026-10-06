/**
 * Garde-fous de l'interface du Builder (V2.2). Le dépôt n'a pas de bibliothèque
 * de test DOM : comme pour l'Email Generator, l'interface est testée par son
 * état pur (`builder-state.test.ts`) et par la lecture de ses sources pour les
 * règles qui ne tiennent qu'à leur écriture : le document reste la source de
 * vérité, le renderer reste le seul rendu, aucun modèle n'est appelé, les
 * contrôles sont nommés et accessibles, le POC n'est pas touché.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const components = ["builder-workspace", "builder-topbar", "builder-canvas", "block-toolbar", "lame-library-panel", "assistant-panel"]
const files = [...components.map((name) => `components/email-builder/${name}.tsx`), "app/email-builder/page.tsx"]

describe("Builder — structure et frontières", () => {
  test("nouvel espace /email-builder, API de rendu dédiée ; l'ancien Email Generator est intact et ne connaît pas le Builder", () => {
    for (const path of [...files, "app/api/email-builder/render/route.ts"]) assert.ok(existsSync(join(root, path)), path)
    for (const path of ["app/email-generator/page.tsx", "components/email/email-workspace.tsx", "components/email/email-preview.tsx", "lib/email/generate-handler.ts", "lib/email/index.ts"]) {
      assert.ok(!/email-builder/.test(read(path)), `${path} ne doit pas connaître le Builder`)
    }
  })

  test("le Builder ne réutilise pas l'architecture email-workspace (formulaire, chat, éditeur de versions)", () => {
    for (const path of files) assert.ok(!/email-workspace|editor-state|generator-state|generator-form|edit-client|postEmailEdit/.test(code(path)), path)
  })

  test("aucun appel de modèle, aucun fournisseur, aucune persistance, aucun HTML injecté", () => {
    for (const path of files) {
      const source = code(path)
      assert.ok(!/anthropic|claude|messages\.create|localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML|innerHTML/i.test(source), path)
    }
  })

  test("le seul appel réseau du Builder est le rendu du canvas", () => {
    const calls = files.flatMap((path) => [...code(path).matchAll(/fetch\(\s*([^,)]+)/g)].map((match) => match[1]!.trim()))
    assert.deepEqual(calls, ['"/api/email-builder/render"'])
  })

  test("le rendu vient du renderer serveur : aucun composant n'importe le renderer, ne lit un fichier, ni ne recrée une lame en JSX", () => {
    for (const path of files.filter((entry) => entry.startsWith("components/"))) {
      const source = code(path)
      assert.ok(!/lib\/email\/renderer|node:fs|renderEmail|toPreviewHtml/.test(source), path)
      assert.ok(!/data-slot|email-module-/.test(source), `${path} ne recrée aucune lame`)
    }
    assert.match(code("app/email-builder/page.tsx"), /renderCanvasHtml/)
  })
})

describe("Builder — le document reste la source de vérité", () => {
  const workspace = code("components/email-builder/builder-workspace.tsx")

  test("l'état est le reducer du Builder ; chaque geste est une opération nommée du modèle V2.1", () => {
    assert.match(workspace, /useReducer\(builderReducer/)
    for (const type of ["add-block", "remove-block", "move-block", "set-surface"]) assert.match(workspace, new RegExp(`type: "${type}"`), type)
  })

  test("aucune manipulation directe du tableau de lames dans l'interface", () => {
    for (const path of files) {
      assert.ok(!/\.blocks\s*(=[^=]|\.(splice|push|pop|shift|unshift|sort|reverse|fill)\()|\.config\.blocks\s*=|\bsetDocument\b/.test(code(path)), path)
    }
  })

  test("Annuler / Rétablir : boutons nommés reflétant canUndo / canRedo, et raccourcis Ctrl/Cmd+Z", () => {
    assert.match(workspace, /canUndo=\{builderCanUndo\(state\)\}/)
    assert.match(workspace, /canRedo=\{builderCanRedo\(state\)\}/)
    assert.match(workspace, /metaKey \|\| event\.ctrlKey/)
    const topbar = code("components/email-builder/builder-topbar.tsx")
    assert.match(topbar, /aria-label="Annuler"[^>]*disabled=\{!canUndo\}/)
    assert.match(topbar, /aria-label="Rétablir"[^>]*disabled=\{!canRedo\}/)
  })

  test("le rendu affiché est celui du serveur pour le document courant ; les rendus déjà vus sont réutilisés (annuler sans appel)", () => {
    assert.match(workspace, /renders\[key\]/)
    assert.match(workspace, /if \(renders\[key\] !== undefined\) return/)
  })
})

describe("Builder — canvas", () => {
  const canvas = code("components/email-builder/builder-canvas.tsx")

  test("l'email est dans une iframe isolée, sans script ; le document de l'iframe n'est lu que pour mesurer", () => {
    assert.match(canvas, /sandbox="allow-same-origin"/)
    assert.ok(!/allow-scripts|allow-top-navigation|allow-popups/.test(canvas))
    assert.match(canvas, /builder-block:/)
    assert.ok(!/contentDocument[^;\n]*(\.write|\.open|innerHTML|appendChild|insertBefore|setAttribute|\.style)/.test(canvas), "le document de l'iframe n'est jamais modifié")
  })

  test("survol, sélection et « + » entre deux lames", () => {
    assert.match(canvas, /group-hover\/block/)
    assert.match(canvas, /aria-pressed=\{selected\}/)
    assert.match(canvas, /Ajouter une lame (au début|à la fin|entre)/)
    assert.match(canvas, /onInsert/)
  })

  test("le canvas ne se fie pas à un HTML périmé : contrôles inactifs pendant un nouveau rendu", () => {
    assert.match(canvas, /interactive \? [^:]*: "pointer-events-none/)
  })
})

describe("Builder — accessibilité et interactions", () => {
  test("tout bouton icône est nommé ; chaque action de lame est un vrai bouton au clavier (aucune action réservée au survol)", () => {
    for (const path of files.filter((entry) => entry.endsWith(".tsx"))) {
      const source = code(path)
      for (const tag of source.match(/<(?:Button|DropdownMenuTrigger)\b[^>]*size="icon[^>]*>/g) ?? []) assert.match(tag, /aria-label=/, `${path} : ${tag.slice(0, 80)}`)
    }
    const toolbar = code("components/email-builder/block-toolbar.tsx")
    for (const label of ["Monter la lame", "Descendre la lame", "Changer la surface de la lame", "Plus d'actions sur la lame"]) assert.match(toolbar, new RegExp(label))
    assert.match(toolbar, /Supprimer la lame/)
    assert.ok(!/group-hover|hover:opacity|opacity-0/.test(toolbar), "la barre d'actions ne dépend pas du survol")
    assert.match(code("components/email-builder/builder-topbar.tsx"), /Ajouter une lame/)
  })

  test("focus visible sur les zones de lame, Échap ferme la bibliothèque puis la sélection", () => {
    assert.match(code("components/email-builder/builder-canvas.tsx"), /focus-visible:outline/)
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /event\.key === "Escape"/)
    assert.match(workspace, /close-library/)
  })

  test("la suppression n'a pas de modale : un seul geste, annulable", () => {
    for (const path of files) assert.ok(!/<Dialog|<AlertDialog|window\.confirm|confirm\(/.test(code(path)), path)
  })

  test("retours : régions annoncées (status / alert), fermables", () => {
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /role=\{renderError \|\| notice\?\.tone === "error" \? "alert" : "status"\}/)
    assert.match(workspace, /aria-label="Fermer ce message"/)
  })
})

describe("Builder — bibliothèque et assistant", () => {
  test("la bibliothèque est contextuelle et rétractable ; les aperçus sont ceux de la bibliothèque existante ; le contenu est dit provisoire", () => {
    const library = code("components/email-builder/lame-library-panel.tsx")
    assert.match(library, /EmailLameFrame/)
    assert.match(library, /\/email-library\/preview\//)
    assert.match(library, /Fermer la bibliothèque/)
    assert.match(read("components/email-builder/lame-library-panel.tsx"), /exemple provisoire/)
    assert.match(code("components/email-builder/builder-workspace.tsx"), /\{state\.library && \(/)
  })

  test("l'assistant est un emplacement : aucun état, aucun appel, repliable, masqué sous 1280 px", () => {
    const raw = read("components/email-builder/assistant-panel.tsx")
    const assistant = code("components/email-builder/assistant-panel.tsx")
    assert.ok(!/"use client"|useState|useEffect|fetch/.test(assistant))
    assert.match(raw, /Bientôt disponible/)
    assert.match(assistant, /Replier l'assistant/)
    assert.match(assistant, /hidden[^"]*xl:flex/)
  })
})
