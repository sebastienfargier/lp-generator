/**
 * Destinations Studi contrôlées : les seules URLs que le futur modèle peut
 * proposer comme `href`. Chaque chemin est recopié d'une source du projet
 * Email, jamais reconstruit par analogie (`sources-studi.md` : « Ne jamais
 * reconstruire une URL par analogie »).
 *
 * - Chemins : `sources-studi.md` (§2 filières et catalogue, §4 bis blog, §5
 *   pages utiles) ; financement personnel : `guidelines-communication.md` §6.4.
 * - Hôte : `https://www.studi.com`, seul hôte des URLs complètes des sources
 *   (guidelines §6.4).
 * - Suivi : la query `?[UTM À DÉFINIR — CRM]`, placeholder documenté
 *   (`sources-studi.md` §6), déjà accepté par le contrat EmailHref.
 *
 * Provenance vérifiée le 2026-09-29 : chaque chemin figure mot pour mot dans
 * la source indiquée. Les sources du projet Email étant hors du repo, les
 * tests contrôlent ce catalogue versionné (forme, hôte, UTM, provenance
 * déclarée), pas les fichiers source.
 *
 * Filières : `sources-studi.md` annonce « 17 pages de filière », mais sa
 * table en liste 34. Les 34 chemins sont repris : chacun est documenté.
 */
import { emailHrefPlaceholders } from "./system"
import type { EmailHttpsUrl } from "./types"

export type EmailDestinationGroup = "catalogue" | "filiere" | "service" | "blog"

type EmailDestinationEntry = {
  label: string
  path: `/fr/${string}`
  group: EmailDestinationGroup
  /** Quand la proposer ; `null` pour une filière (usage commun ci-dessous). */
  usage: string | null
  /** Provenance du chemin. */
  source: string
}

export const studiOrigin = "https://www.studi.com"

/** Usage commun des pages de filière (`sources-studi.md` §2). */
export const filiereUsage =
  "Page de filière : liste les formations du domaine. Destination stable pour un CTA, sans choix immédiat."

export const emailDestinations = {
  /* Catalogue et orientation (sources-studi.md §2) */
  "catalogue-formations": { label: "Catalogue Studi", path: "/fr/formations", group: "catalogue", usage: "Catalogue complet des formations, avec filtres.", source: "sources-studi.md §2" },
  metiers: { label: "Fiches métiers", path: "/fr/metiers", group: "catalogue", usage: "Meilleure destination d'un email d'acquisition en début de séquence : parle du métier avant la formation.", source: "sources-studi.md §2" },
  diplomes: { label: "Formations par niveau de diplôme", path: "/fr/diplomes", group: "catalogue", usage: "Choisir une formation par niveau de sortie.", source: "sources-studi.md §2" },
  certificats: { label: "Certificats professionnels", path: "/fr/certificats", group: "catalogue", usage: "Monter en compétences avec un certificat.", source: "sources-studi.md §2" },
  "cpf-formations-eligibles": { label: "Formations éligibles CPF", path: "/fr/cpf/formations-eligibles", group: "catalogue", usage: "Email qui parle du CPF.", source: "sources-studi.md §2" },
  alternance: { label: "Catalogue Alternance", path: "/fr/cfa-studi", group: "catalogue", usage: "Formations en alternance.", source: "sources-studi.md §2" },

  /* Services et pages utiles (sources-studi.md §5, guidelines §6.4) */
  financement: { label: "Financement", path: "/fr/financement", group: "service", usage: "Tous les dispositifs de financement ; frein partagé par les trois cibles.", source: "sources-studi.md §5" },
  "financement-personnel": { label: "Financement personnel", path: "/fr/financement/financement-personnel", group: "service", usage: "Paiement échelonné ; lien des conditions du financement personnel.", source: "guidelines-communication.md §6.4" },
  "parcours-decouverte": { label: "Parcours Découverte", path: "/fr/parcours-decouverte", group: "service", usage: "Lien texte secondaire pour essayer avant de s'engager, jamais en second bouton.", source: "sources-studi.md §5" },
  accompagnement: { label: "Accompagnement", path: "/fr/accompagnement", group: "service", usage: "Les trois niveaux d'accompagnement.", source: "sources-studi.md §5" },
  "competences-360": { label: "Compétences 360", path: "/fr/competences-360", group: "service", usage: "Accélérateurs de compétences.", source: "sources-studi.md §5" },
  "soft-skills": { label: "Soft Skills", path: "/fr/soft-skills", group: "service", usage: "Compétences comportementales.", source: "sources-studi.md §5" },
  "coaching-carriere": { label: "Coaching carrière", path: "/fr/coaching-carriere", group: "service", usage: "Préparer une évolution ou une recherche d'emploi.", source: "sources-studi.md §5" },
  methode: { label: "Méthode et pédagogie", path: "/fr/methode", group: "service", usage: "Expliquer comment on apprend chez Studi.", source: "sources-studi.md §5" },
  blog: { label: "Blog", path: "/fr/blog", group: "service", usage: "Accueil du blog, quand aucune catégorie ne convient.", source: "sources-studi.md §5" },
  "trajectoire-magazine": { label: "Magazine Trajectoire", path: "/fr/trajectoire-magazine", group: "service", usage: "Magazine éditorial.", source: "sources-studi.md §5" },

  /* Filières (sources-studi.md §2) */
  "filiere-finance-comptabilite": { label: "Finance - Comptabilité", path: "/fr/formations-en-ligne-finance-comptabilite", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-comptabilite": { label: "Comptabilité", path: "/fr/formations-en-ligne-comptabilite", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-finance-controle-de-gestion": { label: "Finance - Contrôle de gestion", path: "/fr/formations-en-ligne-finance-controle-de-gestion", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-logistique-supply-chain": { label: "Logistique - Supply chain", path: "/fr/formations-en-ligne-en-logistique-et-supply-chain", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-ressources-humaines-paie": { label: "Ressources humaines - Paie", path: "/fr/formations-en-ligne-ressources-humaines-paie", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-politique-rh-recrutement": { label: "Politique RH - Recrutement", path: "/fr/formations-en-ligne-Politique-rh-recrutement", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-social-paie": { label: "Social - Paie", path: "/fr/formations-en-ligne-social-paie", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-juridique": { label: "Juridique", path: "/fr/formations-en-ligne-en-juridique", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-commerce-vente": { label: "Commerce - Vente", path: "/fr/formations-en-ligne-commerce-vente", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-commerce-international": { label: "Commerce international", path: "/fr/formations-en-ligne-commerce-international", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-commercial-relation-client": { label: "Commercial - Relation client", path: "/fr/formations-en-ligne-commercial-relation-client", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-retail-point-de-vente": { label: "Retail - Point de vente", path: "/fr/formations-en-ligne-retail-point-de-vente", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-marketing-communication": { label: "Marketing - Communication", path: "/fr/formations-en-ligne-en-marketing-et-communication", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-marketing": { label: "Marketing", path: "/fr/formations-en-ligne-en-marketing", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-communication": { label: "Communication", path: "/fr/formations-en-ligne-communication", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-management-gestion-de-projet": { label: "Management - Gestion de projet", path: "/fr/formations-en-ligne-management", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-office-management-secretariat": { label: "Office management - Secrétariat", path: "/fr/formations-en-ligne-office-management-secretariat", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-management-strategie-d-entreprise": { label: "Management - Stratégie d'entreprise", path: "/fr/formations-en-ligne-management-strategie-entreprise", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-developpement-web": { label: "Développement web", path: "/fr/formations-en-ligne-developpement-web", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-data-ia": { label: "Data - IA", path: "/fr/formations-en-ligne-en-data-ia", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-gestion-de-projet": { label: "Gestion de projet", path: "/fr/formations-en-ligne-gestion-de-projet", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-infra-reseaux-cybersecurite": { label: "Infra - Réseaux - Cybersécurité", path: "/fr/formations-en-ligne-en-infrastructures-reseaux-et-cybersecurite", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-design": { label: "Design", path: "/fr/formations-en-ligne-design", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-animation-3d-vfx": { label: "Animation - 3D - VFX", path: "/fr/formations-en-ligne-animation-3d-effets-speciaux", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-design-graphique-et-digital": { label: "Design graphique et digital", path: "/fr/formations-en-ligne-design-graphique-ux-ui", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-formation-insertion": { label: "Formation - Insertion", path: "/fr/formations-en-ligne-en-formation-insertion", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-immobilier": { label: "Immobilier", path: "/fr/formations-en-ligne-immobilier", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-banque-assurance": { label: "Banque - Assurance", path: "/fr/formations-en-ligne-banque-assurance", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-tourisme": { label: "Tourisme", path: "/fr/formations-en-ligne-tourisme", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-sport": { label: "Sport", path: "/fr/formations-en-ligne-sport", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-services-a-la-personne": { label: "Services à la personne", path: "/fr/formations-en-ligne-en-services-la-personne", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-accompagnement-petite-enfance": { label: "Accompagnement - Petite enfance", path: "/fr/formations-en-ligne-accompagnement-petite-enfance", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-esthetique": { label: "Esthétique", path: "/fr/formations-en-ligne-esthetique", group: "filiere", usage: null, source: "sources-studi.md §2" },
  "filiere-coiffure": { label: "Coiffure", path: "/fr/formations-en-ligne-coiffure", group: "filiere", usage: null, source: "sources-studi.md §2" },

  /* Catégories du blog (sources-studi.md §4 bis) : un lien texte, jamais un second bouton */
  "blog-communiques-de-presse-actualites": { label: "Blog — Communiqués de presse / actualités", path: "/fr/blog/communiques-de-presse-actualites", group: "blog", usage: "Actualités de Studi.", source: "sources-studi.md §4 bis" },
  "blog-decryptage-du-monde-de-la-formation": { label: "Blog — Décryptage du monde de la formation", path: "/fr/blog/decryptage-du-monde-de-la-formation", group: "blog", usage: "Parle aux personnes en poste.", source: "sources-studi.md §4 bis" },
  "blog-la-rse-chez-studi": { label: "Blog — La RSE chez Studi", path: "/fr/blog/la-rse-chez-studi", group: "blog", usage: "Engagement de marque : jamais dans un email d'acquisition.", source: "sources-studi.md §4 bis" },
  "blog-la-vie-dapprenant": { label: "Blog — La vie d'apprenant", path: "/fr/blog/la-vie-dapprenant", group: "blog", usage: "Parle aux jeunes.", source: "sources-studi.md §4 bis" },
  "blog-la-vie-pro": { label: "Blog — La vie pro", path: "/fr/blog/la-vie-pro", group: "blog", usage: "Profils qui montent en compétences.", source: "sources-studi.md §4 bis" },
  "blog-les-actualites-metiers-formations": { label: "Blog — Les actualités métiers / formations", path: "/fr/blog/les-actualites-metiers-formations", group: "blog", usage: "Profils qui montent en compétences.", source: "sources-studi.md §4 bis" },
  "blog-les-temoignages": { label: "Blog — Les témoignages", path: "/fr/blog/les-temoignages", group: "blog", usage: "Toutes cibles ; la catégorie la plus utile en fin d'email.", source: "sources-studi.md §4 bis" },
  "blog-les-tips-et-conseils": { label: "Blog — Les tips et conseils", path: "/fr/blog/les-tips-et-conseils", group: "blog", usage: "Parle aux jeunes.", source: "sources-studi.md §4 bis" },
  "blog-reconversion-professionnelle": { label: "Blog — Reconversion professionnelle", path: "/fr/blog/reconversion-professionnelle", group: "blog", usage: "Parle aux personnes en poste qui envisagent une reconversion.", source: "sources-studi.md §4 bis" },
  "blog-studi-team": { label: "Blog — Studi Team", path: "/fr/blog/studi-team", group: "blog", usage: "Marque employeur : jamais dans un email d'acquisition.", source: "sources-studi.md §4 bis" },
} as const satisfies Record<string, EmailDestinationEntry>

export type EmailDestinationId = keyof typeof emailDestinations

/** URL d'une destination contrôlée, avec le placeholder UTM du CRM. */
export function emailDestinationUrl(id: EmailDestinationId): EmailHttpsUrl {
  return `${studiOrigin}${emailDestinations[id].path}?${emailHrefPlaceholders.utm}`
}

/**
 * Destinations mentionnées par les sources sans URL établie : elles ne sont
 * pas proposables, le modèle écrit [URL À CONFIRMER] ou demande l'URL.
 */
export const emailUnconfirmedDestinations = [
  { label: "Article de blog précis", reason: "URL à relever dans la catégorie avant chaque email (sources-studi.md §4 bis)." },
  { label: "Inscription à un live", reason: "Titre, date, heure et URL d'inscription à fournir ; sinon le live n'entre pas dans l'email (sources-studi.md §3)." },
  { label: "Page d'une formation précise", reason: "URL fournie par le brief ou relevée sur la page de filière (sources-studi.md §2)." },
  { label: "Pages alternance par métier", reason: "Seul le préfixe /fr/alternance/… est documenté (sources-studi.md §2)." },
  { label: "Diplômes Bac+2, Bac+3, Bac+5", reason: "Chemins donnés en abrégé (« -bac2 ») : non recopiables tels quels (sources-studi.md §2)." },
] as const
