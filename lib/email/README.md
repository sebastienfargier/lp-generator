# lib/email — domaine Email Generator

Ce domaine est indépendant du Landing Page Generator :

- aucun import depuis `lib/landing`, `lib/generator` ou `components/*` ;
- rien ne dépend de lui.

Supprimer ce dossier ne change rien au générateur de landing pages.

Étape actuelle : contrat, catalogue et templates normalisés (étape 1.5). Pas
encore de schéma Zod, de renderer, d'UI, d'API ni de génération.

| Fichier | Rôle |
|---|---|
| `manifest.ts` | catalogue runtime : 36 lames, 214 slots, éléments système, 40 icônes |
| `templates/*.html` | les 36 corps de lames normalisés, un fichier par `file` du manifeste |
| `types.ts` | `EmailConfig`, `EmailBlock` et valeurs de slots, dérivés du manifeste |
| `system.ts` | éléments et jetons résolus par le système, jamais par une config |
| `disclaimers.ts` | catalogue fermé des 9 disclaimers (guidelines, chapitre 12) |
| `surfaces.ts` | les 7 surfaces fermées et les invariants de `recettes-couleur.md` |
| `index.ts` | exports publics |

## Principe : le HTML des lames est maîtrisé

Une config ne fournit que le contenu des éléments `data-slot`. Elle ne modifie
ni la structure, ni les tables, ni les styles, ni les classes, ni les
couleurs. Le contrat n'a aucun champ `html`, `style`, `className` ou `css`.

## Conventions des templates

| Attribut | Porté par | Résolu par |
|---|---|---|
| `data-slot="<nom>"` | l'élément dont la config fournit le contenu | l'`EmailConfig` |
| `data-system="<nom>"` | logo, réseaux sociaux, désabonnement, préférences | le système (`system.ts`) |
| `data-optional="<slot>"` | les lignes supprimées quand ce slot optionnel est absent | le renderer, cas listés ci-dessous |

Le renderer ne fait que les opérations suivantes, sans heuristique.

| Type | Opération |
|---|---|
| `texte` | contenu de l'élément ← texte échappé |
| `cta` | `href` ← `href` ; contenu ← libellé échappé |
| `cta:fleche` | idem, suivi de ` &nbsp;&#8594;` (gabarit d'origine) |
| `lien` | `href` ← `href` ; contenu ← libellé échappé |
| `asset:visuel` | attributs `src` et `alt` de l'`<img data-slot>` |
| `asset:icone` | `src` ← URL CDN de l'icône nommée |
| `disclaimer` | contenu ← `*` + texte exact du catalogue (date injectée si besoin) |
| `data-system` | jeton ← valeur de la plateforme ; libellé inchangé |

### Images (`asset:visuel`)

Chaque visuel est un `<img data-slot="image-N">`, dans le `<td>` du cadre
d'origine. Le `<td>` garde :

- ses attributs `height` et `valign` ;
- sa classe responsive `phNNN`.

Seul son `padding:12px`, qui centrait le placeholder, passe à `0`.

L'image porte les dimensions desktop mesurées du cadre, en `width` et
`height`, avec `width:100%;height:auto` et le `border-radius` du cadre.

**Le visuel doit être fourni au ratio exact du slot.** Le renderer ne recadre
pas. Un visuel à un autre ratio laisse le fond gris du cadre apparent, sans
déformation.

## Manifeste

`manifest.ts` est la source de vérité du catalogue runtime. Il est issu de
`lames.json` 0.1, puis normalisé. `EmailBlockType`, les slots par lame et
leurs valeurs en sont dérivés, et aucune liste de lames n'existe ailleurs.

Chaque template contient exactement les `data-slot` et `data-system` de son
entrée, dans le même ordre. Tout slot est requis, sauf ceux déclarés
`optional`. Aujourd'hui, seul `disclaimer-2` est optionnel.

Écarts avec `lames.json` 0.1, à reporter dans le projet Email :

- **slots ajoutés :**
  - `label` : `header-seasonal-campaign`, `hero-cards` ;
  - `compteur-1..3` : les deux countdowns ;
  - `partenaire` : `hero-split-image-dark` ;
  - `item-1..3-titre` et `item-1..3-texte` : `benefits-and-testimonial` ;
  - `cta-1` : `benefits-and-testimonial`, `cta-and-testimonial`,
    `product-details-variant-01` et `-02` ;
  - `code-promo-1` : `discount-banner-cards` ;
- **devenus éléments système :** `logo` (3 lames), `social-1..4`,
  `lien-desabonnement` et `lien-preferences` ;
- **types précisés :** `cta` devient `cta` ou `cta:fleche`, et `disclaimer-*`
  devient `disclaimer`.

## Lien avec le projet Email

Les fichiers source de Claude restent hors du repo.

- **`templates/*.html`** vient de `bibliotheque-lames.md`, un bloc `html` par
  lame, avec les transformations ci-dessus et rien d'autre. 14 lames sont
  identiques à l'octet près. Le sens de synchronisation s'inverse : c'est le
  repo qui fait foi, et `bibliotheque-lames.md` est à régénérer depuis ces
  fichiers.
- **`socle-email.html`** n'est pas encore dans le repo, car il n'a pas changé.
  Il deviendra l'enveloppe du renderer :
  - `subject` remplace `[OBJET DE L'EMAIL]` ;
  - `preheader` remplace `[PREHEADER]` ;
  - les lames s'insèrent entre les marqueurs `LAMES`.

  Voir `emailDocumentTokens`.

## Disclaimers

Une config choisit un identifiant, jamais un texte :

```ts
{ disclaimer: "chiffres-performance" }
{ disclaimer: "offre-promotionnelle", endDate: "2026-10-31" }
```

Seule l'offre promotionnelle prend un paramètre : `endDate` remplace
`JJ/MM/AAAA`. Le renderer ajoute l'astérisque devant le texte. Deux
disclaimers identiques dans la même lame seront refusés par le futur schéma.

**Transformation structurelle autorisée, unique :**
- **Lame et slot :** `email-module-legal-disclaimer`, `disclaimer-2`.
- **Condition :** `disclaimer-2` est absent.
- **Effet :** le renderer supprime les deux `<tr data-optional="disclaimer-2">`
  (l'espacement de 8 px et la ligne du second disclaimer).

Il n'existe aucune autre suppression, et pas de mécanisme générique.

## Liens et `href`

`EmailHref` accepte trois formes :

- une URL `https://…`, avec la query `?[UTM À DÉFINIR — CRM]` admise ;
- une expression Liquid complète `{{ … }}` ;
- le placeholder explicite `[URL À CONFIRMER]`.

`javascript:`, `data:`, `http:` et les URL relatives sont refusés dès le
typage. `[URL À CONFIRMER]` et le placeholder UTM sont valides
structurellement ; l'envoyabilité sera contrôlée séparément.

Les liens `lien-1..3` du footer restent éditoriaux, fournis par la config. Les liens système (désabonnement, préférences) ne reçoivent ni `href`
ni libellé : leur jeton devient un tag de la plateforme, et leur libellé légal
reste fixe.

Le lien « voir en ligne » n'est confirmé par aucune source. `lien-1` du
bandeau `email-module-preheader` reste donc un lien éditorial.

## Surfaces

`surface` prend l'une des sept surfaces fermées. Header et footer (disclaimer
inclus) n'acceptent que `page`, et ce dès le typage. Le futur schéma
appliquera en plus la règle de `emailSurfaceRules` : jamais deux zones
colorées à la suite.

Restent des consignes de génération, hors validation V1 :

- « exactement une zone colorée » (`recettes-couleur.md`) ;
- le choix de la surface selon le type d'email.

## Arbitrages V1

- `partenaire` (`hero-split-image-dark`) est un texte, pas un logo.
- Les compteurs des countdowns sont des valeurs texte statiques.
- Les réseaux sociaux restent système. Le réseau de chaque position n'est pas
  arbitré (YouTube ou TikTok) tant qu'aucune source ne tranche.
- Dimensions et ratio des visuels appartiennent au template, jamais à la
  config.

## Hors du contrat

Ces éléments sont des entrées du futur moteur (`GenerationInput`) :

- le mode (Référence, Modèle, Création) et le périmètre repris ;
- le brief, la cible, le type d'email et l'action attendue ;
- les objets proposés, les réserves et le verdict d'envoyabilité ;
- les personas, guidelines, services, calendrier et sources.
