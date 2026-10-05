/**
 * Formulaire de /email-generator : valeurs, validation légère et conversion en
 * corps de requête. Module pur, utilisable côté client : il n'importe rien du
 * moteur, de Claude ni de la démo. Le serveur reste l'autorité (`generate-handler.ts`).
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailPublicErrorCode } from "./generate-handler"

/** Objectifs que le moteur V1 génère, avec leur libellé utilisateur. */
export const emailGeneratorObjectiveValues = ["decouverte-formations", "accompagnement", "evolution-carriere"] as const

export type EmailGeneratorObjective = (typeof emailGeneratorObjectiveValues)[number]

export type EmailGeneratorForm = {
  campaignName: string
  /** Facultatif : vide, l'IA propose l'objet. */
  subject: string
  brief: string
  audience: string
  objective: EmailGeneratorObjective
  /** Une information par ligne ; facultatif. */
  facts: string
}

/** Un exemple de brief : un clic préremplit le formulaire, sans lancer de génération. */
export type EmailGeneratorExample = { id: string; label: string; form: EmailGeneratorForm }

/* -------------------------------------------------------------------------- */
/* Informations à reprendre telles quelles                                    */
/* -------------------------------------------------------------------------- */

export const emailFactsLimits = { maxCount: 8, maxLength: 200 } as const

/** Une ligne non vide = une information, sans espaces autour. */
export function parseEmailFactsInput(input: string | undefined): string[] {
  return (input ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

/** Validation légère côté client ; le serveur reste l'autorité. */
export function emailFactsInputError(input: string | undefined): string | null {
  const facts = parseEmailFactsInput(input)
  if (facts.length > emailFactsLimits.maxCount) {
    return `${emailFactsLimits.maxCount} informations au maximum : regroupez ou retirez-en.`
  }
  if (facts.some((fact) => fact.length > emailFactsLimits.maxLength)) {
    return `Chaque information tient en ${emailFactsLimits.maxLength} caractères au maximum.`
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Formulaire                                                                 */
/* -------------------------------------------------------------------------- */

export const emptyEmailGeneratorForm: EmailGeneratorForm = {
  campaignName: "",
  subject: "",
  brief: "",
  audience: "",
  objective: "decouverte-formations",
  facts: "",
}

/** Champs obligatoires remplis, objectif valide, informations dans leurs limites. L'objet est facultatif. */
export function canGenerateEmail(form: EmailGeneratorForm): boolean {
  return (
    [form.campaignName, form.brief, form.audience].every((value) => value.trim() !== "") &&
    (emailGeneratorObjectiveValues as readonly string[]).includes(form.objective) &&
    emailFactsInputError(form.facts) === null
  )
}

/**
 * Corps de `POST /api/generate-email`. L'objet n'est envoyé que s'il est
 * rempli (il reste alors l'objet final) ; les informations partent en lignes
 * de texte, que le serveur convertit en faits `{ statement }`.
 */
export function toEmailRequestBody(form: EmailGeneratorForm) {
  const subject = form.subject.trim()
  const facts = parseEmailFactsInput(form.facts)
  return {
    campaignName: form.campaignName.trim(),
    ...(subject ? { subject } : {}),
    brief: form.brief.trim(),
    audience: form.audience.trim(),
    objective: form.objective,
    ...(facts.length > 0 ? { facts } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                    */
/* -------------------------------------------------------------------------- */

/** Erreur côté navigateur : le service n'a pas répondu ou sa réponse est illisible. */
export type EmailClientErrorCode = EmailPublicErrorCode | "network"

export type EmailErrorFamily = "request" | "temporary" | "configuration"

/**
 * Trois familles d'erreurs pour l'utilisateur. Le `Record` est exhaustif : un
 * nouveau code public ne compile pas tant qu'on n'a pas décidé de ce qu'il dit.
 */
export const emailErrorFamilies: Record<EmailClientErrorCode, EmailErrorFamily> = {
  "invalid-request": "request",
  unsupported: "request",
  "rate-limit": "temporary",
  "provider-error": "temporary",
  timeout: "temporary",
  refused: "request",
  "invalid-output": "temporary",
  "invalid-draft": "temporary",
  unresolvable: "temporary",
  "invalid-email": "temporary",
  "validation-failed": "temporary",
  rendering: "temporary",
  network: "temporary",
  configuration: "configuration",
  internal: "configuration",
}

const fieldLabels: Record<string, string> = {
  campaignName: "Nom de campagne",
  subject: "Objet",
  brief: "Brief",
  audience: "Audience",
  objective: "Objectif",
  facts: "Informations à reprendre telles quelles",
}

export type EmailErrorView = {
  title: string
  /** Messages affichés : jamais de chemin technique ni de détail interne. */
  messages: string[]
  /** Que faire ensuite. */
  hint: string
}

type PublicIssue = { path: string; message: string }

/** Ce que voit l'utilisateur pour une erreur publique : titre, messages et suite à donner. */
export function describeEmailError(error: { code: EmailClientErrorCode; issues?: readonly PublicIssue[] }): EmailErrorView {
  const family = emailErrorFamilies[error.code] ?? "configuration"
  if (family === "temporary") {
    return {
      title: "Génération impossible pour le moment",
      messages: [error.code === "network" ? "Le service de génération n'a pas répondu." : "L'email n'a pas pu être généré correctement."],
      hint: "Réessayez dans un instant.",
    }
  }
  if (family === "configuration") {
    return {
      title: "Service indisponible",
      messages: ["Le service de génération n'est pas disponible."],
      hint: "Contactez l'équipe.",
    }
  }
  // Demande à modifier : les messages du serveur sont courts et sans détail interne ; un champ est nommé par son libellé.
  const messages = (error.issues ?? []).map((issue) => {
    const label = fieldLabels[issue.path.split(".")[0] ?? ""]
    return label ? `${label} : ${issue.message}` : issue.message
  })
  return {
    title: error.code === "unsupported" ? "Demande non prise en charge" : "Demande à modifier",
    messages: messages.length > 0 ? messages : ["La demande ne peut pas être traitée telle quelle."],
    hint: "Modifiez la demande, puis relancez la génération.",
  }
}
