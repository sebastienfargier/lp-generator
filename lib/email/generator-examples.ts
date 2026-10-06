/**
 * Exemples de brief de /email-generator : un par famille d'email que le moteur
 * compose (orientation, newsletter, preuves Studi). Un clic préremplit le
 * formulaire, sans lancer de génération. Seul l'exemple Promo porte des valeurs
 * (une remise, un code, une date) : ce sont des DONNÉES DE DÉMONSTRATION, pas une
 * offre Studi, marquées `illustrative`. Les autres ne contiennent aucun chiffre : les
 * repères chiffrés viennent des claims approuvées, choisies par le moteur.
 *
 * Module pur, utilisable côté client : il n'importe rien du moteur.
 */
import { emptyEmailPromotionForm, type EmailGeneratorExample } from "./generator-form"

export const emailGeneratorExamples: readonly EmailGeneratorExample[] = [
  {
    id: "orientation",
    label: "Orientation",
    form: {
      campaignName: "Trouver sa voie avec Studi",
      intent: "orientation",
      target: "reconversion",
      brief: "Aider les lecteurs à clarifier leur projet et à découvrir les métiers et les formations Studi.",
      subject: "",
      facts: "",
      promotion: emptyEmailPromotionForm,
    },
  },
  {
    id: "newsletter",
    label: "Newsletter",
    form: {
      campaignName: "Newsletter, apprendre à côté du quotidien",
      intent: "newsletter",
      target: "actifs_en_poste",
      brief: "Une newsletter qui aide à organiser sa formation à côté du travail : méthode, motivation, demande d'aide.",
      subject: "",
      facts: "",
      promotion: emptyEmailPromotionForm,
    },
  },
  {
    id: "preuves",
    label: "Preuves Studi",
    form: {
      campaignName: "Studi, des repères pour choisir",
      intent: "preuves",
      target: "reconversion",
      brief: "Donner quelques repères vérifiés sur Studi à des personnes qui comparent des écoles avant de se décider.",
      subject: "",
      facts: "",
      promotion: emptyEmailPromotionForm,
    },
  },
  {
    id: "promotion",
    label: "Promo",
    illustrative: true,
    form: {
      campaignName: "Offre de rentrée",
      intent: "promotion",
      target: "actifs_en_poste",
      brief: "Présenter une offre de rentrée à des personnes en poste qui veulent développer leurs compétences, sans les presser.",
      subject: "",
      facts: "",
      promotion: { offerType: "percent", value: "20", code: "DEMO20", endDate: "2026-10-31", scope: "les formations diplômantes", destination: "catalogue-formations" },
    },
  },
]
