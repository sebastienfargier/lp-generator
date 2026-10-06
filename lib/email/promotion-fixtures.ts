/**
 * Trois fixtures R4 (promotion), hors ligne : ce qu'un modèle aurait à produire
 * pour une demande de promotion, écrit à la main dans le registre des ressources
 * de marque. Elles prouvent l'aller-retour requête → Draft → resolver →
 * EmailConfig → validation → terminologie → rendu → aperçu, sans appeler
 * Anthropic.
 *
 * DONNÉES DE DÉMONSTRATION : les montants, pourcentages, codes (`DEMO…`) et
 * dates de ces fixtures ne sont PAS des offres Studi. Elles n'existent que pour
 * démontrer le mécanisme ; une vraie campagne apporte ses propres Promotion
 * Facts. `demo: true` les marque, et les tests l'exigent.
 *
 * Chaque fixture porte sa requête (Promotion Facts comprises) ; le Draft ne
 * porte aucune valeur commerciale.
 *
 * Domaine Email uniquement : aucun import depuis `lib/landing`.
 */
import type { EmailPromotionRequest } from "./promotion-facts"
import { resolvePromotionDraft } from "./promotion-resolver"

export type EmailPromotionFixture = {
  id: string
  label: string
  /** Toujours `true` : valeurs de démonstration, jamais une offre Studi. */
  demo: true
  request: EmailPromotionRequest
  draft: unknown
}

/** Date de référence des fixtures (un jour avant la première date de fin) : les tests la passent comme « aujourd'hui ». */
export const promotionFixtureToday = "2026-10-05"

export const emailPromotionFixtures = [
  {
    id: "R4-A",
    label: "R4 — remise en montant, sans code (bandeau)",
    demo: true,
    request: {
      campaignName: "Offre de rentrée, démonstration A",
      brief: "Présenter une remise de rentrée à des personnes qui envisagent une reconversion, sans les presser.",
      audience: "Personnes en reconversion",
      target: "reconversion",
      intent: "promotion",
      promotion: { offer: { type: "amount", amount: 500 }, endDate: "2026-10-31", scope: "les formations diplômantes", destination: "catalogue-formations" },
    },
    draft: {
      subject: "-500 € pour démarrer votre reconversion",
      preheader: "Une offre de rentrée pour passer du projet à la formation, à parcourir dans le catalogue.",
      visualIntent: "campaign-portrait",
      offer: {
        eyebrow: "Offre de rentrée",
        text: "Une remise pour franchir le pas et vous lancer dans la formation qui correspond à votre projet.",
        ctaLabel: "Voir les formations concernées",
      },
      support: {
        title: "Pour faire le bon choix",
        items: [
          { icon: "magnifying-glass", title: "Explorez le catalogue", text: "Parcourez les formations par domaine et par niveau de diplôme." },
          { icon: "briefcase", title: "Comparez les parcours", text: "Rapprochez chaque formation du métier que vous visez." },
          { icon: "lightbulb", title: "Choisissez en confiance", text: "Gardez la formation qui répond le mieux à votre situation." },
        ],
      },
      closing: {
        title: "Prêt à passer à l'étape suivante ?",
        text: "Le catalogue détaille chaque formation concernée par l'offre. Prenez le temps de comparer avant de vous décider.",
        ctaLabel: "Découvrir le catalogue",
      },
    },
  },
  {
    id: "R4-B",
    label: "R4 — remise en pourcentage avec code (hero d'offre)",
    demo: true,
    request: {
      campaignName: "Offre alternance, démonstration B",
      brief: "Présenter une offre à des futurs alternants, avec un ton direct et chaleureux.",
      audience: "Alternants",
      target: "alternants",
      intent: "promotion",
      promotion: { offer: { type: "percent", percent: 20 }, code: "DEMO20", endDate: "2026-11-15", scope: "les formations en alternance", destination: "alternance" },
    },
    draft: {
      subject: "-20 % sur ta formation en alternance",
      preheader: "Une offre pour te lancer en alternance : découvre les formations concernées.",
      visualIntent: "career-movement",
      offer: {
        eyebrow: "Offre alternance",
        text: "Tu vises l'alternance ? Cette offre t'aide à te lancer dans une formation en phase avec ton projet.",
        ctaLabel: "Voir les formations",
      },
      support: {
        title: "Avant de te décider",
        items: [
          { icon: "magnifying-glass", title: "Repère les formations", text: "Parcours le catalogue Alternance et note celles qui t'intéressent." },
          { icon: "handshake-simple", title: "Pense à ton entreprise", text: "Réfléchis au secteur et au métier dans lesquels tu veux travailler." },
          { icon: "stopwatch", title: "Compare sans précipitation", text: "Lis le détail de chaque formation avant de choisir." },
        ],
      },
      closing: {
        title: "À toi de jouer",
        text: "Le catalogue Alternance présente les formations concernées. Compare-les, puis choisis celle qui te correspond.",
        ctaLabel: "Parcourir le catalogue",
      },
    },
  },
  {
    id: "R4-C",
    label: "R4 — remise en montant avec code et échéance (bandeau d'offre)",
    demo: true,
    request: {
      campaignName: "Offre certificats, démonstration C",
      brief: "Présenter une offre sur les certificats professionnels à des personnes en poste qui veulent développer une compétence.",
      audience: "Actifs en poste",
      target: "actifs_en_poste",
      intent: "promotion",
      promotion: { offer: { type: "amount", amount: 300 }, code: "DEMO-CERTIF", endDate: "2026-12-01", scope: "les certificats professionnels", destination: "certificats" },
    },
    draft: {
      subject: "-300 € pour monter en compétences",
      preheader: "Une offre pour développer vos compétences, à parcourir dans le catalogue des certificats.",
      visualIntent: "campaign-portrait",
      offer: {
        eyebrow: "Offre Studi",
        text: "Vous êtes en poste et souhaitez développer une compétence précise ? Cette offre allège le coût d'un certificat professionnel.",
        ctaLabel: "Découvrir les certificats",
      },
      support: {
        title: "Pour avancer en poste",
        items: [
          { icon: "graduation-cap", title: "Choisissez une compétence", text: "Identifiez celle qui compte pour votre poste actuel ou pour le suivant." },
          { icon: "magnifying-glass", title: "Parcourez les certificats", text: "Consultez le détail de chaque certificat pour les comparer." },
          { icon: "briefcase", title: "Pensez à votre quotidien", text: "Repérez ce qui s'accorde avec votre activité professionnelle." },
        ],
      },
      closing: {
        title: "Un pas de plus vers votre objectif",
        text: "Le catalogue des certificats détaille chaque parcours concerné par l'offre. Comparez-les sans précipitation, puis retenez celui qui vous convient.",
        ctaLabel: "Parcourir les certificats",
      },
    },
  },
] as const satisfies readonly EmailPromotionFixture[]

export type EmailPromotionFixtureId = (typeof emailPromotionFixtures)[number]["id"]

/** Aller-retour hors ligne d'une fixture : Draft → EmailConfig validé. */
export function resolveEmailPromotionFixture(id: EmailPromotionFixtureId) {
  const fixture = emailPromotionFixtures.find((candidate) => candidate.id === id)!
  return { fixture, resolution: resolvePromotionDraft(fixture.request as EmailPromotionRequest, fixture.draft) }
}
