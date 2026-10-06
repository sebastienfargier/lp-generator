/**
 * Prompt d'édition, sans réseau : la vue éditoriale compacte de l'email courant
 * + l'instruction → { system, user, schéma du patch }. Aucun appel de modèle ici.
 *
 * Claude reçoit uniquement ce qui sert à modifier un texte :
 * - l'instruction ;
 * - les champs de texte éditables et leur texte actuel ;
 * - les faits PROTÉGÉS, en lecture seule (la valeur d'une offre, le périmètre,
 *   les formulations des preuves, les informations de la demande) ;
 * - la voix de la cible, les règles de rédaction, les formulations à éviter.
 *
 * Il ne reçoit jamais : HTML, CSS, URLs, chemins d'images, identifiants de
 * lames, manifeste, EmailConfig, le code promo, la date de fin, ni le Draft
 * entier (intention visuelle, icônes, destination, identifiants de claims).
 *
 * Le contexte (famille, champs, schéma) est choisi AVANT l'appel : aucune union
 * de familles n'est envoyée.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { buildEditTransportSchema } from "./edit-patch"
import type { EmailEditFamily, EmailEditField } from "./edit-fields"
import type { PromotionBrandContext, RecipeBrandContext } from "./recipe-brand-context"

const outputRule = `Réponds uniquement par l'objet JSON conforme au schéma de sortie : aucun texte avant ou après, aucun markdown, aucune explication.`

const base = `Tu modifies le contenu d'un email Studi déjà rédigé, à partir d'une INSTRUCTION de la personne qui l'édite. Tu reçois "instruction", "email" (les champs de texte modifiables, avec leur texte actuel), "protected" (des faits en LECTURE SEULE) et "context" (la voix de marque, les règles et les formulations à éviter).

${outputRule}

Sortie : { summary, edits }.
- edits : uniquement les champs que l'instruction oblige à changer, chacun avec son NOUVEAU texte complet. Un champ non cité reste tel quel. Ne réécris pas un champ qui n'est pas concerné.
- field : un identifiant de la liste "email.fields", rien d'autre.
- summary : une phrase courte (140 caractères au plus) qui dit ce qui a changé.
- Respecte l'instruction : « plus court » raccourcit vraiment, « plus direct » va droit au but avec des phrases courtes, « plus chaleureux » adoucit sans devenir familier, « plus dynamique » privilégie des verbes d'action, « évite de répéter X » remplace X par une formulation différente.
- Garde l'adresse de context.voice.address (tutoiement ou vouvoiement), sans jamais les mélanger, et le sens de chaque champ : un titre reste un titre, un libellé de bouton reste court et à l'infinitif.
- context.rules et context.avoid s'appliquent à tout le texte.
- Tu ne modifies, ne cites et ne contournes jamais les éléments de "protected" : ils sont affichés par le système. Si l'instruction demande de les changer, laisse-les intacts et réécris seulement les textes.
- Tu n'ajoutes aucun fait nouveau : ni chiffre, prix, durée, date, effectif, certification, classement, garantie, témoignage, partenaire, ni mention de service ou de financement qui ne figure pas dans "protected".
- Ni URL, ni lien, ni HTML, ni nom d'image, ni mention légale.`

const familyRules: Record<EmailEditFamily, string> = {
  "discovery-reassurance": `Cet email rassure une personne qui explore une orientation : garde la progression en trois étapes et le ton sans pression.`,
  "editorial-newsletter": `Cet email est une newsletter : garde le rythme éditorial, des rubriques distinctes (jamais deux synonymes) et des textes concrets.`,
  "brand-proof": `Cet email est construit autour de preuves de la marque, affichées à l'identique par le système (voir protected.proofs) : n'écris aucun chiffre, ne reformule ni ne commente aucune preuve. Un texte d'appui situe le repère (une échelle, une étendue, une taille) sans rien prouver ni garantir : jamais de qualité, de résultat, d'efficacité, d'accompagnement individuel, de satisfaction ni de réussite déduits d'une preuve.`,
  promotion: `Cet email présente une offre commerciale dont le système affiche la valeur, le code, la date de fin, le périmètre, la mention légale et la destination des boutons. N'écris aucun chiffre, ni % ni €, dans les textes : seuls l'objet et le préheader peuvent citer protected.offer.value, recopiée à l'identique. N'écris ni code, ni date, ni délai, ni « jusqu'à », ni « à partir de », ni « économisez », ni mot en capitales ; aucune pression ni urgence factice ; aucune mention de financement, de gratuité, de garantie ou de conseiller.`,
}

export type EditPromptInput = {
  family: EmailEditFamily
  instruction: string
  /** Champs éditables avec leur texte actuel, dans l'ordre de l'email. */
  fields: readonly (EmailEditField & { text: string })[]
  /** Faits protégés en lecture seule (voir `edit-engine.ts`). */
  protectedFacts: Record<string, unknown>
  context: Pick<RecipeBrandContext, "voice" | "rules" | "avoid"> | Pick<PromotionBrandContext, "voice" | "rules" | "avoid">
}

export type EditPromptReady = {
  system: string
  user: string
  paths: string[]
  transportSchema: ReturnType<typeof buildEditTransportSchema>
}

export function buildEditPrompt(input: EditPromptInput): EditPromptReady {
  const paths = input.fields.map((entry) => entry.path)
  const { voice, rules, avoid } = input.context
  return {
    system: `${base}\n\n${familyRules[input.family]}`,
    user: JSON.stringify({
      instruction: input.instruction.trim(),
      email: { fields: input.fields.map(({ path, label, text }) => ({ field: path, label, text })) },
      protected: input.protectedFacts,
      context: { voice, rules, avoid },
    }),
    paths,
    transportSchema: buildEditTransportSchema(paths),
  }
}
