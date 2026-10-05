import { provenanceOf, type BrandDocumentId } from "./provenance"
import type { BrandProvenance, BrandSeverity } from "./types"

/**
 * Lexique de marque exécutable : les formulations que le corpus interdit
 * (`04-lexique-marque`, `02`, `06`, `07`, `12`, `14`, `01`), chacune avec sa
 * source, sa gravité et, quand le corpus la donne, son alternative. Aucune
 * règle n'est inventée : `corpusEntry` désigne la ligne `mot_interdit` du
 * lexique d'où elle vient, et un test vérifie que la ligne et l'alternative
 * existent bien dans le document.
 *
 * `lintBrandText` est pur et déterministe : il repère, il ne corrige jamais. Il
 * ne comprend pas la langue : il cherche des formulations précises, sans accent
 * ni casse, en mots entiers. Les exceptions que le corpus formule lui-même
 * (« Diplômé ou Remboursé », « jusqu'à 100 % ») sont écrites ici.
 *
 * Les statuts sont ceux des documents : toutes ces sources sont `en_revue` ou
 * `brouillon`, jamais approuvées. Une alerte est donc une aide à la relecture,
 * pas un verdict juridique.
 */

export type BrandTerminologyRule = {
  id: string
  /** Ce que la règle interdit, en clair. */
  label: string
  /** Motifs cherchés dans le texte replié (sans accent ni casse), sans ancres : elles sont ajoutées. */
  patterns: readonly string[]
  severity: BrandSeverity
  /** Alternative donnée par le corpus, telle quelle. */
  alternative?: string
  documentId: BrandDocumentId
  /** Ligne `mot_interdit` du lexique d'où vient la règle, si elle y figure. */
  corpusEntry?: string
  /** Exception formulée par le corpus : le texte replié, la fin du terme et son début. */
  unless?: (folded: string, start: number, end: number) => boolean
  note?: string
}

/* -------------------------------------------------------------------------- */
/* Repliement                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Minuscules, sans accent, apostrophes et espaces insécables normalisés, en
 * gardant EXACTEMENT la longueur du texte d'origine (chaque caractère donne un
 * caractère), pour retrouver la citation d'origine par ses indices.
 */
export function foldBrandText(text: string): string {
  let folded = ""
  for (const char of text) {
    const mapped = /[’‘`´]/.test(char)
      ? "'"
      : /[   ]/.test(char)
        ? " "
        : char.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    // Un caractère qui ne se replie pas en un seul caractère reste tel quel.
    folded += mapped.length === char.length ? mapped : char
  }
  return folded
}

const followsJusqua = (folded: string, start: number) => /jusqu'a\s*$/.test(folded.slice(Math.max(0, start - 14), start))

/* -------------------------------------------------------------------------- */
/* Règles                                                                     */
/* -------------------------------------------------------------------------- */

/** Les règles spécifiques passent avant les générales : à span égal, la première gagne. */
export const brandTerminologyRules = [
  // Promesses de résultat (04, 02, 06)
  { id: "reussite-assuree", label: "« réussite assurée » : résultat interdit", patterns: ["reussite assuree?s?"], severity: "error", alternative: "vous accompagne vers la réussite", documentId: "lexique-marque", corpusEntry: "réussite assurée" },
  { id: "succes-garanti", label: "« succès garanti » : non prouvable", patterns: ["succes garantis?"], severity: "error", alternative: "vous aide à atteindre vos objectifs", documentId: "lexique-marque", corpusEntry: "succès garanti" },
  { id: "transformation-assuree", label: "« transformation assurée » : marketing excessif", patterns: ["transformation assuree?s?"], severity: "warning", alternative: "évolution professionnelle", documentId: "lexique-marque", corpusEntry: "transformation assurée" },
  { id: "emploi-garanti", label: "« job assuré / emploi garanti » : promesse d'emploi illégale", patterns: ["(?:job|emploi) (?:assure|garanti)e?s?"], severity: "error", alternative: "favorise l'employabilité", documentId: "lexique-marque", corpusEntry: "job assuré / emploi garanti" },
  { id: "embauche-garantie", label: "« embauche garantie » : illégal", patterns: ["embauche garantie?s?"], severity: "error", alternative: "préparation à l'emploi", documentId: "lexique-marque", corpusEntry: "embauche garantie" },
  { id: "debouche-garanti", label: "« débouché garanti » : résultat interdit", patterns: ["debouches? garantis?"], severity: "error", alternative: "perspectives professionnelles", documentId: "lexique-marque", corpusEntry: "débouché garanti" },
  { id: "salaire-garanti", label: "« salaire garanti » : interdit", patterns: ["salaires? garantis?"], severity: "error", alternative: "perspectives salariales", documentId: "lexique-marque", corpusEntry: "salaire garanti" },
  { id: "diplome-garanti", label: "« diplôme garanti » : promesse interdite", patterns: ["diplomes? garantis?"], severity: "error", alternative: "préparation à l'obtention du diplôme", documentId: "lexique-marque", corpusEntry: "diplôme garanti" },
  {
    id: "garanti",
    label: "« garanti / assuré » : promesse absolue, risque juridique",
    patterns: ["garanti(?:e|s|es)?"],
    severity: "error",
    alternative: "favorise / peut permettre / vise à",
    documentId: "lexique-marque",
    corpusEntry: "garanti / assuré",
    // Exception du corpus (06) : « Garantie Diplômé ou Remboursé* », avec son disclaimer.
    unless: (folded, _start, end) => /^\s*(?:le |la )?diplome ou rembourse/.test(folded.slice(end)),
    note: "« Garantie Diplômé ou Remboursé* » est la seule formule admise (06), avec « *Soumis à conditions. ».",
  },
  { id: "sans-effort", label: "« sans effort » : mensonger", patterns: ["sans effort"], severity: "error", alternative: "accompagné à chaque étape", documentId: "lexique-marque", corpusEntry: "sans effort" },
  { id: "immediatement-operationnel", label: "« immédiatement opérationnel » : absolu non contractuel", patterns: ["immediatement operationnels?"], severity: "warning", alternative: "compétences mobilisables", documentId: "lexique-marque", corpusEntry: "immédiatement opérationnel" },
  { id: "mieux-paye", label: "« mieux payé » : comparatif flou", patterns: ["mieux paye(?:e|s|es)?"], severity: "warning", alternative: "opportunités professionnelles", documentId: "lexique-marque", corpusEntry: "mieux payé" },
  { id: "succes-rapide", label: "« succès rapide » : résultat promis", patterns: ["succes rapide"], severity: "warning", documentId: "promesse-editoriale" },
  {
    id: "facile-rapide",
    label: "« facile / rapide » : trompeur ou subjectif",
    patterns: ["facile(?:s|ment)?", "rapide(?:s|ment)?"],
    severity: "warning",
    alternative: "accessible / à votre rythme",
    documentId: "lexique-marque",
    corpusEntry: "facile / rapide",
    note: "Conflit connu : `10-financement-personnel` impose « Financez votre formation facilement en plusieurs fois sans frais* ». Voir `brandKnownConflicts` ; rien n'est tranché ici.",
  },
  // Financement (04, 07, 08, 09, 12)
  { id: "gratuit", label: "« gratuit » : trompeur sur le financement", patterns: ["gratuit(?:e|s|es|ement)?"], severity: "error", alternative: "finançable / jusqu'à 100%*", documentId: "lexique-marque", corpusEntry: "gratuit" },
  {
    id: "zero-euro",
    label: "« 0 € / sans rien payer » : promesse abusive",
    patterns: ["(?<![0-9][.,]?)0 ?€", "(?<![0-9][.,]?)0 ?euros?", "zero euros?", "zero frais", "sans rien payer", "sans depenser un centime", "sans toucher a vos economies"],
    severity: "error",
    alternative: "solution de financement adaptée*",
    documentId: "lexique-marque",
    corpusEntry: "0€ / sans rien payer",
  },
  {
    id: "finance-a-100",
    label: "« 100 % financé » : jamais automatique",
    patterns: ["100 ?% ?finance(?:e|s|es)?", "finance(?:e|s|es)? a 100 ?%"],
    severity: "error",
    alternative: "jusqu'à 100%*",
    documentId: "lexique-marque",
    corpusEntry: "100% financé",
    unless: (folded, start) => followsJusqua(folded, start),
    note: "« Financé jusqu'à 100%* » est admis avec son disclaimer ; « Financé à 100%* » l'est seulement en appel d'offre B2B (12).",
  },
  { id: "pris-en-charge-etat", label: "« pris en charge par l'État » : faux raccourci", patterns: ["pris(?:e|es)? en charge par l'etat", "finance(?:e|s|es)? par l'etat"], severity: "error", alternative: "finançable via dispositifs publics", documentId: "lexique-marque", corpusEntry: "pris en charge par l'État" },
  // Reconnaissance, titres, diplômes (04, 06)
  { id: "formation-reconnue-etat", label: "« formation reconnue par l'État » : faux juridiquement (les diplômes le sont)", patterns: ["formations? reconnue?s? par l'etat"], severity: "error", alternative: "diplôme reconnu par l'État", documentId: "lexique-marque", corpusEntry: "formation reconnue par l'État" },
  { id: "certifie-par-etat", label: "« certifié par l'État » : terme flou", patterns: ["certifie(?:e|s|es)? par l'etat", "diplomes? d'etat certifie(?:e|s|es)?"], severity: "error", alternative: "diplôme reconnu par l'État", documentId: "lexique-marque", corpusEntry: "certifié par l'État" },
  { id: "certificat-reconnu-etat", label: "« certificat reconnu par l'État » : interdit", patterns: ["certificats? reconnus? par l'etat"], severity: "error", documentId: "diplomes-certifications" },
  { id: "certification-rncp", label: "« certification RNCP » : impropre", patterns: ["certifications? rncp"], severity: "warning", alternative: "titre RNCP", documentId: "lexique-marque", corpusEntry: "certification RNCP" },
  { id: "master", label: "« Master » : réservé aux diplômes nationaux, même par comparaison", patterns: ["master"], severity: "error", alternative: "Titre RNCP de niveau 7", documentId: "diplomes-certifications", note: "Mastère ou MBA seulement si c'est l'intitulé officiel Studi (06)." },
  // Accompagnement (04, 14)
  { id: "coach-mentor-dedie", label: "« coach / mentor personnel ou dédié » : promesse excessive", patterns: ["coach(?:ing)? (?:personnel|personnalise|dedie)e?", "mentors? (?:personnel|dedie)e?"], severity: "error", alternative: "accompagnement pédagogique / équipe pédagogique", documentId: "lexique-marque", corpusEntry: "coach personnel / mentor dédié" },
  { id: "suivi-personnalise", label: "« suivi personnalisé 100% » : absolu non contractuel", patterns: ["suivi personnalise(?: ?100 ?%)?"], severity: "warning", alternative: "accompagnement individualisé", documentId: "lexique-marque", corpusEntry: "suivi personnalisé 100%" },
  { id: "accompagnement-personnalise", label: "« accompagnement personnalisé » : terme encadré", patterns: ["accompagnement personnalise"], severity: "warning", documentId: "accompagnement" },
  { id: "sur-mesure", label: "« sur-mesure » : non contractuel", patterns: ["sur[- ]mesure"], severity: "warning", alternative: "parcours adaptable", documentId: "lexique-marque", corpusEntry: "sur-mesure" },
  // Divers (04, 01)
  { id: "promotion-reduction", label: "« promotion / réduction » : sensible CPF", patterns: ["promotions?", "reductions?"], severity: "warning", alternative: "avantage financier* / conditions avantageuses*", documentId: "lexique-marque", corpusEntry: "promotion / réduction" },
  { id: "user-apprenant", label: "« user » pour désigner l'apprenant : lexique tech hors-marque", patterns: ["users?"], severity: "warning", alternative: "apprenant", documentId: "lexique-marque", corpusEntry: "user (pour désigner l'apprenant)" },
  { id: "injonction", label: "« vous devez / il faut absolument » : injonction", patterns: ["vous devez", "il faut absolument"], severity: "warning", documentId: "identite-marque" },
] as const satisfies readonly BrandTerminologyRule[]

export type BrandTerminologyRuleId = (typeof brandTerminologyRules)[number]["id"]

/* -------------------------------------------------------------------------- */
/* Conflit connu                                                              */
/* -------------------------------------------------------------------------- */

export type BrandKnownConflict = {
  id: string
  /** `unresolved` : personne n'a arbitré. Le code ne tranche pas. */
  status: "unresolved"
  summary: string
  forbids: readonly { documentId: BrandDocumentId; quote: string }[]
  mandates: { documentId: BrandDocumentId; quote: string }
  affectedRuleIds: readonly BrandTerminologyRuleId[]
  /** L'expression imposée, sans l'astérisque : un terme interdit qui s'y trouve est marqué `conflictId`. */
  mandatedExpression: string
}

/**
 * « Facilement » : `02` et `04` proscrivent facile / facilement / rapidement,
 * alors que `10-financement-personnel` impose l'expression « Financez votre
 * formation facilement en plusieurs fois sans frais* ». Les trois documents sont
 * `en_revue`. Le lint applique la règle générale à tout le texte, y compris à
 * l'expression imposée, et signale seulement qu'elle est en conflit connu.
 */
export const brandKnownConflicts = [
  {
    id: "facilement",
    status: "unresolved",
    summary:
      "Le lexique et la promesse éditoriale interdisent « facile / facilement / rapidement », mais le financement personnel impose une expression contenant « facilement ».",
    forbids: [
      { documentId: "lexique-marque", quote: "facile / rapide" },
      { documentId: "promesse-editoriale", quote: "« Sans effort », « facilement », « rapidement » (sens absolu)" },
    ],
    mandates: { documentId: "financement-personnel", quote: "Financez votre formation facilement en plusieurs fois sans frais*" },
    affectedRuleIds: ["facile-rapide"],
    mandatedExpression: "Financez votre formation facilement en plusieurs fois sans frais",
  },
] as const satisfies readonly BrandKnownConflict[]

/* -------------------------------------------------------------------------- */
/* Lint                                                                       */
/* -------------------------------------------------------------------------- */

export type BrandLintFinding = {
  ruleId: BrandTerminologyRuleId
  label: string
  /** Texte d'origine qui a déclenché la règle. */
  match: string
  /** Position dans le texte d'origine. */
  index: number
  severity: BrandSeverity
  /** Alternative donnée par le corpus, s'il y en a une. */
  alternative?: string
  provenance: BrandProvenance
  /** Présent quand la formulation est en conflit connu entre documents : rien n'est tranché. */
  conflictId?: string
}

const compiled = brandTerminologyRules.map((rule) => ({
  rule: rule as BrandTerminologyRule,
  regexes: (rule.patterns as readonly string[]).map((pattern) => new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`, "g")),
}))

const conflictSpans = (folded: string, conflict: BrandKnownConflict) => {
  const expression = foldBrandText(conflict.mandatedExpression)
  const spans: [number, number][] = []
  for (let from = folded.indexOf(expression); from !== -1; from = folded.indexOf(expression, from + 1)) spans.push([from, from + expression.length])
  return spans
}

/**
 * Cherche les formulations interdites dans un texte. Retourne les alertes dans
 * l'ordre du texte ; ne modifie rien. Une règle spécifique l'emporte sur la
 * règle générale quand elles se recouvrent.
 */
export function lintBrandText(text: string): BrandLintFinding[] {
  const folded = foldBrandText(text)
  const taken: [number, number][] = []
  const findings: BrandLintFinding[] = []
  const conflicts = brandKnownConflicts.map((conflict) => ({ conflict, spans: conflictSpans(folded, conflict) }))

  for (const { rule, regexes } of compiled) {
    for (const regex of regexes) {
      regex.lastIndex = 0
      for (let match = regex.exec(folded); match; match = regex.exec(folded)) {
        const start = match.index
        const end = start + match[0].length
        if (match[0].length === 0) {
          regex.lastIndex += 1
          continue
        }
        if (taken.some(([from, to]) => start < to && end > from)) continue
        if (rule.unless?.(folded, start, end)) continue
        taken.push([start, end])
        const conflict = conflicts.find(
          ({ conflict, spans }) => (conflict.affectedRuleIds as readonly string[]).includes(rule.id) && spans.some(([from, to]) => start >= from && end <= to)
        )
        findings.push({
          ruleId: rule.id as BrandTerminologyRuleId,
          label: rule.label,
          match: text.slice(start, end),
          index: start,
          severity: rule.severity,
          ...(rule.alternative ? { alternative: rule.alternative } : {}),
          provenance: provenanceOf(rule.documentId),
          ...(conflict ? { conflictId: conflict.conflict.id } : {}),
        })
      }
    }
  }
  return findings.sort((a, b) => a.index - b.index)
}
