/**
 * Garde-fous déterministes d'une instruction d'édition, AVANT tout appel de
 * modèle, et de la voix du texte modifié, APRÈS. Pur, hors ligne, sans NLP :
 * quelques motifs qui attrapent les demandes évidemment interdites. Les cas
 * ambigus passent au modèle, mais la protection réelle est ailleurs : le patch
 * ne peut viser que des champs de texte (`edit-fields.ts`), l'email est
 * recomposé par le resolver, et les valeurs protégées sont comparées avant et
 * après (`edit-protect.ts`).
 *
 * Refus avant appel :
 * - valeur de l'offre ou chiffre (remise, pourcentage, montant, prix, « 59 000 ») ;
 * - code promo, date de fin, prolongation ;
 * - mention légale, conditions ;
 * - lien, destination, URL ;
 * - image, visuel, couleur, mise en page, footer, en-tête ;
 * - structure : ajouter ou retirer une section, un chiffre, un bouton ;
 * - adresse (tu / vous) : décidée par la cible de la marque ;
 * - consigne qui vise le système plutôt que l'email.
 *
 * Une demande de ton, de longueur, de répétition, d'accroche ou de conclusion
 * passe.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */

export type EditRefusalCode = "empty" | "too-long" | "value" | "code" | "date" | "legal" | "link" | "media" | "structure" | "voice" | "system"

export type EditRefusal = { code: EditRefusalCode; message: string }

export const editInstructionLimits = { min: 3, max: 500 } as const

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’]/g, "'")

/** Verbes qui MODIFIENT quelque chose (« rends plus court » n'en est pas un : il vise le style). */
const mutation = /\b(?:pass\w*|chang\w*|modifi\w*|remplac\w*|mets?|mettre|portes?|porter|baiss\w*|augment\w*|diminu\w*|reduis\w*|reduire|prolong\w*|rallong\w*|repouss\w*|decal\w*|supprim\w*|retir\w*|enlev\w*|efface\w*|masqu\w*|cach\w*|omet\w*|ajout\w*|rajout\w*|insere\w*|inserer|invent\w*|deplac\w*|inverse\w*|reorgan\w*|remets?)\b/
const addOrRemove = /\b(?:ajout\w*|rajout\w*|insere\w*|inserer|supprim\w*|retir\w*|enlev\w*|efface\w*|omet\w*|deplac\w*|inverse\w*|reorgan\w*|duplique\w*)\b/

const nouns: readonly { code: EditRefusalCode; pattern: RegExp; message: string }[] = [
  { code: "legal", pattern: /\b(?:mentions? legales?|legal|legale|legaux|conditions?|disclaimers?|cgv|cgu|astérisque|asterisque)\b/, message: "La mention légale est posée par le système : elle ne se modifie pas par instruction." },
  { code: "code", pattern: /\b(?:codes?|coupons?)\b/, message: "Le code promo vient des données de l'offre : modifiez-le dans le formulaire, puis régénérez l'email." },
  { code: "date", pattern: /\b(?:dates?|echeances?|deadline|jusqu'au|fin de l'offre|delais?|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/, message: "La date de fin vient des données de l'offre : modifiez-la dans le formulaire, puis régénérez l'email." },
  { code: "value", pattern: /(?:\b(?:remises?|reductions?|rabais|pourcent\w*|pourcentages?|euros?|prix|tarifs?|montants?|valeurs?|chiffres?|statistiques?)\b|[%€])/, message: "La valeur de l'offre et les chiffres ne se modifient pas par instruction : les données de l'offre et les preuves de la marque font foi." },
  { code: "link", pattern: /\b(?:liens?|urls?|href|destinations?|adresses? web|redirig\w*)\b/, message: "Les liens et destinations sont contrôlés : ils ne se modifient pas par instruction." },
  { code: "media", pattern: /\b(?:images?|visuels?|photos?|illustrations?|logos?|icones?|couleurs?|polices?|css|html|styles?|fonds?|surfaces?|mise en page|layout|footer|pieds? de page|en-tetes?|headers?|bannieres?)\b/, message: "Les visuels, les couleurs et la mise en page sont verrouillés dans cette version : seuls les textes se modifient." },
]

/** Éléments dont l'ajout ou le retrait change la structure de l'email. */
const structureNouns = /\b(?:sections?|blocs?|lames?|rubriques?|etapes?|appuis?|chiffres?|preuves?|claims?|statistiques?|boutons?|ctas?|titres?|paragraphes?|temoignages?|partenaires?)\b/

const injection = /\b(?:ignore\w*\s+(?:toutes?\s+)?(?:les\s+)?(?:consignes|instructions|regles)|system prompt|prompt systeme|cle api|api key|affiche\w* (?:ta|ton|le) (?:prompt|cle|schema))\b/

const sentences = (text: string) => text.split(/(?<=[.!?;\n])\s+/).map((part) => part.trim()).filter(Boolean)

export type EditGuardContext = {
  /** Adresse décidée par la cible : `tutoiement` (alternants) ou `vouvoiement`. */
  address: "tutoiement" | "vouvoiement"
  /** Valeurs protégées de l'email courant (code, valeur, date, chiffres des preuves…), recopiées telles qu'affichées. */
  protectedTokens?: readonly string[]
}

/**
 * Instruction → `undefined` (elle peut partir au modèle) ou un refus motivé. Ne
 * lève jamais.
 */
export function checkEditInstruction(instruction: string, context: EditGuardContext): EditRefusal | undefined {
  const trimmed = instruction.trim()
  if (trimmed.length < editInstructionLimits.min) return { code: "empty", message: "Écrivez une instruction : ce que vous voulez changer dans l'email." }
  if (trimmed.length > editInstructionLimits.max) return { code: "too-long", message: `L'instruction tient en ${editInstructionLimits.max} caractères au maximum.` }
  const folded = fold(trimmed)
  if (injection.test(folded)) return { code: "system", message: "Cette instruction vise le système plutôt que l'email : décrivez un changement de texte." }

  // Adresse : décidée par la cible de la marque, jamais par une instruction.
  const wantsTu = /\b(?:tutoie\w*|tutoy\w*|tutoiement)\b/.test(folded)
  const wantsVous = /\b(?:vouvoie\w*|vouvoy\w*|vouvoiement)\b/.test(folded)
  if ((wantsTu && context.address !== "tutoiement") || (wantsVous && context.address !== "vouvoiement")) {
    return { code: "voice", message: `L'adresse (${context.address === "tutoiement" ? "tutoiement" : "vouvoiement"}) est décidée par la cible de l'email : changez la cible dans le formulaire pour en changer.` }
  }

  const tokens = (context.protectedTokens ?? []).map(fold).filter((token) => token.length >= 2)
  for (const sentence of sentences(folded)) {
    const mutates = mutation.test(sentence)
    if (!mutates) continue
    const hasNumber = /\d/.test(sentence)
    // Ajouter ou retirer un élément : la structure est celle de la recette.
    if (addOrRemove.test(sentence) && structureNouns.test(sentence)) {
      return { code: "structure", message: "La structure de l'email est celle de sa recette : on ne peut ni ajouter ni retirer de section, de chiffre ou de bouton. Les textes peuvent être réécrits." }
    }
    for (const noun of nouns) {
      if (noun.pattern.test(sentence)) return { code: noun.code, message: noun.message }
    }
    // Une valeur protégée citée avec un verbe de modification.
    if (tokens.some((token) => sentence.includes(token))) return { code: "value", message: "Cette valeur est protégée : elle vient des données de l'offre ou des preuves de la marque, et ne se modifie pas par instruction." }
    // Un chiffre ou un code (un jeton qui mêle lettres et chiffres) avec un verbe de modification : on ne devine pas ce qui est protégé.
    if (hasNumber) return { code: "value", message: "Les chiffres, les codes et les valeurs ne se modifient pas par instruction : les données de l'offre et les preuves de la marque font foi." }
  }
  return undefined
}

/* -------------------------------------------------------------------------- */
/* Voix du texte modifié                                                      */
/* -------------------------------------------------------------------------- */

const tuForms = /\b(?:tu|toi|tes|t'|ta)\b|\bt['’]/i
const vousForms = /\b(?:vous|votre|vos)\b/i

/** Champs dont l'adresse ne correspond pas à celle de la cible (tutoiement vs vouvoiement). */
export function voiceViolations(texts: readonly { path: string; text: string }[], address: "tutoiement" | "vouvoiement"): { path: string; match: string }[] {
  const wrong = address === "tutoiement" ? vousForms : tuForms
  return texts.flatMap(({ path, text }) => {
    const match = wrong.exec(text)
    return match ? [{ path, match: match[0] }] : []
  })
}

/* -------------------------------------------------------------------------- */
/* Faits flous introduits par une édition                                     */
/* -------------------------------------------------------------------------- */

/** Quantités sans chiffre : « des centaines de formations » est un chiffre qui ne s'écrit pas. */
const vagueQuantity = /\b(?:centaines?|milliers?|millions?|milliards?|dizaines?|douzaines?|des dizaines|plusieurs centaines)\b/
/** Ce que l'offre ou la preuve ne dit pas : conditions, cumul, remboursement (R3 et R4 seulement). */
const offerTerms = /\b(?:conditions?|cumul\w*|rembours\w*|assoupli\w*|sans condition\w*)\b/

/**
 * Un texte modifié ne doit pas introduire un fait que l'email n'avait pas :
 * une quantité floue (toutes les familles) ou une évocation des conditions de
 * l'offre (preuves et promotions). Seule une expression ABSENTE de l'ancien
 * texte compte : une phrase existante qui la contenait déjà n'est pas rejetée.
 */
export function addedFacts(family: string, edits: readonly { path: string; before: string; after: string }[]): { path: string; match: string }[] {
  const patterns = [vagueQuantity, ...(family === "brand-proof" || family === "promotion" ? [offerTerms] : [])]
  return edits.flatMap(({ path, before, after }) => {
    const found = patterns.map((pattern) => pattern.exec(fold(after))).find((match) => match !== null)
    return found && !new RegExp(found[0]).test(fold(before)) ? [{ path, match: found[0] }] : []
  })
}
