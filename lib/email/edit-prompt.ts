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
import type { CompositionCapabilities } from "./composition"
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

/** Opérations de composition, décrites seulement pour les capacités de CET email. */
function compositionRules(capabilities: CompositionCapabilities): string {
  const has = (operation: string) => (capabilities.operations as string[]).includes(operation)
  const lines = [
    "Opérations de composition (champ \"operations\" ; [] quand l'instruction ne demande que du texte). Une opération = { op, target, value }, toutes les valeurs viennent des énumérations du schéma :",
    ...(has("add-section") || has("remove-section")
      ? [
          "- add-section / remove-section, value \"default\" : target \"end-date\" (bloc « fin de l'offre » placé sous l'offre : trois cases jour, mois, année tirées de la date de fin) ou \"support\" (bloc des appuis). Tu n'ajoutes que ce qui manque (voir layout.sections) et ne retires que ce qui est présent.",
        ]
      : []),
    ...(has("change-surface")
      ? [
          "- change-surface : target \"end-date\", \"support\" ou \"closing\" ; value \"clair\", \"jaune\", \"vert\" ou \"sombre\" (variantes de la marque, jamais un code couleur). Une seule zone colorée : la nouvelle remplace l'ancienne. Le panneau de l'offre garde sa couleur : on ne peut pas le changer.",
        ]
      : []),
    ...(has("change-image")
      ? [
          "- change-image : target \"main-image\" ; value \"alternative\" (une autre image, au choix du système) ou une intention de layout.imageIntents. Tu ne choisis jamais l'image elle-même.",
        ]
      : []),
    ...(has("add-section")
      ? [
          "Un « compte à rebours » n'existe pas dans un email : aucune horloge, ses valeurs seraient fausses dès le lendemain. Une demande de compte à rebours, de décompte ou de date limite se traduit par add-section \"end-date\" : la date de fin de l'offre, affichée par le système. Tu ne crées, ne calcules et ne modifies aucune date, durée ni nombre de jours.",
        ]
      : []),
    "Si l'instruction demande autre chose (une couleur précise, un autre bloc, un déplacement, une image précise), laisse edits et operations vides et explique-le en une phrase dans summary.",
  ]
  return lines.join("\n")
}

export type EditPromptInput = {
  family: EmailEditFamily
  instruction: string
  /** Champs éditables avec leur texte actuel, dans l'ordre de l'email. */
  fields: readonly (EmailEditField & { text: string })[]
  /** Faits protégés en lecture seule (voir `edit-engine.ts`). */
  protectedFacts: Record<string, unknown>
  context: Pick<RecipeBrandContext, "voice" | "rules" | "avoid"> | Pick<PromotionBrandContext, "voice" | "rules" | "avoid">
  /** Capacités de composition de cet email (V1.5), ou `undefined` : texte seul. */
  capabilities?: CompositionCapabilities
  /** État des sections et de l'image, en rôles et intentions (jamais de lame, de couleur ni de fichier). */
  layout?: Record<string, unknown>
  /** Intentions visuelles que l'on peut demander, avec une indication courte. */
  imageIntents?: readonly { intent: string; hint: string }[]
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
    system: `${base}\n\n${familyRules[input.family]}${input.capabilities ? `\n\n${compositionRules(input.capabilities)}` : ""}`,
    user: JSON.stringify({
      instruction: input.instruction.trim(),
      email: { fields: input.fields.map(({ path, label, text }) => ({ field: path, label, text })) },
      ...(input.capabilities ? { layout: { ...(input.layout ?? {}), ...(input.imageIntents && input.imageIntents.length > 0 ? { imageIntents: input.imageIntents } : {}) } } : {}),
      protected: input.protectedFacts,
      context: { voice, rules, avoid },
    }),
    paths,
    transportSchema: buildEditTransportSchema(paths, input.capabilities),
  }
}
