import { z } from "zod"

import { emailDestinationUrl, type EmailDestinationId } from "./destinations"
import type { EmailSurface } from "./surfaces"
import type { EmailBlock, EmailConfig } from "./types"

/**
 * Générateur de démonstration : brief → EmailConfig, sans IA et sans aléa.
 * Même brief, même email. Trois scénarios, un par objectif, avec chacun sa
 * composition de lames, sa zone colorée et ses textes. Il n'emploie que des
 * lames utilisables sans visuel, témoignage, partenaire ni donnée promo, et
 * du contenu générique : aucun prix, remise, chiffre, financement,
 * partenaire, certification ni date. Les liens sont des destinations
 * contrôlées (`destinations.ts`).
 */

export const emailObjectives = [
  { value: "decouverte-formations", label: "Découverte des formations" },
  { value: "accompagnement", label: "Comprendre l'accompagnement" },
  { value: "evolution-carriere", label: "Préparer son évolution de carrière" },
] as const

export type EmailObjective = (typeof emailObjectives)[number]["value"]

const required = (label: string) =>
  z.string().trim().min(1, `${label} est requis.`)

export const EmailBriefSchema = z.strictObject({
  campaignName: required("Le nom de campagne"),
  subject: required("L'objet"),
  brief: required("Le brief"),
  audience: required("L'audience"),
  objective: z.enum(
    emailObjectives.map((objective) => objective.value) as [EmailObjective, ...EmailObjective[]],
    { error: "Objectif inconnu." }
  ),
})

export type EmailBrief = z.infer<typeof EmailBriefSchema>

export const defaultEmailBrief: EmailBrief = {
  campaignName: "Reconversion professionnelle",
  subject: "Et si c'était le bon moment pour changer de métier ?",
  brief:
    "Créer un email éditorial pour présenter les possibilités de reconversion professionnelle et orienter vers les formations Studi.",
  audience: "Professionnels en poste qui envisagent une reconversion",
  objective: "decouverte-formations",
}

/* -------------------------------------------------------------------------- */
/* Exemples                                                                   */
/* -------------------------------------------------------------------------- */

/** Briefs d'exemple de la démo, un par scénario (le premier est l'initial). */
export const emailDemoPresets = [
  { id: "reconversion", label: "Reconversion", brief: defaultEmailBrief },
  {
    id: "accompagnement",
    label: "Accompagnement",
    brief: {
      campaignName: "Accompagnement",
      subject: "Vous former, sans avancer seul",
      brief: "Rassurer des personnes qui hésitent à se former seules en présentant l'accompagnement Studi et sa méthode.",
      audience: "Personnes en poste qui craignent de se former seules",
      objective: "accompagnement",
    },
  },
  {
    id: "evolution",
    label: "Évolution de carrière",
    brief: {
      campaignName: "Évolution de carrière",
      subject: "Et si vous passiez à l'étape suivante ?",
      brief: "Encourager des salariés à développer leurs compétences pour préparer une évolution professionnelle.",
      audience: "Salariés qui veulent évoluer dans leur métier",
      objective: "evolution-carriere",
    },
  },
] as const satisfies readonly { id: string; label: string; brief: EmailBrief }[]

/* -------------------------------------------------------------------------- */
/* Contenu                                                                    */
/* -------------------------------------------------------------------------- */

/** Audience en situation difficile : surface d'empathie (recettes §5). */
const empathyKeywords = ["demandeur", "sans emploi", "chômage", "chomage", "recherche d'emploi"]

function includesAny(text: string, keywords: readonly string[]) {
  const normalized = text.toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword))
}

/** Identifiant stable dérivé du nom de campagne. */
export function toEmailId(campaignName: string) {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return /^[a-z]/.test(slug) ? slug : `email-${slug || "demo"}`
}

const text = (value: string) => ({ text: value })
const link = (label: string, id: EmailDestinationId) => ({ label, href: emailDestinationUrl(id) })

type Accroche = { title: string; text: string }

/** Accroche du hero : variante choisie par un mot du brief, sinon défaut. */
function accroche(brief: string, fallback: Accroche, variant: Accroche & { keywords: readonly string[] }) {
  return includesAny(brief, variant.keywords) ? variant : fallback
}

const header: EmailBlock = { id: "header", type: "email-module-header-newsletter", slots: {} }

const footer: EmailBlock = {
  id: "footer",
  type: "email-module-footer-compact-legal",
  slots: {
    "lien-1": link("Catalogue Studi", "catalogue-formations"),
    "lien-2": link("Catalogue Alternance", "alternance"),
    "lien-3": link("Magazine Trajectoire", "trajectoire-magazine"),
  },
}

type Scenario = {
  blocks: (brief: EmailBrief, zone: EmailSurface) => EmailBlock[]
  /** Surface de la zone colorée (recettes §5, autre surface à chaque scénario). */
  zone: EmailSurface
  preheader: string
}

/* -------------------------------------------------------------------------- */
/* Scénarios                                                                  */
/* -------------------------------------------------------------------------- */

const scenarios: Record<EmailObjective, Scenario> = {
  /** Réflexion, étapes, découverte : bandeau + hero coloré + étapes + clôture. */
  "decouverte-formations": {
    zone: "marque",
    preheader: "Trois étapes pour y voir plus clair et explorer les formations qui correspondent à votre projet",
    blocks: (brief, zone) => {
      const hero = accroche(
        brief.brief,
        { title: "Changer de métier, étape par étape", text: "Une reconversion se prépare. Studi vous propose de la construire à votre rythme, en ligne." },
        { keywords: ["reprendre", "diplôme", "diplome", "études", "etudes"], title: "Reprendre une formation, sans tout arrêter", text: "Une formation en ligne peut s'organiser autour de votre emploi du temps." }
      )
      return [
        { id: "bandeau", type: "email-module-preheader", slots: { label: text(brief.campaignName.toUpperCase()), "lien-1": link("Voir les fiches métiers", "metiers") } },
        header,
        { id: "hero", type: "email-module-hero-diagnostic-quiz", surface: zone, slots: { "sous-titre": text(brief.campaignName), "titre-principal": text(hero.title), "texte-descriptif": text(hero.text), "cta-1": link("Découvrir les formations", "catalogue-formations") } },
        {
          id: "etapes",
          type: "email-module-numbered-list",
          slots: {
            "sous-titre": text(`Pour vous : ${brief.audience}`),
            "item-1-titre": text("Faire le point sur votre projet"),
            "texte-descriptif-1": text("Clarifiez ce qui vous motive et les métiers qui vous attirent."),
            "item-2-titre": text("Choisir une formation adaptée"),
            "texte-descriptif-2": text("Comparez les domaines, les formats et les niveaux de sortie."),
            "item-3-titre": text("Avancer à votre rythme"),
            "texte-descriptif-3": text("Organisez votre formation autour de vos contraintes."),
          },
        },
        { id: "cloture", type: "email-module-text-only", slots: { "titre-section": text("Explorez les formations à votre rythme"), "texte-descriptif": text("Parcourez les domaines de formation et repérez ceux qui font écho à votre projet. Vous pouvez avancer étape par étape.") } },
        footer,
      ]
    },
  },

  /** Soutien et méthode : hero sobre + appuis à icônes + encart coloré. */
  accompagnement: {
    zone: "marque",
    preheader: "Formateurs, conseillers et méthode : découvrez comment Studi vous accompagne pendant votre formation",
    blocks: (brief, zone) => {
      const hero = accroche(
        brief.brief,
        { title: "Vous former, sans avancer seul", text: "Pendant votre formation, des équipes peuvent vous accompagner à chaque étape." },
        { keywords: ["méthode", "methode", "distance", "en ligne"], title: "Apprendre à distance, avec une méthode", text: "La méthode Studi vise à vous aider à apprendre efficacement, à votre rythme." }
      )
      return [
        header,
        { id: "hero", type: "email-module-hero-diagnostic-quiz", slots: { "sous-titre": text(brief.campaignName), "titre-principal": text(hero.title), "texte-descriptif": text(hero.text), "cta-1": link("Découvrir l'accompagnement", "accompagnement") } },
        {
          id: "appuis",
          type: "email-module-icons-list",
          slots: {
            "titre-section": text(`Pour vous : ${brief.audience}`),
            "icone-1": { icon: "users" },
            "item-1-titre": text("Des formateurs et des conseillers"),
            "texte-descriptif-1": text("Des interlocuteurs pour répondre à vos questions pendant la formation."),
            "icone-2": { icon: "lightbulb" },
            "item-2-titre": text("Une méthode pour apprendre"),
            "texte-descriptif-2": text("Des cours, des exercices et des repères pour progresser régulièrement."),
            "icone-3": { icon: "stopwatch" },
            "item-3-titre": text("Un rythme qui vous ressemble"),
            "texte-descriptif-3": text("Vous organisez vos sessions selon vos disponibilités."),
          },
        },
        {
          id: "encart",
          type: "email-module-text-and-feature-card",
          surface: zone,
          slots: {
            "titre-section": text("Un accompagnement tout au long du parcours"),
            "texte-descriptif-1": text("Se former à distance ne veut pas dire se former seul. Découvrez les niveaux d'accompagnement proposés par Studi."),
            "titre-principal": text("Trouvez l'accompagnement qui vous convient"),
            "texte-descriptif-2": text("Comparez les formules et choisissez celle qui correspond à votre projet."),
            "cta-1": link("Découvrir l'accompagnement", "accompagnement"),
          },
        },
        footer,
      ]
    },
  },

  /** Compétences et progression : header de campagne + hero Encre + grille. */
  "evolution-carriere": {
    zone: "encre",
    preheader: "Compétences, certificats, coaching : les leviers pour préparer la prochaine étape de votre parcours",
    blocks: (brief, zone) => {
      const hero = accroche(
        brief.brief,
        { title: "Faites évoluer votre carrière, à votre rythme", text: "Développer de nouvelles compétences peut ouvrir de nouvelles perspectives dans votre métier." },
        { keywords: ["compétence", "competence", "monter en"], title: "Développez de nouvelles compétences", text: "Se former en poste peut vous aider à préparer la suite de votre parcours professionnel." }
      )
      return [
        { id: "header", type: "email-module-header-seasonal-campaign", slots: { label: text(brief.campaignName) } },
        { id: "hero", type: "email-module-hero-diagnostic-quiz", surface: zone, slots: { "sous-titre": text("Évolution professionnelle"), "titre-principal": text(hero.title), "texte-descriptif": text(hero.text), "cta-1": link("Découvrir le coaching carrière", "coaching-carriere") } },
        {
          id: "leviers",
          type: "email-module-numbererd-grid",
          slots: {
            "sous-titre": text(`Pour vous : ${brief.audience}`),
            "titre-principal": text("Quatre leviers pour progresser"),
            "item-1-titre": text("Compétences 360"),
            "texte-descriptif-1": text("Des accélérateurs pour renforcer vos compétences."),
            "item-2-titre": text("Soft skills"),
            "texte-descriptif-2": text("Travailler les compétences comportementales."),
            "item-3-titre": text("Certificats professionnels"),
            "texte-descriptif-3": text("Valoriser une compétence précise."),
            "item-4-titre": text("Coaching carrière"),
            "texte-descriptif-4": text("Préparer votre prochaine étape professionnelle."),
          },
        },
        { id: "cloture", type: "email-module-text-only", slots: { "titre-section": text("Préparez la suite de votre parcours"), "texte-descriptif": text("Chaque étape compte. Explorez les leviers qui correspondent à votre projet et avancez à votre rythme.") } },
        footer,
      ]
    },
  },
}

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * L'objectif choisit le scénario (composition, zone colorée, destinations) ;
 * le brief choisit la variante d'accroche ; l'audience est reprise dans le
 * corps et, si elle est en situation difficile, passe la zone colorée en
 * Accent 2 doux. Nom de campagne et objet viennent de la saisie.
 */
export function generateDemoEmail(brief: EmailBrief): EmailConfig {
  const scenario = scenarios[brief.objective]
  const zone = includesAny(brief.audience, empathyKeywords) ? "accent-2-soft" : scenario.zone
  return {
    version: 1,
    id: toEmailId(brief.campaignName),
    name: brief.campaignName,
    subject: brief.subject,
    preheader: scenario.preheader,
    blocks: scenario.blocks(brief, zone),
  }
}
