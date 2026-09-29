/**
 * Catalogue métier des 36 lames email, destiné au futur prompt du modèle.
 *
 * Il décrit le rôle éditorial des lames, quand les choisir et leurs limites.
 * Il ne recopie rien de technique : slots, types, optionnels, éléments
 * système et surfaces viennent du manifeste, et sont combinés à ces entrées
 * par `getEmailSectionCatalogForPrompt()`. Aucun HTML, style ni URL ici.
 *
 * Sources : noms Figma et structure des templates, exemples complets du
 * projet Email (`ref/exemple-complete-*`), `instructions-projet.md`,
 * `recettes-couleur.md`, `objet-et-preview.md`, `copy-email.md`,
 * `personas.md`, `guidelines-communication.md`. Quand elles ne distinguent
 * pas deux variantes au-delà de leur structure, l'entrée le dit.
 *
 * Indépendant du catalogue Landing : aucun import de `lib/landing`.
 */
import { emailDisclaimers, type EmailDisclaimerId } from "./disclaimers"
import {
  emailBlockManifest,
  emailIconNames,
  type EmailBlockFamily,
  type EmailSlotKind,
} from "./manifest"
import { emailSurfaceRules, emailSurfaces, type EmailSurface } from "./surfaces"
import type { EmailBlockType } from "./types"

export type EmailSectionCatalogEntry = {
  /** Nom humain court. */
  name: string
  /** Ce que la lame fait dans l'email, en une phrase. */
  role: string
  useWhen: readonly string[]
  avoidWhen?: readonly string[]
  /** Consignes pour remplir les slots. */
  contentGuidance?: readonly string[]
  /** Limites connues du template ou du rendu, utiles au choix. */
  limitations?: readonly string[]
  /**
   * Restriction éditoriale de surface, plus stricte que le contrat (Zod
   * accepte toutes les surfaces sur une lame configurable).
   */
  onlySurfaces?: readonly EmailSurface[]
}

/* -------------------------------------------------------------------------- */
/* Limites partagées                                                          */
/* -------------------------------------------------------------------------- */

const needsVisuals =
  "Chaque visuel doit être une URL HTTPS fournie par le brief, au ratio exact du slot ; aucun catalogue d'images n'existe encore : ne jamais inventer d'URL."
const figuresFromSources =
  "Une valeur chiffrée (remise, statistique) ne vient que du brief ou des chiffres validés des guidelines (chapitre 9) ; sinon [CHIFFRE À VALIDER]."
const realTestimonial =
  "Le témoignage et son auteur doivent être fournis et validés : jamais inventés, jamais repris des verbatims des personas."
const exactTrainingTitles =
  "Intitulés de formation copiés à l'identique depuis le brief ou la page de filière, jamais devinés."
const promoCode = "Le code promo vient du brief ; en capitales."

/* -------------------------------------------------------------------------- */
/* Entrées                                                                    */
/* -------------------------------------------------------------------------- */

export const emailSectionCatalog = {
  /* Header */
  "email-module-preheader": {
    name: "Bandeau preheader",
    role: "Bandeau sombre au-dessus du header : un libellé court et un lien texte secondaire.",
    useWhen: ["Rappeler la campagne ou la rubrique et offrir un lien secondaire (par exemple vers le catalogue)."],
    avoidWhen: ["Le lien secondaire unique de l'email est déjà pris par une autre lame."],
    contentGuidance: [
      "Ce bandeau est visible : il ne remplace pas le préheader caché de l'email (champ preheader).",
      "Son lien compte comme le lien texte secondaire de l'email.",
    ],
  },
  "email-module-header-newsletter": {
    name: "Header newsletter",
    role: "Logo Studi et signature de marque fixe.",
    useWhen: ["Newsletter, email éditorial ou lifecycle, sans campagne datée à annoncer."],
    avoidWhen: ["La campagne a un libellé ou une échéance à afficher : préférer le header de campagne."],
  },
  "email-module-header-seasonal-campaign": {
    name: "Header de campagne",
    role: "Logo Studi et étiquette courte de campagne à droite.",
    useWhen: ["Promo, temps fort, quiz ou rentrée : l'étiquette nomme la campagne ou son échéance."],
    contentGuidance: ["Étiquette de quelques mots, fait vérifiable plutôt que promesse (ex. une date ou le nom d'une opération)."],
  },

  /* Hero */
  "email-hero-newsletter-variant-01": {
    name: "Hero newsletter, 5 visuels",
    role: "Sur-titre, titre, texte et CTA, au-dessus d'une frise de cinq visuels verticaux.",
    useWhen: ["Ouverture de newsletter mettant en avant plusieurs personnes ou sujets."],
    avoidWhen: ["Moins de cinq visuels disponibles : préférer la variante 02."],
    contentGuidance: ["Sur-titre daté de la newsletter (ex. mois et année)."],
    limitations: [needsVisuals],
  },
  "email-hero-newsletter-variant-02": {
    name: "Hero newsletter, 1 visuel",
    role: "Même ouverture que la variante 01, avec un seul visuel large.",
    useWhen: ["Ouverture de newsletter avec un seul visuel."],
    limitations: [needsVisuals],
  },
  "email-module-hero-cards": {
    name: "Hero carte d'offre",
    role: "Carte avec étiquette, valeur clé et visuel, puis titre, texte et CTA.",
    useWhen: ["Offre ou avantage résumé en une valeur clé (ex. une remise annoncée par le brief)."],
    avoidWhen: ["Aucune valeur clé fournie par le brief."],
    contentGuidance: [figuresFromSources],
    limitations: [needsVisuals],
  },
  "email-module-hero-countdown-variant-01": {
    name: "Hero compte à rebours, sans bouton",
    role: "Trois compteurs avec leurs unités, puis titre et texte.",
    useWhen: ["Échéance réelle et confirmée, quand l'action est portée par une lame suivante."],
    avoidWhen: ["Aucune date de fin confirmée : la fausse urgence est proscrite."],
    contentGuidance: [
      "Les compteurs sont du texte figé à l'envoi (ex. 03 / JOURS), pas un minuteur.",
      "Surface Encre recommandée pour un compte à rebours.",
    ],
  },
  "email-module-hero-countdown-variant-02": {
    name: "Hero compte à rebours, avec bouton",
    role: "Même compte à rebours que la variante 01, suivi d'un CTA.",
    useWhen: ["Échéance réelle et confirmée, avec l'action principale dans le hero."],
    avoidWhen: ["Aucune date de fin confirmée."],
    contentGuidance: ["Compteurs figés à l'envoi ; surface Encre recommandée."],
  },
  "email-module-hero-diagnostic-quiz": {
    name: "Hero diagnostic",
    role: "Sous-titre, titre, texte et CTA, sans visuel.",
    useWhen: [
      "Inviter à se situer : quiz, test de niveau, bilan d'orientation.",
      "Hero sobre sans visuel disponible.",
    ],
    contentGuidance: ["Énoncer un fait concret (ex. une durée) plutôt qu'une promesse de résultat."],
  },
  "email-module-hero-offer-image-top": {
    name: "Hero offre avec code",
    role: "Visuel pleine largeur, puis panneau sombre : sous-titre, valeur clé, texte, code promo, CTA et lien secondaire.",
    useWhen: ["Promotion avec code et date de fin, portée par un visuel."],
    avoidWhen: ["Pas de code promo, ou pas de visuel disponible."],
    contentGuidance: [figuresFromSources, promoCode],
    limitations: [needsVisuals, "Panneau sombre intrinsèque : surface non configurable."],
  },
  "email-module-hero-promotional-image-large": {
    name: "Hero promotionnel, grand visuel",
    role: "Sous-titre, titre, texte et CTA, au-dessus d'un grand visuel.",
    useWhen: ["Campagne où le visuel porte le message."],
    contentGuidance: ["Diffère de la variante moyenne par le sous-titre et la hauteur du visuel ; les sources ne distinguent pas d'autre usage."],
    limitations: [needsVisuals],
  },
  "email-module-hero-promotional-image-medium": {
    name: "Hero promotionnel, visuel moyen",
    role: "Titre, texte et CTA, au-dessus d'un visuel plus bas, sans sous-titre.",
    useWhen: ["Campagne avec visuel, quand le texte doit rester visible sans défiler."],
    limitations: [needsVisuals],
  },
  "email-module-hero-split-image": {
    name: "Hero texte et visuel vertical",
    role: "Colonne texte (sous-titre, titre, texte, CTA) à côté d'un visuel vertical.",
    useWhen: ["Ouverture avec un portrait ou un visuel vertical."],
    limitations: [needsVisuals],
  },
  "email-module-hero-split-image-dark": {
    name: "Hero partenaire sombre",
    role: "Nom du partenaire, titre et CTA sur panneau sombre à côté d'un visuel, puis bandeau sombre avec deux textes et un second CTA.",
    useWhen: ["Email consacré à une école ou un partenaire académique."],
    avoidWhen: ["Aucun partenariat réel nommé par le brief."],
    contentGuidance: [
      "Le partenaire est un texte (son nom), pas un logo.",
      "Les deux CTA portent la même action principale.",
    ],
    limitations: [needsVisuals, "Panneaux sombres intrinsèques : surface non configurable."],
  },

  /* Story */
  "email-module-text-and-cta-variant-01": {
    name: "Texte et bouton",
    role: "Titre de section, texte et CTA.",
    useWhen: ["Relancer l'action principale en fin d'email, après le corps."],
    avoidWhen: ["Le hero porte déjà l'unique CTA et une clôture sans bouton suffit : préférer le texte seul."],
  },
  "email-module-text-and-cta-variant-02": {
    name: "Texte, visuel et bouton",
    role: "Titre de section, visuel large, texte et CTA.",
    useWhen: ["Bloc de corps illustré qui mène à une action."],
    limitations: [needsVisuals],
  },
  "email-module-text-and-feature-card": {
    name: "Texte et encart",
    role: "Titre et texte de section, puis encart mis en avant (titre, texte, CTA).",
    useWhen: ["Paragraphe éditorial suivi d'un point à mettre en exergue (newsletter, article)."],
  },
  "email-module-text-only": {
    name: "Texte seul",
    role: "Titre de section et paragraphe, sans action.",
    useWhen: ["Paragraphe éditorial ou clôture sans second bouton."],
  },

  /* Offer */
  "email-module-banner-full": {
    name: "Bandeau chiffre clé",
    role: "Bandeau sombre : sous-titre, grande valeur clé, deux textes et CTA.",
    useWhen: ["Mettre en avant un chiffre clé validé ou une offre, sur fond sombre."],
    contentGuidance: [figuresFromSources],
    limitations: ["Fond sombre intrinsèque : surface non configurable."],
  },
  "email-module-discount-banner-cards": {
    name: "Bandeau remise et code",
    role: "Sous-titre, titre et texte de l'offre, à côté d'une carte portant le code promo et une précision.",
    useWhen: ["Promotion avec code, sur la zone colorée de l'email (Accent 1 recommandé pour une promo)."],
    avoidWhen: ["Pas de code promo."],
    contentGuidance: [promoCode, "La lame n'a pas de bouton : l'action doit être portée par une autre lame."],
  },
  "email-module-discount-banner-full": {
    name: "Bandeau offre complète",
    role: "Bandeau sombre : sous-titre, valeur clé, texte, code promo, CTA et lien secondaire.",
    useWhen: ["Promotion avec code quand le hero reste sobre ou sans visuel."],
    avoidWhen: ["Pas de code promo."],
    contentGuidance: [figuresFromSources, promoCode],
    limitations: ["Fond sombre intrinsèque : surface non configurable."],
  },

  /* Benefits */
  "email-module-benefits-and-testimonial": {
    name: "Bénéfices et témoignage",
    role: "Deux sections de texte, trois bénéfices à puces, CTA pleine largeur, puis témoignage avec icône.",
    useWhen: ["Lever un frein (par exemple le financement) avec des arguments puis une preuve sociale."],
    contentGuidance: [realTestimonial, "Chaque bénéfice : titre court en gras, puis une phrase."],
  },
  "email-module-benefits-compact-highlights": {
    name: "Bandeau valeur clé",
    role: "Bandeau sombre compact : une valeur clé et son libellé, avec une barre décorative.",
    useWhen: ["Rappeler un chiffre validé en une ligne."],
    contentGuidance: [figuresFromSources],
    limitations: [
      "La barre est décorative et figée : elle ne représente aucune progression.",
      "Fond sombre intrinsèque : surface non configurable.",
    ],
  },
  "email-module-cta-and-testimonial": {
    name: "Bouton et témoignage",
    role: "Texte, CTA pleine largeur, puis témoignage avec icône.",
    useWhen: ["Clôturer par l'action et une preuve sociale."],
    contentGuidance: [realTestimonial],
  },
  "email-module-product-details-variant-01": {
    name: "Détail d'offre, titre sous l'encart",
    role: "Encart (étiquette, titre) sur un cadre décoratif, puis titre de section, texte et CTA.",
    useWhen: ["Détailler un élément d'une offre, un bloc par élément."],
    contentGuidance: ["La variante 02 place un titre au-dessus de l'encart ; les sources ne distinguent pas d'autre usage."],
    limitations: [
      "Pas de visuel : le cadre derrière l'encart est décoratif.",
      "Rendu non défini sur surface colorée : surface Page uniquement.",
    ],
    onlySurfaces: ["page"],
  },
  "email-module-product-details-variant-02": {
    name: "Détail d'offre, titre au-dessus",
    role: "Titre, encart (étiquette, titre) sur un cadre décoratif, puis texte et CTA.",
    useWhen: ["Détailler un élément d'une offre en l'annonçant par un titre."],
    limitations: [
      "Pas de visuel : le cadre derrière l'encart est décoratif.",
      "Rendu non défini sur surface colorée : surface Page uniquement.",
    ],
    onlySurfaces: ["page"],
  },

  /* Features */
  "email-module-icons-grid": {
    name: "Grille à icônes",
    role: "Sous-titre et titre, puis quatre cartes : icône, titre et texte.",
    useWhen: ["Quatre atouts de même poids."],
    avoidWhen: ["En V1 : préférer la liste à icônes ou la grille numérotée."],
    limitations: [
      "Les icônes disponibles sont au trait sombre et posées sur un carré sombre : illisibles sur Page, Bloc et Accents. Contraste non résolu.",
    ],
  },
  "email-module-icons-list": {
    name: "Liste à icônes",
    role: "Titre de section, puis trois éléments : icône dans un rond, titre et texte.",
    useWhen: ["Trois atouts ou services à présenter en liste."],
    contentGuidance: ["Icône choisie pour son sens, dans le catalogue."],
  },
  "email-module-numbered-list": {
    name: "Liste numérotée",
    role: "Sous-titre, puis trois éléments numérotés 01 à 03 : titre et texte.",
    useWhen: ["Trois étapes ordonnées ou trois points successifs."],
  },
  "email-module-numbererd-grid": {
    name: "Grille numérotée",
    role: "Sous-titre et titre, puis quatre cartes numérotées 01 à 04 : titre et texte.",
    useWhen: ["Quatre atouts, sans icône."],
  },

  /* Products */
  "email-module-products-three-column-grid": {
    name: "Trois formations",
    role: "Trois cartes : visuel, intitulé, texte et lien.",
    useWhen: ["Présenter trois formations ou filières."],
    contentGuidance: [exactTrainingTitles],
    limitations: [needsVisuals],
  },
  "email-module-products-four-column-grid": {
    name: "Quatre formations",
    role: "Quatre cartes en deux rangées : visuel, intitulé, texte et lien.",
    useWhen: ["Présenter quatre formations ou filières."],
    contentGuidance: [exactTrainingTitles],
    limitations: [needsVisuals],
  },

  /* Diagnostic */
  "email-module-diagnostic-progress-list": {
    name: "Liste de compétences",
    role: "Cinq libellés, chacun suivi d'une barre décorative.",
    useWhen: ["Lister les domaines évalués par un quiz ou un diagnostic."],
    limitations: ["Barres décoratives de longueur figée : elles ne représentent aucun score."],
  },

  /* Divider */
  "email-module-divider-choice": {
    name: "Séparateur de choix",
    role: "Bandeau court d'une phrase entre deux parties.",
    useWhen: ["Séparer deux options présentées à la suite (ex. « Ou vous choisissez »)."],
  },

  /* Footer */
  "email-module-legal-disclaimer": {
    name: "Mentions légales",
    role: "Un ou deux disclaimers du catalogue contrôlé.",
    useWhen: [
      "Obligatoire dès que l'email cite : un financement jusqu'à 100 %, une promo, une bourse, la garantie Diplômé ou Remboursé, un salaire ou un chiffre Audirep.",
    ],
    contentGuidance: [
      "Choisir un identifiant dans le catalogue des disclaimers, jamais un texte ; ajouter un astérisque à la mention concernée dans le corps.",
    ],
  },
  "email-module-footer-compact-legal": {
    name: "Footer",
    role: "Logo, réseaux sociaux, trois liens éditoriaux, mentions et liens de désabonnement.",
    useWhen: ["Toujours, en dernière lame."],
    contentGuidance: ["Seuls les trois liens éditoriaux se remplissent ; le reste est fixé par le système."],
  },
} as const satisfies { [Type in EmailBlockType]: EmailSectionCatalogEntry }

/* -------------------------------------------------------------------------- */
/* Règles globales                                                            */
/* -------------------------------------------------------------------------- */

/** Contraintes déjà garanties par la validation (schemas.ts). */
export const emailStructuralRules = [
  "Exactement une lame footer, en dernière position.",
  "Au plus une lame de mentions légales, placée immédiatement avant le footer.",
  "Le header n'est pas obligatoire.",
  "Chaque lame a un id unique (minuscules, chiffres, tirets).",
  "Tous les slots d'une lame sont requis, sauf ceux marqués optionnels.",
  "Une surface ne se donne qu'aux lames configurables, et seulement parmi les surfaces listées ; jamais deux surfaces colorées (autres que page) à la suite.",
  "Textes : texte brut, sans HTML ; Liquid {{ … }} autorisé.",
  "Liens : URL https://, expression Liquid ou [URL À CONFIRMER] ; query ?[UTM À DÉFINIR — CRM] admise.",
  "Icônes : un nom du catalogue d'icônes. Disclaimers : un identifiant du catalogue, jamais un texte.",
] as const

/** Recommandations éditoriales (sources du projet Email), non validées. */
export const emailEditorialGuidance = [
  "Un email tient en 5 à 8 lames : preheader, header, un hero, deux à quatre lames de corps, mentions légales si nécessaire, footer.",
  "Un seul CTA principal ; au plus un lien texte secondaire dans tout l'email.",
  "Exactement une zone colorée, sur le hero, la bannière d'offre ou un bloc de corps ; Marque par défaut ; Accent 2 doux réservé aux emails d'empathie (demandeurs d'emploi, parcours interrompu).",
  "Surface selon le type : lifecycle, newsletter, B2B → Marque ; promo, offre, bourse → Accent 1 ; compte à rebours → Encre ; transactionnel → Bloc.",
  "Un email lève une seule objection. Vouvoiement, phrases courtes, promesse au conditionnel.",
  "Aucun chiffre hors des chiffres validés des guidelines : sinon [CHIFFRE À VALIDER].",
  "Aucune URL inventée : pages de filière et pages Studi listées dans les sources, sinon [URL À CONFIRMER].",
  "Objet de 30 à 45 caractères ; préheader de 60 à 90 caractères, qui prolonge l'objet sans le répéter.",
] as const

/** Valeur attendue pour chaque type de slot (forme JSON). */
export const emailSlotKindGuide = {
  texte: '{ "text": "…" }',
  cta: '{ "label": "…", "href": "…" } — bouton',
  "cta:fleche": '{ "label": "…", "href": "…" } — bouton, flèche ajoutée par le template',
  lien: '{ "label": "…", "href": "…" } — lien texte',
  "asset:visuel": '{ "src": "https://…", "alt": "…" }',
  "asset:icone": '{ "icon": "…" } — un nom du catalogue d\'icônes',
  disclaimer: '{ "disclaimer": "…" } — un identifiant du catalogue ; + "endDate": "AAAA-MM-JJ" si requis',
} as const satisfies { [Kind in EmailSlotKind]: string }

/* -------------------------------------------------------------------------- */
/* Représentation pour le prompt                                              */
/* -------------------------------------------------------------------------- */

type ManifestEntry = {
  family: EmailBlockFamily
  surfaceMode: "configurable" | "fixed"
  slots: Readonly<Record<string, EmailSlotKind>>
  optional?: readonly string[]
}

export type EmailPromptSection = EmailSectionCatalogEntry & {
  type: EmailBlockType
  family: EmailBlockFamily
  surface: "configurable" | "fixed"
  /** Slots dans l'ordre du template : `nom: type`, suffixe `?` si optionnel. */
  slots: string[]
}

export type EmailPromptCatalog = {
  structuralRules: readonly string[]
  editorialGuidance: readonly string[]
  slotKinds: Record<EmailSlotKind, string>
  surfaces: readonly EmailSurface[]
  neutralSurface: EmailSurface
  iconNames: readonly string[]
  disclaimers: { id: EmailDisclaimerId; label: string; requiresEndDate: boolean }[]
  sections: EmailPromptSection[]
}

/**
 * Vocabulaire contrôlé pour le futur prompt : catalogue métier + données
 * techniques du manifeste, dans l'ordre du manifeste. Sérialisable en JSON.
 * Les disclaimers n'exposent que leur identifiant et leur intitulé.
 */
export function getEmailSectionCatalogForPrompt(): EmailPromptCatalog {
  const types = Object.keys(emailBlockManifest) as EmailBlockType[]
  const disclaimerIds = Object.keys(emailDisclaimers) as EmailDisclaimerId[]

  return {
    structuralRules: emailStructuralRules,
    editorialGuidance: emailEditorialGuidance,
    slotKinds: { ...emailSlotKindGuide },
    surfaces: emailSurfaces,
    neutralSurface: emailSurfaceRules.neutral,
    iconNames: emailIconNames,
    disclaimers: disclaimerIds.map((id) => {
      const entry: { label: string; parameter?: string } = emailDisclaimers[id]
      return { id, label: entry.label, requiresEndDate: entry.parameter === "endDate" }
    }),
    sections: types.map((type) => {
      const technical: ManifestEntry = emailBlockManifest[type]
      const optional = new Set(technical.optional ?? [])
      return {
        type,
        family: technical.family,
        surface: technical.surfaceMode,
        slots: Object.entries(technical.slots).map(
          ([slot, kind]) => `${slot}${optional.has(slot) ? "?" : ""}: ${kind}`
        ),
        ...emailSectionCatalog[type],
      }
    }),
  }
}
