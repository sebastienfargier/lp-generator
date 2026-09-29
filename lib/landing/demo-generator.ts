import { demoLandingPage } from "./demo"
import type {
  LandingAction,
  LandingAudienceItem,
  LandingContentItem,
  LandingPageConfig,
  LandingProduct,
} from "./types"

/**
 * Moteur de démonstration : génération déterministe (sans IA) qui produit une
 * LandingPageConfig à partir d'un brief. Il sera remplacé par un générateur
 * Claude, avec le même contrat de sortie. Aucune dépendance React.
 *
 * Contenus : uniquement des produits, prix et images déjà présents dans le
 * projet ; textes génériques de démonstration, sans affirmation réglementaire.
 */

export type DemoGeneratorInput = {
  projectName: string
  brief: string
  audience: string
  objective: string
}

export const demoScenarios = [
  "reconversion",
  "formation-rh",
  "financement",
  "management",
] as const

export type DemoScenario = (typeof demoScenarios)[number]

/* -------------------------------------------------------------------------- */
/* Détection du scénario                                                      */
/* -------------------------------------------------------------------------- */

/** Minuscules sans accents, pour une détection de mots-clés simple. */
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

const scenarioKeywords: { [Scenario in DemoScenario]: RegExp[] } = {
  reconversion: [
    /reconver/,
    /changer de metier/,
    /changement de metier/,
    /nouveau metier/,
  ],
  "formation-rh": [
    /\brh\b/,
    /ressources humaines/,
    /formation/,
    /\bmba\b/,
    /bachelor/,
  ],
  financement: [/\bcpf\b/, /financement/, /financer/, /\bprix\b/, /budget/],
  management: [/manager/, /management/, /equipe/, /leadership/, /recrutement/],
}

/**
 * Scénario dont le brief contient le plus de mots-clés. En cas d'égalité,
 * l'ordre de `demoScenarios` s'applique ; sans aucun mot-clé : reconversion.
 */
export function detectDemoScenario(brief: string): DemoScenario {
  const text = normalize(brief)
  let best: DemoScenario = "reconversion"
  let bestScore = 0
  for (const scenario of demoScenarios) {
    const score = scenarioKeywords[scenario].filter((pattern) =>
      pattern.test(text)
    ).length
    if (score > bestScore) {
      best = scenario
      bestScore = score
    }
  }
  return best
}

/* -------------------------------------------------------------------------- */
/* Personnalisation                                                           */
/* -------------------------------------------------------------------------- */

/** Identifiant de page au format des ancres (ex. "Reconversion RH" → "reconversion-rh"). */
function toPageId(projectName: string) {
  const slug = normalize(projectName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!slug) return "landing-page"
  return /^[a-z]/.test(slug) ? slug : `lp-${slug}`
}

/** CTA principal selon l'objectif ; l'ancre pointe vers une section de la page. */
function primaryActionFor(objective: string, anchor: string): LandingAction {
  switch (objective) {
    case "lead-generation":
      return { label: "Être rappelé par un conseiller", href: anchor, icon: "phone" }
    case "documentation-download":
      return { label: "Télécharger la documentation", href: anchor, icon: "download" }
    case "contact":
      return { label: "Prendre contact", href: anchor, icon: "phone" }
    default:
      return { label: "Découvrir les formations", href: anchor }
  }
}

/* -------------------------------------------------------------------------- */
/* Données de démonstration existantes                                        */
/* -------------------------------------------------------------------------- */

type DemoSection = (typeof demoLandingPage.sections)[number]

function demoSection<Type extends DemoSection["type"]>(type: Type) {
  const section = demoLandingPage.sections.find(
    (item): item is Extract<DemoSection, { type: Type }> => item.type === type
  )
  if (!section) throw new Error(`Section de démonstration absente : ${type}`)
  return section
}

const demoProducts: LandingProduct[] = demoSection("product-grid").props.products
const demoAudiences: LandingAudienceItem[] =
  demoSection("audience-switcher").props.items
const demoContents: LandingContentItem[] =
  demoSection("content-carousel").props.items

/* -------------------------------------------------------------------------- */
/* Scénarios                                                                  */
/* -------------------------------------------------------------------------- */

type ScenarioBuilder = (input: DemoGeneratorInput) => LandingPageConfig["sections"]

const scenarios: { [Scenario in DemoScenario]: ScenarioBuilder } = {
  reconversion: ({ audience, objective }) => [
    {
      id: "hero",
      type: "editorial-hero",
      props: {
        title:
          "Envie d'un nouveau métier ? Préparez votre reconversion sans tout mettre en pause.",
        visual: {
          src: "/images/hero-parent-enfant.jpg",
          alt: "Une mère joue avec son jeune enfant dans un salon lumineux",
        },
        primaryAction: primaryActionFor(objective, "#parcours"),
        supportingText: `Pensé pour : ${audience}.`,
      },
    },
    {
      id: "atouts",
      type: "value-props",
      props: {
        label: "Les atouts d'une reconversion accompagnée",
        items: [
          {
            title: "Compatible avec votre emploi",
            description: "Avancez à votre rythme, le soir ou le week-end.",
          },
          {
            title: "Un projet clarifié",
            description: "Faites le point sur vos compétences et vos envies.",
          },
          {
            title: "Un accompagnement humain",
            description: "Un interlocuteur dédié tout au long du parcours.",
          },
        ],
      },
    },
    {
      id: "parcours",
      type: "pillars",
      props: {
        eyebrow: "Votre parcours",
        title: "Trois étapes pour changer de métier sereinement",
        description:
          "Une démarche progressive, pensée pour les personnes déjà en poste.",
        items: [
          {
            title: "Faire le point",
            description:
              "Identifier vos compétences transférables et les métiers qui vous correspondent.",
          },
          {
            title: "Choisir sa formation",
            description:
              "Comparer les parcours selon votre disponibilité, votre budget et vos objectifs.",
          },
          {
            title: "Se lancer",
            description:
              "Suivre la formation à votre rythme et préparer votre entrée dans le nouveau métier.",
          },
        ],
      },
    },
    {
      id: "ressources",
      type: "content-carousel",
      props: {
        label: "Ressources pour préparer votre reconversion",
        items: demoContents,
      },
    },
  ],

  "formation-rh": ({ brief, audience, objective }) => {
    const hasMba = /\bmba\b/.test(normalize(brief))
    return [
      hasMba
        ? {
            id: "hero",
            type: "product-hero",
            props: {
              badges: [
                { label: "Populaire", variant: "accent-1" },
                {
                  label: "100% En ligne · Titre RNCP de Niveau 7",
                  variant: "brand-soft",
                },
              ],
              title: "MBA Manager Stratégique RH",
              description:
                "Devenez un expert hautement qualifié de la transformation des ressources humaines. Un cursus d'excellence flexible pour concilier formation et activité professionnelle.",
              pricing: {
                discount: "-20%",
                originalPrice: "1 250 €",
                price: "990 €",
                installment: "ou 82,50 €/mois",
                financing: {
                  title: "Éligible MonCompteFormation",
                  description:
                    "Reste à charge possible de 0 € selon vos droits CPF cumulés.",
                },
              },
              primaryAction: primaryActionFor(objective, "#formations"),
              secondaryAction: { label: "Voir les profils", href: "#profils" },
              partner: {
                label: "En partenariat académique de prestige avec :",
                name: "ESGRH",
              },
              visual: {
                src: "/images/hero-apprenante.jpg",
                alt: "Apprenante souriante assise sur un canapé",
              },
              highlight: {
                title: "Débouchés professionnels",
                items: [
                  "Consultant en stratégie d’entreprise",
                  "Chargé de mission stratégique",
                  "Chef de projet développement produit",
                  "Consultant RH auto-entrepreneur",
                ],
              },
            },
          }
        : {
            id: "hero",
            type: "editorial-hero",
            props: {
              title: "Faites des ressources humaines votre nouveau terrain de jeu.",
              visual: {
                src: "/images/hero-apprenante.jpg",
                alt: "Apprenante souriante assise sur un canapé",
              },
              primaryAction: primaryActionFor(objective, "#formations"),
              supportingText: `Pensé pour : ${audience}.`,
            },
          },
      {
        id: "benefices",
        type: "value-props",
        props: demoSection("value-props").props,
      },
      {
        id: "formations",
        type: "product-grid",
        props: {
          label: "Nos formations en ressources humaines",
          products: demoProducts,
        },
      },
      {
        id: "profils",
        type: "audience-switcher",
        props: {
          label: "Un parcours adapté à votre situation",
          defaultValue: demoAudiences[0]?.id,
          items: demoAudiences,
        },
      },
      {
        id: "contenus",
        type: "content-carousel",
        props: {
          label: "Ressources pour préparer votre projet RH",
          items: demoContents,
        },
      },
    ]
  },

  financement: ({ audience, objective }) => [
    {
      id: "hero",
      type: "immersive-hero",
      props: {
        badge: { label: "Financement", variant: "accent-1" },
        headline: ["Votre formation", "est peut-être déjà", "finançable"],
        description: `Faites le point sur les solutions possibles — ${audience}.`,
        primaryAction: primaryActionFor(objective, "#etapes"),
        visual: { src: "/images/hero-bilan.jpg", alt: "", position: "right" },
      },
    },
    {
      id: "solutions",
      type: "value-props",
      props: {
        label: "Pourquoi étudier son financement en amont",
        items: [
          {
            title: "Y voir clair",
            description: "Connaître les pistes envisageables avant de vous engager.",
          },
          {
            title: "Être accompagné",
            description: "Un conseiller vous aide à préparer votre dossier.",
          },
          {
            title: "Gagner du temps",
            description: "Les bonnes informations réunies au même endroit.",
          },
        ],
      },
    },
    {
      id: "etapes",
      type: "pillars",
      props: {
        eyebrow: "Comment ça marche",
        title: "Trois étapes pour préparer le financement de votre formation",
        items: [
          {
            title: "Échanger avec un conseiller",
            description:
              "Présentez votre projet et votre situation pour identifier les pistes adaptées.",
          },
          {
            title: "Choisir la formation",
            description:
              "Sélectionnez le parcours qui correspond à vos objectifs et à votre calendrier.",
          },
          {
            title: "Constituer le dossier",
            description:
              "Réunissez les éléments nécessaires avec l'aide de votre conseiller.",
          },
        ],
      },
    },
    {
      id: "guides",
      type: "content-carousel",
      props: {
        label: "Guides et conseils sur le financement",
        items: demoContents,
      },
    },
  ],

  management: ({ audience, objective }) => [
    {
      id: "hero",
      type: "editorial-hero",
      props: {
        title: "Développez votre leadership et faites grandir votre équipe.",
        visual: {
          src: "/images/content-3.jpg",
          alt: "Femme travaillant debout devant son ordinateur près d'une fenêtre",
        },
        primaryAction: primaryActionFor(objective, "#leviers"),
        supportingText: `Pensé pour : ${audience}.`,
      },
    },
    {
      id: "leviers",
      type: "pillars",
      props: {
        eyebrow: "Management",
        title: "Les leviers d'un management qui fait progresser",
        description:
          "Des compétences concrètes, applicables dès le lendemain avec votre équipe.",
        items: [
          {
            title: "Donner un cap",
            description:
              "Clarifier les priorités et partager une vision compréhensible par tous.",
          },
          {
            title: "Faire grandir les talents",
            description:
              "Accompagner chacun dans sa progression grâce au feedback et à la délégation.",
          },
          {
            title: "Recruter juste",
            description:
              "Structurer vos recrutements pour renforcer l'équipe sur la durée.",
          },
        ],
      },
    },
    {
      id: "profils",
      type: "audience-switcher",
      props: {
        label: "Un programme selon votre expérience",
        defaultValue: "nouveau-manager",
        items: [
          {
            id: "nouveau-manager",
            eyebrow: "Nouveau manager",
            title: "Réussir sa prise de poste",
            description:
              "Les bases pour animer une équipe et installer votre légitimité.",
            image: {
              src: "/images/audience-2.jpg",
              alt: "Homme montant un escalier, un classeur sous le bras",
            },
          },
          {
            id: "manager-confirme",
            eyebrow: "Manager confirmé",
            title: "Passer un cap",
            description:
              "Prendre du recul, déléguer davantage et piloter la performance.",
            image: {
              src: "/images/audience-1.jpg",
              alt: "Homme souriant travaillant sur son ordinateur à la maison",
            },
          },
          {
            id: "futur-manager",
            eyebrow: "Futur manager",
            title: "Préparer son évolution",
            description:
              "Acquérir les réflexes du management avant votre première équipe.",
            image: {
              src: "/images/content-4.jpg",
              alt: "Deux amies souriantes, l'une tenant un téléphone",
            },
          },
        ],
      },
    },
    {
      id: "ressources",
      type: "content-carousel",
      props: {
        label: "Ressources pour les managers",
        items: demoContents,
      },
    },
  ],
}

/**
 * Génération de démonstration. La sortie doit ensuite être validée par
 * LandingPageSchema, exactement comme le sera celle du futur modèle.
 */
export function generateDemoLandingPage(input: DemoGeneratorInput): {
  scenario: DemoScenario
  config: LandingPageConfig
} {
  const scenario = detectDemoScenario(input.brief)
  return {
    scenario,
    config: {
      version: 1,
      id: toPageId(input.projectName),
      title: input.projectName.trim(),
      sections: scenarios[scenario](input),
    },
  }
}
