/**
 * V2.6 : la vraie entrée du Builder et la création de zéro. Hors React : le
 * shell et le Builder sont des états purs ; l'interface est testée par la
 * lecture de ses sources pour ce qui tient à leur écriture (comme les autres
 * suites). Aucun réseau, aucun appel de modèle.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import { renderEmailFromUnknown } from "../../email/renderer"
import { emailRecipeFixtures } from "../../email/recipe-fixtures"
import { safeParseEmailConfig, safeParseEmailConfigBuilder, safeParseEmailConfigStructure } from "../../email/schemas"
import { handleAssistant } from "../assistant-handler"
import { builderCanRedo, builderCanUndo, builderDocument, builderHasWork, builderIsEmpty, builderReducer, createBuilderState, type BuilderAction, type BuilderState } from "../builder-state"
import { renderCanvasHtml } from "../canvas"
import { builderLames } from "../catalog"
import { buildDemoDocument } from "../demo-document"
import { createBlankDocument, isEmptyDocument } from "../document"
import { validateDocumentIntegrity } from "../integrity"
import type { DocumentOperation } from "../operations"
import { getDocumentRecommendations } from "../recommendations"
import { handleBuilderRender } from "../render-handler"
import { createShell, shellReducer, type ShellAction } from "../shell-state"
import { builderTemplates } from "../templates"

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")

const starter = (type: string) => builderLames().find((lame) => lame.type === type)!.starter!
const add = (type: string, index?: number): DocumentOperation => ({ type: "add-block", blockType: type, slots: starter(type), ...(index === undefined ? {} : { index }) }) as DocumentOperation
const run = (state: BuilderState, ...actions: BuilderAction[]) => actions.reduce(builderReducer, state)
const operate = (state: BuilderState, operation: DocumentOperation) => builderReducer(state, { type: "operation", operation })
const ids = (state: BuilderState) => builderDocument(state).config.blocks.map((block) => block.id)
const shell = (...actions: ShellAction[]) => actions.reduce(shellReducer, createShell())
const blank = () => createBuilderState(createBlankDocument())
const firstLame = "email-module-hero-promotional-image-large"
const withLame = () => operate(blank(), add(firstLame))

describe("V2.6 — état d'entrée : aucun email ouvert", () => {
  test("ouvrir /email-builder n'ouvre AUCUN document : l'entrée, jamais l'email de démonstration", () => {
    const initial = createShell()
    assert.equal(initial.screen, "entry")
    assert.ok(!("document" in initial))
    const page = code("app/email-builder/page.tsx")
    assert.match(page, /BuilderShell/)
    assert.ok(!/demo-document|buildDemoDocument|renderCanvasHtml|BuilderWorkspace/.test(page), "la page n'injecte ni la démo ni un rendu")
    for (const path of ["builder-shell", "entry-screen", "builder-workspace", "builder-topbar", "empty-canvas", "restart-button"]) assert.ok(!/demo-document|buildDemoDocument/.test(code(`components/email-builder/${path}.tsx`)), path)
  })

  test("la démonstration reste une fixture de développement et de test (valide, non vide), découplée de l'expérience", () => {
    const demo = buildDemoDocument()
    assert.deepEqual(validateDocumentIntegrity(demo), [])
    assert.ok(!isEmptyDocument(demo))
  })

  test("trois choix : partir de zéro, partir d'un modèle ; la référence est visible mais NON activable (aucun upload, aucun champ, aucun appel)", () => {
    const screen = code("components/email-builder/entry-screen.tsx")
    const raw = read("components/email-builder/entry-screen.tsx")
    for (const label of ["Partir de zéro", "Partir d&apos;un modèle", "Depuis une référence", "Construire mon email lame par lame", "Utiliser une base Studi existante", "Créer à partir d&apos;une inspiration", "Comment veux-tu commencer"]) assert.ok(raw.includes(label), label)
    assert.match(raw, /Bientôt disponible/)
    assert.match(screen, /<button type="button" disabled aria-describedby="reference-soon"/)
    assert.ok(!/<input|type="file"|type="url"|fetch\(|onReference|anthropic/i.test(screen), "pas de faux upload, pas de champ URL, pas d'appel")
  })

  test("responsive : les trois choix s'empilent sur petit écran", () => {
    const screen = code("components/email-builder/entry-screen.tsx")
    assert.match(screen, /grid-cols-1 gap-4 md:grid-cols-3/)
    assert.match(screen, /grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3/)
  })

  test("transitions du shell : entrée → modèles → retour ; seules les transitions valides agissent", () => {
    assert.equal(shell({ type: "choose-templates" }).screen, "templates")
    assert.equal(shell({ type: "choose-templates" }, { type: "back" }).screen, "entry")
    const template = builderTemplates()[0]!
    // ni modèle sans l'écran des modèles, ni retour ou recommencer sans rien à quitter
    assert.equal(shell({ type: "choose-template", document: template.document }).screen, "entry")
    assert.equal(shell({ type: "back" }).screen, "entry")
    assert.equal(shell({ type: "restart" }).screen, "entry")
    assert.equal(shell({ type: "choose-blank" }, { type: "choose-blank" }).opened, 1)
  })
})

describe("V2.6 — partir de zéro : un vrai document vide", () => {
  test("choisir « Partir de zéro » ouvre un EmailDocument vide valide, sans lame, sans démo, nommé « Nouvel email »", () => {
    const opened = shell({ type: "choose-blank" })
    assert.equal(opened.screen, "builder")
    const document = opened.screen === "builder" ? opened.document : undefined
    assert.ok(document && isEmptyDocument(document))
    assert.deepEqual(document.config.blocks, [])
    assert.deepEqual(document.blockMeta, {})
    assert.equal(document.config.name, "Nouvel email")
    assert.deepEqual(document.provenance, { origin: "manual" })
    assert.deepEqual(validateDocumentIntegrity(document), [])
  })

  test("un email ouvert mais vide est différent d'aucun email ouvert : deux états du shell, EmailDocument n'est jamais détourné", () => {
    const none = createShell()
    const empty = shell({ type: "choose-blank" })
    assert.notEqual(none.screen, empty.screen)
    assert.ok(!("document" in none) && "document" in empty)
    assert.match(code("lib/email-builder/shell-state.ts"), /screen: "entry"/)
  })

  test("l'initialisation n'est pas une opération : le travail commence avec un historique vierge", () => {
    const state = blank()
    assert.equal(state.history.past.length, 0)
    assert.equal(builderCanUndo(state), false)
    assert.equal(builderCanRedo(state), false)
    assert.equal(state.status, "draft")
    assert.equal(state.versions.length, 0)
  })

  test("le contrat historique du POC reste strict ; seul le contrat du Builder accepte zéro lame", () => {
    const empty = createBlankDocument().config
    assert.equal(safeParseEmailConfigBuilder(empty).success, true)
    assert.equal(safeParseEmailConfigStructure(empty).success, false)
    assert.equal(safeParseEmailConfig(empty).success, false)
    assert.throws(() => renderEmailFromUnknown(empty), { name: "ZodError" })
    // les autres exigences techniques restent celles du Builder : un identifiant en double est toujours refusé
    const doc = buildDemoDocument().config
    const duplicate = { ...doc, blocks: [doc.blocks[0]!, doc.blocks[0]!] }
    assert.equal(safeParseEmailConfigBuilder(duplicate).success, false)
    assert.equal(safeParseEmailConfigBuilder({ ...empty, subject: "  " }).success, false)
  })

  test("un email vide ne s'exporte ni ne se rend : le renderer n'est pas appelé, l'API de rendu refuse sans le rendre", async () => {
    const response = await handleBuilderRender(new Request("http://localhost/api/email-builder/render", { method: "POST", body: JSON.stringify({ document: createBlankDocument() }) }))
    assert.equal(response.status, 422)
    const body = (await response.json()) as { status: string; issues: { message: string }[] }
    assert.equal(body.status, "error")
    assert.match(body.issues[0]!.message, /sans lame/)
    const workspace = code("components/email-builder/builder-workspace.tsx")
    assert.match(workspace, /if \(shownEmpty \|\| renders\[key\] !== undefined\) return/)
    assert.match(workspace, /<EmptyCanvas onAddFirst=/)
    assert.ok(!/renderCanvasHtml|renderEmail/.test(workspace))
    assert.ok(!/export-html|exportEmail|buildExportableEmailHtml/.test([code("components/email-builder/builder-topbar.tsx"), workspace].join("")), "aucun export dans le Builder")
  })

  test("un email vide n'a pas de faux problème : aucune recommandation ne l'accuse d'autre chose que de n'avoir pas de footer", () => {
    assert.deepEqual(getDocumentRecommendations(createBlankDocument()).map((entry) => entry.code), ["layout-footer-missing"])
  })

  test("l'état vide du canvas : « Ton email est vide » et l'action « Ajouter une première lame »", () => {
    const raw = read("components/email-builder/empty-canvas.tsx")
    assert.match(raw, /Ton email est vide/)
    assert.match(raw, /Commence par choisir une lame dans la bibliothèque/)
    assert.match(raw, /Ajouter une première lame/)
    assert.ok(!/<iframe|srcDoc/.test(raw), "pas d'iframe vide")
  })
})

describe("V2.6 — première et dernière lame", () => {
  test("« Ajouter une première lame » ouvre la bibliothèque existante ; la lame choisie devient la première ; le Builder reprend son fonctionnement normal", () => {
    let state = run(blank(), { type: "open-library" })
    assert.deepEqual(state.panel, { kind: "library" })
    assert.match(code("components/email-builder/builder-workspace.tsx"), /onAddFirst=\{\(\) => dispatch\(\{ type: "open-library" \}\)\}/)
    state = operate(state, add(firstLame))
    assert.deepEqual(ids(state), [firstLame])
    assert.equal(builderIsEmpty(state), false)
    assert.equal(state.panel, null)
    assert.deepEqual(state.selection, { kind: "block", blockId: firstLame })
    assert.equal(builderDocument(state).blockMeta[firstLame]?.origin, "builder")
    assert.deepEqual(validateDocumentIntegrity(builderDocument(state)), [])
    const html = renderCanvasHtml(builderDocument(state))
    assert.ok(html.includes(`<!--builder-block:${firstLame}-->`), "le rendu normal s'applique dès la première lame")
    // la suite : édition, ajout entre les lames, déplacement, surface, suppression
    state = operate(state, add("email-module-text-and-cta-variant-01"))
    assert.equal(ids(state).length, 2)
    state = operate(state, { type: "move-block", blockId: ids(state)[1]!, toIndex: 0 })
    assert.equal(ids(state)[1], firstLame)
  })

  test("la bibliothèque est la même qu'avant : aucune lame créée, aucune lame retirée", () => {
    const lames = builderLames()
    assert.equal(lames.filter((lame) => lame.starter).length, 31)
    assert.match(code("components/email-builder/builder-workspace.tsx"), /<LameLibraryPanel/)
    assert.equal([...code("components/email-builder/builder-workspace.tsx").matchAll(/<LameLibraryPanel/g)].length, 1, "aucun second mécanisme d'ajout")
  })

  test("ajouter la première lame est une opération : Undo revient à zéro lame, Redo restaure la lame", () => {
    let state = withLame()
    assert.equal(state.history.past.length, 1)
    assert.equal(builderCanUndo(state), true)
    state = run(state, { type: "undo" })
    assert.ok(builderIsEmpty(state))
    assert.equal(builderCanUndo(state), false)
    assert.equal(builderCanRedo(state), true)
    state = run(state, { type: "redo" })
    assert.deepEqual(ids(state), [firstLame])
  })

  test("supprimer la dernière lame : retour à l'état vide sans erreur ; Undo la restaure", () => {
    let state = withLame()
    state = operate(state, { type: "remove-block", blockId: firstLame })
    assert.ok(builderIsEmpty(state))
    assert.equal(state.notice?.tone === "error", false)
    assert.deepEqual(state.selection, { kind: "none" })
    assert.deepEqual(validateDocumentIntegrity(builderDocument(state)), [])
    state = run(state, { type: "undo" })
    assert.deepEqual(ids(state), [firstLame])
    assert.equal(builderIsEmpty(state), false)
  })
})

describe("V2.6 — assistant, versions et statut à zéro lame", () => {
  test("assistant : aucun message n'est pris en compte à zéro lame ; disponible dès la première lame ; l'interface le dit discrètement", async () => {
    const empty = run(blank(), { type: "assistant-send", text: "Bonjour" })
    assert.equal(empty.assistant.pending, false)
    assert.equal(empty.assistant.messages.length, 0)
    const ready = run(withLame(), { type: "assistant-send", text: "Bonjour" })
    assert.equal(ready.assistant.pending, true)
    const panel = read("components/email-builder/assistant-panel.tsx")
    assert.match(panel, /Ajoute une première lame pour utiliser l&apos;assistant/)
    assert.match(panel, /disabled=\{idle\}/)
    assert.match(code("components/email-builder/builder-workspace.tsx"), /empty \|\| text\.trim\(\) === ""/)
  })

  test("l'API de l'assistant refuse un email vide sans aucun appel du moteur ni du modèle", async () => {
    let calls = 0
    const response = await handleAssistant(new Request("http://localhost/api/email-builder/assistant", { method: "POST", body: JSON.stringify({ document: createBlankDocument(), history: [], message: "Salut" }) }), {
      engine: async () => (calls++, { status: "success", message: "x", model: "test" }),
      log: () => {},
    })
    assert.equal(response.status, 422)
    assert.equal(calls, 0)
    assert.match(((await response.json()) as { message: string }).message, /première lame/)
  })

  test("versions : aucune version à zéro lame ; enregistrement possible dès la première lame ; le menu le dit", () => {
    const empty = run(blank(), { type: "save-version", name: "Vide", at: "2026-10-07T10:00:00.000Z" })
    assert.equal(empty.versions.length, 0)
    const saved = run(withLame(), { type: "save-version", name: "Départ", at: "2026-10-07T10:00:00.000Z" })
    assert.equal(saved.versions.length, 1)
    const menu = read("components/email-builder/versions-menu.tsx")
    assert.match(menu, /disabled=\{viewing \|\| empty\}/)
    assert.match(menu, /Ajoute une première lame pour enregistrer une version/)
  })

  test("annuler / rétablir fonctionnent dans l'état vide, sans créer de version", () => {
    let state = run(withLame(), { type: "undo" })
    assert.ok(builderIsEmpty(state))
    state = run(state, { type: "redo" })
    assert.equal(state.versions.length, 0)
    assert.equal(ids(state).length, 1)
  })

  test("statut : Brouillon à zéro lame, À valider / Prêt à envoyer indisponibles ; libres dès la première lame", () => {
    const empty = run(blank(), { type: "set-status", status: "review" }, { type: "set-status", status: "ready" })
    assert.equal(empty.status, "draft")
    let state = run(withLame(), { type: "set-status", status: "review" })
    assert.equal(state.status, "review")
    state = run(state, { type: "set-status", status: "ready" })
    assert.equal(state.status, "ready")
    assert.match(read("components/email-builder/status-menu.tsx"), /disabled=\{empty && option !== "draft"\}/)
  })

  test("un email qui redevient vide (suppression de la dernière lame, ou Undo) redevient Brouillon", () => {
    let state = run(withLame(), { type: "set-status", status: "ready" })
    state = operate(state, { type: "remove-block", blockId: firstLame })
    assert.equal(state.status, "draft")
    let other = run(withLame(), { type: "set-status", status: "review" }, { type: "undo" })
    assert.ok(builderIsEmpty(other))
    assert.equal(other.status, "draft")
    other = run(other, { type: "redo" }, { type: "set-status", status: "review" })
    assert.equal(other.status, "review")
    assert.ok(!builderIsEmpty(other))
    assert.equal(state.status, "draft")
  })
})

describe("V2.6 — partir d'un modèle", () => {
  const fixtureIds = emailRecipeFixtures.map((fixture) => fixture.id)

  test("seuls les modèles qui produisent un document valide sont proposés : ceux des recettes du domaine, aucun faux catalogue", () => {
    const templates = builderTemplates()
    assert.deepEqual(templates.map((template) => template.id), fixtureIds)
    assert.deepEqual([...new Set(templates.map((template) => template.title))], ["Découverte", "Réassurance", "Newsletter", "Preuves"])
    for (const template of templates) {
      assert.deepEqual(validateDocumentIntegrity(template.document), [], template.id)
      assert.equal(template.blockCount, template.document.config.blocks.length)
      assert.ok(template.blockCount > 0)
      assert.ok(template.description.length > 0 && template.document.config.name.startsWith("Nouvel email · "), template.id)
    }
    assert.ok(!templates.some((template) => /promotion|offre/i.test(template.title)), "pas de modèle de promotion sans Promotion Facts")
  })

  test("chaque modèle se rend avec le vrai renderer et ne déclenche aucune alerte sur ses valeurs de référence", () => {
    for (const template of builderTemplates()) {
      assert.ok(renderCanvasHtml(template.document).includes("<!--builder-block:"), template.id)
      assert.equal(getDocumentRecommendations(template.document).filter((entry) => entry.level === "alert").length, 0, template.id)
    }
  })

  test("choisir un modèle ouvre un document : une copie, clonée du modèle, immédiatement éditable ; ce n'est pas une opération", () => {
    const template = builderTemplates()[0]!
    const opened = shell({ type: "choose-templates" }, { type: "choose-template", document: template.document })
    assert.equal(opened.screen, "builder")
    const document = opened.screen === "builder" ? opened.document : undefined
    assert.ok(document && document !== template.document)
    assert.deepEqual(document, template.document)
    const state = createBuilderState(document!)
    assert.equal(state.history.past.length, 0)
    assert.equal(state.status, "draft")
  })

  test("un modèle est un point de départ, pas un formulaire : même Builder, mêmes gestes, aucun comportement spécial", () => {
    const template = builderTemplates().find((entry) => entry.id === "R2-A")!
    let state = createBuilderState(structuredClone(template.document))
    const [first, second] = ids(state)
    state = operate(state, { type: "remove-block", blockId: first! })
    state = operate(state, { type: "move-block", blockId: second!, toIndex: 0 })
    state = operate(state, add("email-module-text-and-cta-variant-01"))
    assert.ok(ids(state).includes("email-module-text-and-cta-variant-01"))
    state = run(state, { type: "assistant-send", text: "Qu'en penses-tu ?" })
    assert.equal(state.assistant.pending, true)
    state = run(state, { type: "set-status", status: "ready" }, { type: "save-version", name: "Départ", at: "2026-10-07T10:00:00.000Z" })
    assert.equal(state.status, "ready")
    assert.equal(state.versions.length, 1)
    for (const path of ["entry-screen", "builder-shell"]) assert.ok(!/<form|<input|<textarea|onSubmit/.test(code(`components/email-builder/${path}.tsx`)), `${path} : aucun formulaire`)
  })
})

describe("V2.6 — recommencer", () => {
  test("rien à perdre (email vide, sans version) : aucune confirmation ; une lame ou une version : confirmation", () => {
    assert.equal(builderHasWork(blank()), false)
    assert.equal(builderHasWork(withLame()), true)
    const versioned = operate(run(withLame(), { type: "save-version", name: "V", at: "2026-10-07T10:00:00.000Z" }), { type: "remove-block", blockId: firstLame })
    assert.ok(builderIsEmpty(versioned))
    assert.equal(builderHasWork(versioned), true, "une version enregistrée est du travail à perdre, même document vide")
    const button = read("components/email-builder/restart-button.tsx")
    assert.match(button, /Recommencer cet email \?/)
    assert.match(button, /Le travail non persisté de cette session sera perdu\./)
    assert.match(button, /onClick=\{confirm \? undefined : onRestart\}/)
    assert.match(button, />Annuler</)
    assert.match(code("components/email-builder/builder-topbar.tsx"), /<RestartButton confirm=\{confirmRestart\} onRestart=\{onRestart\}/)
  })

  test("recommencer retourne à l'entrée ; rouvrir crée un espace de travail neuf, sans l'historique précédent", () => {
    let model = shell({ type: "choose-blank" })
    const firstSession = model.opened
    const worked = withLame()
    assert.equal(worked.history.past.length, 1)
    model = shellReducer(model, { type: "restart" })
    assert.equal(model.screen, "entry")
    model = shellReducer(shellReducer(model, { type: "choose-templates" }), { type: "choose-template", document: builderTemplates()[1]!.document })
    assert.equal(model.screen, "builder")
    assert.ok(model.opened > firstSession, "un autre espace de travail")
    const fresh = createBuilderState(model.screen === "builder" ? model.document : createBlankDocument())
    assert.equal(fresh.history.past.length, 0)
    assert.equal(fresh.versions.length, 0)
    assert.equal(fresh.assistant.messages.length, 0)
    assert.match(code("components/email-builder/builder-shell.tsx"), /<BuilderWorkspace key=\{shell\.opened\}/)
  })

  test("recommencer et choisir ne sont pas des opérations Undo : aucune action du Builder ne les connaît", () => {
    const state = code("lib/email-builder/builder-state.ts")
    assert.ok(!/restart(?!-from)|choose-|"back"/.test(state))
  })
})

describe("V2.6 — frontières", () => {
  test("l'entrée et l'état vide n'ajoutent aucun réseau, aucun modèle, aucune persistance, aucune dépendance de glisser-déposer", () => {
    for (const path of ["builder-shell", "entry-screen", "empty-canvas", "restart-button"]) {
      assert.ok(!/fetch\(|anthropic|claude|localStorage|sessionStorage|indexedDB|dnd|drag/i.test(code(`components/email-builder/${path}.tsx`)), path)
    }
    assert.ok(!/dnd-kit|react-dnd|react-beautiful-dnd|dragula/.test(read("package.json")))
  })

  test("le shell ne touche ni au POC ni à Landing", () => {
    for (const path of ["lib/email-builder/shell-state.ts", "lib/email-builder/templates.ts"]) assert.ok(!/lib\/landing|\.\.\/landing/.test(code(path)), path)
  })
})

describe("V2.6 — topbar responsive (structure, pas de pixels)", () => {
  const topbar = code("components/email-builder/builder-topbar.tsx")
  const restart = code("components/email-builder/restart-button.tsx")
  const versions = code("components/email-builder/versions-menu.tsx")

  test("une seule ligne à partir de lg ; en dessous, la barre passe à la ligne au lieu de déborder", () => {
    const header = /<header className="([^"]+)"/.exec(topbar)![1]!.split(" ")
    for (const klass of ["flex", "flex-wrap", "min-h-12", "lg:h-12", "lg:flex-nowrap"]) assert.ok(header.includes(klass), klass)
    assert.ok(!header.includes("h-12") && !header.includes("overflow-x-auto"), "ni hauteur fixe sous lg, ni défilement horizontal")
  })

  test("les actions secondaires passent en icône seule sous lg, sans perdre leur nom accessible ni leur libellé au bureau", () => {
    assert.match(restart, /aria-label="Recommencer" title="Recommencer"/)
    assert.match(restart, /<span className="hidden lg:inline">Recommencer<\/span>/)
    assert.match(topbar, /aria-label="Ajouter une lame" title="Ajouter une lame"/)
    assert.match(topbar, /<span className="hidden lg:inline">Ajouter une lame<\/span>/)
    assert.match(versions, /aria-label=\{`Versions/)
    assert.match(versions, /<span className="hidden max-w-40 truncate lg:inline">/)
  })

  test("aucune action n'est retirée de la barre : annuler, rétablir, statut, versions, bibliothèque, recommencer restent rendus à toute largeur", () => {
    for (const piece of ["aria-label=\"Annuler\"", "aria-label=\"Rétablir\"", "<StatusMenu", "<VersionsMenu", "onClick={onAddBlock}", "<RestartButton"]) assert.ok(topbar.includes(piece), piece)
    assert.ok(!/hidden (sm|md|lg):(flex|inline-flex|block)[^"]*"[^>]*>\s*<(Button|StatusMenu|VersionsMenu|RestartButton)/.test(topbar.replace(/className="hidden sm:flex"/, "")), "aucune action cachée")
  })
})

describe("Dashboard → Email Builder", () => {
  const dashboard = code("components/dashboard/dashboard-data.ts")

  test("l'accès Email principal du dashboard (carte outil, navigation, recherche) est le Builder", () => {
    assert.match(dashboard, /title: "Emails",\s*description: "[^"]+",\s*cta: "Créer un email",\s*href: "\/email-builder"/)
    assert.match(dashboard, /\{ title: "Emails", href: "\/email-builder", icon: Mail \}/)
    // la recherche (⌘K) est dérivée de la navigation : aucune seconde source d'accès
    assert.match(dashboard, /export const searchableItems = navItems/)
    assert.ok(!/\/email-generator/.test(dashboard), "plus aucun lien du dashboard vers l'ancien générateur")
    assert.ok(!/L'IA le compose|l'IA compose/.test(dashboard.match(/title: "Emails"[\s\S]*?href/)?.[0] ?? ""), "la carte ne promet pas une composition par l'IA que le Builder ne fait pas encore")
  })

  test("le bouton Dashboard du Builder (entrée comme topbar) retourne au dashboard global, pas à l'ancien générateur", () => {
    for (const path of ["entry-screen", "builder-topbar"]) {
      const source = code(`components/email-builder/${path}.tsx`)
      assert.match(source, /render=\{<Link href="\/" \/>\}/, path)
      assert.ok(!/email-generator/.test(source), path)
    }
    assert.ok(existsSync(join(root, "app/(dashboard)/page.tsx")), "le dashboard global est la page racine")
  })

  test("l'ancien générateur, ses API, la bibliothèque et le Builder restent en place ; aucune redirection globale", () => {
    for (const path of ["app/email-generator/page.tsx", "app/api/generate-email/route.ts", "app/api/edit-email/route.ts", "app/api/export-email/route.ts", "app/(dashboard)/email-library/page.tsx", "app/email-builder/page.tsx", "app/api/email-builder/render/route.ts", "app/api/email-builder/assistant/route.ts"]) assert.ok(existsSync(join(root, path)), path)
    assert.ok(!/redirects|rewrites|permanentRedirect|redirect\(/.test(code("next.config.ts")), "aucune redirection de routes")
    assert.ok(!/email-builder/.test(code("app/email-generator/page.tsx")), "l'ancien générateur ne connaît pas le Builder")
  })
})
