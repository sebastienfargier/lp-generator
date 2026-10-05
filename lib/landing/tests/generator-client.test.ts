/**
 * Comportement du client de /generator, sans React ni réseau : l'appel unique
 * à l'API et l'état de la page (loading, success, error, conservation du
 * dernier résultat valide).
 */
import assert from "node:assert/strict"
import { describe, mock, test } from "node:test"

import { describeFieldPath, emptyGeneratorBrief, factsInputError, maxGeneratorFacts, parseFactsInput } from "../brief"
import { requestLandingGeneration } from "../generate-client"
import { canGenerate, describeGeneratedPage, generatorReducer, generatorSubmitLabel, initialGeneratorState, type GeneratorState } from "../generator-state"
import { resolveLandingDraft } from "../draft-resolver"
import { safeParseLandingGenerationRequest } from "../generation-request"
import { landingGenerateEndpoint, publicErrorCodes, type PublicGenerationError } from "../public-api"
import { context, request, validDraft } from "./fixtures"
import { generationDraftFor } from "./generate-fixtures"

const brief = { projectName: "  Reconversion RH ", brief: " Un brief. ", audience: " Salariés ", objective: "discover-trainings" }
const resolution = resolveLandingDraft(request, generationDraftFor(validDraft()), context)
assert.ok(resolution.status === "resolved")
const config = resolution.config

/** `fetch` simulé : enregistre les appels, répond ou lève. */
function fakeFetch(respond: () => unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const value = respond()
    if (value instanceof Error) throw value
    return value as Response
  }) as typeof fetch
  return { calls, fetchImpl }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const failure = (error: PublicGenerationError, status: number) => json({ ok: false, error }, status)

describe("requestLandingGeneration : un seul POST", () => {
  test("succès : un POST sur /api/generate avec les quatre champs du brief, et la configuration reçue", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    const outcome = await requestLandingGeneration(brief, fetchImpl)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, landingGenerateEndpoint)
    assert.equal(calls[0]!.url, "/api/generate")
    assert.equal(calls[0]!.init.method, "POST")
    assert.deepEqual(calls[0]!.init.headers, { "Content-Type": "application/json" })
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { projectName: "Reconversion RH", brief: "Un brief.", audience: "Salariés", objective: "discover-trainings" })
    assert.deepEqual(outcome, { status: "success", config })
  })

  test("le corps ne contient que les champs du formulaire : un champ inconnu n'est jamais transmis, sans faits il n'y a pas de `facts`", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    await requestLandingGeneration({ ...brief, extra: "x", apiKey: "secret" } as typeof brief, fetchImpl)
    assert.deepEqual(Object.keys(JSON.parse(calls[0]!.init.body as string)), ["projectName", "brief", "audience", "objective"])
  })

  test("aucune relance, quel que soit l'échec : erreur publique, 429, 500, réseau, réponse illisible", async () => {
    const responses: (() => unknown)[] = [
      () => failure({ code: "rate-limit", message: "Trop de demandes." }, 429),
      () => failure({ code: "internal", message: "Erreur." }, 500),
      () => failure({ code: "timeout", message: "Trop long." }, 504),
      () => new TypeError("Failed to fetch"),
      () => new Response("<html>502</html>", { status: 502 }),
      () => json({ ok: true, config: { version: 2 } }),
    ]
    for (const respond of responses) {
      const { calls, fetchImpl } = fakeFetch(respond)
      const outcome = await requestLandingGeneration(brief, fetchImpl)
      assert.equal(outcome.status, "error")
      assert.equal(calls.length, 1, "un seul POST, jamais de relance")
    }
  })

  test("sans fetch injecté, le fetch global du moment est utilisé, une seule fois", async () => {
    const original = globalThis.fetch
    const spy = mock.method(globalThis, "fetch", async () => json({ ok: true, config }))
    try {
      assert.equal((await requestLandingGeneration(brief)).status, "success")
      assert.equal(spy.mock.callCount(), 1)
    } finally {
      spy.mock.restore()
      assert.equal(globalThis.fetch, original)
    }
  })
})

describe("requestLandingGeneration : réponses", () => {
  test("erreur publique relayée telle quelle : code, message, champs", async () => {
    const error: PublicGenerationError = { code: "invalid-request", message: "Vérifiez.", fields: [{ path: "brief", message: "Le brief est requis." }] }
    const { fetchImpl } = fakeFetch(() => failure(error, 400))
    assert.deepEqual(await requestLandingGeneration(brief, fetchImpl), { status: "error", error })
  })

  test("chaque code public connu est relayé", async () => {
    for (const code of publicErrorCodes) {
      const { fetchImpl } = fakeFetch(() => failure({ code, message: "Message." }, 500))
      const outcome = await requestLandingGeneration(brief, fetchImpl)
      assert.deepEqual(outcome, { status: "error", error: { code, message: "Message." } }, code)
    }
  })

  test("rien d'autre que code, message et champs n'est relayé : pile, sortie brute, identifiants ignorés", async () => {
    const { fetchImpl } = fakeFetch(() => json({ ok: false, error: { code: "internal", message: "Erreur.", stack: "PILE", raw: "SORTIE-BRUTE", requestId: "req_x", fields: [{ path: "brief", message: "m", secret: "S" }, "pas-un-champ"] }, debug: "D" }, 500))
    const outcome = await requestLandingGeneration(brief, fetchImpl)
    assert.deepEqual(outcome, { status: "error", error: { code: "internal", message: "Erreur.", fields: [{ path: "brief", message: "m" }] } })
    assert.ok(!JSON.stringify(outcome).includes("PILE") && !JSON.stringify(outcome).includes("SORTIE-BRUTE") && !JSON.stringify(outcome).includes("req_x"))
  })

  test("échec réseau : erreur publique « network », sans le détail de l'exception", async () => {
    const { fetchImpl } = fakeFetch(() => new TypeError("Failed to fetch https://interne"))
    const outcome = await requestLandingGeneration(brief, fetchImpl)
    assert.deepEqual(outcome, { status: "error", error: { code: "network", message: "Connexion impossible. Vérifiez votre réseau et réessayez." } })
  })

  test("réponse illisible ou inattendue : « invalid-response », le renderer ne reçoit rien", async () => {
    const unreadable = [
      () => new Response("pas du json", { status: 200 }),
      () => json("texte"),
      () => json(null),
      () => json([]),
      () => json({ ok: true }),
      () => json({ ok: true, config: null }),
      () => json({ ok: true, config: { version: 1, id: "x", title: "x", sections: [] } }),
      () => json({ ok: true, config: { ...config, sections: [{ ...config.sections[0], className: "x" }] } }),
      () => json({ ok: false }),
      () => json({ ok: false, error: { code: "code-inconnu", message: "m" } }),
      () => json({ ok: false, error: { code: "internal" } }),
      () => json({ ok: "oui" }),
    ]
    for (const respond of unreadable) {
      const { fetchImpl } = fakeFetch(respond)
      const outcome = await requestLandingGeneration(brief, fetchImpl)
      assert.equal(outcome.status, "error")
      if (outcome.status === "error") assert.equal(outcome.error.code, "invalid-response")
    }
  })

  test("la configuration reçue est revalidée avant d'atteindre le renderer", async () => {
    const withExtra = { ...config, sections: config.sections.map((section) => ({ ...section, props: { ...section.props, style: { color: "red" } } })) }
    const { fetchImpl } = fakeFetch(() => json({ ok: true, config: withExtra }))
    assert.equal((await requestLandingGeneration(brief, fetchImpl)).status, "error")
  })
})

describe("état de la page", () => {
  const apiError: PublicGenerationError = { code: "unavailable", message: "Indisponible." }
  const loading = generatorReducer(initialGeneratorState, { type: "start" })

  test("EMPTY : état initial, aucune configuration, aucune erreur", () => {
    assert.deepEqual(initialGeneratorState, { status: "idle", config: null, error: null })
  })

  test("LOADING : start passe en chargement et efface l'erreur", () => {
    assert.deepEqual(loading, { status: "loading", config: null, error: null })
    const afterError: GeneratorState = { status: "error", config, error: apiError }
    assert.deepEqual(generatorReducer(afterError, { type: "start" }), { status: "loading", config, error: null })
  })

  test("pas de double soumission : start pendant un appel ne change rien (même objet)", () => {
    assert.equal(generatorReducer(loading, { type: "start" }), loading)
  })

  test("SUCCESS : la configuration devient l'état courant", () => {
    assert.deepEqual(generatorReducer(loading, { type: "success", config }), { status: "success", config, error: null })
  })

  test("ERROR sans résultat précédent : erreur affichée, aperçu toujours vide", () => {
    assert.deepEqual(generatorReducer(loading, { type: "failure", error: apiError }), { status: "error", config: null, error: apiError })
  })

  test("ERROR après un succès : la dernière configuration valide est conservée", () => {
    const success = generatorReducer(loading, { type: "success", config })
    const second = generatorReducer(success, { type: "start" })
    assert.equal(second.config, config, "l'aperçu reste affiché pendant la nouvelle génération")
    const failed = generatorReducer(second, { type: "failure", error: apiError })
    assert.deepEqual(failed, { status: "error", config, error: apiError })
    assert.equal(failed.config, config)
  })

  test("un succès ultérieur remplace la configuration et efface l'erreur", () => {
    const failed: GeneratorState = { status: "error", config, error: apiError }
    const other = { ...config, id: "autre-page", title: "Autre page" }
    const next = generatorReducer(generatorReducer(failed, { type: "start" }), { type: "success", config: other })
    assert.deepEqual(next, { status: "success", config: other, error: null })
  })

  test("un résultat tardif hors chargement est ignoré", () => {
    assert.equal(generatorReducer(initialGeneratorState, { type: "success", config }), initialGeneratorState)
    assert.equal(generatorReducer(initialGeneratorState, { type: "failure", error: apiError }), initialGeneratorState)
    const success: GeneratorState = { status: "success", config, error: null }
    assert.equal(generatorReducer(success, { type: "failure", error: apiError }), success)
  })

  test("le réducteur est pur : il n'altère pas l'état reçu", () => {
    const state: GeneratorState = { status: "error", config, error: apiError }
    const snapshot = JSON.stringify(state)
    generatorReducer(state, { type: "start" })
    assert.equal(JSON.stringify(state), snapshot)
  })
})

describe("libellé du bouton : Générer, Génération…, Régénérer", () => {
  const error: PublicGenerationError = { code: "generation-failed", message: "x" }
  const loading = generatorReducer(initialGeneratorState, { type: "start" })

  test("D. avant toute génération : « Générer »", () => {
    assert.equal(generatorSubmitLabel(initialGeneratorState), "Générer")
  })

  test("E. pendant l'appel : « Génération… », première génération comme régénération", () => {
    assert.equal(generatorSubmitLabel(loading), "Génération…")
    const success = generatorReducer(loading, { type: "success", config })
    assert.equal(generatorSubmitLabel(generatorReducer(success, { type: "start" })), "Génération…")
  })

  test("F. après un succès : « Régénérer »", () => {
    assert.equal(generatorSubmitLabel(generatorReducer(loading, { type: "success", config })), "Régénérer")
  })

  test("G. modifier le formulaire n'y change rien : le libellé ne dépend que de l'état de la page (pas de dirty)", () => {
    const success = generatorReducer(loading, { type: "success", config })
    const edited = { ...brief, brief: "Un autre brief.", audience: "Autre audience", facts: "Heure : 19h." }
    assert.equal(JSON.stringify(edited) === JSON.stringify(brief), false)
    assert.equal(generatorSubmitLabel(success), "Régénérer")
    assert.equal(generatorSubmitLabel.length, 1, "un seul argument : l'état, jamais le formulaire")
  })

  test("H. erreur après un succès : l'ancienne preview est conservée et le bouton reste « Régénérer »", () => {
    const success = generatorReducer(loading, { type: "success", config })
    const failed = generatorReducer(generatorReducer(success, { type: "start" }), { type: "failure", error })
    assert.equal(failed.status, "error")
    assert.equal(failed.config, config)
    assert.equal(generatorSubmitLabel(failed), "Régénérer")
  })

  test("I. erreur sur la première génération : pas de preview, le bouton revient à « Générer »", () => {
    const failed = generatorReducer(loading, { type: "failure", error })
    assert.equal(failed.config, null)
    assert.equal(generatorSubmitLabel(failed), "Générer")
  })

  test("après une erreur, un nouveau succès remplace la preview et donne « Régénérer »", () => {
    const failed = generatorReducer(loading, { type: "failure", error })
    const next = generatorReducer(generatorReducer(failed, { type: "start" }), { type: "success", config })
    assert.equal(generatorSubmitLabel(next), "Régénérer")
  })
})

describe("canGenerate : validation légère", () => {
  test("les quatre champs doivent être renseignés ; le serveur reste l'autorité", () => {
    assert.equal(canGenerate(emptyGeneratorBrief), false)
    assert.equal(canGenerate({ ...emptyGeneratorBrief, objective: "discover-trainings" }), false)
    assert.equal(canGenerate(brief), true)
    for (const key of ["projectName", "brief", "audience", "objective"] as const) {
      assert.equal(canGenerate({ ...brief, [key]: "   " }), false, key)
      assert.equal(canGenerate({ ...brief, [key]: "" }), false, key)
    }
  })
})

describe("légende du résultat : « Page générée · N sections »", () => {
  const loading = generatorReducer(initialGeneratorState, { type: "start" })
  const legend = (state: GeneratorState) => (state.config ? describeGeneratedPage(state.config) : null)

  test("aucune légende avant une génération réussie : ni au départ, ni pendant, ni après un premier échec", () => {
    assert.equal(legend(initialGeneratorState), null)
    assert.equal(legend(loading), null)
    assert.equal(legend(generatorReducer(loading, { type: "failure", error: { code: "timeout", message: "x" } as PublicGenerationError })), null)
  })

  test("après un succès : « Page générée » et le vrai nombre de sections de la configuration", () => {
    const text = describeGeneratedPage(config)
    assert.match(text, /^Page générée · \d+ sections?$/)
    assert.equal(text, `Page générée · ${config.sections.length} ${config.sections.length > 1 ? "sections" : "section"}`)
    assert.equal(legend(generatorReducer(loading, { type: "success", config })), text)
  })

  test("singulier à une section, pluriel sinon ; aucun identifiant technique, aucun JSON", () => {
    const one = { ...config, sections: config.sections.slice(0, 1) }
    assert.equal(describeGeneratedPage(one), "Page générée · 1 section")
    assert.equal(describeGeneratedPage({ ...config, sections: [...config.sections, ...config.sections] }), `Page générée · ${config.sections.length * 2} sections`)
    for (const section of config.sections) assert.ok(!describeGeneratedPage(config).includes(section.id))
    assert.ok(!/[{}"\[\]]/.test(describeGeneratedPage(config)))
  })

  test("la légende suit la dernière configuration valide (un échec ultérieur ne la change pas)", () => {
    const success = generatorReducer(loading, { type: "success", config })
    const failed = generatorReducer(generatorReducer(success, { type: "start" }), { type: "failure", error: { code: "timeout", message: "x" } as PublicGenerationError })
    assert.equal(legend(failed), legend(success))
  })
})

/* -------------------------------------------------------------------------- */
/* Informations à reprendre telles quelles (request.facts)                    */
/* -------------------------------------------------------------------------- */

describe("informations à reprendre : lecture du champ", () => {
  test("une ligne non vide = une information ; lignes vides supprimées, lignes rognées, contenu conservé", () => {
    assert.deepEqual(parseFactsInput("Date du live : 15 octobre 2026.\n\nHeure : 18h30.\nLe live est gratuit.\n"), ["Date du live : 15 octobre 2026.", "Heure : 18h30.", "Le live est gratuit."])
    assert.deepEqual(parseFactsInput("   Heure : 18h30.   \n\t\n  Une   information  avec  des espaces  "), ["Heure : 18h30.", "Une   information  avec  des espaces"])
    assert.deepEqual(parseFactsInput("a\r\nb\r\n\r\nc"), ["a", "b", "c"])
    assert.deepEqual(parseFactsInput("L'inscription est nécessaire. — é à ç"), ["L'inscription est nécessaire. — é à ç"])
  })

  test("champ vide, blanc ou absent : aucune information", () => {
    for (const input of ["", "   ", "\n\n", " \n \t \n", undefined]) assert.deepEqual(parseFactsInput(input), [], JSON.stringify(input))
  })

  test("12 informations acceptées, 13 refusées côté client (les lignes vides ne comptent pas)", () => {
    const lines = (count: number) => Array.from({ length: count }, (_, index) => `Information ${index + 1}.`)
    assert.equal(maxGeneratorFacts, 12)
    assert.equal(factsInputError(lines(12).join("\n")), null)
    assert.equal(factsInputError(lines(12).join("\n\n")), null)
    assert.equal(factsInputError(lines(13).join("\n")), "12 informations au plus (13 saisies).")
    assert.equal(factsInputError(`${lines(12).join("\n")}\n\n\n`), null)
    assert.equal(canGenerate({ ...brief, facts: lines(12).join("\n") }), true)
    assert.equal(canGenerate({ ...brief, facts: lines(13).join("\n") }), false)
  })

  test("le champ est facultatif : sans information, la génération reste possible", () => {
    for (const facts of [undefined, "", "   \n  "]) assert.equal(canGenerate({ ...brief, facts }), true, JSON.stringify(facts))
  })

  test("libellé des chemins renvoyés par le serveur : l'information n° N (non vide), pas la ligne du texte", () => {
    assert.equal(describeFieldPath("facts"), "Informations à reprendre")
    assert.equal(describeFieldPath("facts.0.value"), "Informations à reprendre (n° 1)")
    assert.equal(describeFieldPath("facts.2.value"), "Informations à reprendre (n° 3)")
    assert.equal(describeFieldPath("projectName"), "Nom du projet")
    assert.equal(describeFieldPath("inconnu"), "inconnu")
  })
})

describe("informations à reprendre : requête envoyée à /api/generate", () => {
  const send = async (facts: string | undefined) => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    const outcome = await requestLandingGeneration({ ...brief, facts }, fetchImpl)
    return { calls, outcome, body: calls[0] ? (JSON.parse(calls[0].init.body as string) as Record<string, unknown>) : undefined }
  }

  test("A. aucune information : une requête, sans champ `facts`", async () => {
    for (const facts of [undefined, "", "  \n "]) {
      const { calls, outcome, body } = await send(facts)
      assert.equal(calls.length, 1)
      assert.equal(outcome.status, "success")
      assert.ok(!("facts" in body!))
    }
  })

  test("B. une ligne : facts = [{ value }] ; C. quatre lignes : quatre informations", async () => {
    assert.deepEqual((await send("Heure : 18h30.")).body!.facts, [{ value: "Heure : 18h30." }])
    const four = (await send("a\nb\nc\nd")).body!.facts as { value: string }[]
    assert.deepEqual(four, [{ value: "a" }, { value: "b" }, { value: "c" }, { value: "d" }])
  })

  test("D. lignes vides intermédiaires supprimées ; E. espaces autour d'une ligne rognés", async () => {
    assert.deepEqual((await send("a\n\n\nb\n  \nc")).body!.facts, [{ value: "a" }, { value: "b" }, { value: "c" }])
    assert.deepEqual((await send("   a   \n\tb\t")).body!.facts, [{ value: "a" }, { value: "b" }])
  })

  test("F. douze informations : acceptées et envoyées", async () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `Information ${index + 1}.`)
    const { calls, body } = await send(twelve.join("\n"))
    assert.equal(calls.length, 1)
    assert.deepEqual(body!.facts, twelve.map((value) => ({ value })))
  })

  test("G. treize informations : refus côté client, AUCUNE requête, erreur près du champ", async () => {
    const thirteen = Array.from({ length: 13 }, (_, index) => `Information ${index + 1}.`).join("\n")
    const { calls, outcome } = await send(thirteen)
    assert.equal(calls.length, 0)
    assert.equal(outcome.status, "error")
    if (outcome.status !== "error") return
    assert.equal(outcome.error.code, "invalid-request")
    assert.deepEqual(outcome.error.fields, [{ path: "facts", message: "12 informations au plus (13 saisies)." }])
  })

  test("J. une seconde génération utilise les informations modifiées ; K. le corps contient exactement les informations attendues", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    await requestLandingGeneration({ ...brief, facts: "Heure : 18h30." }, fetchImpl)
    await requestLandingGeneration({ ...brief, facts: "Heure : 19h00.\nLe live est gratuit." }, fetchImpl)
    await requestLandingGeneration({ ...brief, facts: "" }, fetchImpl)
    const bodies = calls.map((call) => JSON.parse(call.init.body as string))
    assert.deepEqual(bodies[0].facts, [{ value: "Heure : 18h30." }])
    assert.deepEqual(bodies[1].facts, [{ value: "Heure : 19h00." }, { value: "Le live est gratuit." }])
    assert.ok(!("facts" in bodies[2]))
    assert.deepEqual(Object.keys(bodies[1]), ["projectName", "brief", "audience", "objective", "facts"])
  })

  test("I. après une erreur serveur, la même saisie peut être renvoyée telle quelle (le formulaire n'est pas modifié par l'appel)", async () => {
    const values = { ...brief, facts: "Heure : 18h30.\nLe live est gratuit." }
    const snapshot = JSON.stringify(values)
    const { calls, fetchImpl } = fakeFetch(() => failure({ code: "generation-failed", message: "Réessayez." }, 422))
    const first = await requestLandingGeneration(values, fetchImpl)
    assert.equal(first.status, "error")
    assert.equal(JSON.stringify(values), snapshot, "l'appel ne modifie pas la saisie")
    const second = await requestLandingGeneration(values, fetchImpl)
    assert.equal(second.status, "error")
    assert.deepEqual(JSON.parse(calls[1]!.init.body as string), JSON.parse(calls[0]!.init.body as string))
  })

  test("l'état de la page n'efface ni ne remplace jamais les informations saisies (H, I)", () => {
    const form = { ...brief, facts: "Heure : 18h30." }
    const snapshot = JSON.stringify(form)
    let state: GeneratorState = initialGeneratorState
    state = generatorReducer(state, { type: "start" })
    state = generatorReducer(state, { type: "success", config })
    state = generatorReducer(state, { type: "start" })
    state = generatorReducer(state, { type: "failure", error: { code: "generation-failed", message: "x" } })
    assert.equal(JSON.stringify(form), snapshot)
    assert.deepEqual(Object.keys(state).sort(), ["config", "error", "status"], "le réducteur ne porte aucune saisie")
  })
})

describe("informations à reprendre : scénario de démo « Studi Live Orientation »", () => {
  const demo = {
    projectName: "Studi Live Orientation",
    audience: "adultes en réflexion sur leur orientation ou leur reconversion",
    objective: "discover-trainings",
    brief:
      "Studi organise un live consacré à l'orientation et à la reconversion.\nLa landing page doit annoncer clairement ce rendez-vous, puis aider\nles visiteurs à explorer les formations et à préciser leur projet.\nLe live doit constituer un temps fort visible de la page, sans\ntransformer toute la landing en page événementielle.",
    facts: "Date du live : 15 octobre 2026.\nHeure : 18h30.\nLe live est gratuit.\nL'inscription est nécessaire.",
  }
  const expected = ["Date du live : 15 octobre 2026.", "Heure : 18h30.", "Le live est gratuit.", "L'inscription est nécessaire."]

  test("la saisie donne exactement les quatre informations attendues", () => {
    assert.deepEqual(parseFactsInput(demo.facts), expected)
    assert.equal(canGenerate(demo), true)
  })

  test("la requête envoyée contient ces informations (format `{ value }` de request.facts), sans appel réel", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    await requestLandingGeneration(demo, fetchImpl)
    assert.equal(calls.length, 1)
    const body = JSON.parse(calls[0]!.init.body as string)
    assert.deepEqual(body.facts, expected.map((value) => ({ value })))
    assert.equal(body.projectName, "Studi Live Orientation")
    assert.equal(body.objective, "discover-trainings")
  })

  test("cette requête est acceptée par le contrat serveur existant, qui garde les informations dans l'ordre", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json({ ok: true, config }))
    await requestLandingGeneration(demo, fetchImpl)
    const parsed = safeParseLandingGenerationRequest(JSON.parse(calls[0]!.init.body as string))
    assert.equal(parsed.success, true)
    if (parsed.success) assert.deepEqual(parsed.data.facts?.map((fact) => fact.value), expected)
  })
})
