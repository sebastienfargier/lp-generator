import { z } from "zod"

import { emailDemoImage } from "./demo-assets"
import { emailDestinationUrl, type EmailDestinationId } from "./destinations"
import type { EmailSurface } from "./surfaces"
import type { EmailBlock, EmailConfig } from "./types"

/**
 * Générateur de démonstration : brief → EmailConfig, sans IA et sans aléa.
 * Même brief, même email. Quatre scénarios, un par objectif, avec chacun sa
 * composition de lames, son hero à photo, sa zone colorée et ses textes. Il
 * n'emploie que des lames utilisables sans témoignage, partenaire ni donnée
 * promo, et du contenu générique : aucun prix, remise, chiffre, financement,
 * partenaire, certification ni date. Seule exception : les valeurs fictives
 * du scénario Promotion (`promotionDemoOffer`), décidées pour la démo. Les
 * liens sont des destinations contrôlées (`destinations.ts`) ; les photos,
 * les visuels de démonstration de `demo-assets.ts` (URL `.invalid` dans le
 * HTML canonique).
 *
 * S'y ajoutent des campagnes visuelles : un email construit autour d'une
 * création fournie (`visual`). Le texte de la création lui appartient : il
 * n'est ni extrait, ni recopié dans le HTML, ni transformé en données.
 */

export const emailObjectives = [
  { value: "decouverte-formations", label: "Découverte des formations" },
  { value: "accompagnement", label: "Comprendre l'accompagnement" },
  { value: "evolution-carriere", label: "Préparer son évolution de carrière" },
] as const

export type EmailObjective = (typeof emailObjectives)[number]["value"]

/**
 * Objectifs du mode démo : ceux du contrat de génération, plus Promotion.
 * Promotion reste propre à la démo : `EmailGenerationRequest` garde ses
 * trois objectifs et porte une promo par `emailType` et `offer`.
 */
export const emailDemoObjectives = [
  ...emailObjectives,
  { value: "promotion", label: "Promotion" },
] as const

export type EmailDemoObjective = (typeof emailDemoObjectives)[number]["value"]

/**
 * Campagnes visuelles du mode démo. Champ interne à la démo : il choisit la
 * composition et le visuel, n'entre ni dans l'EmailConfig, ni dans le HTML,
 * ni dans `EmailGenerationRequest` (le pont ne recopie que ses champs).
 */
export const emailDemoVisuals = ["black-friday", "studi-days", "studi-meet"] as const

export type EmailDemoVisual = (typeof emailDemoVisuals)[number]

const required = (label: string) =>
  z.string().trim().min(1, `${label} est requis.`)

export const EmailBriefSchema = z.strictObject({
  campaignName: required("Le nom de campagne"),
  subject: required("L'objet"),
  brief: required("Le brief"),
  audience: required("L'audience"),
  objective: z.enum(
    emailDemoObjectives.map((objective) => objective.value) as [EmailDemoObjective, ...EmailDemoObjective[]],
    { error: "Objectif inconnu." }
  ),
  visual: z.enum(emailDemoVisuals, { error: "Campagne visuelle inconnue." }).optional(),
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

export type EmailDemoPreset = { id: string; label: string; group: "scenario" | "campagne"; brief: EmailBrief }

/**
 * Briefs d'exemple de la démo : un par scénario (le premier est l'initial),
 * puis les campagnes visuelles.
 */
export const emailDemoPresets = [
  { id: "reconversion", label: "Reconversion", group: "scenario", brief: defaultEmailBrief },
  {
    id: "accompagnement",
    group: "scenario",
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
    group: "scenario",
    label: "Évolution de carrière",
    brief: {
      campaignName: "Évolution de carrière",
      subject: "Et si vous passiez à l'étape suivante ?",
      brief: "Encourager des salariés à développer leurs compétences pour préparer une évolution professionnelle.",
      audience: "Salariés qui veulent évoluer dans leur métier",
      objective: "evolution-carriere",
    },
  },
  {
    id: "promotion",
    label: "Promotion",
    group: "scenario",
    brief: {
      campaignName: "Promotion",
      subject: "-50 % pour lancer votre projet de formation",
      brief: "Présenter une offre promotionnelle de -50 % (valeur fictive de démonstration) et orienter vers le catalogue des formations.",
      audience: "Personnes qui envisagent de se former",
      objective: "promotion",
    },
  },
  {
    id: "black-friday",
    label: "Black Friday",
    group: "campagne",
    brief: {
      campaignName: "Black Friday",
      subject: "Black Friday : découvrez les formations Studi",
      brief: "Mettre en avant la campagne Black Friday Studi à partir du visuel de campagne fourni et orienter vers la découverte des formations.",
      audience: "Personnes intéressées par une formation Studi",
      objective: "promotion",
      visual: "black-friday",
    },
  },
  {
    id: "studi-days",
    label: "Studi Days",
    group: "campagne",
    brief: {
      campaignName: "Studi Days",
      subject: "Découvrez Studi, en ligne et à votre rythme",
      brief: "Présenter l'univers Studi Days à partir du visuel de campagne fourni et inviter le lecteur à découvrir Studi et ses formations.",
      audience: "Personnes qui découvrent Studi",
      objective: "decouverte-formations",
      visual: "studi-days",
    },
  },
  {
    id: "studi-meet",
    label: "Studi Meet",
    group: "campagne",
    brief: {
      campaignName: "Studi Meet",
      subject: "Studi Meet : échangez avec des enseignants en ligne",
      brief: "Présenter Studi Meet à partir du visuel fourni et inviter le lecteur à découvrir le service.",
      audience: "Personnes intéressées par l'univers Studi",
      objective: "decouverte-formations",
      visual: "studi-meet",
    },
  },
] as const satisfies readonly EmailDemoPreset[]

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

/**
 * Données FICTIVES de démonstration, décidées par l'utilisateur pour la démo :
 * ni une offre Studi vérifiée, ni des données des sources, et jamais des faits
 * validés pour le contrat de génération (`EmailGenerationRequest.offer`).
 * Aucune date de fin, compte à rebours, prix, montant ni condition n'a été
 * fourni : aucun n'est rédigé, et aucun disclaimer du catalogue ne s'applique
 * (`offre-promotionnelle` exige une date de fin). La provenance reste ici,
 * hors du contrat EmailConfig.
 */
export const promotionDemoOffer = { value: "-50 %", code: "DEMO50", source: "demo" } as const

const scenarios: Record<EmailDemoObjective, Scenario> = {
  /** Réflexion, étapes, découverte : bandeau + hero panoramique + étapes + clôture. */
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
        { id: "hero", type: "email-module-hero-promotional-image-medium", surface: zone, slots: { "titre-principal": text(hero.title), "texte-descriptif": text(hero.text), "cta-1": link("Découvrir les formations", "catalogue-formations"), "image-1": emailDemoImage("reconversion") } },
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
        { id: "cloture", type: "email-module-text-only", slots: { "titre-section": text("Prenez le temps d'explorer"), "texte-descriptif": text("Parcourez les fiches métiers et les domaines de formation pour repérer ce qui fait écho à votre projet.") } },
        footer,
      ]
    },
  },

  /** Soutien et méthode : hero texte + portrait, appuis à icônes, encart coloré. */
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
        { id: "hero", type: "email-module-hero-split-image", slots: { "sous-titre": text(brief.campaignName), "titre-principal": text(hero.title), "texte-descriptif": text(hero.text), "cta-1": link("Découvrir l'accompagnement", "accompagnement"), "image-1": emailDemoImage("accompagnement") } },
        {
          id: "appuis",
          type: "email-module-icons-list",
          slots: {
            "titre-section": text(`Pour vous : ${brief.audience}`),
            "icone-1": { icon: "users" },
            "item-1-titre": text("Des formateurs et des conseillers"),
            "texte-descriptif-1": text("Des interlocuteurs pour répondre à vos questions pendant la formation."),
            "icone-2": { icon: "lightbulb" },
            "item-2-titre": text("Des repères pour progresser"),
            "texte-descriptif-2": text("Des cours et des exercices pour avancer régulièrement."),
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
            "titre-section": text("Progresser dans votre parcours"),
            "texte-descriptif-1": text("Se former à distance ne veut pas dire se former seul. Des interlocuteurs peuvent vous accompagner au fil de votre formation."),
            "titre-principal": text("Comment apprend-on chez Studi ?"),
            "texte-descriptif-2": text("Découvrez la pédagogie Studi et la façon dont elle s'organise tout au long de votre parcours."),
            "cta-1": link("Découvrir la pédagogie", "methode"),
          },
        },
        footer,
      ]
    },
  },

  /** Compétences et progression : header de campagne + grand visuel + grille. */
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
        { id: "hero", type: "email-module-hero-promotional-image-large", surface: zone, slots: { "sous-titre": text("Évolution professionnelle"), "titre-principal": text(hero.title), "texte-descriptif": text(hero.text), "cta-1": link("Découvrir le coaching carrière", "coaching-carriere"), "image-1": emailDemoImage("evolution") } },
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
        { id: "cloture", type: "email-module-text-only", slots: { "titre-section": text("Préparez la suite de votre parcours"), "texte-descriptif": text("Faites le point sur les compétences que vous souhaitez développer, puis explorez les leviers qui correspondent à votre projet.") } },
        footer,
      ]
    },
  },

  /** Offre fictive : header de campagne + hero offre (photo, -50 %, code) + atouts Accent 1. */
  promotion: {
    zone: "accent-1",
    preheader: "Une offre promotionnelle pour lancer votre projet de formation, en ligne et à votre rythme",
    blocks: (brief, zone) => [
      { id: "header", type: "email-module-header-seasonal-campaign", slots: { label: text(brief.campaignName) } },
      {
        id: "hero",
        type: "email-module-hero-offer-image-top",
        slots: {
          "image-1": emailDemoImage("promotion"),
          "sous-titre": text("Offre promotionnelle"),
          "valeur-cle": text(promotionDemoOffer.value),
          "texte-descriptif": text("Lancez votre projet de formation avec Studi."),
          "code-promo-1": text(promotionDemoOffer.code),
          "cta-1": link("Découvrir les formations", "catalogue-formations"),
          "lien-1": link("Voir le Parcours Découverte", "parcours-decouverte"),
        },
      },
      {
        id: "atouts",
        type: "email-module-icons-list",
        surface: zone,
        slots: {
          "titre-section": text(`Pour vous : ${brief.audience}`),
          "icone-1": { icon: "laptop" },
          "item-1-titre": text("Des formations en ligne"),
          "texte-descriptif-1": text("Vous suivez vos cours à distance, depuis chez vous."),
          "icone-2": { icon: "stopwatch" },
          "item-2-titre": text("À votre rythme"),
          "texte-descriptif-2": text("Vous avancez selon votre emploi du temps."),
          "icone-3": { icon: "graduation-cap" },
          "item-3-titre": text("De nombreux domaines"),
          "texte-descriptif-3": text("Parcourez les formations par domaine et par niveau."),
        },
      },
      footer,
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Campagnes visuelles                                                        */
/* -------------------------------------------------------------------------- */

type Campaign = {
  blocks: (brief: EmailBrief) => EmailBlock[]
  preheader: string
}

/**
 * Le visuel est la pièce maîtresse : le HTML le complète sans le recopier.
 * Surfaces fixées par le visuel (Accent 1 et Marque sont ses fonds exacts).
 */
const campaigns: Record<EmailDemoVisual, Campaign> = {
  /**
   * Le visuel porte « Jusqu'à -40 % » et une accroche : ils restent dans
   * l'image. Aucune offre, code, date, compte à rebours, prix ni condition
   * n'est créé, et aucun disclaimer (voir `emailDemoVisualNotices`).
   */
  "black-friday": {
    preheader: "Le catalogue des formations Studi, à parcourir à votre rythme",
    blocks: () => [
      header,
      {
        id: "hero",
        type: "email-module-hero-promotional-image-large",
        surface: "accent-1",
        slots: {
          "sous-titre": text("Formations Studi"),
          "titre-principal": text("Choisissez votre formation"),
          "texte-descriptif": text("Parcourez le catalogue et trouvez la formation qui correspond à votre projet."),
          "cta-1": link("Découvrir les formations", "catalogue-formations"),
          "image-1": emailDemoImage("black-friday"),
        },
      },
      footer,
    ],
  },

  /** Aucune page Studi Days n'existe : le CTA mène à la méthode Studi. */
  "studi-days": {
    preheader: "Formations en ligne, méthode et accompagnement : découvrez comment on apprend chez Studi",
    blocks: (brief) => [
      header,
      {
        id: "hero",
        type: "email-module-hero-promotional-image-large",
        surface: "marque",
        slots: {
          "sous-titre": text("Découvrir Studi"),
          "titre-principal": text("Découvrez comment on apprend chez Studi"),
          "texte-descriptif": text("Des formations en ligne, une méthode et un accompagnement pour avancer dans votre projet."),
          "cta-1": link("Découvrir Studi", "methode"),
          "image-1": emailDemoImage("studi-days"),
        },
      },
      {
        id: "atouts",
        type: "email-module-icons-list",
        slots: {
          "titre-section": text(`Pour vous : ${brief.audience}`),
          "icone-1": { icon: "laptop" },
          "item-1-titre": text("Des formations en ligne"),
          "texte-descriptif-1": text("Vous suivez vos cours à distance, depuis chez vous."),
          "icone-2": { icon: "users" },
          "item-2-titre": text("Des formateurs et des conseillers"),
          "texte-descriptif-2": text("Des interlocuteurs pour répondre à vos questions pendant la formation."),
          "icone-3": { icon: "stopwatch" },
          "item-3-titre": text("À votre rythme"),
          "texte-descriptif-3": text("Vous organisez vos sessions selon vos disponibilités."),
        },
      },
      footer,
    ],
  },

  /**
   * Service d'apprentissage en ligne, pas un événement : aucune date, lieu,
   * programme ni réservation. Textes limités à ce que présente
   * https://meet.studi.fr/ (catégories de cours, cours de groupe, chat vidéo
   * en direct, tuteurs, « Apprenez à votre rythme »).
   */
  "studi-meet": {
    preheader: "Cours de groupe, chat vidéo en direct et tuteurs : découvrez Studi Meet",
    blocks: (brief) => [
      header,
      {
        id: "hero",
        type: "email-module-hero-promotional-image-medium",
        surface: "encre",
        slots: {
          "titre-principal": text("Échangez avec des enseignants en ligne"),
          "texte-descriptif": text("Choisissez une catégorie de cours et apprenez à votre rythme."),
          "cta-1": link("Découvrir Studi Meet", "studi-meet"),
          "image-1": emailDemoImage("studi-meet"),
        },
      },
      {
        id: "atouts",
        type: "email-module-icons-list",
        slots: {
          "titre-section": text(`Pour vous : ${brief.audience}`),
          "icone-1": { icon: "users" },
          "item-1-titre": text("Cours de groupe"),
          "texte-descriptif-1": text("Des cours en ligne à suivre à plusieurs."),
          "icone-2": { icon: "comments" },
          "item-2-titre": text("Chat vidéo en direct"),
          "texte-descriptif-2": text("Des échanges en vidéo, en direct."),
          "icone-3": { icon: "magnifying-glass" },
          "item-3-titre": text("Trouver des tuteurs"),
          "texte-descriptif-3": text("Parcourez les tuteurs et les catégories de cours."),
        },
      },
      footer,
    ],
  },
}

/**
 * Limites affichées dans l'interface : l'email de démonstration n'est pas
 * prêt pour un envoi réel.
 */
export const emailDemoVisualNotices: Partial<Record<EmailDemoVisual, string>> = {
  "black-friday":
    "Démonstration : le visuel fourni comporte un astérisque (« formations diplômantes* ») dont le renvoi n'a pas été fourni. Cet email n'est pas prêt pour un envoi réel.",
}

/* -------------------------------------------------------------------------- */
/* Génération                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * L'objectif choisit le scénario (composition, zone colorée, destinations) ;
 * le brief choisit la variante d'accroche ; l'audience est reprise dans le
 * corps et, si elle est en situation difficile, passe la zone colorée en
 * Accent 2 doux. Nom de campagne et objet viennent de la saisie. Une
 * campagne visuelle (`visual`) remplace le scénario.
 */
export function generateDemoEmail(brief: EmailBrief): EmailConfig {
  const base = { version: 1, id: toEmailId(brief.campaignName), name: brief.campaignName, subject: brief.subject } as const
  // Campagne visuelle : le visuel choisit la composition, avant l'objectif.
  if (brief.visual) {
    const campaign = campaigns[brief.visual]
    return { ...base, preheader: campaign.preheader, blocks: campaign.blocks(brief) }
  }
  const scenario = scenarios[brief.objective]
  const zone = includesAny(brief.audience, empathyKeywords) ? "accent-2-soft" : scenario.zone
  return {
    ...base,
    preheader: scenario.preheader,
    blocks: scenario.blocks(brief, zone),
  }
}
