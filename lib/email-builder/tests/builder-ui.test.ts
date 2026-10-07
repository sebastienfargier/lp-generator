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

const components = ["builder-workspace", "builder-topbar", "builder-canvas", "block-toolbar", "lame-library-panel", "image-picker-panel", "inline-editor", "versions-menu", "status-menu", "assistant-panel", "builder-shell", "entry-screen", "empty-canvas", "restart-button"]
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

  test("les seuls appels réseau du Builder : le rendu du canvas, et un message explicite à l'assistant", () => {
    const calls = files.flatMap((path) => [...code(path).matchAll(/fetch\(\s*([^,)]+)/g)].map((match) => match[1]!.trim()))
    assert.deepEqual(calls.sort(), ['"/api/email-builder/assistant"', '"/api/email-builder/render"'])
  })

  test("le rendu vient du renderer serveur : aucun composant n'importe le renderer, ne lit un fichier, ni ne recrée une lame en JSX", () => {
    for (const path of files.filter((entry) => entry.startsWith("components/"))) {
      const source = code(path)
      assert.ok(!/lib\/email\/renderer|node:fs|renderEmail|toPreviewHtml/.test(source), path)
      assert.ok(!/data-slot=|email-module-/.test(source), `${path} ne recrée aucune lame`)
    }
    assert.ok(!/renderCanvasHtml|renderEmail/.test(code("app/email-builder/page.tsx")), "la page n'injecte aucun rendu : un email n'est rendu qu'une fois ouvert, par l'API de rendu")
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
    assert.match(workspace, /canUndo=\{!readOnly && builderCanUndo\(state\)\}/)
    assert.match(workspace, /canRedo=\{!readOnly && builderCanRedo\(state\)\}/)
    assert.match(workspace, /metaKey \|\| event\.ctrlKey/)
    const topbar = code("components/email-builder/builder-topbar.tsx")
    assert.match(topbar, /aria-label="Annuler"[^>]*disabled=\{!canUndo\}/)
    assert.match(topbar, /aria-label="Rétablir"[^>]*disabled=\{!canRedo\}/)
  })

  test("le rendu affiché est celui du serveur pour le document courant ; les rendus déjà vus sont réutilisés (annuler sans appel)", () => {
    assert.match(workspace, /renders\[key\]/)
    assert.match(workspace, /if \(shownEmpty \|\| renders\[key\] !== undefined\) return/)
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
    assert.match(workspace, /type: "escape"/)
  })

  test("la suppression n'a pas de modale : un seul geste, annulable", () => {
    // Seuls l'enregistrement d'une version (un nom à saisir) et « Recommencer » (abandon du travail de la session) ouvrent une petite fenêtre ; aucune action sur une lame ne demande de confirmation.
    for (const path of files.filter((entry) => !entry.endsWith("versions-menu.tsx") && !entry.endsWith("restart-button.tsx"))) assert.ok(!/<Dialog|<AlertDialog|window\.confirm|confirm\(/.test(code(path)), path)
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
    assert.match(code("components/email-builder/builder-workspace.tsx"), /panel\?\.kind === "library" && \(/)
  })

  test("l'assistant est une conversation sobre : messages, saisie, envoi, propositions ; repliable, masqué sous 1280 px ; état vide simple", () => {
    const raw = read("components/email-builder/assistant-panel.tsx")
    const assistant = code("components/email-builder/assistant-panel.tsx")
    assert.ok(!/fetch\(|anthropic|localStorage/i.test(assistant), "le panneau ne connaît ni le réseau ni le modèle")
    assert.match(raw, /Je peux relire cet email, proposer des améliorations ou retravailler son contenu\./)
    assert.match(assistant, /Replier l'assistant/)
    assert.match(assistant, /hidden[^"]*xl:flex/)
    assert.match(assistant, /aria-label="Message à l'assistant"/)
    assert.match(assistant, /aria-label="Envoyer"/)
  })

})

describe("Builder — édition directe du contenu (V2.3)", () => {
  const editor = code("components/email-builder/inline-editor.tsx")
  const canvas = code("components/email-builder/builder-canvas.tsx")
  const picker = code("components/email-builder/image-picker-panel.tsx")
  const workspace = code("components/email-builder/builder-workspace.tsx")

  test("l'iframe n'est jamais un éditeur : ni contenteditable, ni designMode, ni écriture dans son document ; le champ vit AU-DESSUS", () => {
    for (const source of [canvas, editor, workspace, picker]) {
      assert.ok(!/contenteditable|contentEditable|designMode|execCommand/.test(source))
      assert.ok(!/contentDocument[^;\n]*(\.write|\.open|innerHTML|textContent\s*=|appendChild|insertBefore|setAttribute|\.style\b)/.test(source))
    }
    assert.match(canvas, /<InlineEditor/)
    assert.match(editor, /absolute z-40/)
  })

  test("le document n'est jamais reconstruit depuis le HTML : lame et slot viennent des repères et du document, la valeur initiale du document", () => {
    assert.match(canvas, /data-slot/)
    assert.match(canvas, /initialDraft\(editingEditor, slotValue\(/)
    assert.ok(!/innerText|textContent/.test(canvas.replace(/\/\/.*$/gm, "")), "aucun texte lu dans le HTML rendu")
  })

  test("le brouillon est LOCAL : la frappe ne touche ni au reducer, ni au rendu ; une seule validation", () => {
    assert.match(editor, /useState<SlotDraft>\(initial\)/)
    assert.ok(!/onChange=\{[^}]*(onCommit|dispatch|fetch)/.test(editor))
    assert.ok(!/fetch\(|dispatch/.test(editor))
    assert.equal((editor.match(/onCommit\(draft\)/g) ?? []).length, 1, "un seul point de validation")
    assert.match(editor, /if \(done\.current\) return/)
  })

  test("Entrée valide, Échap annule (sans propager), la perte du focus valide ; un bouton valide libellé et lien ensemble", () => {
    assert.match(editor, /event\.key === "Escape"/)
    assert.match(editor, /event\.stopPropagation\(\)/)
    assert.match(editor, /event\.key === "Enter"/)
    assert.match(editor, /onBlur=\{commit\}/)
    assert.match(editor, /contains\(event\.relatedTarget/)
    assert.match(editor, /Appliquer/)
  })

  test("le design system contrôle la forme : le champ reprend la typographie de l'élément et n'offre ni police, ni taille, ni couleur", () => {
    assert.match(editor, /captureFieldStyle/)
    assert.ok(!/type="color"|<select|fontFamily=\{|setFont|bold|italic/i.test(editor.replace(/fontFamily: style\.fontFamily/g, "")))
  })

  test("l'élément a priorité sur la lame : ses contrôles sont au-dessus ; la barre de lame n'apparaît que pour une LAME sélectionnée", () => {
    assert.match(canvas, /selection\.kind === "block" && selection\.blockId === zone\.id/)
    assert.match(canvas, /absolute z-10 outline-offset-2/)
    assert.match(canvas, /selected && \(\s*<div className="absolute top-2 right-2 z-30">/)
    assert.match(canvas, /tabIndex=\{blockSelected \? 0 : -1\}/)
  })

  test("images : « Remplacer » ouvre la banque Studi existante ; ni upload, ni URL libre, ni seconde banque", () => {
    assert.match(canvas, /Remplacer/)
    assert.match(picker, /emailBankImageBlocks/)
    assert.match(picker, /resolveEmailBankImage/)
    assert.ok(!/type="file"|FileReader|drop|upload|new Image|https?:\/\//i.test(picker.replace(/\/\/.*$/gm, "")))
    assert.match(workspace, /type: "set-image"/)
    assert.match(workspace, /type: "open-images"/)
  })

  test("accessibilité : chaque contenu éditable est un bouton nommé, avec focus visible ; actions image au clavier", () => {
    assert.match(canvas, /aria-label=\{`\$\{editor === "image" \? "Image"/)
    assert.match(canvas, /focus-visible:outline-2/)
    assert.match(code("components/email-builder/image-picker-panel.tsx"), /aria-label=\{`\$\{emailBank\[id\]\.alt\}/)
    assert.match(editor, /aria-label=\{label\}/)
  })

  test("silence quand tout va bien : aucun message de réussite", () => {
    for (const path of files) assert.ok(!/(modifié|enregistré|sauvegardé|appliqué) avec succès/i.test(read(path)), path)
  })

  test("V2.3 n'ajoute rien de ce qui est hors périmètre : pas de dépendance, ni modèle, ni persistance, ni upload", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> }
    assert.ok(!Object.keys(pkg.dependencies).some((name) => /dnd|slate|tiptap|prosemirror|lexical|draft-js|quill|ckeditor|prisma|drizzle/i.test(name)))
    for (const path of files) assert.ok(!/anthropic|localStorage|FileReader|type="file"/i.test(code(path)), path)
  })
})

describe("Builder — versions nommées et statut (V2.4)", () => {
  const workspace = code("components/email-builder/builder-workspace.tsx")
  const topbar = code("components/email-builder/builder-topbar.tsx")
  const menu = code("components/email-builder/versions-menu.tsx")
  const status = code("components/email-builder/status-menu.tsx")
  const canvas = code("components/email-builder/builder-canvas.tsx")
  const state = code("lib/email-builder/builder-state.ts")

  test("rien n'est persisté : ni stockage navigateur, ni cookie, ni réseau, ni base, ni auteur en dur", () => {
    for (const path of [...files, "lib/email-builder/versions.ts", "lib/email-builder/builder-state.ts"]) {
      assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|prisma|drizzle|Auteur/i.test(code(path)), path)
    }
    assert.deepEqual([...code("lib/email-builder/versions.ts").matchAll(/Date\.now|new Date|fetch\(/g)], [], "le modèle est pur : ni horloge, ni réseau")
  })

  test("la date vient du geste de l'utilisateur, jamais du reducer ; le reducer reste pur", () => {
    assert.match(workspace, /type: "save-version", name, at: new Date\(\)\.toISOString\(\)/)
    assert.ok(!/Date\.now|new Date|Math\.random/.test(state))
  })

  test("le statut est un menu libre : trois valeurs, immédiat, sans confirmation ni blocage ; en consultation, il est figé", () => {
    assert.match(status, /documentStatuses\.map/)
    assert.match(status, /onValueChange=\{\(value\) => onChange\(value as DocumentStatus\)\}/)
    assert.ok(!/Dialog|confirm\(|disabled=\{[^}]*recommend/i.test(status))
    assert.match(status, /if \(readOnly\)/)
    assert.match(topbar, /<StatusMenu status=\{status\} readOnly=\{readOnly\}/)
  })

  test("les versions : liste de la plus récente à la plus ancienne, numéro, nom, statut, durée ; enregistrement par une petite fenêtre dont le numéro est attribué par le système", () => {
    assert.match(menu, /\[\.\.\.versions\]\.reverse\(\)/)
    assert.match(menu, /versionLabel\(version\)/)
    assert.match(menu, /statusLabels\[version\.status\]/)
    assert.match(menu, /relativeTime\(version\.createdAt, now\)/)
    assert.match(menu, /Enregistrer une nouvelle version/)
    assert.match(menu, /nextVersionPrefix\(versions\)/)
    assert.match(menu, /Facultatif/)
    assert.match(menu, /disabled=\{viewing \|\| empty\}/)
  })

  test("le wording de l'indicateur n'évoque pas une sauvegarde serveur", () => {
    assert.match(menu, /Modifications non enregistrées dans une version/)
    for (const path of files) assert.ok(!/non sauvegardé|pas sauvegardé|unsaved/i.test(read(path)), path)
  })

  test("consultation : le MÊME canvas en lecture seule (aucune couche de contrôles), historique et ajout désactivés, bandeau avec les deux sorties", () => {
    assert.match(canvas, /\{!readOnly && \(/)
    assert.match(workspace, /readOnly=\{readOnly\}/)
    assert.match(workspace, /canUndo=\{!readOnly && builderCanUndo\(state\)\}/)
    assert.match(workspace, /Vous consultez \{versionLabel\(viewing\)\}/)
    assert.match(workspace, /type: "exit-view"/)
    assert.match(workspace, /type: "restart-from"/)
    assert.match(topbar, /disabled=\{readOnly\}/)
    assert.match(workspace, /document=\{shown\}/)
  })

  test("le reducer ferme la porte : tout geste d'édition est ignoré pendant la consultation (une seule garde)", () => {
    assert.match(state, /if \(state\.viewingId !== null && !whileViewing\.has\(action\.type\)\) return state/)
  })

  test("aucun renderer spécial pour les versions : le rendu et son cache sont ceux du document affiché", () => {
    assert.match(workspace, /const key = JSON\.stringify\(shown\)/)
    assert.ok(!/version[A-Za-z]*Render|renderVersion|\/api\/email-builder\/versions/i.test(workspace))
  })

  test("aucune nouvelle dépendance ni hors périmètre (diff, branches, export)", () => {
    for (const path of [...files, "lib/email-builder/versions.ts"]) assert.ok(!/diff\(|branch|merge|exportHtml|anthropic/i.test(code(path).replace(/lib\/email\/export/g, "")), path)
  })
})

describe("Builder — assistant éditorial (V2.5)", () => {
  const workspace = code("components/email-builder/builder-workspace.tsx")
  const panel = code("components/email-builder/assistant-panel.tsx")

  test("un appel UNIQUEMENT sur envoi explicite : ni à l'ouverture du panneau, ni après une modification, une version ou un statut (aucun effet ne lance l'assistant)", () => {
    const sendBody = workspace.slice(workspace.indexOf("async function sendToAssistant"), workspace.indexOf("function onKeyDown"))
    assert.match(sendBody, /fetch\("\/api\/email-builder\/assistant"/)
    assert.equal((workspace.match(/\/api\/email-builder\/assistant/g) ?? []).length, 1, "un seul point d'appel")
    for (const effect of workspace.match(/useEffect\([\s\S]*?\n  \}, \[[^\]]*\]\)/g) ?? []) assert.ok(!/assistant/.test(effect), "aucun effet n'appelle l'assistant")
    assert.match(workspace, /onSend=\{sendToAssistant\}/)
  })

  test("le document envoyé est le travail COURANT au moment de l'envoi ; un seul envoi à la fois ; consultation : pas d'envoi", () => {
    const sendBody = workspace.slice(workspace.indexOf("async function sendToAssistant"), workspace.indexOf("function onKeyDown"))
    assert.match(sendBody, /body: JSON\.stringify\(\{ document, history, message: text\.trim\(\)/)
    assert.match(sendBody, /state\.assistant\.pending \|\| readOnly/)
    assert.match(workspace, /const document = builderDocument\(state\)/)
  })

  test("rien ne s'applique tout seul : l'application est un dispatch explicite déclenché par le bouton « Appliquer », jamais par la réponse", () => {
    assert.equal((workspace.match(/type: "apply-proposal"/g) ?? []).length, 1)
    assert.match(workspace, /onApply=\{\(id\) => dispatch\(\{ type: "apply-proposal", id, catalog \}\)\}/)
    assert.ok(!/apply-proposal/.test(workspace.slice(workspace.indexOf("async function sendToAssistant"), workspace.indexOf("function onKeyDown"))), "la réception d'une réponse n'applique rien")
    assert.match(panel, /onClick=\{\(\) => onApply\(messageId\)\}/)
  })

  test("simulation de développement : seulement par ?assistant=mock, jamais par défaut", () => {
    assert.match(workspace, /get\("assistant"\) === "mock"/)
    assert.match(workspace, /\.\.\.\(devMock \? \{ devMock: true \} : \{\}\)/)
  })

  test("propositions lisibles : résumé, étendue (« 3 contenus changent »), où / quoi / avant / après ; périmée, appliquée, ignorée", () => {
    assert.match(panel, /changent/)
    assert.match(panel, /describeProposal\(document, proposal\.changes, blockName\)/)
    assert.match(panel, /Proposition périmée/)
    assert.match(panel, /L&apos;email a changé depuis cette proposition\. Demande-moi de l&apos;actualiser\./)
    assert.match(panel, /Appliquée/)
    assert.match(panel, /Ignorer/)
    assert.match(panel, /isProposalStale\(proposal, document\)/)
  })

  test("consultation d'une version : saisie, amorces et « Appliquer » désactivés, avec l'explication", () => {
    assert.match(panel, /Reviens au travail actuel pour utiliser l&apos;assistant\./)
    assert.match(panel, /disabled=\{readOnly\}/)
    assert.match(panel, /disabled=\{!canSend\}/)
    assert.match(workspace, /readOnly=\{readOnly\}/)
  })

  test("conversation : défilement, annonce (log), état d'attente discret ; aucune note, aucun score, aucune liste imposée", () => {
    assert.match(panel, /role="log"/)
    assert.match(panel, /L&apos;assistant réfléchit…/)
    assert.ok(!/\/10|score|note sur/i.test(panel))
  })

  test("l'assistant ne pilote ni le statut ni la structure : le panneau n'en connaît aucune action", () => {
    assert.ok(!/set-status|onStatus|add-block|remove-block|move-block|set-surface/.test(panel))
  })
})
