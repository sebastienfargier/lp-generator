/**
 * Éléments et jetons résolus par le système, jamais par une EmailConfig.
 *
 * Dans les templates, un élément système porte `data-system="<nom>"` (et non
 * `data-slot`) : une config ne peut donc pas le cibler. Le renderer remplace
 * son jeton par la valeur de la plateforme (CDN, tag d'envoi) ; son libellé
 * éventuel est verrouillé et reste celui du template.
 */

export const emailSystemElements = {
  /** Logo Studi monochrome pour fond clair. */
  logo: { kind: "asset", token: "[URL_CDN_LOGO_STUDI_SOMBRE]" },
  /**
   * Icônes des réseaux sociaux du footer. Le réseau de chaque position n'est
   * pas arbitré (YouTube ou TikTok selon les sources) : à confirmer.
   */
  "social-1": { kind: "asset", token: "[URL_CDN_SOCIAL_01]" },
  "social-2": { kind: "asset", token: "[URL_CDN_SOCIAL_02]" },
  "social-3": { kind: "asset", token: "[URL_CDN_SOCIAL_03]" },
  "social-4": { kind: "asset", token: "[URL_CDN_SOCIAL_04]" },
  /** Liens de gestion d'abonnement : tag de la plateforme, libellé légal fixe. */
  "lien-desabonnement": {
    kind: "lien",
    token: "[URL_DESABONNEMENT]",
    label: "Se désabonner",
  },
  "lien-preferences": {
    kind: "lien",
    token: "[URL_PREFERENCES]",
    label: "Gérer mes préférences",
  },
} as const

export type EmailSystemElement = keyof typeof emailSystemElements

/** Jetons du socle remplis depuis les métadonnées de l'EmailConfig. */
export const emailDocumentTokens = {
  subject: "[OBJET DE L'EMAIL]",
  preheader: "[PREHEADER]",
} as const

/**
 * Placeholders explicites admis dans un `href` de config. Ils sont valides
 * structurellement et restent visibles, jamais silencieux ; l'envoyabilité
 * sera contrôlée séparément. `utm` ne s'emploie qu'en query d'une URL HTTPS :
 * les UTM sont décidés côté CRM (`sources-studi.md` §6).
 */
export const emailHrefPlaceholders = {
  urlToConfirm: "[URL À CONFIRMER]",
  utm: "[UTM À DÉFINIR — CRM]",
} as const
