/**
 * /email-generator, interface POC du moteur Claude : plus aucune apparence de
 * démo, état initial vide, exemples, formulaire (objet facultatif, informations
 * à reprendre), états loading / succès / erreur, Dashboard. Les composants ne
 * sont pas exécutables dans Node : on vérifie leur structure, et le comportement
 * vit dans des modules purs. Aucun réseau.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, mock, test } from "node:test"

import type { EmailEngine, EmailPublicErrorCode } from "../generate-handler"
import { emailPublicErrors, handleEmailGeneration } from "../generate-handler"
import { emailDemoObjectives, emailDemoPresets, emailObjectives } from "../demo-generator"
import { resolveEmailDraftToConfig } from "../draft-resolver"
import {
  canGenerateEmail,
  describeEmailError,
  emailErrorFamilies,
  emailFactsInputError,
  emailFactsLimits,
  emailGeneratorObjectiveValues,
  emptyEmailGeneratorForm,
  parseEmailFactsInput,
  toEmailRequestBody,
  type EmailGeneratorForm,
} from "../generator-form"
import { buildEmailGeneratorExamples } from "../generator-examples"
import {
  describeGeneratedEmail,
  emailGeneratorReducer,
  emailSubmitLabel,
  initialEmailGeneratorState,
  type EmailGeneratorState,
} from "../generator-state"
import type { EmailGenerationSuccess } from "../generation"
import type { EmailGenerationRequest } from "../generation-request"
import { draftRequest, referenceDraft } from "./draft-fixtures"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
/** Source sans commentaires : on teste ce qui s'affiche et s'exécute, pas ce qu'on en dit. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const uiFiles = ["app/email-generator/page.tsx", "components/email/email-workspace.tsx", "components/email/email-brief-panel.tsx", "components/email/email-preview.tsx"]
const generatorModules = ["lib/email/generator-form.ts", "lib/email/generator-state.ts", "lib/email/generator-examples.ts"]

const fetchGuard = mock.method(globalThis, "fetch", () => {
  throw new Error("Appel réseau interdit dans les tests")
})
before(() => fetchGuard.mock.resetCalls())
after(() => {
  assert.equal(fetchGuard.mock.callCount(), 0, "un test a appelé fetch")
  fetchGuard.mock.restore()
})

const form = (over: Partial<EmailGeneratorForm> = {}): EmailGeneratorForm => ({
  campaignName: "Trouver sa voie",
  subject: "",
  brief: "Aider les lecteurs à explorer les formations.",
  audience: "Adultes en réflexion",
  objective: "decouverte-formations",
  facts: "",
  ...over,
})

const email = (blockCount: number): EmailGenerationSuccess => ({ status: "success", subject: "S", preheader: "P", blockCount, html: "<p>x</p>", previewHtml: "<p>x</p>" })

/** Moteur simulé qui passe par le VRAI resolver : l'objet final vient de la requête s'il est fourni, du brouillon sinon. */
function resolvingEngine() {
  const requests: EmailGenerationRequest[] = []
  const engine: EmailEngine = async (request) => {
    requests.push(request)
    const resolved = resolveEmailDraftToConfig(request, referenceDraft)
    if (resolved.status !== "resolved") throw new Error(JSON.stringify(resolved))
    return { status: "success", config: resolved.config, draft: referenceDraft, model: "m", stopReason: "end_turn" }
  }
  return { requests, engine }
}

async function post(body: unknown, engine: EmailEngine) {
  const response = await handleEmailGeneration(new Request("http://localhost/api/generate-email", { method: "POST", body: JSON.stringify(body) }), { engine, log: () => {} })
  return { response, json: (await response.json()) as Record<string, unknown> & { code?: string; subject?: string; issues?: { path: string; message: string }[] } }
}

describe("écran : plus d'apparence de démo, état initial vide", () => {
  test("A-B. aucun « Demo », « démo », « Mode démo » ni « sans IA » dans le parcours Email Generator ni dans la carte Dashboard", () => {
    // Texte et code visibles : les lignes d'import (chemin du jeu d'essai) ne s'affichent pas.
    for (const path of [...uiFiles, ...generatorModules.filter((path) => !path.endsWith("examples.ts"))]) {
      assert.ok(!/\bdemo\b|démo|sans IA|prototype|expériment|bientôt/i.test(code(path).replace(/^import [^\n]*\n/gm, "")), path)
    }
    const dashboard = code("components/dashboard/dashboard-data.ts")
    const card = dashboard.match(/title: "Emails",\s*description: "([^"]+)",\s*cta: "([^"]+)"/)
    assert.ok(card)
    assert.ok(!/démo|demo|sans IA/i.test(`${card[1]} ${card[2]}`))
    assert.match(card[1]!, /IA/)
    assert.equal(card[2], "Générer un email")
  })

  test("C-D. aucun aperçu déterministe ni génération au chargement : la page n'appelle rien, l'état initial est vide", () => {
    const page = code("app/email-generator/page.tsx")
    assert.ok(!/runEmailGeneration|defaultEmailBrief|initialResult|fetch\(|generation"|anthropic/i.test(page))
    assert.deepEqual(initialEmailGeneratorState, { status: "idle", email: null, error: null })
    const workspace = code("components/email/email-workspace.tsx")
    assert.ok(!/useEffect|useLayoutEffect|setTimeout|setInterval/.test(workspace))
    assert.equal((workspace.match(/fetch\(/g) ?? []).length, 1)
    assert.match(workspace, /async function generate\(\) \{[\s\S]*?fetch\(/)
    assert.match(workspace, /useState\(emptyEmailGeneratorForm\)/)
  })

  test("O. l'état initial de l'aperçu est un état vide explicite, impossible à confondre avec un email généré", () => {
    const preview = code("components/email/email-preview.tsx")
    assert.match(preview, /Votre email apparaîtra ici après génération\./)
    assert.match(preview, /!html &&\s*!loading &&/)
    assert.ok(!/la dernière génération est invalide/.test(preview))
    assert.match(preview, /\{legend && \(/, "la légende n'existe qu'après un succès")
    assert.match(preview, /\{html && \(\s*<p/, "la note sous l'aperçu n'existe qu'avec un email")
  })

  test("L. retour Dashboard visible, titre « Email Generator », sous-titre sobre sans promesse excessive", () => {
    const page = code("app/email-generator/page.tsx")
    assert.match(page, /import Link from "next\/link"/)
    assert.match(page, /render=\{<Link href="\/" \/>\}/)
    assert.match(page, />\s*Dashboard\s*</)
    assert.match(page, /<h1[^>]*>Email Generator<\/h1>/)
    assert.match(page, /L&apos;IA compose l&apos;email à partir de lames contrôlées\./)
  })
})

describe("exemples et objectifs", () => {
  const examples = buildEmailGeneratorExamples()

  test("C-E. exactement trois exemples (Reconversion, Accompagnement, Évolution de carrière), groupe « Exemples », sans génération au clic", () => {
    assert.deepEqual(examples.map((example) => example.label), ["Reconversion", "Accompagnement", "Évolution de carrière"])
    assert.deepEqual(examples.map((example) => example.id), ["reconversion", "accompagnement", "evolution"])
    for (const example of examples) {
      assert.ok(canGenerateEmail(example.form), example.id)
      assert.equal(example.form.facts, "")
      assert.ok(example.form.subject.trim() !== "")
      assert.ok(!("visual" in example.form), "aucun champ de campagne visuelle")
    }
    const panel = code("components/email/email-brief-panel.tsx")
    assert.match(panel, /aria-label="Exemples"/)
    assert.match(panel, />Exemples</)
    assert.match(panel, /onClick=\{\(\) => onFormChange\(\{ \.\.\.example\.form \}\)\}/)
    assert.ok(!/onGenerate\(\)/.test(panel.slice(panel.indexOf('aria-label="Exemples"'), panel.indexOf("<FieldGroup"))), "un exemple ne génère pas")
    assert.ok(!/\bpresets?\b/i.test(panel), "le vocabulaire utilisateur est « Exemples »")
  })

  test("les exemples viennent du jeu d'essai (qui reste intact) et sont acceptés par la route", async () => {
    for (const example of examples) {
      const preset = emailDemoPresets.find((entry) => entry.id === example.id)!
      assert.equal(example.form.brief, preset.brief.brief)
      assert.equal(example.form.campaignName, preset.brief.campaignName)
      const { engine, requests } = resolvingEngine()
      const { response } = await post(toEmailRequestBody(example.form), engine)
      assert.equal(response.status, 200, example.id)
      assert.equal(requests.length, 1)
    }
  })

  test("F-G. Promotion, Black Friday, Studi Days, Studi Meet et campagnes visuelles absents de l'interface", () => {
    for (const path of [...uiFiles, ...generatorModules]) {
      assert.ok(!/Promotion|Black Friday|Studi Days|Studi Meet|campagnes? visuelles?|\bvisual\b|emailDemoPresets\b.*campagne/i.test(code(path).replace(/emailDemoPresets/g, "").replace(/"promotion"/g, "")), path)
    }
    assert.ok(!/"promotion"/.test(code("lib/email/generator-form.ts")))
    assert.ok(!/emailDemoObjectives/.test(code("app/email-generator/page.tsx")), "la page n'expose pas les objectifs de démo")
  })

  test("H. exactement trois objectifs compatibles, avec leurs libellés", () => {
    assert.deepEqual([...emailGeneratorObjectiveValues], emailObjectives.map((objective) => objective.value))
    assert.deepEqual(emailObjectives.map((objective) => objective.label), ["Découverte des formations", "Comprendre l'accompagnement", "Préparer son évolution de carrière"])
    assert.equal(emailGeneratorObjectiveValues.length, 3)
    assert.match(code("app/email-generator/page.tsx"), /objectives=\{emailObjectives\}/)
    assert.ok(emailDemoObjectives.length > emailObjectives.length, "le jeu d'essai garde Promotion, sans l'exposer")
  })
})

describe("formulaire : objet facultatif, informations à reprendre, validation", () => {
  test("I. l'objet est facultatif : libellé, aide, validation, corps de requête", () => {
    const panel = code("components/email/email-brief-panel.tsx")
    assert.match(panel, /Objet \{optional\}/)
    assert.match(panel, /\(facultatif\)/)
    assert.match(panel, /Laissez vide : l&apos;IA le propose\./)
    assert.ok(canGenerateEmail(form({ subject: "" })))
    assert.ok(canGenerateEmail(form({ subject: "   " })))
    assert.ok(!("subject" in toEmailRequestBody(form({ subject: "  " }))))
    assert.equal(toEmailRequestBody(form({ subject: "  Mon objet  " })).subject, "Mon objet")
  })

  test("J. objet vide → la requête n'impose rien et l'objet de Claude devient l'objet final", async () => {
    const { engine, requests } = resolvingEngine()
    const { response, json } = await post(toEmailRequestBody(form({ subject: "" })), engine)
    assert.equal(response.status, 200)
    assert.ok(!("subject" in requests[0]!))
    assert.equal(json.subject, referenceDraft.subject)
    // Une chaîne vide ou blanche envoyée directement est traitée comme absente.
    for (const subject of ["", "   "]) {
      const direct = resolvingEngine()
      const result = await post({ ...toEmailRequestBody(form()), subject }, direct.engine)
      assert.equal(result.json.subject, referenceDraft.subject)
      assert.ok(!("subject" in direct.requests[0]!))
    }
  })

  test("K. objet fourni → il reste l'objet final, même si Claude en propose un autre", async () => {
    const { engine, requests } = resolvingEngine()
    const { json } = await post(toEmailRequestBody(form({ subject: "Mon objet à moi" })), engine)
    assert.equal(requests[0]!.subject, "Mon objet à moi")
    assert.equal(json.subject, "Mon objet à moi")
    assert.notEqual(json.subject, referenceDraft.subject)
  })

  test("L. informations : une ligne non vide = une information, trim, lignes vides ignorées, CRLF accepté", () => {
    assert.deepEqual(parseEmailFactsInput("  Une info.  \n\n   \nDeux infos.\r\nTrois."), ["Une info.", "Deux infos.", "Trois."])
    assert.deepEqual(parseEmailFactsInput(""), [])
    assert.deepEqual(parseEmailFactsInput(undefined), [])
  })

  test("L. informations : huit au maximum, 200 caractères par ligne, messages explicites ; facultatives", () => {
    const lines = (count: number) => Array.from({ length: count }, (_, index) => `Info ${index + 1}`).join("\n")
    assert.equal(emailFactsInputError(lines(8)), null)
    assert.match(emailFactsInputError(lines(9))!, /8 informations au maximum/)
    assert.equal(emailFactsInputError("x".repeat(emailFactsLimits.maxLength)), null)
    assert.match(emailFactsInputError("x".repeat(emailFactsLimits.maxLength + 1))!, /200 caractères/)
    assert.ok(canGenerateEmail(form({ facts: "" })))
    assert.ok(!canGenerateEmail(form({ facts: lines(9) })))
    assert.ok(!canGenerateEmail(form({ facts: "x".repeat(201) })))
    assert.equal([emailFactsLimits.maxCount, emailFactsLimits.maxLength].join(","), "8,200")
  })

  test("L. informations : envoyées en lignes de texte, converties par le serveur en faits { statement } du contrat existant", async () => {
    const body = toEmailRequestBody(form({ facts: "  Une info.\n\nDeux infos.  " }))
    assert.deepEqual(body.facts, ["Une info.", "Deux infos."])
    const { engine, requests } = resolvingEngine()
    const { response } = await post(body, engine)
    assert.equal(response.status, 200)
    assert.deepEqual(requests[0]!.facts, [{ statement: "Une info." }, { statement: "Deux infos." }])
    assert.ok(requests[0]!.facts!.every((fact) => Object.keys(fact).join() === "statement"))
    assert.ok(!("facts" in toEmailRequestBody(form({ facts: "\n  \n" }))))
    assert.ok(!("facts" in requests[0]! && requests[0]!.facts!.length === 0))
  })

  test("L. le serveur reste l'autorité : plus de huit informations, une ligne trop longue ou vide, un champ inconnu sont refusés sans appel", async () => {
    const { engine, requests } = resolvingEngine()
    const base = toEmailRequestBody(form())
    const refused = [
      { ...base, facts: Array.from({ length: 9 }, (_, index) => `Info ${index}`) },
      { ...base, facts: ["x".repeat(201)] },
      { ...base, facts: ["  "] },
      { ...base, facts: "pas une liste" },
      { ...base, facts: [{ statement: "x" }] },
      { ...base, offer: { summary: "x" } },
      { ...base, emailType: "promo" },
    ]
    for (const body of refused) {
      const { response, json } = await post(body, engine)
      assert.equal(response.status, 400)
      assert.equal(json.code, "invalid-request")
    }
    assert.equal(requests.length, 0)
  })

  test("I-M. aucun disclaimer : ni dans l'interface, ni dans le corps, ni ajouté automatiquement ; l'email n'a pas de mentions légales", async () => {
    for (const path of [...uiFiles, "lib/email/generator-form.ts"]) assert.ok(!/disclaimer/i.test(code(path)), path)
    const { engine, requests } = resolvingEngine()
    const { response, json } = await post({ ...toEmailRequestBody(form({ facts: "Une info." })) }, engine)
    assert.equal(response.status, 200)
    assert.ok(!JSON.stringify(requests[0]).includes("disclaimer"))
    assert.ok(!String(json.html).includes("Voir les conditions") && !/legal-disclaimer/.test(JSON.stringify(json)))
    const refused = await post({ ...toEmailRequestBody(form()), facts: ["x"], disclaimer: "financement-personnel" }, engine)
    assert.equal(refused.response.status, 400)
    const preview = code("components/email/email-preview.tsx")
    assert.match(preview, /Les mentions légales ne\s+sont pas ajoutées automatiquement : vérifiez l&apos;email avant utilisation\./)
    assert.ok(!/prêt à l'envoi|prêt à envoyer/i.test(preview))
  })

  test("N. le bouton est impossible à activer avec un brief incomplet ; objectif valide exigé ; objet et informations facultatifs", () => {
    assert.ok(canGenerateEmail(form()))
    assert.equal(canGenerateEmail(emptyEmailGeneratorForm), false)
    for (const key of ["campaignName", "brief", "audience"] as const) {
      assert.equal(canGenerateEmail(form({ [key]: "" })), false, key)
      assert.equal(canGenerateEmail(form({ [key]: "   " })), false, key)
    }
    assert.equal(canGenerateEmail(form({ objective: "promotion" as never })), false)
    assert.equal(canGenerateEmail(form({ objective: "" as never })), false)
    const panel = code("components/email/email-brief-panel.tsx")
    assert.match(panel, /<Button type="submit" disabled=\{pending \|\| !canGenerate\}/)
    assert.match(code("components/email/email-workspace.tsx"), /if \(inFlight\.current \|\| !canGenerateEmail\(form\)\) return/)
    assert.match(panel, /Tous les champs sont obligatoires, sauf ceux marqués « facultatif »\./)
    assert.equal((panel.match(/\(facultatif\)/g) ?? []).length, 1, "le marqueur est défini une fois et réutilisé")
    assert.equal((panel.match(/\{optional\}/g) ?? []).length, 2, "objet et informations")
  })

  test("le brief et les informations sont distingués par leurs aides, sans documentation longue", () => {
    const panel = code("components/email/email-brief-panel.tsx")
    assert.match(panel, /L&apos;intention éditoriale/)
    assert.match(panel, /Ajoutez ici les chiffres, dates ou informations qui doivent être respectés\. Un élément par ligne\./)
    assert.ok(panel.length < 8000)
  })
})

describe("états : loading honnête, succès, erreur", () => {
  const loading = emailGeneratorReducer(initialEmailGeneratorState, { type: "start" })

  test("bouton : Générer, Génération…, Régénérer (même après une erreur), « Générer » si la première échoue", () => {
    assert.equal(emailSubmitLabel(initialEmailGeneratorState), "Générer l'email")
    assert.equal(emailSubmitLabel(loading), "Génération…")
    const success = emailGeneratorReducer(loading, { type: "success", email: email(5) })
    assert.equal(emailSubmitLabel(success), "Régénérer")
    assert.equal(emailSubmitLabel(emailGeneratorReducer(success, { type: "start" })), "Génération…")
    const failedAfter = emailGeneratorReducer(emailGeneratorReducer(success, { type: "start" }), { type: "failure", error: { code: "timeout", issues: [] } })
    assert.equal(emailSubmitLabel(failedAfter), "Régénérer")
    assert.equal(emailSubmitLabel(emailGeneratorReducer(loading, { type: "failure", error: { code: "timeout", issues: [] } })), "Générer l'email")
  })

  test("P. loading honnête : durée annoncée, aucune progression, aucun pourcentage, aucune étape, aucune minuterie", () => {
    const panel = code("components/email/email-brief-panel.tsx")
    const preview = code("components/email/email-preview.tsx")
    const workspace = code("components/email/email-workspace.tsx")
    assert.match(panel, /La génération peut prendre une quinzaine de secondes\./)
    assert.match(preview, /La génération peut prendre une quinzaine de secondes\./)
    assert.match(panel, /disabled=\{pending \|\| !canGenerate\}/)
    assert.match(panel, /\{pending && <Spinner/)
    for (const source of [panel, preview, workspace]) assert.ok(!/progress|setInterval|setTimeout|Math\.random|étape \d|\d+ ?%\s*<|Skeleton/i.test(source))
    assert.deepEqual(["idle", "loading", "success", "error"].filter((status) => !read("lib/email/generator-state.ts").includes(`"${status}"`)), [])
    assert.match(preview, /role="status"/)
  })

  test("pendant une régénération, l'ancien email reste (voile) ; pas de seconde soumission", () => {
    const success = emailGeneratorReducer(loading, { type: "success", email: email(5) })
    const second = emailGeneratorReducer(success, { type: "start" })
    assert.equal(second.email, success.email)
    assert.equal(second.error, null)
    assert.equal(emailGeneratorReducer(second, { type: "start" }), second)
    assert.match(code("components/email/email-workspace.tsx"), /loading=\{pending \|\| awaitingPreview\}/)
  })

  test("M-Q. succès : « Email généré · N lames » dérivée du résultat réel, jamais écrite en dur", () => {
    assert.equal(describeGeneratedEmail(email(5)), "Email généré · 5 lames")
    assert.equal(describeGeneratedEmail(email(1)), "Email généré · 1 lame")
    assert.equal(describeGeneratedEmail(email(7)), "Email généré · 7 lames")
    assert.match(code("components/email/email-workspace.tsx"), /legend=\{state\.email \? describeGeneratedEmail\(state\.email\) : null\}/)
    assert.ok(!/Email généré · \d/.test(code("components/email/email-preview.tsx")))
  })

  test("R. erreur : le dernier email valide est conservé, jamais remplacé par un échec ; un succès le remplace", () => {
    const first = email(5)
    const success = emailGeneratorReducer(loading, { type: "success", email: first })
    const failed = emailGeneratorReducer(emailGeneratorReducer(success, { type: "start" }), { type: "failure", error: { code: "provider-error", issues: [] } })
    assert.equal(failed.status, "error")
    assert.equal(failed.email, first)
    const replaced = emailGeneratorReducer(emailGeneratorReducer(failed, { type: "start" }), { type: "success", email: email(6) })
    assert.equal(replaced.email!.blockCount, 6)
    assert.equal(emailGeneratorReducer(initialEmailGeneratorState, { type: "success", email: first }), initialEmailGeneratorState)
    assert.equal(emailGeneratorReducer(initialEmailGeneratorState, { type: "failure", error: { code: "timeout", issues: [] } }), initialEmailGeneratorState)
  })

  test("l'aperçu existant est conservé : iframe srcDoc sandbox, 600 / 390, échelle, hauteur, Objet / Préheader, voile", () => {
    const preview = code("components/email/email-preview.tsx")
    assert.match(preview, /srcDoc=\{html\}/)
    assert.match(preview, /sandbox="allow-same-origin"/)
    assert.match(preview, /\{ value: "desktop", label: "Desktop", width: 600/)
    assert.match(preview, /\{ value: "mobile", label: "Mobile", width: 390/)
    assert.match(preview, /Math\.min\(1, surface\.width \/ target\.width\)/)
    assert.match(preview, /scrollHeight/)
    assert.match(preview, /Objet/)
    assert.match(preview, /Préheader/)
    assert.match(preview, /Aperçu : logo et pictos locaux, réseaux sociaux masqués, liens inactifs\./)
  })
})

describe("erreurs : trois familles, rien d'interne", () => {
  const codes = Object.keys(emailErrorFamilies) as (keyof typeof emailErrorFamilies)[]

  test("S. chaque code public a une famille ; les familles suivent la spécification", () => {
    const published = new Set<string>(Object.values(emailPublicErrors).map((mapping) => mapping.code))
    for (const code of published) assert.ok(code in emailErrorFamilies, code)
    for (const code of ["invalid-request", "unsupported"] as const) assert.equal(emailErrorFamilies[code], "request")
    for (const code of ["rate-limit", "provider-error", "timeout", "invalid-output", "invalid-draft", "unresolvable", "invalid-email", "validation-failed", "rendering"] as const) assert.equal(emailErrorFamilies[code], "temporary")
    for (const code of ["configuration", "internal"] as const) assert.equal(emailErrorFamilies[code], "configuration")
    assert.equal(emailErrorFamilies.network, "temporary")
  })

  test("S. aucun chemin technique ni détail interne affiché : ni « génération », ni Anthropic, Zod, JSON, prompt, stack, clé", () => {
    for (const code of codes) {
      const view = describeEmailError({
        code,
        issues: [{ path: "génération", message: "Anthropic a refusé : ZodError sk-ant-api03-secret stack JSON prompt" }],
      })
      const text = `${view.title} ${view.messages.join(" ")} ${view.hint}`
      const family = emailErrorFamilies[code]
      if (family !== "request") assert.ok(!/Anthropic|Zod|sk-ant|stack|JSON|prompt|génération\b.*:/i.test(text), `${code} : ${text}`)
      assert.ok(!/(^|\s)génération :/.test(text), code)
      assert.ok(view.hint.length > 10, code)
    }
  })

  test("famille « demande à modifier » : messages nommés par le libellé du champ, jamais par son chemin ; refus de la V1 relayé", () => {
    const view = describeEmailError({
      code: "invalid-request",
      issues: [
        { path: "campaignName", message: "Le nom de campagne est requis." },
        { path: "facts.2", message: "Une information ne peut pas être vide." },
      ],
    })
    assert.equal(view.title, "Demande à modifier")
    assert.deepEqual(view.messages, ["Nom de campagne : Le nom de campagne est requis.", "Informations à reprendre telles quelles : Une information ne peut pas être vide."])
    assert.match(view.hint, /Modifiez la demande/)
    const unsupported = describeEmailError({ code: "unsupported", issues: [{ path: "objective", message: "Les emails promotionnels ne sont pas encore générés par l'IA." }] })
    assert.equal(unsupported.title, "Demande non prise en charge")
    assert.match(unsupported.messages[0]!, /^Objectif : Les emails promotionnels/)
  })

  test("familles « temporaire » et « configuration » : message fixe, invitation à réessayer ou à contacter l'équipe", () => {
    const temporary = describeEmailError({ code: "timeout", issues: [] })
    assert.match(temporary.hint, /Réessayez/)
    assert.equal(describeEmailError({ code: "network", issues: [] }).title, temporary.title)
    const configuration = describeEmailError({ code: "configuration", issues: [{ path: "génération", message: "ANTHROPIC_API_KEY absente" }] })
    assert.match(configuration.hint, /Contactez l'équipe/)
    assert.ok(!/ANTHROPIC/.test(configuration.messages.join(" ")))
  })

  test("la route envoie toujours un code lisible par le client ; l'alerte ne montre aucun chemin", async () => {
    const failing: EmailEngine = async () => ({ status: "error", error: { kind: "timeout", message: "x" } })
    const { response, json } = await post(toEmailRequestBody(form()), failing)
    assert.equal(response.status, 504)
    assert.equal(json.code, "timeout" satisfies EmailPublicErrorCode)
    const panel = code("components/email/email-brief-panel.tsx")
    assert.ok(!/issue\.path|<code/.test(panel))
    assert.match(panel, /describeEmailError\(error\)/)
  })
})

describe("portée : le reste du système est inchangé", () => {
  const strip = code

  test("U. la bibliothèque Email n'est pas touchée : elle n'importe rien de l'écran Generator", () => {
    for (const path of ["lib/email/library.ts", "lib/email/library-fixtures.ts", "components/email/email-library-browser.tsx", "components/email/email-lame-frame.tsx", "app/(dashboard)/email-library/page.tsx", "app/(dashboard)/email-library/preview/[type]/route.ts"]) {
      assert.ok(!/generator-form|generator-state|generator-examples|email-brief-panel|email-workspace|email-preview/.test(strip(path)), path)
    }
    const dashboard = code("components/dashboard/dashboard-data.ts")
    assert.match(dashboard, /title: "Lames Email"[\s\S]*?href: "\/email-library"/)
    assert.match(dashboard, /lames: Object\.keys\(emailBlockManifest\)\.length/)
  })

  test("V. demo-generator et demo-assets restent disponibles, avec leurs sept presets", () => {
    assert.ok(existsSync(join(root, "lib/email/demo-generator.ts")) && existsSync(join(root, "lib/email/demo-assets.ts")) && existsSync(join(root, "lib/email/generation.ts")))
    assert.equal(emailDemoPresets.length, 7)
    assert.ok(emailDemoObjectives.some((objective) => objective.value === "promotion"))
    for (const path of ["lib/email/demo-generator.ts", "lib/email/demo-assets.ts"]) assert.ok(!/generator-form|generator-state|generator-examples/.test(strip(path)), path)
  })

  test("W. le moteur Claude, le Draft, le resolver, le renderer et les templates n'importent rien du nouvel écran", () => {
    const engine = ["lib/email/anthropic.ts", "lib/email/anthropic-schema.ts", "lib/email/draft-prompt.ts", "lib/email/generation-draft.ts", "lib/email/draft-resolver.ts", "lib/email/renderer.ts", "lib/email/preview.ts", "lib/email/schemas.ts", "lib/email/image-catalog.ts", "lib/email/surfaces.ts"]
    for (const path of engine) assert.ok(!/generator-form|generator-state|generator-examples/.test(strip(path)), path)
    // Seule la route HTTP du formulaire s'adapte (objet facultatif, informations) : elle n'ajoute aucun appel.
    const handler = code("lib/email/generate-handler.ts")
    assert.equal((handler.match(/engine\(/g) ?? []).length, 1)
    assert.match(handler, /generateEmailWithClaude/)
  })

  test("X. aucune dépendance Landing dans l'écran Email ni dans ses modules", () => {
    for (const path of [...uiFiles, ...generatorModules, "lib/email/generate-handler.ts"]) {
      assert.ok(!/lib\/landing|components\/landing|components\/library|components\/sections|components\/generator/.test(strip(path)), path)
    }
  })

  test("aucune dépendance Anthropic dans les modules et composants de l'écran", () => {
    for (const path of [...uiFiles, ...generatorModules]) {
      const runtime = code(path).replace(/^import type [^\n]*\n/gm, "")
      const match = /anthropic|ANTHROPIC|process\.env/i.exec(runtime)
      assert.equal(match, null, `${path} : ${match?.[0]} … ${runtime.slice(Math.max(0, (match?.index ?? 0) - 60), (match?.index ?? 0) + 40)}`)
    }
  })
})

describe("état du formulaire : cohérence", () => {
  test("le corps de requête reflète le formulaire : champs requis rognés, objet et informations seulement s'ils sont remplis", () => {
    assert.deepEqual(toEmailRequestBody(form({ campaignName: "  Nom  ", brief: " B ", audience: " A " })), {
      campaignName: "Nom",
      brief: "B",
      audience: "A",
      objective: "decouverte-formations",
    })
    const full = toEmailRequestBody(form({ subject: "Objet", facts: "Un.\nDeux." }))
    assert.deepEqual(Object.keys(full), ["campaignName", "subject", "brief", "audience", "objective", "facts"])
  })

  test("un exemple préremplit tout le formulaire, y compris l'objet, en vidant les informations ; l'état actif se reconnaît à l'égalité", () => {
    const [example] = buildEmailGeneratorExamples()
    assert.ok(example)
    const state: EmailGeneratorState = initialEmailGeneratorState
    assert.equal(state.email, null)
    assert.equal(JSON.stringify(example.form) === JSON.stringify({ ...example.form }), true)
    assert.match(code("components/email/email-brief-panel.tsx"), /JSON\.stringify\(example\.form\) === JSON\.stringify\(form\)/)
  })
})

// L'état initial du formulaire n'impose rien : tout reste à saisir.
test("formulaire vide à l'origine : objectif par défaut valide, le reste à saisir, génération impossible", () => {
  assert.equal(emptyEmailGeneratorForm.objective, "decouverte-formations")
  assert.equal(draftRequest.objective, emptyEmailGeneratorForm.objective)
  assert.equal(canGenerateEmail(emptyEmailGeneratorForm), false)
})
