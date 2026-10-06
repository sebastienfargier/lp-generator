/**
 * Garde-fous de la COPIE d'un email R4 : ce que Claude peut écrire autour d'une
 * offre dont les valeurs sont contrôlées. Pure, hors ligne, sans modèle.
 *
 * Claude écrit l'accroche, les bénéfices, la transition ; il ne produit jamais
 * une valeur commerciale. Chaque règle ferme une porte par laquelle une valeur
 * pourrait entrer en douce dans du texte libre :
 *
 * - chiffres : aucun dans le corps de l'email ; l'objet et le préheader ne
 *   peuvent citer QUE la valeur de l'offre, à l'identique (« -20 % » ≠ « 25 % »,
 *   « 500 € » ≠ « 550 € ») ;
 * - nombres écrits en lettres, symboles %, €, « pour cent » : mêmes règles ;
 * - dates, délais, comptes à rebours, calculs de jours restants : jamais (la date
 *   de fin est affichée par le système) ;
 * - urgence : jamais de pression (dernière chance, dépêchez-vous…). Les
 *   formulations qui font référence à l'échéance sans la dater ne sont admises
 *   que si une date de fin contrôlée existe ;
 * - portée : « jusqu'à », « à partir de », « économisez » changent la portée de
 *   la valeur contrôlée : refusés ;
 * - code : le code lui-même n'est jamais écrit par Claude (ni aucun mot en
 *   capitales, forme d'un code inventé) ; le mot « code » n'est admis que si
 *   l'offre porte un code ;
 * - financement, prise en charge, gratuité, garanties, conseiller : aucun fait
 *   approuvé pour la promotion V1, donc aucune mention.
 *
 * Tout est comparé sans accents ni casse, sur des frontières de mots.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { numberTokens, promotionOfferNumber, type PromotionFacts } from "./promotion-facts"

export type PromotionCopyField = "subject" | "preheader" | "body"

export type PromotionCopyIssue = { rule: string; message: string; match: string }

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'")

type Rule = { id: string; message: string; pattern: RegExp }

/** Pression et fausse urgence : refusées, avec ou sans date de fin. */
const hardUrgency: readonly Rule[] = [
  { id: "pression", message: "Pas de pression ni de fausse urgence.", pattern: /\b(?:derniere chance|dernieres? heures?|dernier jour|derniers jours|aujourd'hui seulement|seulement aujourd'hui|uniquement aujourd'hui|depechez|ne tardez|vite|avant qu'il ne soit trop tard|trop tard|dernier moment|ne manquez pas|ne ratez pas|plus que (?:quelques|peu|\d+)|il ne reste|compte a rebours|decompte)\b/ },
  { id: "hype", message: "Pas d'emphase marketing ni de superlatif.", pattern: /\b(?:profitez-en|profitez en|incroyable|exceptionnel(?:le)?s?|irresistible|inegalable|unique|exclusi(?:f|fs|ve|ves|vite)|meilleur(?:e)?s? prix|moins cher|prix casses?|promo choc|jamais vu)\b/ },
]

/** Échéance évoquée sans être datée : admise seulement si l'offre a une date de fin contrôlée. */
const deadlineWording: readonly Rule[] = [
  { id: "echeance", message: "Évoquer l'échéance exige une date de fin contrôlée.", pattern: /\b(?:offre limitee|duree limitee|periode limitee|limitee dans le temps|bientot|se termine|prend fin|touche a sa fin|pendant la duree de l'offre|tant que l'offre|fin de l'offre|echeance|expire)\b/ },
]

/** Dates, délais et portée : le système affiche la date de fin ; Claude ne date, ne calcule, ne borne rien. */
const datesAndScope: readonly Rule[] = [
  { id: "date", message: "Aucune date dans la copie : la date de fin est affichée par le système.", pattern: /\b(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|ce soir|cette semaine|ce mois|le mois prochain|fin d'(?:annee|ete|ete)|d'ici (?:la fin|le))\b/ },
  { id: "jusqua", message: "« jusqu'au » / « jusqu'à » changent la portée de la valeur ou datent l'offre.", pattern: /\b(?:jusqu'(?:au|a|aux|en)|avant le|a partir (?:du|de|d')|des le|d'ici)\b/ },
  { id: "economie", message: "Aucun calcul d'économie : la valeur de l'offre est affichée telle quelle.", pattern: /\b(?:economis\w*|gagnez|gagner de l'argent|remise de|reduction de|rabais de)\b/ },
]

/** Financement, gratuité, garanties, service : aucun fait approuvé pour la promotion V1. */
const unsupportedClaims: readonly Rule[] = [
  { id: "financement", message: "Aucune mention de financement : aucun fait approuvé pour cette promotion.", pattern: /\b(?:financ\w*|cpf|compte personnel de formation|france travail|pole emploi|opco|prise en charge|pris en charge|prise en charge|mensualit\w*|paiement (?:en|echelonne|fractionne)|echelonn\w*|facilites? de paiement|subvention\w*|eligib\w*|reste a charge|sans frais)\b/ },
  { id: "gratuit", message: "Aucune gratuité ni cadeau : aucun fait approuvé.", pattern: /\b(?:gratuit\w*|offert(?:e)?s?|cadeau\w*|sans engagement financier)\b/ },
  { id: "garantie", message: "Aucune garantie ni résultat promis.", pattern: /\b(?:garanti\w*|garantie\w*|reussite assuree|emploi assure|satisfait ou rembourse)\b/ },
  { id: "service", message: "Aucun service précis promis (conseiller, accompagnement individuel) : aucun fait approuvé.", pattern: /\b(?:conseill(?:er|ere|ers|eres)|coach\w*|tuteur\w*|mentor\w*|accompagnement personnalise|accompagne a chaque etape)\b/ },
]

const codeWords = /\b(?:code|codes|coupon|coupons|bon de reduction)\b/

/** Nombres en toutes lettres suivis d'une unité commerciale ou de durée, et « pour cent » : un chiffre qui s'écrit. */
const spelledNumber = /\b(?:(?:un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|mille)\s+(?:pour cent|euros?|jours?|mois|semaines?|heures?|minutes?|ans?|annees?)|pour cent)\b/
const symbols = /[%€$£]|\beuros?\b/i

function firstMatch(rules: readonly Rule[], text: string): PromotionCopyIssue | undefined {
  for (const rule of rules) {
    const match = rule.pattern.exec(text)
    if (match) return { rule: rule.id, message: rule.message, match: match[0] }
  }
  return undefined
}

/** Valeur de l'offre citée dans un texte, sous l'une des formes admises ; sinon `undefined`. */
function offerMentions(text: string, expected: { digits: string; unit: "€" | "%" }) {
  const pattern = /(-|−)?\s?(\d[\d   .,]*\d|\d)\s?(%|€|euros?\b|pour cent)?/gi
  return [...text.matchAll(pattern)].map((match) => {
    const digits = match[2]!.replace(/[   ]/g, "")
    const unit = match[3] ? (/^%|pour cent/i.test(match[3]) ? "%" : "€") : undefined
    return { raw: match[0].trim(), exact: digits === expected.digits && unit === expected.unit }
  })
}

export type PromotionCopyContext = {
  /** `true` : une date de fin contrôlée existe (toujours le cas d'une promotion V1). */
  hasDeadline: boolean
  /** `true` : l'offre porte un code (le mot « code » est alors admis, le code lui-même jamais). */
  hasCode: boolean
}

/**
 * Vérifie un texte écrit par Claude. Renvoie les problèmes, jamais une
 * correction. `field` : l'objet et le préheader peuvent citer la valeur de
 * l'offre, à l'identique ; le corps ne cite aucun chiffre.
 */
export function lintPromotionCopy(text: string, field: PromotionCopyField, facts: Pick<PromotionFacts, "offer" | "code">, context?: Partial<PromotionCopyContext>): PromotionCopyIssue[] {
  const { hasDeadline = true, hasCode = facts.code !== undefined } = context ?? {}
  const issues: PromotionCopyIssue[] = []
  const folded = fold(text)
  const push = (issue: PromotionCopyIssue | undefined) => {
    if (issue) issues.push(issue)
  }

  /* Chiffres */
  if (field === "body") {
    if (numberTokens(text).length > 0 || symbols.test(text)) issues.push({ rule: "chiffre", message: "Aucun chiffre, symbole % ou € dans le corps : les valeurs commerciales viennent des Promotion Facts.", match: (text.match(/\d[\d  .,]*|[%€$£]|euros?/i) ?? [""])[0]!.trim() })
  } else {
    const expected = promotionOfferNumber(facts)
    const mentions = offerMentions(text, expected)
    const wrong = mentions.find((mention) => !mention.exact)
    if (wrong) issues.push({ rule: "chiffre", message: "L'objet et le préheader ne citent que la valeur de l'offre, à l'identique.", match: wrong.raw })
    else if (/[%€$£]|\beuros?\b/i.test(text) && mentions.length === 0) issues.push({ rule: "chiffre", message: "Symbole monétaire ou pourcentage sans la valeur de l'offre.", match: (text.match(/[%€$£]|euros?/i) ?? [""])[0]! })
  }
  push(spelledNumber.test(folded) ? { rule: "chiffre-lettres", message: "Aucun nombre écrit en lettres : les valeurs viennent des Promotion Facts.", match: (spelledNumber.exec(folded) ?? [""])[0]! } : undefined)

  /* Dates, portée, urgence */
  push(firstMatch(datesAndScope, folded))
  push(firstMatch(hardUrgency, folded))
  if (!hasDeadline) push(firstMatch(deadlineWording, folded))

  /* Code */
  if (!hasCode) {
    const word = codeWords.exec(folded)
    if (word) issues.push({ rule: "code", message: "Aucun code dans cette offre : aucune mention de code.", match: word[0] })
  } else if (facts.code && new RegExp(`(^|[^A-Za-z0-9-])${facts.code.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}($|[^A-Za-z0-9-])`, "i").test(text)) {
    issues.push({ rule: "code", message: "Le code n'est jamais écrit par Claude : le système l'affiche.", match: facts.code })
  }

  // Un code inventé s'écrit en capitales : aucun mot en capitales dans la copie (le code vient des Promotion Facts).
  const shout = /\b[A-ZÀ-Ý][A-ZÀ-Ý0-9-]{4,}\b/.exec(text)
  if (shout) issues.push({ rule: "code", message: "Aucun mot en capitales : un code ne s'écrit pas dans la copie, il vient des Promotion Facts.", match: shout[0] })

  /* Affirmations sans fait approuvé */
  push(firstMatch(unsupportedClaims, folded))
  return issues
}
