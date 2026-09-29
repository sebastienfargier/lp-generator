# lib/email — domaine Email Generator

Ce domaine est indépendant du Landing Page Generator :

- aucun import depuis `lib/landing`, `lib/generator` ou `components/*` ;
- rien ne dépend de lui.

Supprimer ce dossier ne change rien au générateur de landing pages.

Étape actuelle : fondation (contrat, catalogue, templates, validation,
renderer) et premier workspace `/email-generator` en mode démo (étape 4A).
Pas encore d'IA.

| Fichier | Rôle |
|---|---|
| `manifest.ts` | catalogue runtime : 36 lames, 214 slots, éléments système, 40 icônes |
| `templates/*.html` | les 36 corps de lames normalisés, un fichier par `file` du manifeste |
| `types.ts` | `EmailConfig`, `EmailBlock` et valeurs de slots, dérivés du manifeste |
| `system.ts` | éléments et jetons résolus par le système, jamais par une config |
| `disclaimers.ts` | catalogue fermé des 9 disclaimers (guidelines, chapitre 12) |
| `surfaces.ts` | les 7 surfaces fermées et les invariants de `recettes-couleur.md` |
| `schemas.ts` | validation Zod d'EmailConfig, dérivée du manifeste (`parseEmailConfig`) |
| `renderer.ts` | rendu HTML : `renderEmail`, `renderEmailFromUnknown` (serveur, hors `index.ts`) |
| `demo-generator.ts` | mode démo : brief validé → EmailConfig déterministe, sans IA |
| `generation.ts` | serveur : brief → démo → Zod → `renderEmail` (`runEmailGeneration`) |
| `socle-email.html` | enveloppe du document, copie à l'identique du socle du projet Email |
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
| `data-color-role="<rôle>"` | un élément dont les couleurs ne suivent pas la table §3 | le renderer (`resolveColorRole`) |

Ces quatre attributs sont internes. Ils servent aux vérifications et aux
transformations, puis sont retirés du HTML final. Aucun autre `data-*`
n'est touché.

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
- **`socle-email.html`** : `lib/email/socle-email.html` est la source runtime.
  C'est une copie octet pour octet du socle du projet Email, sans aucune
  modification.

## Disclaimers

Une config choisit un identifiant, jamais un texte :

```ts
{ disclaimer: "chiffres-performance" }
{ disclaimer: "offre-promotionnelle", endDate: "2026-10-31" }
```

Seule l'offre promotionnelle prend un paramètre : `endDate` remplace
`JJ/MM/AAAA`. Le renderer ajoute l'astérisque devant le texte. Deux
disclaimers identiques dans la même lame sont refusés par le schéma.

**Transformation structurelle autorisée, unique :**
- **Lame et slot :** `email-module-legal-disclaimer`, `disclaimer-2`.
- **Condition :** `disclaimer-2` est absent.
- **Effet :** le renderer supprime les deux `<tr data-optional="disclaimer-2">`
  (l'espacement de 8 px et la ligne du second disclaimer).

Il n'existe aucune autre suppression, et pas de mécanisme générique.

## Liens et `href`

`EmailHref` accepte trois formes :

- une URL `https://…` avec un hôte. Elle peut interpoler du Liquid
  `{{ … }}` dans son chemin, sa query ou son fragment, jamais dans l'hôte.
  La query `?[UTM À DÉFINIR — CRM]` (ou `&…`) est admise en fin d'URL ;
- une expression Liquid complète `{{ … }}` ;
- le placeholder explicite `[URL À CONFIRMER]`.

`javascript:`, `data:`, `http:` et les URL relatives sont refusés dès le
typage. Le runtime refuse en plus :

- un Liquid mal fermé ou vide ;
- un espace, un guillemet ou un chevron hors Liquid ;
- une URL sans hôte.

Liquid n'est jamais exécuté : c'est une chaîne destinée à la plateforme
d'envoi. `[URL À CONFIRMER]` et le placeholder UTM sont valides
structurellement ; l'envoyabilité sera contrôlée séparément.

Les liens `lien-1..3` du footer restent éditoriaux, fournis par la config. Les liens système (désabonnement, préférences) ne reçoivent ni `href`
ni libellé : leur jeton devient un tag de la plateforme, et leur libellé légal
reste fixe.

Le lien « voir en ligne » n'est confirmé par aucune source. `lien-1` du
bandeau `email-module-preheader` reste donc un lien éditorial.

## Surfaces

Chaque lame déclare `surfaceMode` dans le manifeste.

- **`configurable` (26 lames)** : la table de substitution de
  `recettes-couleur.md` §3 s'applique. La lame accepte `surface`, l'une des
  sept surfaces fermées (`page` si absente).
- **`fixed` (10 lames)** : la lame garde ses couleurs, et la config ne peut
  pas fournir `surface`, que le renderer ignorerait. Ces lames sont :
  - les 3 Header et les 2 Footer (disclaimer inclus), qui restent en Page
    toujours (§4). Le manifeste ne compile pas autrement ;
  - `banner-full`, `discount-banner-full`, `hero-offer-image-top` et
    `hero-split-image-dark`, dont le panneau principal est en `#45413B` ;
  - `benefits-compact-highlights`, dont toute la table est en `#2F2A28`.

  Aucune de ces deux valeurs n'est un fond de la table §3 : elles n'y
  figurent qu'en texte et en filet.

Le schéma applique en plus la règle de `emailSurfaceRules` : jamais deux
surfaces configurées colorées à la suite. Les couleurs intrinsèques des lames
`fixed` ne comptent pas.

Restent des consignes de génération, hors validation V1 :

- « exactement une zone colorée » (`recettes-couleur.md`) ;
- le choix de la surface selon le type d'email.

## Validation runtime (`schemas.ts`)

Toute config d'origine inconnue passe par `parseEmailConfig` (lève une
`ZodError`) ou `safeParseEmailConfig` (erreurs détaillées, à renvoyer au
modèle) avant d'être un `EmailConfig`.

- Les 36 schémas de lame sont construits en parcourant `emailBlockManifest` :
  aucune liste de lames n'est recopiée.
- Les slots sont un objet strict par lame : slot inconnu ou élément système
  refusés, slots requis obligatoires, `optional` acceptés absents.
- Les valeurs viennent des catalogues : icônes, disclaimers, surfaces.
- Règles entre lames : ids uniques, pas de surfaces colorées consécutives,
  exactement un footer en dernière position, et au plus une lame de mentions
  légales (optionnelle), immédiatement avant le footer.
- Le footer est la lame qui porte le lien de désabonnement, exigé par
  `README-assets-projet.md` (« un footer avec son lien de désabonnement »).
  `instructions-projet.md` le place en fin de séquence, et le disclaimer
  « juste avant le footer ».
- Aucune source n'impose le header : il n'apparaît que dans la séquence
  indicative de 5 à 8 lames. Il n'est donc pas obligatoire.

Règles que seul le runtime peut vérifier :

- textes visibles non vides, sans balisage HTML réel. Sont refusés :
  - les balises nommées : `<strong>`, `</a>`, `<a href="…">`, `<br/>` ;
  - les commentaires et le doctype.

  Un `<` ou `>` isolé est accepté (« Réponse en <5 min », « x > 5 »).
  Limites connues : `a<b et c>d` écrit sans espaces, ou `<Nom>`, ont la forme
  d'une balise et sont refusés ;
- ids au format `^[a-z][a-z0-9-]*$` ;
- URL HTTPS bien formées, avec un hôte ;
- dates calendaires réelles ;
- disclaimers distincts dans une même lame ;
- `blocks` non vide.

Hors validation : longueurs d'objet et de préheader, nombre de lames, CTA
unique, lexique, envoyabilité, et le choix entre alt descriptif et alt vide
(moteur de génération, accessibilité).

Aucun effet global sur Zod : les messages intégrés passent en français à
chaque appel de `parseEmailConfig` et `safeParseEmailConfig`, sans
`z.config`. Les messages métier sont écrits dans les schémas.
`EmailConfigSchema.parse` est une API bas niveau : appelée directement, elle
garde la locale globale et ne garantit pas le français.

## Renderer (`renderer.ts`)

Importer depuis `@/lib/email/renderer`, côté serveur uniquement : le module
lit les fichiers avec `node:fs`, et `index.ts` reste importable partout.

- `renderEmail(config)` prend une EmailConfig déjà valide et renvoie le HTML
  complet.
- `renderEmailFromUnknown(input)` enchaîne `parseEmailConfig`, puis
  `renderEmail`. Il lève une `ZodError` si la config est invalide.

Le HTML n'est jamais re-sérialisé. parse5 localise les éléments, avec les
positions exactes des balises et des attributs, puis le renderer applique
des remplacements ponctuels au texte d'origine. Commentaires MSO, entités,
classes et styles restent octet pour octet.

**Document.** Dans l'en-tête du socle, `[OBJET DE L'EMAIL]` et `[PREHEADER]`
sont remplacés par le texte échappé, avant l'insertion des lames. Les lames
sont ensuite insérées entre les marqueurs `LAMES`, dans l'ordre de
`config.blocks`.

**Slots.**

| Type | Opération |
|---|---|
| `texte` | contenu ← texte échappé |
| `cta`, `lien` | `href` ← valeur ; contenu ← libellé échappé |
| `cta:fleche` | idem, suivi de ` &nbsp;&#8594;` |
| `asset:visuel` | `src` et `alt` |
| `asset:icone` | `src` ← `[URL_CDN_ICONE:<nom>]` : jeton runtime interne temporaire, absent des sources, à résoudre plus tard |
| `disclaimer` | `*` + texte exact du catalogue, date au format JJ/MM/AAAA |

Si `disclaimer-2` est absent, ses deux lignes `data-optional` sont supprimées.

**Échappement.**
- Texte : `&`, `<`, `>`.
- Attributs : en plus `"`.
- Liquid n'est jamais interprété : il reste une chaîne destinée à la
  plateforme.

**Éléments système.** Leurs jetons sont conservés : logo, réseaux sociaux,
désabonnement, préférences, icônes. Aucun n'est résolu vers un CDN ou un CRM.

**Attributs internes.** Leurs positions sont relevées dans le template
d'origine. Ils sont retirés dans la même passe que les autres remplacements,
après toutes les vérifications. Une ligne `data-optional` déjà supprimée
n'est pas traitée une seconde fois.

**Surfaces.**
- Une lame `fixed` garde ses couleurs.
- Une lame `configurable` reçoit la recette de sa surface (`page` si absente),
  via `emailSurfaceRecipes` et `emailColorSubstitutions`.
- Toute couleur absente de la table est une erreur.
- Deux rôles explicites (`data-color-role`) couvrent les exceptions
  connues ; le rôle est porté par le template, jamais déduit d'une valeur :
  - `icon-background` : les 3 pastilles de 44 px de `icons-list` (§3). Blanc
    sur les surfaces claires, Filet sur Marque et Encre ;
  - `overlay-card` : la carte superposée au visuel des deux
    `product-details`. Sur Page, elle garde son fond blanc et son contour
    encre, comme dans l'exemple complet 5. Aucune source ne dit son rendu sur
    une surface colorée : une erreur explicite est levée.
- Les autres lames à icônes (`icons-grid`, `benefits-and-testimonial`,
  `cta-and-testimonial`) suivent la table §3, qui couvre leurs couleurs.

**Intégrité.** Un `EmailTemplateError` est levé dans chacun de ces cas :
- slot du manifeste absent du template, ou `data-slot` non déclaré ;
- élément porteur inattendu, ou contenu qui n'est pas du texte seul ;
- flèche du gabarit manquante ;
- jeton système altéré ;
- marqueur du socle absent ;
- lame inconnue.

Les 36 lames se rendent sur Page. Sur Marque, 24 des 26 lames configurables
se rendent ; les deux `product-details` lèvent l'erreur du rôle
`overlay-card`.

**Points connus, non traités.**

- **Enveloppe pleine largeur.** `recettes-couleur.md` §3 attribue
  explicitement le Fond à la « table pleine largeur », qui est donc colorée.
  Les références font toutes 640 px de large et ne montrent pas ce qu'il y a
  au-delà.
- **Visuels en mobile.** Avec `height:auto`, les images dépassent les hauteurs
  `phNNN` prévues pour le mobile. Un audit visuel séparé est prévu.
- **Première intégration serveur ou Vercel.** Il faudra vérifier que
  `templates/` et `socle-email.html` sont bien inclus dans le bundle.
  `next.config` n'est pas modifié à ce stade.

## Workspace `/email-generator`

`app/email-generator/page.tsx` (serveur) rend l'aperçu initial avec
`runEmailGeneration`. `components/email/` contient la partie client : le
brief, l'appel à `POST /api/generate-email` et l'aperçu.

La route est propre au domaine Email : `/api/generate` reste réservé aux
landing pages. L'aperçu affiche le HTML de `renderEmail` tel quel :
- dans une iframe `srcDoc`, `sandbox="allow-same-origin"`, donc sans script
  ni popup ;
- à 720 px en Desktop (au-dessus du seuil mobile de 640 px du socle) et à
  390 px en Mobile, réduit si la surface est plus étroite.

**HTML canonique ou aperçu.** `renderEmail()` produit le seul HTML
exportable : jetons système et vrais liens. `preview.ts` (`toPreviewHtml`)
en dérive le HTML d'aperçu, affiché dans l'iframe :
- le logo sombre devient `/logos/logo_studi_sombre_lowres.png` ;
- les 40 icônes deviennent `/icones/<nom>.png`. Un autre nom est une erreur ;
- les réseaux sociaux deviennent un pixel transparent : aucun réseau n'est
  attribué à ces positions ;
- les `href` deviennent `data-preview-href`, sans script : les liens sont
  inertes et leur destination reste inspectable.

Les chemins `/logos` et `/icones` ne sont jamais des URLs envoyables, et
n'entrent ni dans EmailConfig ni dans le HTML canonique.

**Largeur au-delà de 640 px.** Chaque lame commence par une table
`width="100%"` avec `background:#FFFFFF`, qui contient la table `.lame` de
640 px. `recettes-couleur.md` §3 attribue le Fond à cette « table pleine
largeur ». Chaque lame forme donc une bande pleine largeur, blanche ou à la
couleur de sa surface, qui recouvre le fond neutre `#F5F5F4` du socle. Le
comportement est conforme aux sources ; le changer suppose une décision de
design.

**`icons-grid`.** Ses icônes PNG au trait sombre sont posées sur un carré
`#1D1916` : le contraste est insuffisant. Cette lame n'est pas utilisée par
la démo, en attendant une décision sur le design ou les assets.

Next.js trace automatiquement `templates/` et `socle-email.html` pour la
page et la route (vérifié dans les `.nft.json` du build). Il reste à tester
sur Vercel.

## Tests

```bash
npm run test:email
```

Le runner est `node:test`, sans dépendance : Node exécute directement le
TypeScript. `tests/resolve-ts.mjs` complète seulement les imports sans
extension de `lib/email`. Les tests utilisent les vrais templates et le vrai
socle ; seuls les cas de corruption injectent une source modifiée.

- `schemas.test.ts` : contrat EmailConfig. Chaque cas refusé porte aussi un
  `@ts-expect-error`, vérifié par `tsc` au lint et au build.
- `manifest.test.ts` : 36 lames ; slots, éléments système et optionnels de
  chaque template identiques au manifeste.
- `renderer.test.ts` : document, slots, échappement, surfaces, intégrité, et
  rendu des 36 lames sur Page.

Les deux `product-details` ne sont volontairement pas supportés sur une
surface colorée, tant qu'aucune règle de design ne fixe le rendu de leur
carte (`overlay-card`). Le test attend l'erreur explicite.

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
