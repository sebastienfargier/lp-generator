/**
 * Six compositions de démonstration, hors ligne : deux par recette. Le texte
 * est écrit à la main (jamais par un modèle) dans le registre des ressources
 * de marque : vouvoiement, phrases courtes, bénéfice avant caractéristique,
 * aucune promesse de résultat, aucune offre ni témoignage. Aucun chiffre
 * hors des claims approuvées. Le contenu ne reprend rien des maquettes de
 * référence (leur structure seule a guidé les recettes).
 *
 * Une fixture est une `EmailRecipeComposition`, c'est-à-dire exactement ce
 * qu'un modèle aurait à décider ; le resolver produit l'EmailConfig.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import { composeEmailRecipe, type EmailRecipeComposition } from "./recipe-resolver"
import type { EmailRecipeId } from "./recipes"

export type EmailRecipeFixture = { id: string; recipe: EmailRecipeId; label: string; composition: EmailRecipeComposition }

export const emailRecipeFixtures = [
  {
    id: "R1-A",
    recipe: "discovery-reassurance",
    label: "Découverte — hero large, zone marque",
    composition: {
      recipe: "discovery-reassurance",
      campaignName: "Découvrir son métier, première étape",
      subject: "Et si vous clarifiiez votre projet ?",
      preheader: "Trois étapes pour savoir où vous allez, avec un interlocuteur à vos côtés.",
      heroLayout: "large",
      visualIntent: "warm-reassurance",
      seed: "r1-a",
      hero: {
        eyebrow: "Orientation",
        title: "Clarifiez votre projet avant de choisir une formation",
        text: "Vous hésitez entre plusieurs voies ? Prenez le temps de regarder un métier de près : ce qu'il demande, ce qu'il apporte, et ce qui vous correspond.",
        cta: { label: "Explorer les métiers", destination: "metiers" },
      },
      sections: [
        {
          kind: "steps",
          eyebrow: "Votre progression",
          items: [
            { title: "Explorer", text: "Parcourez des fiches métiers pour voir ce que fait vraiment quelqu'un qui exerce." },
            { title: "Comparer", text: "Rapprochez les métiers de vos envies, de vos contraintes et de votre quotidien." },
            { title: "Choisir", text: "Repérez la formation qui mène au métier retenu, puis échangez avec un conseiller." },
          ],
        },
        {
          kind: "benefits",
          title: "Ce qui vous accompagne",
          items: [
            { icon: "magnifying-glass", title: "Des fiches claires", text: "Chaque métier est décrit simplement : missions, environnement, évolutions." },
            { icon: "users", title: "Un conseiller à l'écoute", text: "Vous posez vos questions, il vous aide à y voir plus clair." },
            { icon: "stopwatch", title: "Votre calendrier", text: "Vous avancez au rythme qui convient à votre situation." },
          ],
        },
        {
          kind: "closing",
          title: "Prêt à regarder de plus près ?",
          text: "Commencez par les métiers qui vous intriguent : rien ne vous oblige à décider tout de suite.",
          cta: { label: "Découvrir les fiches métiers", destination: "metiers" },
        },
      ],
    },
  },
  {
    id: "R1-B",
    recipe: "discovery-reassurance",
    label: "Réassurance — hero vertical, surface douce",
    composition: {
      recipe: "discovery-reassurance",
      campaignName: "Reprendre pied après une pause",
      subject: "Reprendre pied, à votre manière",
      preheader: "Un point de départ simple pour repenser votre parcours, sans pression.",
      heroLayout: "split",
      visualIntent: "career-movement",
      surfaceIntent: "empathy",
      seed: "r1-b",
      hero: {
        eyebrow: "Nouveau départ",
        title: "Reprenez la main sur votre parcours",
        text: "Une interruption n'est pas une impasse. Regardez ce qui vous motive, puis avancez par petites étapes.",
        cta: { label: "Voir les formations", destination: "catalogue-formations" },
      },
      sections: [
        {
          kind: "steps",
          eyebrow: "Pour avancer",
          items: [
            { title: "Faire le point", text: "Listez ce que vous savez faire et ce que vous aimeriez faire." },
            { title: "Explorer", text: "Découvrez des métiers proches de vos centres d'intérêt." },
            { title: "Se lancer", text: "Choisissez une première formation et un rythme réaliste." },
          ],
        },
        {
          kind: "closing",
          title: "Un premier pas, quand vous voulez",
          text: "Parcourez le catalogue et gardez ce qui vous parle.",
          cta: { label: "Parcourir le catalogue", destination: "catalogue-formations" },
        },
      ],
    },
  },
  {
    id: "R2-A",
    recipe: "editorial-newsletter",
    label: "Newsletter — bandeau image, lien secondaire",
    composition: {
      recipe: "editorial-newsletter",
      campaignName: "Newsletter, apprendre à côté du quotidien",
      subject: "Apprendre à côté du quotidien : nos pistes",
      preheader: "Des repères concrets pour organiser vos semaines et garder le cap sur votre projet.",
      heroLayout: "banner",
      visualIntent: "editorial-work",
      seed: "r2-a",
      secondaryLink: { intro: "Retrouvez nos conseils", label: "Lire le blog", destination: "blog-les-tips-et-conseils" },
      hero: {
        eyebrow: "La newsletter Studi",
        title: "Apprendre à côté du quotidien : des repères concrets",
        text: "Concilier emploi, vie de famille et formation demande de l'organisation. Voici de quoi trouver votre rythme.",
        cta: { label: "Lire le magazine", destination: "trajectoire-magazine" },
      },
      sections: [
        {
          kind: "text",
          title: "Commencer petit",
          text: "Quelques minutes bien placées valent mieux qu'une longue session reportée. Choisissez un moment fixe dans la semaine et tenez-vous-y.",
        },
        {
          kind: "steps",
          eyebrow: "Dans cette édition",
          items: [
            { title: "Organiser ses semaines", text: "Une méthode simple pour réserver du temps à vos cours." },
            { title: "Garder l'élan", text: "Des astuces pour continuer quand la fatigue s'invite." },
            { title: "Demander de l'aide", text: "Savoir à qui poser une question quand un point bloque." },
          ],
        },
        {
          kind: "illustrated",
          title: "Le magazine, pour aller plus loin",
          text: "Retrouvez des parcours, des conseils et des idées de lecture pour nourrir votre projet.",
          cta: { label: "Lire le magazine", destination: "trajectoire-magazine" },
        },
      ],
    },
  },
  {
    id: "R2-B",
    recipe: "editorial-newsletter",
    label: "Newsletter — frise de portraits, rubriques",
    composition: {
      recipe: "editorial-newsletter",
      campaignName: "Newsletter, rubriques de la semaine",
      subject: "Quatre rubriques à lire cette semaine",
      preheader: "Orientation, méthode, rythme et motivation : de quoi nourrir votre semaine.",
      heroLayout: "portrait-strip",
      stripId: "portrait-strip-mixed-02",
      seed: "r2-b",
      hero: {
        eyebrow: "La newsletter Studi",
        title: "Des parcours, des questions, des idées",
        text: "Cette édition revient sur les questions qui reviennent le plus souvent et propose des pistes pour avancer.",
        cta: { label: "Lire le magazine", destination: "trajectoire-magazine" },
      },
      sections: [
        {
          kind: "text",
          title: "Un moment pour vous",
          text: "Prenez cinq minutes pour parcourir les rubriques ci-dessous : chacune se lit seule.",
        },
        {
          kind: "grid",
          eyebrow: "Au programme",
          title: "Quatre rubriques à parcourir",
          items: [
            { title: "Orientation", text: "Comprendre un métier avant de s'engager." },
            { title: "Méthode", text: "Apprendre à son rythme, avec des repères." },
            { title: "Motivation", text: "Garder l'élan sur la durée." },
            { title: "Quotidien", text: "Faire de la place à la formation dans ses semaines." },
          ],
        },
        {
          kind: "feature",
          title: "À retenir",
          text: "Un projet se construit par petites touches. Revenir chaque semaine sur un point précis aide à avancer sans se disperser.",
          cardTitle: "Votre semaine type",
          cardText: "Notez deux moments fixes pour vos cours : ils deviennent vite un repère.",
          cta: { label: "Lire le magazine", destination: "trajectoire-magazine" },
        },
      ],
    },
  },
  {
    id: "R3-A",
    recipe: "brand-proof",
    label: "Preuves — trois claims en liste, zone marque",
    composition: {
      recipe: "brand-proof",
      campaignName: "Studi, des repères pour choisir",
      subject: "Studi : des repères pour choisir",
      preheader: "Quelques repères clés sur l'école, pour décider en connaissance de cause.",
      heroLayout: "large",
      visualIntent: "campaign-portrait",
      seed: "r3-a",
      hero: {
        eyebrow: "Repères Studi",
        title: "Des repères concrets pour choisir en confiance",
        text: "Avant de vous engager, regardez ce que Studi propose et à quelle échelle. Voici quelques repères clés.",
        cta: { label: "Découvrir le catalogue", destination: "catalogue-formations" },
      },
      sections: [
        {
          kind: "claim-list",
          eyebrow: "Studi aujourd'hui",
          claims: ["catalogue-formations", "formations-alternance", "formateurs-conseillers"],
          texts: [
            "Ce repère donne une idée de l'étendue de l'offre de formation.",
            "Ce repère situe l'ampleur de l'offre proposée en alternance.",
            "Ce chiffre permet de situer l'échelle de l'équipe pédagogique.",
          ],
        },
        {
          kind: "text",
          title: "Comment utiliser ces repères",
          text: "Servez-vous de ces informations pour comparer, poser vos questions et avancer à votre allure.",
        },
      ],
    },
  },
  {
    id: "R3-B",
    recipe: "brand-proof",
    label: "Preuves — bandeau sombre et claim en titre",
    composition: {
      recipe: "brand-proof",
      campaignName: "Studi, une communauté et des partenaires",
      subject: "Studi : une communauté, des partenaires",
      preheader: "Des repères sur la communauté d'apprenants et les écoles partenaires de Studi.",
      heroLayout: "split",
      visualIntent: "campaign-portrait",
      seed: "r3-b",
      hero: {
        eyebrow: "Repères Studi",
        title: "Une communauté, des écoles partenaires",
        text: "Apprendre, c'est aussi se sentir entouré. Voici l'écosystème dans lequel s'inscrit Studi.",
        cta: { label: "Découvrir la méthode", destination: "methode" },
      },
      sections: [
        { kind: "claim-highlight", claim: "apprenants-en-formation" },
        { kind: "claim-text", claim: "partenaires-academiques", text: "Des noms qui situent l'environnement dans lequel Studi s'inscrit." },
        {
          kind: "text",
          title: "Une question avant de décider ?",
          text: "Parcourez la méthode, repérez ce qui vous convient et gardez vos questions pour un échange avec un conseiller.",
        },
      ],
    },
  },
] as const satisfies readonly EmailRecipeFixture[]

/** Résout une fixture : composition → EmailConfig validé, claims et diagnostics. */
export function resolveEmailRecipeFixture(id: (typeof emailRecipeFixtures)[number]["id"]) {
  const fixture = emailRecipeFixtures.find((candidate) => candidate.id === id)!
  return composeEmailRecipe(fixture.composition as EmailRecipeComposition)
}
