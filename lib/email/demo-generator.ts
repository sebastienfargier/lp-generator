import { z } from "zod"

import { emailHrefPlaceholders } from "./system"
import type { EmailBlock, EmailConfig, EmailHttpsUrl } from "./types"

/**
 * Générateur de démonstration : brief → EmailConfig, sans IA et sans aléa.
 * Même brief, même email. Il n'emploie que des lames existantes et du
 * contenu générique, sans prix, remise, chiffre, financement, partenaire ni
 * certification. Les liens visent des pages Studi listées dans
 * `sources-studi.md`, avec le placeholder UTM du CRM.
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
/* Contenu                                                                    */
/* -------------------------------------------------------------------------- */

const utm = `?${emailHrefPlaceholders.utm}`
const studi = (path: string): EmailHttpsUrl => `https://www.studi.com${path}${utm}`

/** Action attendue : libellé du CTA, page de destination, clôture. */
const objectiveContent = {
  "decouverte-formations": {
    cta: "Découvrir les formations",
    href: studi("/fr/formations"),
    preheader: "et explorer les formations en ligne qui correspondent à votre projet",
    closingTitle: "Explorez les formations à votre rythme",
    closingText:
      "Parcourez les domaines de formation et repérez ceux qui font écho à votre projet. Vous pouvez avancer étape par étape.",
  },
  accompagnement: {
    cta: "Découvrir l'accompagnement",
    href: studi("/fr/accompagnement"),
    preheader: "et découvrir comment l'accompagnement Studi peut vous aider à avancer",
    closingTitle: "Vous n'avancez pas seul",
    closingText:
      "Formateurs et conseillers pédagogiques peuvent vous accompagner tout au long de votre formation.",
  },
  "evolution-carriere": {
    cta: "Découvrir le coaching carrière",
    href: studi("/fr/coaching-carriere"),
    preheader: "et préparer la prochaine étape de votre parcours professionnel",
    closingTitle: "Préparez la suite de votre parcours",
    closingText:
      "Le coaching carrière peut vous aider à clarifier votre projet et à préparer vos prochaines démarches.",
  },
} as const satisfies Record<EmailObjective, object>

/**
 * Thème repéré dans le brief (mots-clés), du plus spécifique au plus
 * général ; reconversion par défaut.
 */
const themes = [
  {
    keywords: ["reconversion", "changer de métier", "changer de metier", "nouveau métier"],
    title: "Changer de métier, étape par étape",
    text: "Une reconversion se prépare. Studi vous propose de la construire à votre rythme, en ligne.",
  },
  {
    keywords: ["évolution", "evolution", "carrière", "carriere", "promotion", "compétence", "competence"],
    title: "Faites évoluer votre carrière, à votre rythme",
    text: "Développer de nouvelles compétences peut ouvrir de nouvelles perspectives dans votre métier.",
  },
  {
    keywords: ["diplôme", "diplome", "formation", "reprendre", "études", "etudes"],
    title: "Reprendre une formation, sans tout arrêter",
    text: "Une formation en ligne peut s'organiser autour de votre emploi du temps.",
  },
] as const

const defaultTheme = themes[0]

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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return /^[a-z]/.test(slug) ? slug : `email-${slug || "demo"}`
}

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Construit l'email de démonstration : preheader visible, header, hero
 * (seul CTA principal), étapes, clôture éditoriale, footer. Le brief choisit le thème, l'audience la surface
 * du hero, l'objectif le CTA et la clôture.
 */
export function generateDemoEmail(brief: EmailBrief): EmailConfig {
  const objective = objectiveContent[brief.objective]
  const theme =
    themes.find((candidate) => includesAny(brief.brief, candidate.keywords)) ?? defaultTheme
  const surface = includesAny(brief.audience, empathyKeywords) ? "accent-2-soft" : "marque"

  const blocks: EmailBlock[] = [
    {
      id: "bandeau",
      type: "email-module-preheader",
      slots: {
        label: { text: brief.campaignName.toUpperCase() },
        "lien-1": { label: "Voir les formations", href: studi("/fr/formations") },
      },
    },
    { id: "header", type: "email-module-header-newsletter", slots: {} },
    {
      id: "hero",
      type: "email-module-hero-diagnostic-quiz",
      surface,
      slots: {
        "sous-titre": { text: brief.campaignName },
        "titre-principal": { text: theme.title },
        "texte-descriptif": { text: theme.text },
        "cta-1": { label: objective.cta, href: objective.href },
      },
    },
    {
      id: "etapes",
      type: "email-module-numbered-list",
      slots: {
        "sous-titre": { text: `Pour vous : ${brief.audience}` },
        "item-1-titre": { text: "Faire le point sur votre projet" },
        "texte-descriptif-1": { text: "Clarifiez ce qui vous motive et les métiers qui vous attirent." },
        "item-2-titre": { text: "Choisir une formation adaptée" },
        "texte-descriptif-2": { text: "Comparez les domaines, les formats et les niveaux de sortie." },
        "item-3-titre": { text: "Avancer à votre rythme" },
        "texte-descriptif-3": { text: "Organisez votre formation autour de vos contraintes." },
      },
    },
    {
      // Clôture éditoriale sans bouton : le hero porte le seul CTA principal.
      id: "cloture",
      type: "email-module-text-only",
      slots: {
        "titre-section": { text: objective.closingTitle },
        "texte-descriptif": { text: objective.closingText },
      },
    },
    {
      id: "footer",
      type: "email-module-footer-compact-legal",
      slots: {
        "lien-1": { label: "Catalogue Studi", href: studi("/fr/formations") },
        "lien-2": { label: "Catalogue Alternance", href: emailHrefPlaceholders.urlToConfirm },
        "lien-3": { label: "Magazine Trajectoire", href: studi("/fr/trajectoire-magazine") },
      },
    },
  ]

  return {
    version: 1,
    id: toEmailId(brief.campaignName),
    name: brief.campaignName,
    subject: brief.subject,
    preheader: `Trois étapes pour y voir plus clair, ${objective.preheader}`,
    blocks,
  }
}
