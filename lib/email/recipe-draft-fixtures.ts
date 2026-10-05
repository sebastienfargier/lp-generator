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
    label: "R2 — newsletter, édition bandeau",
    request: request({
      campaignName: "Newsletter, apprendre à côté du quotidien",
      brief: "Une newsletter qui aide à organiser sa formation à côté du travail et de la vie de famille.",
      audience: "Actifs en poste qui se forment",
      emailType: "newsletter",
    }),
    draft: {
      edition: "banner",
      subject: "Apprendre à côté du quotidien : nos pistes",
      preheader: "Des repères concrets pour organiser vos semaines et garder le cap sur votre projet.",
      hero: {
        eyebrow: "La newsletter Studi",
        title: "Apprendre à côté du quotidien : des repères concrets",
        text: "Concilier emploi, vie de famille et formation demande de l'organisation. Voici de quoi trouver votre rythme.",
        cta: { label: "Lire le magazine", destination: "trajectoire-magazine" },
      },
      intro: {
        title: "Commencer petit",
        text: "Quelques minutes bien placées valent mieux qu'une longue session reportée. Choisissez un moment fixe dans la semaine et tenez-vous-y.",
      },
      rubriques: {
        eyebrow: "Dans cette édition",
        title: "Quatre repères pour avancer",
        items: [
          { title: "Organiser ses semaines", text: "Une méthode simple pour réserver du temps à vos cours." },
          { title: "Garder l'élan", text: "Des astuces pour continuer quand la fatigue s'invite." },
          { title: "Demander de l'aide", text: "Savoir à qui poser une question quand un point bloque." },
          { title: "Faire le point", text: "Un moment pour mesurer ce que vous avez déjà accompli." },
        ],
      },
      closing: {
        title: "Le magazine, pour aller plus loin",
        text: "Retrouvez des parcours, des conseils et des idées de lecture pour nourrir votre projet.",
        ctaLabel: "Lire le magazine",
      },
    },
  },
  {
    id: "D-R2-B",
    recipe: "editorial-newsletter",
    label: "R2 — newsletter, édition frise de portraits",
    request: request({
      campaignName: "Newsletter, rubriques de la semaine",
      brief: "Une newsletter de rubriques à parcourir : orientation, méthode, motivation, quotidien.",
      audience: "Lecteurs de la communauté Studi",
      intent: "editorial",
    }),
    draft: {
      edition: "portrait-strip",
      subject: "Quatre rubriques à lire cette semaine",
      preheader: "Orientation, méthode, rythme et motivation : de quoi nourrir votre semaine.",
      hero: {
        eyebrow: "La newsletter Studi",
        title: "Des parcours, des questions, des idées",
        text: "Cette édition revient sur les questions qui reviennent le plus souvent et propose des pistes pour avancer.",
        cta: { label: "Lire le magazine", destination: "trajectoire-magazine" },
      },
      intro: {
        title: "Un moment pour vous",
        text: "Prenez cinq minutes pour parcourir les rubriques ci-dessous : chacune se lit seule, dans l'ordre qui vous plaît.",
      },
      rubriques: {
        eyebrow: "Au programme",
        title: "Quatre rubriques à parcourir",
        items: [
          { title: "Orientation", text: "Comprendre un métier avant de s'engager." },
          { title: "Méthode", text: "Apprendre à son rythme, avec des repères." },
          { title: "Motivation", text: "Garder l'élan sur la durée." },
          { title: "Quotidien", text: "Faire de la place à la formation dans ses semaines." },
        ],
      },
      closing: {
        title: "À retenir",
        text: "Un projet se construit par petites touches. Revenir chaque semaine sur un point précis aide à avancer sans se disperser.",
        ctaLabel: "Lire le magazine",
      },
    },
  },
  {
    id: "D-R3-A",
    recipe: "brand-proof",
    label: "R3 — trois claims en liste",
    request: request({
      campaignName: "Studi, des repères pour choisir",
      brief: "Donner quelques repères vérifiés sur Studi à des personnes qui comparent des écoles.",
      audience: "Adultes qui comparent plusieurs écoles",
      intent: "brand-proof",
      objective: "decouverte-formations",
    }),
    draft: {
      subject: "Studi : des repères pour choisir",
      preheader: "Quelques repères clés sur l'école, pour décider en connaissance de cause.",
      visualIntent: "campaign-portrait",
      hero: {
        eyebrow: "Repères Studi",
        title: "Des repères concrets pour choisir en confiance",
        text: "Avant de vous engager, regardez ce que Studi propose et à quelle échelle. Voici quelques repères clés.",
        cta: { label: "Découvrir le catalogue", destination: "catalogue-formations" },
      },
      claims: ["catalogue-formations", "formations-alternance", "formateurs-conseillers"],
      support: [
        "Un choix assez large pour comparer plusieurs voies avant de décider.",
        "Une voie pour apprendre un métier en alliant études et activité professionnelle.",
        "Ce sont eux qui font vivre la pédagogie au quotidien.",
      ],
      closing: { title: "Comment utiliser ces repères", text: "Servez-vous de ces informations pour comparer, poser vos questions et avancer à votre allure." },
    },
  },
  {
    id: "D-R3-B",
    recipe: "brand-proof",
    label: "R3 — deux claims en titres",
    request: request({
      campaignName: "Studi, une communauté et des partenaires",
      brief: "Présenter la communauté d'apprenants et l'environnement académique de Studi.",
      audience: "Actifs en poste qui envisagent une formation",
      intent: "brand-proof",
      objective: "evolution-carriere",
    }),
    draft: {
      subject: "Studi : une communauté, des partenaires",
      preheader: "Des repères sur la communauté d'apprenants et les écoles partenaires de Studi.",
      visualIntent: "campaign-portrait",
      hero: {
        eyebrow: "Repères Studi",
        title: "Une communauté, des écoles partenaires",
        text: "Apprendre, c'est aussi se sentir entouré. Voici l'écosystème dans lequel s'inscrit Studi.",
        cta: { label: "Découvrir la méthode", destination: "methode" },
      },
      claims: ["apprenants-en-formation", "partenaires-academiques"],
      support: ["Vous n'apprenez pas seul : d'autres avancent en même temps que vous.", "Des noms qui situent l'environnement dans lequel Studi s'inscrit."],
      closing: {
        title: "Une question avant de décider ?",
        text: "Parcourez la méthode, repérez ce qui vous convient et gardez vos questions pour un échange avec un conseiller.",
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
