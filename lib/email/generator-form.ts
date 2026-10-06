/**
 * Formulaire de /email-generator : valeurs, validation légère et conversion en
 * corps de requête. Module pur, utilisable côté client : il n'importe rien du
 * moteur, de Claude ni de la démo. Le serveur reste l'autorité (`generate-handler.ts`).
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailPublicErrorCode } from "./generate-handler"

/**
 * Intentions proposées à l'utilisateur, en vocabulaire métier. Le moteur en
 * déduit la recette de façon déterministe (côté serveur) : l'utilisateur ne
 * voit ni recette, ni variante, ni image, ni claim. Deux intentions mènent à la
 * même famille d'email (découverte), avec un angle différent.
 */
export const emailGeneratorIntents = [
  { value: "orientation", label: "Découverte / orientation", hint: "Aider à se situer et à découvrir des métiers et des formations." },
  { value: "accompagnement", label: "Accompagnement / évolution", hint: "Expliquer l'accompagnement et rassurer sur une évolution." },
  { value: "newsletter", label: "Newsletter / contenu éditorial", hint: "Une newsletter à lire : rubriques et conseils." },
  { value: "preuves", label: "Preuves Studi / chiffres clés", hint: "Des repères vérifiés sur Studi, sans offre." },
  { value: "promotion", label: "Promotion / offre commerciale", hint: "Une offre dont les valeurs (montant, code, date) sont saisies, jamais générées." },
] as const

export type EmailGeneratorIntent = (typeof emailGeneratorIntents)[number]["value"]

export const emailGeneratorIntentValues = emailGeneratorIntents.map((intent) => intent.value) as [EmailGeneratorIntent, ...EmailGeneratorIntent[]]

/**
 * Cibles : les cinq audiences de la couche Brand, par leur identifiant
 * technique (un test garde l'égalité avec la couche Brand). La cible décide de la
 * voix (vouvoiement, tutoiement, ton) côté serveur : ce module ne porte aucune
 * règle de marque, seulement des libellés.
 */
export const emailGeneratorTargets = [
  { value: "reconversion", label: "Personnes en reconversion" },
  { value: "actifs_en_poste", label: "Actifs en poste" },
  { value: "alternants", label: "Alternants" },
  { value: "b2b_rh", label: "Entreprises / RH" },
  { value: "demandeurs_emploi", label: "Demandeurs d'emploi" },
] as const

export type EmailGeneratorTarget = (typeof emailGeneratorTargets)[number]["value"]

export const emailGeneratorTargetValues = emailGeneratorTargets.map((target) => target.value) as [EmailGeneratorTarget, ...EmailGeneratorTarget[]]

/**
 * Données de l'offre d'une promotion : saisies, jamais générées. Types et
 * destinations sont des identifiants fermés (un test garde l'égalité avec les
 * Promotion Facts du serveur) ; le serveur reste l'autorité.
 */
export const emailPromotionOfferTypes = [
  { value: "percent", label: "Remise en pourcentage", unit: "%" },
  { value: "amount", label: "Remise en montant", unit: "€" },
] as const
export type EmailPromotionOfferType = (typeof emailPromotionOfferTypes)[number]["value"]

export const emailPromotionDestinations = [
  { value: "catalogue-formations", label: "Catalogue Studi" },
  { value: "alternance", label: "Catalogue Alternance" },
  { value: "diplomes", label: "Formations par niveau de diplôme" },
  { value: "certificats", label: "Certificats professionnels" },
] as const
export type EmailPromotionDestination = (typeof emailPromotionDestinations)[number]["value"]

export type EmailPromotionForm = {
  /** Vide tant que l'utilisateur n'a pas choisi. */
  offerType: EmailPromotionOfferType | ""
  /** Entier : euros ou pourcentage selon le type. */
  value: string
  /** Facultatif ; capitales, chiffres, tirets. */
  code: string
  /** AAAA-MM-JJ. */
  endDate: string
  /** Groupe nominal, ex. « les formations diplômantes ». */
  scope: string
  destination: EmailPromotionDestination | ""
}

export const emptyEmailPromotionForm: EmailPromotionForm = { offerType: "", value: "", code: "", endDate: "", scope: "", destination: "" }

export type EmailGeneratorForm = {
  campaignName: string
  /** Vide tant que l'utilisateur n'a pas choisi. */
  intent: EmailGeneratorIntent | ""
  /** Vide tant que l'utilisateur n'a pas choisi. */
  target: EmailGeneratorTarget | ""
  brief: string
  /** Facultatif : vide, l'IA propose l'objet. */
  subject: string
  /** Une information par ligne ; facultatif. */
  facts: string
  /** Données de l'offre : seulement avec l'intention « promotion ». */
  promotion: EmailPromotionForm
}

/**
 * Un exemple de brief : un clic préremplit le formulaire, sans lancer de
 * génération. `illustrative` : les valeurs de l'offre sont une illustration,
 * pas une offre Studi (voir `generator-examples.ts`).
 */
export type EmailGeneratorExample = { id: string; label: string; form: EmailGeneratorForm; illustrative?: true }

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
  intent: "",
  target: "",
  brief: "",
  subject: "",
  facts: "",
  promotion: emptyEmailPromotionForm,
}

const codePattern = /^[A-Z0-9][A-Z0-9-]{1,19}$/

/** Donnée de l'offre mal saisie, par champ ; `null` : tout est saisi. Le serveur reste l'autorité. */
export function emailPromotionFormError(promotion: EmailPromotionForm): string | null {
  if (promotion.offerType === "") return "Choisissez le type d'offre."
  const value = promotion.value.trim()
  if (!/^\d+$/.test(value) || Number(value) < 1) return "La valeur est un nombre entier positif."
  if (promotion.offerType === "percent" && Number(value) > 100) return "Un pourcentage ne dépasse pas 100."
  if (promotion.code.trim() !== "" && !codePattern.test(promotion.code.trim())) return "Le code : capitales, chiffres et tirets (2 à 20 caractères)."
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promotion.endDate)) return "Indiquez la date de fin de l'offre."
  if (promotion.scope.trim().length < 3) return "Indiquez ce que couvre l'offre."
  if (promotion.destination === "") return "Choisissez la destination du bouton."
  return null
}

/** Champs obligatoires remplis, intention et cible valides, informations dans leurs limites. L'objet est facultatif. */
export function canGenerateEmail(form: EmailGeneratorForm): boolean {
  return (
    [form.campaignName, form.brief].every((value) => value.trim() !== "") &&
    (emailGeneratorIntentValues as readonly string[]).includes(form.intent) &&
    (emailGeneratorTargetValues as readonly string[]).includes(form.target) &&
    (form.intent === "promotion" ? emailPromotionFormError(form.promotion) === null : emailFactsInputError(form.facts) === null)
  )
}

/**
 * Corps de `POST /api/generate-email`. L'objet n'est envoyé que s'il est
 * rempli (il reste alors l'objet final) ; les informations partent en lignes
 * de texte, que le serveur convertit en faits `{ statement }`.
 */
export function toEmailRequestBody(form: EmailGeneratorForm) {
  const subject = form.subject.trim()
  const promotion = form.intent === "promotion"
  // Une promotion n'a pas d'informations libres : l'offre vient de ses propres données.
  const facts = promotion ? [] : parseEmailFactsInput(form.facts)
  return {
    campaignName: form.campaignName.trim(),
    ...(subject ? { subject } : {}),
    brief: form.brief.trim(),
    intent: form.intent,
    target: form.target,
    ...(facts.length > 0 ? { facts } : {}),
    ...(promotion ? { promotion: toPromotionBody(form.promotion) } : {}),
  }
}

/** Données de l'offre du formulaire → Promotion Facts (le nombre est converti, rien n'est inventé). */
export function toPromotionBody(promotion: EmailPromotionForm) {
  const value = Number(promotion.value.trim())
  const code = promotion.code.trim()
  return {
    offer: promotion.offerType === "amount" ? { type: "amount" as const, amount: value } : { type: "percent" as const, percent: value },
    ...(code ? { code } : {}),
    endDate: promotion.endDate,
    scope: promotion.scope.trim(),
    destination: promotion.destination,
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
  "brand-violation": "temporary",
  rendering: "temporary",
  network: "temporary",
  configuration: "configuration",
  internal: "configuration",
}

const fieldLabels: Record<string, string> = {
  campaignName: "Nom de campagne",
  subject: "Objet",
  brief: "Brief",
  intent: "Intention",
  target: "Cible",
  facts: "Informations à reprendre telles quelles",
  promotion: "Données de l'offre",
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
