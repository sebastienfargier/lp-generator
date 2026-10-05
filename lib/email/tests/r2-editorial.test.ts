/**
 * Qualité éditoriale de R2 (newsletter), hors ligne. On ne « teste pas la
 * qualité » d'un modèle : on garantit (1) que le prompt R2 porte les principes
 * éditoriaux, (2) que la sécurité factuelle et de marque est intacte, (3) que
 * R1, R3, les schémas et les contextes n'ont pas bougé, (4) que le budget
 * reste compact, et (5) que des critères structurels distinguent un brouillon
 * générique (celui du premier smoke réel, reconstitué) des deux références.
 * Aucun appel Anthropic.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { describe, test } from "node:test"

import { emailDestinations } from "../destinations"
import { buildRecipeBrandContext } from "../recipe-brand-context"
import { emailRecipeDraftFixtures, resolveEmailRecipeDraftFixture } from "../recipe-draft-fixtures"
import { buildRecipeTransportSchema } from "../recipe-drafts"
import { buildEmailRecipePrompt, discoverySystemPrompt, newsletterSystemPrompt } from "../recipe-prompts"
import { emailRecipeIds, emailRecipes } from "../recipes"
import { measure, type JsonSchema } from "./schema-metrics"

const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 16)

/** Empreintes mesurées AVANT le polish : tout ce qui n'est pas le prompt système de R2 doit rester identique. */
const before = {
  // R3 : prompt et contexte modifiés ensuite, volontairement, par V2-4C (copy claim-safe, chiffres clés) ; leurs empreintes sont dans r3-proof.test.ts.
  system: { "discovery-reassurance": "7daddb994de807e0", "editorial-newsletter": "c3c16e44a2e62968" },
  schema: { "discovery-reassurance": "6b9d61ddcfedfdd9", "editorial-newsletter": "668a8bd61e9f8f8b", "brand-proof": "ba146d9379681f65" },
  context: { "discovery-reassurance": "895a881eaa614dab", "editorial-newsletter": "6d65c02cab11a515" },
  r2: { system: 2048, user: 3069, context: 2591, schemaBytes: 1708, schemaExpanded: 1462 },
} as const

const newsletterRequest = {
  campaignName: "Newsletter Studi — avancer dans son projet",
  brief: "Créer une newsletter éditoriale Studi utile aux actifs qui réfléchissent à leur évolution professionnelle. Donner des repères concrets pour avancer dans son projet, apprendre régulièrement et explorer de nouvelles possibilités sans créer de pression commerciale. Le contenu doit donner envie de poursuivre la lecture et de découvrir les ressources Studi.",
  audience: "Actifs en poste",
  target: "actifs_en_poste",
  intent: "editorial",
  emailType: "newsletter",
}

describe("R2 : principes éditoriaux portés par le prompt", () => {
  const prompt = newsletterSystemPrompt

  test("une idée éditoriale centrale, formulable en une phrase : le hero la porte, le reste la développe sans la reformuler", () => {
    assert.match(prompt, /IDÉE ÉDITORIALE CENTRALE, formulable en une phrase/)
    assert.match(prompt, /le hero la porte, le reste la développe sans la reformuler/)
    assert.match(prompt, /le bouton en est la suite naturelle/)
    assert.match(prompt, /pas un résumé du brief/)
  })

  test("hero ≠ introduction : le hero donne une question, une tension ou une promesse de lecture ; l'intro explique pourquoi et prépare la structure", () => {
    assert.match(prompt, /hero : [^;]*title \(l'idée centrale : question, tension ou promesse de lecture\)/)
    assert.match(prompt, /donnent envie de lire la suite/)
    assert.match(prompt, /intro : title et text : pourquoi le sujet mérite quelques minutes, comment l'édition est construite ; elle ne reformule pas le hero/)
  })

  test("quatre idées distinctes : action, question, observation ou comparaison ; titre spécifique ; ni synonymes, ni variantes de « réfléchissez à votre projet »", () => {
    assert.match(prompt, /exactement 4 rubriques/)
    assert.match(prompt, /idée distincte \(une action, une question à se poser, une chose à observer ou à comparer\)/)
    assert.match(prompt, /titre spécifique/)
    assert.match(prompt, /texte qui dit quoi faire, regarder ou comparer/)
    assert.match(prompt, /Jamais deux rubriques synonymes, jamais quatre variantes de « réfléchissez à votre projet »/)
  })

  test("concret sans inventer : verbe + action observable ; aucun fait Studi non fourni (chiffre, durée, résultat, efficacité, service, formation)", () => {
    assert.match(prompt, /Concret sans inventer/)
    assert.match(prompt, /verbe \+ action observable/)
    for (const action of ["noter", "lister", "comparer", "relire", "tester", "poser une question"]) assert.ok(prompt.includes(action), action)
    const forbidden = prompt.slice(prompt.indexOf("Jamais de fait Studi non fourni"))
    for (const word of ["chiffre", "durée présentée comme vérité", "résultat", "efficacité", "service ou accompagnement précis", "détail d'une formation"]) assert.ok(forbidden.includes(word), word)
  })

  test("anti-générique : variété et précision, sans liste noire absolue", () => {
    const sentence = /Variété : ([^\n]+)/.exec(prompt)![1]!
    for (const phrase of ["à votre rythme", "repères concrets", "pistes concrètes", "passer à l'action", "pas à pas", "réflexion", "projet professionnel"]) assert.ok(sentence.includes(`« ${phrase} »`), phrase)
    assert.match(sentence, /évite de répéter ou d'abuser/)
    assert.match(sentence, /quand une formulation plus précise existe/)
    assert.ok(!/interdi|jamais|ne dis pas|proscri/i.test(sentence), "des préférences, pas des interdictions absolues")
    assert.match(sentence, /ne reprends pas les mots du brief tels quels/)
    assert.ok(sentence.length < 330, "pas de liste noire énorme")
  })

  test("CTA cohérent : destination d'après la promesse du bouton, libellé annonçant ce qu'on trouve, deux libellés différents pour la même destination", () => {
    assert.match(prompt, /Destination : d'après ce que le bouton promet/)
    assert.match(prompt, /un lien vers des profils, des parcours ou des fiches exige que le hero l'annonce/)
    assert.match(prompt, /Même destination que hero\.cta \(un seul appel principal\), mais un libellé différent de celui du hero/)
    assert.match(prompt, /annonce ce que le lecteur trouvera/)
  })

  test("objet et préheader plus exigeants, limites de longueur conservées", () => {
    assert.match(prompt, /subject : 30 à 45 caractères/)
    assert.match(prompt, /un angle précis, sans paraphraser le brief ni inventer de fait, pas forcément un verbe en tête/)
    assert.match(prompt, /preheader : 60 à 90 caractères, une promesse de lecture ou une information, sans répéter l'objet ni le hero/)
    assert.match(prompt, /recopie-le/, "l'objet imposé reste recopié")
  })

  test("la sécurité de marque et factuelle est intacte : faits, interdictions, règles du contexte, vocabulaire fermé, aucun HTML", () => {
    assert.match(prompt, /request\.facts : recopie-le alors à l'identique/)
    assert.match(prompt, /n'écris aucun prix, remise, pourcentage, chiffre, durée, date/)
    assert.match(prompt, /context\.rules et context\.avoid s'appliquent à tout le texte ; context\.voice fixe l'adresse et le ton/)
    assert.match(prompt, /Ce que tu ne produis jamais : d'URL, de lien, de chemin ou d'image/)
    assert.ok(!/claims|support|benefits|email-module|<[a-z]+>|class=/.test(prompt))
    assert.ok(!/offre commerciale|promotion|promo\b/i.test(prompt.replace("ni une offre", "")))
    assert.match(prompt, /ni portraits ni visuels/)
  })
})

describe("R2 : ce qui ne change pas", () => {
  test("R1 inchangé octet pour octet ; R2 figé à l'état du polish validé (1ec7ee3)", () => {
    assert.equal(hash(discoverySystemPrompt), before.system["discovery-reassurance"])
    assert.equal(hash(newsletterSystemPrompt), before.system["editorial-newsletter"])
    assert.notEqual(hash(newsletterSystemPrompt), "65dcb40008c85cf7", "le polish R2 est conservé")
  })

  test("les trois schémas de transport sont identiques, ainsi que les contextes R1 et R2 (Structured Output inchangé)", () => {
    for (const recipe of emailRecipeIds) assert.equal(hash(buildRecipeTransportSchema(recipe)), before.schema[recipe], `schéma ${recipe}`)
    for (const recipe of ["discovery-reassurance", "editorial-newsletter"] as const) assert.equal(hash(buildRecipeBrandContext(recipe, "Adultes", "actifs_en_poste").context), before.context[recipe], `contexte ${recipe}`)
  })

  test("budget compact : le prompt système R2 gagne des principes, le total reste sous 7 000 caractères, contexte et schéma inchangés, risque LOW", () => {
    const prompt = buildEmailRecipePrompt(newsletterRequest)
    assert.ok(prompt.status === "ready" && prompt.recipe === "editorial-newsletter")
    if (prompt.status !== "ready") return
    assert.equal(prompt.system, newsletterSystemPrompt)
    assert.ok(prompt.system.length > before.r2.system && prompt.system.length < 3400, `système R2 : ${prompt.system.length}`)
    assert.ok(prompt.system.length / before.r2.system < 1.7, "moins de +70 %")
    assert.equal(prompt.user.length, before.r2.user, "le message utilisateur (contexte compris) n'a pas bougé")
    assert.equal(JSON.stringify(prompt.context).length, before.r2.context)
    assert.ok(prompt.system.length + prompt.user.length < 7000, `total : ${prompt.system.length + prompt.user.length}`)
    const metrics = measure(prompt.transportSchema as JsonSchema)
    assert.deepEqual([metrics.bytes, metrics.expandedBytes, metrics.alternatives, metrics.optional, metrics.patterns], [before.r2.schemaBytes, before.r2.schemaExpanded, 0, 0, 0])
    assert.ok(metrics.objects <= 8 && metrics.properties <= 32, "LOW")
  })

  test("un seul appel futur, aucun retry, aucune promotion dans les modules de prompt", () => {
    for (const recipe of emailRecipeIds) assert.ok(emailRecipes[recipe].cta.buttons >= 1)
    assert.equal(emailRecipes["editorial-newsletter"].cta.buttons, 2, "hero + clôture, une seule destination")
    assert.equal(emailRecipes["editorial-newsletter"].figures, "none")
  })
})

/* -------------------------------------------------------------------------- */
/* Critères structurels sur des brouillons                                    */
/* -------------------------------------------------------------------------- */

type Draft = {
  subject: string
  preheader: string
  hero: { eyebrow: string; title: string; text: string; cta: { label: string; destination: string } }
  intro: { title: string; text: string }
  rubriques: { eyebrow: string; title: string; items: { title: string; text: string }[] }
  closing: { title: string; text: string; ctaLabel: string }
}

const stop = new Set(["pour", "dans", "avec", "vous", "votre", "vos", "une", "des", "les", "que", "qui", "est", "pas", "plus", "sur", "par", "aux", "son", "ses", "cette", "ces", "tout", "tous", "ainsi", "mais", "comme", "être", "avoir", "faire", "entre", "chaque"])
const words = (text: string) => new Set(text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/).filter((word) => word.length > 3 && !stop.has(word)))
const overlap = (a: string, b: string) => {
  const [x, y] = [words(a), words(b)]
  return [...x].filter((word) => y.has(word)).length / Math.max(1, Math.min(x.size, y.size))
}
const allText = (draft: Draft) => [draft.subject, draft.preheader, draft.hero.eyebrow, draft.hero.title, draft.hero.text, draft.hero.cta.label, draft.intro.title, draft.intro.text, draft.rubriques.eyebrow, draft.rubriques.title, ...draft.rubriques.items.flatMap((item) => [item.title, item.text]), draft.closing.title, draft.closing.text, draft.closing.ctaLabel].join(" ")
const count = (text: string, phrase: string) => text.toLowerCase().split(phrase).length - 1
const flagged = ["à votre rythme", "repères concrets", "pistes concrètes", "passer à l'action", "pas à pas", "réflexion", "projet professionnel"]

/** Ce que le hero doit avoir annoncé pour que le bouton soit une suite naturelle (par destination, au plus quelques destinations « lourdes »). */
const promises: Record<string, RegExp> = { "blog-la-vie-pro": /parcours|profils/i, metiers: /métier|fiche/i, "trajectoire-magazine": /magazine|lire|lecture/i, "blog-les-tips-et-conseils": /conseil|astuce|idées/i, methode: /méthode|apprend/i }

/** Défauts structurels : liste vide pour une bonne newsletter. Des critères, pas un jugement de qualité. */
function editorialDefects(draft: Draft): string[] {
  const defects: string[] = []
  const text = allText(draft)
  for (const phrase of flagged) if (count(text, phrase) > 1) defects.push(`répétition : ${phrase}`)
  if (draft.hero.cta.label.trim().toLowerCase() === draft.closing.ctaLabel.trim().toLowerCase()) defects.push("même libellé de bouton deux fois")
  const promise = promises[draft.hero.cta.destination]
  if (promise && !promise.test(`${draft.hero.title} ${draft.hero.text}`)) defects.push("bouton du hero non préparé par le hero")
  if (overlap(`${draft.hero.title} ${draft.hero.text}`, draft.intro.text) > 0.3) defects.push("introduction trop proche du hero")
  const items = draft.rubriques.items
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (overlap(`${items[i]!.title} ${items[i]!.text}`, `${items[j]!.title} ${items[j]!.text}`) > 0.25) defects.push(`rubriques ${i + 1} et ${j + 1} trop proches`)
  if (new Set(items.map((item) => item.title.toLowerCase())).size !== items.length) defects.push("titres de rubriques identiques")
  if (overlap(draft.subject, draft.preheader) > 0.34) defects.push("objet et préheader redondants")
  if (overlap(draft.preheader, `${draft.hero.title} ${draft.hero.text}`) > 0.5) defects.push("préheader qui répète le hero")
  if (draft.subject.length < 30 || draft.subject.length > 45) defects.push("longueur de l'objet")
  if (draft.preheader.length < 60 || draft.preheader.length > 90) defects.push("longueur du préheader")
  if (/\d/.test(text)) defects.push("chiffre")
  return defects
}

/** Le brouillon du premier smoke réel (HTTP 200, classé B), reconstitué depuis ce qui s'affichait. */
const smokeBaseline: Draft = {
  subject: "Avancer dans votre projet, pas à pas",
  preheader: "Des repères concrets pour apprendre régulièrement et explorer de nouvelles pistes.",
  hero: {
    eyebrow: "Votre projet",
    title: "Avancer à votre rythme, tout en restant en poste",
    text: "Réfléchir à son évolution demande du temps et des repères. Cette édition vous propose des pistes concrètes pour avancer.",
    cta: { label: "Découvrir les profils", destination: "blog-la-vie-pro" },
  },
  intro: {
    title: "Un projet se construit étape par étape",
    text: "Faire évoluer sa carrière ne se décide pas en un jour. Vous pouvez avancer par petites touches, en tenant compte de votre emploi et de votre quotidien. Voici de quoi nourrir votre réflexion.",
  },
  rubriques: {
    eyebrow: "Au programme",
    title: "Des repères pour passer à l'action",
    items: [
      { title: "Clarifier votre envie d'évoluer", text: "Identifier ce qui vous motive peut aider à poser un cap. Notez ce que vous aimez dans votre métier et ce que vous souhaitez changer." },
      { title: "Apprendre régulièrement", text: "Des temps d'apprentissage courts, mais réguliers, peuvent favoriser la montée en compétences. L'important est de trouver un rythme compatible avec votre emploi." },
      { title: "Explorer de nouveaux métiers", text: "Découvrir d'autres métiers peut ouvrir des possibilités auxquelles vous n'aviez pas pensé. Les missions, les compétences attendues et les évolutions possibles aident à se projeter." },
      { title: "S'inspirer de parcours d'actifs", text: "Lire le parcours d'autres professionnels peut vous donner des idées concrètes. Chaque trajectoire est différente, mais chacune peut éclairer la vôtre." },
    ],
  },
  closing: { title: "Poursuivez votre réflexion", text: "Découvrez des profils d'actifs qui montent en compétences. Ils peuvent vous aider à préciser votre propre projet, à votre rythme.", ctaLabel: "Découvrir les profils" },
}

describe("R2 : critères structurels sur des brouillons (pas un jugement de qualité)", () => {
  const references = emailRecipeDraftFixtures.filter((fixture) => fixture.recipe === "editorial-newsletter")

  test("deux références éditoriales : actifs en poste / évolution (bandeau) et découverte (frise de portraits)", () => {
    assert.deepEqual(references.map((fixture) => fixture.id), ["D-R2-A", "D-R2-B"])
    assert.deepEqual(references.map((fixture) => (fixture.draft as { edition: string }).edition), ["banner", "portrait-strip"])
    assert.deepEqual(references.map((fixture) => (fixture.request as { target?: string }).target), ["actifs_en_poste", "reconversion"])
  })

  test("les deux références ne présentent aucun défaut structurel", () => {
    for (const fixture of references) assert.deepEqual(editorialDefects(fixture.draft as unknown as Draft), [], fixture.id)
  })

  test("le brouillon du smoke réel, lui, en présente : répétitions, même libellé de bouton, bouton non préparé", () => {
    const defects = editorialDefects(smokeBaseline)
    assert.ok(defects.includes("répétition : à votre rythme"), defects.join(" | "))
    assert.ok(defects.includes("répétition : réflexion"), defects.join(" | "))
    assert.ok(defects.includes("même libellé de bouton deux fois"), defects.join(" | "))
    assert.ok(defects.includes("bouton du hero non préparé par le hero"), defects.join(" | "))
    assert.ok(defects.length >= 4, defects.join(" | "))
  })

  test("les critères détectent des défauts synthétiques isolés", () => {
    const good = structuredClone(references[0]!.draft as unknown as Draft)
    const mutate = (change: (draft: Draft) => void) => {
      const draft = structuredClone(good)
      change(draft)
      return editorialDefects(draft)
    }
    assert.ok(mutate((d) => (d.intro.text = d.hero.text)).includes("introduction trop proche du hero"))
    assert.ok(mutate((d) => (d.rubriques.items[1] = { ...d.rubriques.items[0]! })).some((defect) => /rubriques 1 et 2/.test(defect)))
    assert.ok(mutate((d) => (d.closing.ctaLabel = d.hero.cta.label)).includes("même libellé de bouton deux fois"))
    assert.ok(mutate((d) => (d.hero.text = "Une édition pour réfléchir.")).includes("bouton du hero non préparé par le hero"))
    assert.ok(mutate((d) => (d.preheader = d.subject + " et la suite")).includes("objet et préheader redondants"))
    assert.ok(mutate((d) => (d.hero.text += " Plus de 400 formations.")).includes("chiffre"))
    assert.ok(mutate((d) => (d.rubriques.items.forEach((item) => (item.text += " Pensez à votre réflexion.")))).includes("répétition : réflexion"))
    assert.deepEqual(mutate(() => undefined), [])
  })

  test("les références respectent la voix et la sécurité : vouvoiement, aucun chiffre, aucune claim, aucun terme à risque, destinations contrôlées de la recette", () => {
    for (const fixture of references) {
      const draft = fixture.draft as unknown as Draft
      const text = allText(draft).toLowerCase()
      assert.ok(!/\b(tu|ton|ta|tes|toi)\b/.test(text), `${fixture.id} : tutoiement`)
      assert.ok(/\bvous\b|\bvotre\b|\bvos\b/.test(text), fixture.id)
      for (const risk of ["garanti", "gratuit", "réussite assurée", "sans effort", "100 %", "reconnue par l'état", "master", "coach", "facile", "rapide"]) assert.ok(!text.includes(risk), `${fixture.id} : ${risk}`)
      assert.ok((emailRecipes["editorial-newsletter"].destinations as readonly string[]).includes(draft.hero.cta.destination))
      assert.ok(draft.hero.cta.destination in emailDestinations)
      const { resolution } = resolveEmailRecipeDraftFixture(fixture.id)
      assert.ok(resolution.status === "resolved", `${fixture.id} : ${JSON.stringify("issues" in resolution ? resolution.issues : "")}`)
      if (resolution.status !== "resolved") continue
      assert.deepEqual(resolution.diagnostics, [], `${fixture.id} : aucun diagnostic de terminologie`)
      assert.deepEqual(resolution.claims, [], `${fixture.id} : aucune claim`)
    }
  })

  test("ces références servent de test, jamais de texte injecté dans une génération", () => {
    const prompt = buildEmailRecipePrompt(newsletterRequest)
    assert.ok(prompt.status === "ready")
    if (prompt.status !== "ready") return
    for (const fixture of references) {
      const draft = fixture.draft as unknown as Draft
      for (const sentence of [draft.hero.title, draft.intro.text, draft.closing.text, draft.rubriques.items[0]!.text]) assert.ok(!(prompt.system + prompt.user).includes(sentence.slice(0, 40)), sentence)
    }
  })
})
