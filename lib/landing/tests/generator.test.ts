/**
 * /generator branché sur le moteur Claude : aucun moteur déterministe, aucune
 * génération au chargement, un seul appel par clic, une preview qui n'appelle
 * rien, et le secret Anthropic hors de tout composant client. Les composants
 * ne sont pas exécutables dans Node : on vérifie leur structure, et le
 * comportement vit dans des modules purs testés ailleurs (generator-client).
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { emptyGeneratorBrief, generatorObjectives, GeneratorBriefSchema } from "../brief"
import { landingSupportedObjectives } from "../generation-request"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
/** Source sans commentaires : on teste le code, pas ce qu'il raconte. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(join(root, path)).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const componentFiles = sources("components/generator")
const generatorFiles = ["app/generator/page.tsx", ...componentFiles]
const clientModules = ["lib/landing/generate-client.ts", "lib/landing/generator-state.ts", "lib/landing/public-api.ts"]

describe("moteur de démonstration Landing supprimé", () => {
  test("fichiers du moteur et de l'aperçu par URL absents ; la route réelle existe", () => {
    for (const path of ["lib/landing/demo-generator.ts", "lib/generator", "app/generator/preview"]) {
      assert.ok(!existsSync(join(root, path)), path)
    }
    assert.ok(existsSync(join(root, "app/api/generate/route.ts")))
  })

  test("aucune source n'importe le moteur supprimé", () => {
    const scanned = [...sources("app"), ...sources("components"), ...sources("lib")].filter((path) => !path.includes("/tests/"))
    for (const path of scanned) {
      // Le domaine Email a son propre `./demo-generator`, sans rapport.
      assert.ok(!/landing\/demo-generator|lib\/generator\//.test(read(path)), path)
    }
  })

  test("le générateur n'importe ni la page d'exemple ni ses données", () => {
    for (const path of [...generatorFiles, "lib/landing/brief.ts", ...clientModules]) assert.ok(!/landing\/demo"|demoLandingPage/.test(read(path)), path)
  })

  test("aucun reste du mode démo : ni fonction, ni texte, ni badge, ni aperçu par URL", () => {
    for (const path of [...generatorFiles, "lib/landing/brief.ts", ...clientModules]) {
      const source = code(path)
      assert.ok(!/runGeneration|generateValidatedPage|buildPreviewUrl|\/generator\/preview|URLSearchParams/.test(source), path)
      assert.ok(!/mode démo|sans ia|simulée/i.test(read(path)), path)
    }
    assert.ok(!/<Badge/.test(read("app/generator/page.tsx")))
  })
})

describe("/generator : aucune génération au chargement", () => {
  test("la page et le workspace ne lancent rien : pas d'effet, pas d'import du moteur", () => {
    const page = code("app/generator/page.tsx")
    assert.ok(!/generate-client|generate-handler|anthropic|fetch\(/.test(page))
    const workspace = code("components/generator/generator-workspace.tsx")
    assert.ok(!/useEffect|useLayoutEffect|setTimeout|setInterval/.test(workspace))
    assert.equal((workspace.match(/requestLandingGeneration\(/g) ?? []).length, 1)
  })

  test("formulaire vide à l'origine, objectif POC présélectionné, refusé tel quel sans les autres champs", () => {
    assert.deepEqual(emptyGeneratorBrief, { projectName: "", brief: "", audience: "", objective: "" })
    assert.equal(GeneratorBriefSchema.safeParse(emptyGeneratorBrief).success, false)
    assert.match(read("app/generator/page.tsx"), /\.\.\.emptyGeneratorBrief, objective: landingSupportedObjectives\[0\]/)
  })

  test("l'aperçu est vide avant la première génération", () => {
    assert.match(read("components/generator/landing-preview.tsx"), /Votre landing page apparaîtra ici après génération\./)
    assert.match(code("components/generator/generator-workspace.tsx"), /<LandingPreview config=\{state\.config\} loading=\{pending\}/)
  })
})

describe("objectif POC", () => {
  test("seul le sélectionnable est exposé ; le contrat historique du formulaire garde les autres", () => {
    const exposed = generatorObjectives.filter((objective) => (landingSupportedObjectives as readonly string[]).includes(objective.value))
    assert.deepEqual(exposed.map((objective) => objective.value), ["discover-trainings"])
    assert.equal(generatorObjectives.length, 4)
    assert.match(code("app/generator/page.tsx"), /generatorObjectives\.filter/)
    assert.match(code("app/generator/page.tsx"), /landingSupportedObjectives/)
  })
})

describe("objectif en lecture seule", () => {
  const panel = code("components/generator/generator-panel.tsx")
  const field = panel.slice(panel.indexOf('<FieldLabel htmlFor="generator-objective">'), panel.indexOf("</Field>", panel.indexOf('htmlFor="generator-objective"')))

  test("A. « Découverte des formations » est affiché : libellé de l'objectif sélectionné, dans un champ lu seul", () => {
    assert.match(field, /Objectif/)
    assert.match(field, /<Input\s+id="generator-objective"\s+readOnly/)
    assert.match(field, /value=\{objective\?\.label \?\? ""\}/)
    assert.match(panel, /objectives\.find\(\(item\) => item\.value === brief\.objective\)/)
    assert.equal(generatorObjectives.find((item) => item.value === "discover-trainings")?.label, "Découverte des formations")
    assert.deepEqual(landingSupportedObjectives, ["discover-trainings"])
  })

  test("B. plus aucun select, aucun onChange, aucune mise à jour de l'objectif ; aucun objectif non supporté montré", () => {
    assert.ok(!/Select|<select|role="combobox"/.test(panel))
    assert.ok(!/update\("objective"/.test(panel))
    assert.ok(!/onChange[^\n]*objective/.test(field))
    for (const label of ["Génération de leads", "Téléchargement de documentation", "Prise de contact"]) assert.ok(!panel.includes(label), label)
    assert.ok(!/<Select/.test(code("components/generator/generator-workspace.tsx")))
  })

  test("C. la valeur envoyée reste `objective` du brief, présélectionné à « discover-trainings »", () => {
    assert.match(code("app/generator/page.tsx"), /objective: landingSupportedObjectives\[0\]/)
    assert.match(code("components/generator/generator-workspace.tsx"), /requestLandingGeneration\(brief\)/)
    assert.ok(!/setBrief\(/.test(code("components/generator/generator-workspace.tsx")))
  })
})

describe("bouton Générer / Régénérer et message de durée", () => {
  const panel = code("components/generator/generator-panel.tsx")
  const workspace = code("components/generator/generator-workspace.tsx")

  test("le libellé vient du réducteur pur et traverse le workspace jusqu'au bouton ; spinner et garde inchangés", () => {
    assert.match(workspace, /submitLabel=\{generatorSubmitLabel\(state\)\}/)
    assert.match(panel, /submitLabel: string/)
    assert.match(panel, /disabled=\{pending \|\| !canGenerate\}/)
    assert.match(panel, /\{pending && \(\s*<Spinner/)
  })

  test("J. texte de durée exact, affiché seulement pendant l'appel, sans minuteur ni estimation dynamique", () => {
    assert.match(panel, /La génération peut prendre une vingtaine de secondes\./)
    assert.ok(!/dizaine/.test(panel))
    assert.match(panel, /\{pending && \(\s*<p[^>]*>\s*La génération peut prendre une vingtaine de secondes\./)
    assert.ok(!/setInterval|setTimeout|Date\.now|useEffect/.test(panel + workspace))
  })
})

describe("bouton Générer et états", () => {
  const panel = code("components/generator/generator-panel.tsx")
  const workspace = code("components/generator/generator-workspace.tsx")

  test("bouton actif seulement si le formulaire est prêt et qu'aucun appel n'est en cours", () => {
    assert.match(panel, /<Button[^>]*type="submit"[^>]*disabled=\{pending \|\| !canGenerate\}/)
    assert.match(panel, /aria-busy=\{pending\}/)
    assert.match(panel, /\{submitLabel\}/)
    assert.ok(!/Générer la landing page/.test(panel))
  })

  test("un seul POST par soumission : garde contre la double soumission, ni relance ni boucle", () => {
    assert.match(workspace, /if \(inFlight\.current \|\| !canGenerate\(brief\)\) return/)
    assert.match(workspace, /inFlight\.current = false/)
    assert.ok(!/\bfor \(|\bwhile \(|\.retry|retries|attempt/.test(workspace))
    assert.ok(!/fetch\(/.test(workspace) && !/fetch\(/.test(panel))
  })

  test("l'envoi passe uniquement par le formulaire", () => {
    assert.match(panel, /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\)\s*onGenerate\(\)/)
    assert.ok(!/onClick=\{onGenerate\}/.test(panel))
  })

  test("erreur publique affichée dans le panneau, avec ses champs ; état de chargement annoncé", () => {
    assert.match(panel, /\{error && \(\s*<Alert variant="destructive"/)
    assert.match(panel, /\{error\.message\}/)
    assert.match(panel, /error\.fields/)
    assert.match(code("components/generator/landing-preview.tsx"), /role="status"/)
    assert.match(code("components/generator/landing-preview.tsx"), /aria-busy=\{loading\}/)
  })

  test("l'état vient du réducteur pur : l'erreur ne remplace jamais la dernière configuration", () => {
    assert.match(workspace, /useReducer\(generatorReducer, initialGeneratorState\)/)
    assert.match(workspace, /config=\{state\.config\}/)
  })
})

describe("aperçu : le vrai renderer, sans appel", () => {
  const preview = code("components/generator/landing-preview.tsx")
  const frame = code("components/generator/preview-frame.tsx")

  test("réutilise LandingPageRenderer, sans dupliquer de section ni générer de HTML", () => {
    assert.match(frame, /import \{ LandingPageRenderer \} from "@\/components\/landing"/)
    assert.match(frame, /createPortal\(<LandingPageRenderer config=\{config\} \/>/)
    for (const source of [preview, frame, ...componentFiles.map(code)]) {
      assert.ok(!/@\/components\/sections|components\/sections/.test(source))
      assert.ok(!/dangerouslySetInnerHTML|innerHTML|renderToString|renderToStaticMarkup/.test(source))
    }
  })

  test("aucune requête depuis l'aperçu : ni fetch, ni client de génération, ni route", () => {
    for (const source of [preview, frame]) {
      assert.ok(!/fetch\(|requestLandingGeneration|generate-client|\/api\/|XMLHttpRequest|postMessage/.test(source))
    }
  })

  test("Desktop, Tablet, Mobile : un simple changement de largeur, aucune génération", () => {
    assert.match(preview, /\{ value: "desktop", label: "Desktop", width: 1440/)
    assert.match(preview, /\{ value: "tablet", label: "Tablet", width: 768/)
    assert.match(preview, /\{ value: "mobile", label: "Mobile", width: 390/)
    assert.match(preview, /if \(next\) setViewport\(next\.value\)/)
    assert.ok(!/onGenerate|dispatch|requestLandingGeneration/.test(preview))
  })

  test("les liens de la page sont inertes dans l'aperçu", () => {
    assert.match(frame, /event\.preventDefault\(\)/)
    assert.match(frame, /addEventListener\("click", keepPreviewInert, true\)/)
  })
})

describe("frontière serveur / client : le secret Anthropic reste serveur", () => {
  test("aucun composant, ni module client, n'importe le SDK, le moteur ou le gestionnaire de la route", () => {
    for (const path of [...generatorFiles, ...clientModules]) {
      assert.ok(!/@anthropic-ai\/sdk|landing\/anthropic|generate-handler|draft-resolver|generation-draft/.test(code(path)), path)
      assert.ok(!/process\.env|ANTHROPIC/.test(code(path)), path)
    }
  })

  test("les composants du générateur sont les seuls clients : la page reste un composant serveur", () => {
    assert.ok(!/^["']use client["']/.test(read("app/generator/page.tsx").trimStart()))
    for (const path of ["generator-workspace", "generator-panel", "landing-preview", "preview-frame"]) {
      assert.ok(/^["']use client["']/.test(read(`components/generator/${path}.tsx`).trimStart()), path)
    }
  })
})

describe("clarté de la démonstration", () => {
  const page = code("app/generator/page.tsx")
  const preview = code("components/generator/landing-preview.tsx")
  const tools = code("components/dashboard/dashboard-data.ts")
  const card = code("components/dashboard/tool-card.tsx")
  const library = code("app/(dashboard)/library/page.tsx")

  test("/generator propose un retour au Dashboard (Link vers « / »), sans sidebar", () => {
    assert.match(page, /import Link from "next\/link"/)
    assert.match(page, /render=\{<Link href="\/" \/>\}/)
    assert.match(page, /Dashboard\s*<\/Button>/)
    assert.ok(!/Sidebar|AppSidebar/.test(page))
  })

  test("la légende du résultat n'existe qu'avec une configuration, jamais pendant une génération, sans nouvel état", () => {
    assert.match(preview, /\{config && !loading && \(\s*<Badge[^>]*>\s*\{describeGeneratedPage\(config\)\}/)
    assert.ok(!/useState<[^>]*(config|legend|sections)/i.test(preview))
    assert.ok(!/fetch\(|requestLandingGeneration/.test(preview))
  })

  test("Dashboard : Landing et Email disent « IA » et « Décrivez », plus de « démo » ni de « sans IA », ni de « gérez » ou d'« éditeur »", () => {
    const landing = tools.match(/title: "Landing Pages",\s*description: "([^"]+)",\s*cta: "([^"]+)"/)
    const email = tools.match(/title: "Emails",\s*description: "([^"]+)",\s*cta: "([^"]+)"/)
    assert.ok(landing && email)
    assert.match(landing[1]!, /IA/)
    assert.match(landing[1]!, /Décrivez/)
    assert.equal(landing[2], "Générer une landing page")
    assert.match(email[1]!, /IA/)
    assert.match(email[1]!, /Décrivez/)
    assert.equal(email[2], "Générer un email")
    assert.ok(!/démo|sans IA/i.test(`${email[1]} ${email[2]}`))
    assert.ok(!/gérez|éditeur/i.test(`${tools}\n${card}`))
    assert.match(card, /\{cta\}/)
  })

  test("Library : une phrase explique que l'IA compose avec des lames contrôlées, sans jargon technique", () => {
    assert.match(library, /Les landing pages générées par l'IA sont composées à partir de ces lames contrôlées, pour garantir un rendu cohérent\./)
    assert.match(library, /\{librarySections\.length\} lames/)
    assert.ok(!/Zod|JSON|React|Tailwind/.test(library.slice(library.indexOf("description="), library.indexOf("/>", library.indexOf("description=")))))
  })
})

describe("champ « Informations à reprendre telles quelles »", () => {
  const panel = code("components/generator/generator-panel.tsx")
  const workspace = code("components/generator/generator-workspace.tsx")
  const flat = (source: string) => source.replace(/\s+/g, " ")

  test("un champ de texte facultatif, avec son libellé et sa description, sans système dynamique de tags", () => {
    assert.match(panel, /<FieldLabel htmlFor="generator-facts">\s*Informations à reprendre telles quelles\s*<\/FieldLabel>/)
    assert.match(flat(panel), /Une information par ligne\. Utilisez ce champ pour les dates, horaires ou autres informations factuelles que la page doit respecter\./)
    assert.match(panel, /<Textarea\s+id="generator-facts"\s+rows=\{4\}\s+className="min-h-24"/)
    assert.ok(!/id="generator-facts"[^>]*required/.test(panel), "facultatif")
    assert.ok(!/useState|\.map\(\(fact|addFact|removeFact|tags?\b/i.test(panel), "ni tags, ni champs multiples")
  })

  test("composants du formulaire existants : Field, FieldDescription, FieldError ; aucun CSS spécifique", () => {
    assert.match(panel, /import \{ Field, FieldDescription, FieldError, FieldGroup, FieldLabel \} from "@\/components\/ui\/field"/)
    const block = panel.slice(panel.indexOf('<Field data-invalid'), panel.indexOf("</FieldGroup>"))
    assert.ok(!/style=/.test(block))
    assert.equal((block.match(/className=/g) ?? []).length, 1, "une seule classe d'utilitaire : min-h-24, pour environ 4 lignes visibles")
  })

  test("l'erreur de limite est affichée près du champ, avec aria-invalid", () => {
    assert.match(panel, /const factsError = factsInputError\(brief\.facts\)/)
    assert.match(panel, /aria-invalid=\{factsError \? true : undefined\}/)
    assert.match(panel, /\{factsError && <FieldError>\{factsError\}<\/FieldError>\}/)
  })

  test("le champ suit le même cycle de vie que les autres : un seul état, jamais réinitialisé par une génération", () => {
    assert.match(panel, /onChange=\{\(event\) => update\("facts", event\.target\.value\)\}/)
    assert.match(panel, /value=\{brief\.facts\}/)
    assert.equal((workspace.match(/useState\(initialBrief\)/g) ?? []).length, 1)
    assert.ok(!/setBrief\(/.test(workspace), "aucune réécriture du brief : ni après succès, ni après erreur")
    assert.match(workspace, /onBriefChange=\{setBrief\}/)
    assert.match(workspace, /requestLandingGeneration\(brief\)/)
    assert.match(code("app/generator/page.tsx"), /facts: ""/)
  })

  test("les comportements existants ne changent pas : double soumission, spinner, aperçu conservé", () => {
    assert.match(panel, /disabled=\{pending \|\| !canGenerate\}/)
    assert.match(workspace, /if \(inFlight\.current \|\| !canGenerate\(brief\)\) return/)
    assert.match(workspace, /<LandingPreview config=\{state\.config\} loading=\{pending\}/)
    assert.match(panel, /Spinner/)
  })

  test("l'objectif est présenté à part (cf. « objectif en lecture seule ») ; les erreurs serveur disent « Informations à reprendre »", () => {
    assert.ok(!/SelectValue/.test(panel))
    assert.match(panel, /describeFieldPath\(field\.path\)/)
    assert.ok(!/fieldLabels/.test(panel))
  })

  test("aucun moteur n'est touché : le client n'importe ni Anthropic, ni transport, ni résolveur", () => {
    for (const path of ["lib/landing/generate-client.ts", "lib/landing/brief.ts", "lib/landing/generator-state.ts", ...componentFiles]) {
      assert.ok(!/anthropic|transport-draft|draft-resolver|generation-draft|section-catalog/.test(code(path)), path)
    }
  })
})
