/** Contenus de test des six fixtures V2.9.1 : jamais une URL, seulement des identifiants du système. */
import type { GeneratedBlockContent } from "../generated-html/compile"

export const fixtureContents: Record<string, GeneratedBlockContent> = {
  textSection: { titre: { text: "Reprenez votre parcours" }, texte: { text: "Un accompagnement pensé pour avancer à votre rythme, étape par étape." }, cta: { label: "Découvrir les formations", destination: "catalogue-formations" } },
  heroImageText: { image: { imageId: "canape-lumiere" }, "sur-titre": { text: "Nouveau" }, titre: { text: "Un nouveau départ" }, texte: { text: "Des parcours courts, reconnus, compatibles avec votre emploi du temps." }, cta: { label: "Voir le parcours", destination: "catalogue-formations" } },
  threeCards: {
    "titre-1": { text: "Se former" }, "texte-1": { text: "Des formations diplômantes." }, "lien-1": { label: "En savoir plus", destination: "catalogue-formations" },
    "titre-2": { text: "S'orienter" }, "texte-2": { text: "Un bilan pour choisir." }, "lien-2": { label: "En savoir plus", destination: "catalogue-formations" },
    "titre-3": { text: "Financer" }, "texte-3": { text: "Des solutions de prise en charge." }, "lien-3": { label: "En savoir plus", destination: "catalogue-formations" },
  },
  bannerOverlapCard: { image: { imageId: "bureau-lampe-bleu" }, etiquette: { text: "Offre" }, titre: { text: "Une offre à saisir" }, texte: { text: "Profitez-en dès maintenant." }, cta: { label: "J'en profite", destination: "catalogue-formations" } },
  itemGrid: {
    "icone-1": { icon: "rocket-launch" }, "titre-1": { text: "Rapide" }, "texte-1": { text: "Démarrez en quelques jours." },
    "icone-2": { icon: "users" }, "titre-2": { text: "Accompagné" }, "texte-2": { text: "Un conseiller dédié." },
    "icone-3": { icon: "award" }, "titre-3": { text: "Reconnu" }, "texte-3": { text: "Des diplômes d'État." },
    "icone-4": { icon: "laptop" }, "titre-4": { text: "À distance" }, "texte-4": { text: "100 % en ligne." },
  },
  statBanner: { etiquette: { text: "Résultats" }, chiffre: { text: "92 %" }, legende: { text: "de nos alumni en emploi" }, cta: { label: "Voir les résultats", destination: "catalogue-formations" } },
}
