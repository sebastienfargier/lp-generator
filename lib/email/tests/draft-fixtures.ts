/** Requêtes et Draft de référence des tests du Draft Email et de son resolver. */
import type { EmailGenerationDraft } from "../generation-draft"
import type { EmailGenerationRequest } from "../generation-request"

export const draftRequest: EmailGenerationRequest = {
  campaignName: "Orientation et reconversion",
  brief: "Aider des personnes en réflexion sur leur avenir professionnel à explorer les métiers et les formations Studi.",
  audience: "Adultes en réflexion sur leur orientation ou leur reconversion",
  objective: "decouverte-formations",
}

/** « Découverte / orientation vers les formations Studi » : hero photo, deux blocs de corps, deux CTA. */
export const referenceDraft: EmailGenerationDraft = {
  subject: "Et si vous exploriez de nouveaux métiers ?",
  preheader: "Trois étapes pour y voir plus clair, puis explorer les formations Studi qui correspondent à votre projet",
  blocks: [
    {
      type: "hero",
      image: "tablette-interieur",
      eyebrow: "Orientation",
      title: "Préparez votre prochaine étape, à votre rythme",
      text: "Explorer les métiers, comparer les formations, avancer en ligne : Studi vous accompagne pour y voir plus clair.",
      cta: { label: "Découvrir les formations", destination: "catalogue-formations" },
    },
    {
      type: "steps",
      eyebrow: "Pour vous aider à avancer",
      items: [
        { title: "Faire le point sur votre projet", text: "Clarifiez ce qui vous motive et les métiers qui vous attirent." },
        { title: "Explorer les métiers", text: "Parcourez les fiches métiers pour repérer ce qui fait écho à votre projet." },
        { title: "Choisir une formation adaptée", text: "Comparez les domaines, les formats et les niveaux de sortie." },
      ],
    },
    {
      type: "cta",
      title: "Prenez le temps d'explorer",
      text: "Les fiches métiers vous aident à vous projeter avant de choisir une formation.",
      cta: { label: "Voir les fiches métiers", destination: "metiers" },
    },
  ],
}

const icons = {
  type: "icons",
  title: "Ce que vous pouvez attendre",
  items: [
    { icon: "users", title: "Un accompagnement", text: "Des interlocuteurs pour répondre à vos questions." },
    { icon: "lightbulb", title: "Des repères", text: "Des cours et des exercices pour progresser." },
    { icon: "stopwatch", title: "Votre rythme", text: "Vous organisez vos sessions selon vos disponibilités." },
  ],
} as const

const grid = {
  type: "grid",
  eyebrow: "Vos atouts",
  title: "Quatre leviers pour avancer",
  items: [1, 2, 3, 4].map((n) => ({ title: `Levier ${n}`, text: `Un levier à explorer, numéro ${n}.` })),
} as const

const text = { type: "text", title: "Un mot pour terminer", text: "Prenez le temps de parcourir les pages qui vous intéressent." } as const

const feature = {
  type: "feature",
  title: "Progresser dans votre parcours",
  text: "Se former à distance ne veut pas dire se former seul.",
  cardTitle: "Comment apprend-on chez Studi ?",
  cardText: "Découvrez la pédagogie Studi et son organisation.",
  cta: { label: "Découvrir la pédagogie", destination: "methode" },
} as const

export const bodyFixtures = { icons, grid, text, feature } as const

/** Un hero par photo V1, pour parcourir les trois lames. */
export const heroImages = ["tablette-interieur", "ecouteur-exterieur", "canape-lumiere"] as const

export function draftWith(hero: (typeof heroImages)[number], ...body: unknown[]) {
  return {
    ...referenceDraft,
    blocks: [{ ...referenceDraft.blocks[0]!, image: hero }, ...body],
  }
}
