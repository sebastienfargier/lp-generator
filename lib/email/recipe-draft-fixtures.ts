/**
 * Six Drafts de démonstration, hors ligne : ce qu'un modèle aurait à produire
 * pour chaque recette, écrits à la main dans le registre des ressources de
 * marque (vouvoiement, phrases courtes, aucune promesse de résultat, aucun
 * chiffre hors claims approuvées et faits de la demande). Ils servent à
 * prouver l'aller-retour Draft → resolver → EmailConfig → validation →
 * terminologie → rendu → aperçu, sans appeler Anthropic.
 *
 * Chaque fixture porte sa requête (`EmailRecipeRequest`), qui détermine la
 * recette ; le Draft ne choisit ni la recette, ni la disposition du hero, ni
 * la frise, ni la surface.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { resolveEmailRecipeDraft } from "./recipe-drafts"
import { selectEmailRecipe, type EmailRecipeRequest } from "./recipe-selection"
import type { EmailRecipeId } from "./recipes"

export type EmailRecipeDraftFixture = { id: string; recipe: EmailRecipeId; label: string; request: EmailRecipeRequest; draft: unknown }

const request = (fields: Omit<EmailRecipeRequest, "campaignName"> & { campaignName: string }): EmailRecipeRequest => fields

export const emailRecipeDraftFixtures = [
  {
    id: "D-R1-A",
    recipe: "discovery-reassurance",
    label: "R1 — découverte, audience en réflexion",
    request: request({
      campaignName: "Découvrir son métier, première étape",
      brief: "Aider les lecteurs à clarifier leur projet avant de choisir une formation.",
      audience: "Adultes en réflexion sur leur orientation",
      intent: "discovery",
    }),
    draft: {
      subject: "Et si vous clarifiiez votre projet ?",
      preheader: "Trois étapes pour savoir où vous allez, avec un interlocuteur à vos côtés.",
      visualIntent: "warm-reassurance",
      hero: {
        eyebrow: "Orientation",
        title: "Clarifiez votre projet avant de choisir une formation",
        text: "Vous hésitez entre plusieurs voies ? Prenez le temps de regarder un métier de près : ce qu'il demande, ce qu'il apporte, et ce qui vous correspond.",
        cta: { label: "Explorer les métiers", destination: "metiers" },
      },
      steps: {
        eyebrow: "Votre progression",
        items: [
          { title: "Explorer", text: "Parcourez des fiches métiers pour voir ce que fait vraiment quelqu'un qui exerce." },
          { title: "Comparer", text: "Rapprochez les métiers de vos envies, de vos contraintes et de votre quotidien." },
          { title: "Choisir", text: "Repérez la formation qui mène au métier retenu, puis échangez avec un conseiller." },
        ],
      },
      benefits: {
        title: "Ce qui vous accompagne",
        items: [
          { icon: "magnifying-glass", title: "Des fiches claires", text: "Chaque métier est décrit simplement : missions, environnement, évolutions." },
          { icon: "users", title: "Un conseiller à l'écoute", text: "Vous posez vos questions, il vous aide à y voir plus clair." },
          { icon: "stopwatch", title: "Votre calendrier", text: "Vous avancez au rythme qui convient à votre situation." },
        ],
      },
      closing: {
        title: "Prêt à regarder de plus près ?",
        text: "Commencez par les métiers qui vous intriguent : rien ne vous oblige à décider tout de suite.",
        ctaLabel: "Découvrir les fiches métiers",
      },
    },
  },
  {
    id: "D-R1-B",
    recipe: "discovery-reassurance",
    label: "R1 — réassurance, audience en recherche d'emploi",
    request: request({
      campaignName: "Reprendre pied après une pause",
      brief: "Rassurer des personnes en recherche d'emploi et leur montrer un point de départ.",
      audience: "Personnes en recherche d'emploi",
      objective: "accompagnement",
    }),
    draft: {
      subject: "Reprendre pied, à votre manière",
      preheader: "Un point de départ simple pour repenser votre parcours, sans pression.",
      visualIntent: "career-movement",
      hero: {
        eyebrow: "Nouveau départ",
        title: "Reprenez la main sur votre parcours",
        text: "Une interruption n'est pas une impasse. Regardez ce qui vous motive, puis avancez par petites étapes.",
        cta: { label: "Voir les formations", destination: "catalogue-formations" },
      },
      steps: {
        eyebrow: "Pour avancer",
        items: [
          { title: "Faire le point", text: "Listez ce que vous savez faire et ce que vous aimeriez faire." },
          { title: "Explorer", text: "Découvrez des métiers proches de vos centres d'intérêt." },
          { title: "Se lancer", text: "Choisissez une première formation et un rythme réaliste." },
        ],
      },
      benefits: {
        title: "Des appuis pour avancer",
        items: [
          { icon: "lightbulb", title: "Des idées de métiers", text: "Vous explorez sans engagement, à partir de ce qui vous parle." },
          { icon: "handshake-simple", title: "Un échange possible", text: "Vous pouvez poser vos questions avant de choisir." },
          { icon: "graduation-cap", title: "Des formations lisibles", text: "Le catalogue présente chaque parcours simplement." },
        ],
      },
      closing: {
        title: "Un premier pas, quand vous voulez",
        text: "Parcourez le catalogue et gardez ce qui vous parle.",
        ctaLabel: "Parcourir le catalogue",
      },
    },
  },
  {
    id: "D-R2-A",
    recipe: "editorial-newsletter",
    label: "R2 — newsletter, édition bandeau, actifs en poste (référence éditoriale)",
    request: request({
      campaignName: "Newsletter, évolution à partir de l'existant",
      brief: "Une newsletter qui aide des actifs à repérer ce qui les attire dans leur quotidien de travail, avant d'explorer une autre voie.",
      audience: "Actifs en poste",
      target: "actifs_en_poste",
      emailType: "newsletter",
    }),
    draft: {
      edition: "banner",
      subject: "Votre évolution part de ce que vous savez",
      preheader: "Un carnet, quatre gestes et un parcours à lire pour clarifier la suite de votre route.",
      hero: {
        eyebrow: "Évolution",
        title: "Votre prochaine étape est peut-être déjà dans votre quotidien",
        text: "Une tâche qui vous passionne, une autre qui vous pèse : ces signaux disent déjà où regarder. Cette édition vous aide à les relever, puis à les confronter à des parcours d'autres actifs.",
        cta: { label: "Lire des parcours d'actifs", destination: "blog-la-vie-pro" },
      },
      intro: {
        title: "Pourquoi commencer par vous",
        text: "Changer de cap sans savoir ce qui vous attire peut revenir à repartir de zéro. Quelques minutes de lecture et un carnet suffisent pour démarrer : quatre gestes, à faire dans l'ordre ou séparément.",
      },
      rubriques: {
        eyebrow: "Quatre gestes",
        title: "À tester cette semaine",
        items: [
          { title: "Noter ce qui vous attire", text: "Relevez dans un carnet les tâches qui vous donnent de l'énergie et celles qui vous en retirent." },
          { title: "Lister ce que vous maîtrisez", text: "Écrivez ce que vos collègues vous demandent le plus souvent : c'est un indice de ce que vous faites déjà bien." },
          { title: "Comparer deux directions", text: "Choisissez deux métiers qui vous intriguent et mettez côte à côte ce qu'ils changeraient à votre quotidien." },
          { title: "Lire un parcours proche du vôtre", text: "Repérez la trajectoire d'un actif dans une situation voisine et notez ce qui vous inspire ou vous surprend." },
        ],
      },
      closing: {
        title: "Un parcours à lire avant de décider",
        text: "Voir comment d'autres actifs ont avancé donne des points de comparaison, sans engagement de votre part. Choisissez-en un, puis reprenez votre carnet.",
        ctaLabel: "Choisir un parcours à lire",
      },
    },
  },
  {
    id: "D-R2-B",
    recipe: "editorial-newsletter",
    label: "R2 — newsletter, édition frise de portraits, découverte (référence éditoriale)",
    request: request({
      campaignName: "Newsletter, regarder un métier de près",
      brief: "Une newsletter de découverte : apprendre à comprendre un métier avant de s'y projeter.",
      audience: "Personnes en reconversion",
      target: "reconversion",
      intent: "editorial",
    }),
    draft: {
      edition: "portrait-strip",
      subject: "Un métier se découvre par ses journées",
      preheader: "Journée type, interlocuteurs, compétences, avenir : de quoi comparer deux métiers.",
      hero: {
        eyebrow: "Découverte",
        title: "Que fait-on vraiment dans une journée de travail ?",
        text: "L'intitulé d'un métier en dit peu. Cette édition vous donne quatre questions pour le regarder de près, et une fiche métier pour vérifier vos réponses.",
        cta: { label: "Explorer des fiches métiers", destination: "metiers" },
      },
      intro: {
        title: "Un intitulé ne dit pas tout",
        text: "Deux métiers aux noms proches peuvent remplir des journées très différentes. Posez les mêmes questions à chacun : vous comparerez à armes égales.",
      },
      rubriques: {
        eyebrow: "Quatre questions",
        title: "À poser à chaque métier",
        items: [
          { title: "Que fait-on le matin ?", text: "Cherchez les tâches qui reviennent chaque jour, pas seulement les missions annoncées." },
          { title: "Avec qui travaille-t-on ?", text: "Notez les interlocuteurs : équipes, clients, partenaires. Le cadre relationnel pèse autant que la mission." },
          { title: "Quelles compétences servent ?", text: "Comparez-les à ce que vous savez déjà faire et repérez ce qui resterait à apprendre." },
          { title: "Que devient-on ensuite ?", text: "Regardez les évolutions possibles : un métier se choisit aussi pour ce qu'il ouvre." },
        ],
      },
      closing: {
        title: "De la question à la fiche",
        text: "Une fiche métier permet de vérifier vos réponses sur un cas précis. Choisissez-en une qui vous intrigue et reprenez les quatre questions.",
        ctaLabel: "Ouvrir une fiche métier",
      },
    },
  },
  {
    id: "D-R3-A",
    recipe: "brand-proof",
    label: "R3 — trois claims en liste (compatibilité générale)",
    request: request({
      campaignName: "Studi, des repères pour choisir",
      brief: "Donner quelques repères vérifiés sur Studi à des personnes qui comparent des écoles avant de se décider.",
      audience: "Personnes en reconversion",
      target: "reconversion",
      intent: "brand-proof",
    }),
    draft: {
      subject: "Studi vu par son échelle, en trois repères",
      preheader: "Offre, équipe, communauté : de quoi vous faire une première idée avant d'aller plus loin.",
      visualIntent: "campaign-portrait",
      hero: {
        eyebrow: "Échelle",
        title: "Pour comparer des écoles, commencez par leur taille",
        text: "Étendue de l'offre, équipe pédagogique, personnes en formation : trois ordres de grandeur pour situer Studi avant d'entrer dans le détail.",
        cta: { label: "Parcourir le catalogue", destination: "catalogue-formations" },
      },
      claims: ["catalogue-formations", "formateurs-conseillers", "apprenants-en-formation"],
      support: [
        "Ce repère donne une idée de l'étendue de l'offre de formation.",
        "Ce chiffre permet de situer l'échelle de l'équipe pédagogique.",
        "Ce repère donne une idée du nombre de personnes actuellement en formation.",
      ],
      closing: {
        title: "Un point de départ, pas un verdict",
        text: "Ces repères situent Studi ; ils ne disent pas ce qui vous conviendra. Le catalogue permet de creuser ce qui vous intéresse.",
      },
    },
  },
  {
    id: "D-R3-B",
    recipe: "brand-proof",
    label: "R3 — deux claims en chiffres clés (impact visuel)",
    request: request({
      campaignName: "Studi, deux chiffres clés",
      brief: "Un email de réassurance pour situer Studi par deux chiffres clés vérifiés.",
      audience: "Personnes en reconversion",
      target: "reconversion",
      intent: "brand-proof",
    }),
    draft: {
      subject: "Situer Studi en deux chiffres clés",
      preheader: "Personnes en formation, offre en alternance : un premier aperçu avant d'aller plus loin.",
      visualIntent: "campaign-portrait",
      hero: {
        eyebrow: "Chiffres clés",
        title: "Studi en un coup d'œil",
        text: "Deux chiffres donnent une première idée de l'échelle de Studi. Ils situent l'école, sans rien vous demander.",
        cta: { label: "Découvrir le catalogue Studi", destination: "catalogue-formations" },
      },
      claims: ["apprenants-en-formation", "formations-alternance"],
      support: [
        "Le premier repère donne une idée du nombre de personnes actuellement en formation.",
        "Le second situe l'ampleur de l'offre proposée en alternance.",
      ],
      closing: {
        title: "Pour aller plus loin",
        text: "Ces deux chiffres situent Studi ; ils ne disent pas ce qui vous conviendra. Le catalogue détaille les formations qui vous intéressent.",
      },
    },
  },
] as const satisfies readonly EmailRecipeDraftFixture[]

/** Aller-retour hors ligne d'une fixture : recette déduite de la requête, puis Draft → EmailConfig. */
export function resolveEmailRecipeDraftFixture(id: (typeof emailRecipeDraftFixtures)[number]["id"]) {
  const fixture = emailRecipeDraftFixtures.find((candidate) => candidate.id === id)!
  const selection = selectEmailRecipe(fixture.request as EmailRecipeRequest)
  if (selection.status !== "selected") throw new Error(`${id} : ${selection.issues.map((issue) => issue.message).join(" ")}`)
  return { selection, resolution: resolveEmailRecipeDraft(fixture.request as EmailRecipeRequest, selection.recipe, fixture.draft) }
}
