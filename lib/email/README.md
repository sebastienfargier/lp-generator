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
| `section-catalog.ts` | catalogue métier des 36 lames et règles globales pour le futur prompt (`getEmailSectionCatalogForPrompt`) |
| `destinations.ts` | 60 destinations Studi contrôlées, chacune avec sa source (`emailDestinationUrl`) |
| `generation-context.ts` | contexte compact d'une génération : lames candidates, liens, vocabulaire (`buildEmailGenerationContext`) |
| `generation-request.ts` | contrat d'entrée d'une génération par modèle : faits structurés et validés (`EmailGenerationRequest`) |
| `ai-prompt.ts` | prompt système, assemblage du prompt, schéma de sortie, validation de la réponse (sans réseau) |
| `demo-generator.ts` | mode démo : brief validé → EmailConfig déterministe, sans IA |
| `demo-assets.ts` | trois photos de démo : URL `.invalid` canonique, fichier local pour l'aperçu seulement |
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
  Les références font toutes 640 px de large (ancien standard), et ne
  montrent pas ce qu'il y a au-delà.
- **Visuels en mobile.** Avec `height:auto`, les images dépassent les hauteurs
  `phNNN` prévues pour le mobile. Un audit visuel séparé est prévu. Exception
  corrigée : `.ph270` (hero promotionnel moyen, seule lame qui l'emploie) passe
  à `height:auto`. À 190 px, la cellule dépassait l'image pleine largeur
  (176 px à 390 px de large) et laissait une bande de la surface sous la photo.
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
- à 600 px en Desktop, la largeur canonique, et à 390 px en Mobile. L'aperçu
  est réduit si la surface est plus étroite ;
- à la hauteur de son document : sans barre de défilement interne, qui
  ferait passer la largeur utile sous 600 px. C'est la surface qui défile.

**HTML canonique ou aperçu.** `renderEmail()` produit le seul HTML
exportable : jetons système et vrais liens. `preview.ts` (`toPreviewHtml`)
en dérive le HTML d'aperçu, affiché dans l'iframe :
- le logo sombre devient `/logos/logo_studi_sombre_lowres.png` ;
- les 40 icônes deviennent `/icones/<nom>.png`. Un autre nom est une erreur ;
- les réseaux sociaux deviennent un pixel transparent : aucun réseau n'est
  attribué à ces positions ;
- les trois photos de démo deviennent `/images/email-demo-….jpg` (voir
  ci-dessous) ;
- les `href` deviennent `data-preview-href`, sans script : les liens sont
  inertes et leur destination reste inspectable.

Les chemins `/logos`, `/icones` et `/images` ne sont jamais des URLs
envoyables, et n'entrent ni dans EmailConfig ni dans le HTML canonique.

**Photos de démo (`demo-assets.ts`).** Chaque scénario ouvre sur un hero à
photo, d'une architecture différente :

| Scénario | Lame | Cadre | Fichier (2x) | Source |
| --- | --- | --- | --- | --- |
| Reconversion | `hero-promotional-image-medium` | 600 × 270 | `email-demo-reconversion.jpg`, 1200 × 540 | `audience-3.jpg` |
| Accompagnement | `hero-split-image` | 229 × 456 | `email-demo-accompagnement.jpg`, 458 × 912 | `content-2.jpg` |
| Évolution | `hero-promotional-image-large` | 600 × 534 | `email-demo-evolution.jpg`, 1200 × 1068 | `hero-apprenante.jpg` |
| Promotion | `hero-offer-image-top` | 600 × 300 | `email-demo-promotion.jpg`, 1200 × 600 | `content-4.jpg` |
| Black Friday (campagne) | `hero-promotional-image-large` | 600 × 534 | `email-demo-black-friday.jpg`, 690 × 614 | `campaign-black-friday-640.jpg` |
| Studi Days (campagne) | `hero-promotional-image-large` | 600 × 534 | `email-demo-studi-days.jpg`, 640 × 570 | `campaign-studi-days-640.jpg` |
| Studi Meet (campagne) | `hero-promotional-image-medium` | 600 × 270 | `email-demo-studi-meet.jpg`, 640 × 288 | `service-studi-meet-640.jpg` |

Les fichiers sont des recadrages des photos de `public/images/`, dont les
originaux ne sont pas modifiés. Dans l'EmailConfig et le HTML canonique,
chaque photo est `https://demo-assets.invalid/<fichier>` : une URL HTTPS
acceptée par `ImageAssetSlot`, mais sur un TLD réservé (RFC 2606), jamais
résolu. Le HTML exporté reste donc visiblement non envoyable. Seul
`toPreviewHtml` remplace ces quatre URLs, par un mapping fermé : une autre URL
de `demo-assets.invalid` reste telle quelle. `ImageAssetSlot` et
`EmailGenerationRequest` refusent toujours les chemins locaux.

**Scénario Promotion (démo uniquement).** Quatrième objectif du mode démo
(`emailDemoObjectives`). `EmailGenerationRequest` garde ses trois objectifs :
le pont `emailBriefToGenerationRequest` convertit Promotion en
`emailType: "promo"`, sans offre. Ses seules données commerciales sont
`promotionDemoOffer` (`-50 %`, code `DEMO50`, `source: "demo"`) : des valeurs
fictives, décidées pour la démo, qui ne sont ni une offre Studi ni des faits
validés pour le contrat de génération. Composition : header de campagne,
`hero-offer-image-top` (photo, `valeur-cle`, `code-promo-1`, CTA catalogue,
lien Parcours Découverte), `icons-list` en Accent 1, footer. Aucune date de
fin, compte à rebours, prix ni condition n'a été fourni : les countdowns ne
sont pas utilisés, et aucun disclaimer n'est ajouté (`offre-promotionnelle`
exige une date de fin). C'est une limite de la démo.

**Campagnes visuelles (démo uniquement).** Deux exemples construits autour
d'une création fournie, choisis par le champ interne `visual` d'`EmailBrief`
(absent de l'EmailConfig, du HTML et d'`EmailGenerationRequest`). Le texte
des créations leur appartient : il n'est ni extrait, ni recopié dans le HTML,
ni transformé en données. Les créations, fournies à 640 px, ne sont ni
étirées ni recadrées dans leur contenu : seul du fond uni est retiré ou
ajouté, aux couleurs exactes de la palette (Accent 1 pour Black Friday,
Marque pour Studi Days).

- **Black Friday** : header newsletter, grand visuel en Accent 1, footer ;
  CTA catalogue. Le « -40 % » du visuel n'est pas une offre : aucune offre,
  code, date ni disclaimer. Le visuel comporte un astérisque dont le renvoi
  n'a pas été fourni : l'interface le signale, et l'email n'est pas prêt pour
  un envoi réel.
- **Studi Days** : header newsletter, grand visuel en Marque, atouts,
  footer ; CTA « Découvrir Studi » vers `methode` (aucune page Studi Days).
- **Studi Meet** : header newsletter, visuel moyen en Encre, atouts, footer ;
  CTA « Découvrir Studi Meet » vers la destination `studi-meet`
  (`https://meet.studi.fr/`). C'est un service d'apprentissage en ligne, pas
  un événement : les textes ne reprennent que ce que présente le site
  (catégories de cours, cours de groupe, chat vidéo en direct, tuteurs), sans
  date, lieu, programme ni réservation. Recadrage : 640 × 288 à partir de
  y = 60 (haut du mur et bas de la table retirés).

**Destinations hors studi.com.** `destinations.ts` accepte une origine
externe seulement si elle figure dans `emailExternalOrigins` (liste fermée :
`https://meet.studi.fr`), avec pour source la page officielle. Les 60
destinations studi.com sont inchangées (empreinte testée). Le contrat
EmailConfig ne change pas : il n'a jamais filtré l'hôte des liens ; c'est la
validation de la réponse du modèle (`validateGeneratedEmail`) qui refuse tout
lien hors du contexte, et `studi-meet` n'entre dans aucun contexte.

En mobile, `.ph300` laisse une bande d'environ 5 px sous la photo 2:1 du
hero : `height:auto` n'est pas appliqué, car il dégraderait
`product-details-variant-02`, qui partage la classe.

**Largeur : 600 px.** La largeur canonique est de 600 px :
- `.lame` et les 36 tables `class="lame"` font 600 px (`emailManifestSource.width`) ;
- la bascule mobile se fait sous 600 px (`@media (max-width:599px)`) ;
- les colonnes fixes et les images ont été recalculées pour 600 px.

Chaque lame commence par une table `width="100%"`, à laquelle
`recettes-couleur.md` §3 attribue le Fond. Dans un client plus large que
600 px, chaque lame forme donc une bande pleine largeur, comme le prévoient
les sources. L'aperçu Desktop fait exactement 600 px : ces bandes y
coïncident avec l'email, qui apparaît comme un document de 600 px sur le
fond neutre de l'application.

**`icons-grid`.** Ses icônes PNG au trait sombre sont posées sur un carré
`#1D1916` : le contraste est insuffisant. Cette lame n'est pas utilisée par
la démo, en attendant une décision sur le design ou les assets.

Next.js trace automatiquement `templates/` et `socle-email.html` pour la
page et la route (vérifié dans les `.nft.json` du build). Il reste à tester
sur Vercel.

## Catalogue pour le prompt

`section-catalog.ts` décrit chaque lame pour le modèle : rôle, cas d'usage,
cas à éviter, consignes de contenu, limites et, si besoin, restriction de
surface. Le fichier ne contient aucune donnée technique :
`getEmailSectionCatalogForPrompt()` y ajoute depuis le manifeste la famille,
les slots (avec leur type et les optionnels) et le mode de surface. Il
fournit aussi le vocabulaire contrôlé : surfaces, icônes, identifiants et
intitulés de disclaimers, sans leurs textes juridiques.

Deux listes de règles sont séparées :
- les contraintes garanties par Zod (`emailStructuralRules`) ;
- les recommandations éditoriales des sources (`emailEditorialGuidance`),
  que Zod ne vérifie pas.

Les 36 entrées sont exhaustives dès le typage (`satisfies` sur
`EmailBlockType`). La sortie compacte pèse environ 25 000 caractères.

## Contexte compact

`buildEmailGenerationContext(brief, { emailType?, visuals? })` prépare ce
qu'un futur modèle doit recevoir pour une génération. Il réduit l'espace de
choix sans composer l'email : le catalogue complet reste la source.

- **Lames candidates.** Une lame est écartée si le brief ne fournit pas la
  donnée que ses slots exigent :
  - un visuel HTTPS par slot image ;
  - un code, une échéance ou une valeur chiffrée, uniquement en promo ;
  - un témoignage validé ;
  - des intitulés de formation exacts ;
  - un partenaire ;
  - un quiz.

  Sont aussi écartées les lames dont le catalogue signale une limite :
  `icons-grid` pour son contraste, et `product-details` hors promo. Footer,
  headers et contenu restent toujours disponibles ; les mentions légales ne
  le sont que si le brief les appelle.
- **Destinations.** Le contexte propose les liens du footer, ceux de
  l'objectif et les filières citées par le brief. Le blog n'est proposé que
  pour les types qui l'admettent (`copy-email.md` §4).
- **Vocabulaire.** La liste des icônes, celle des disclaimers et les types
  de slots ne sont envoyés que si une lame candidate les utilise. Les
  disclaimers ne donnent que leur id et leur intitulé.

Les chemins locaux (`/images`, `/logos`, `/icones`) ne sont jamais des
visuels envoyables. Le contexte fait 9 000 à 15 000 caractères, contre
25 400 pour le catalogue complet.

`destinations.ts` recopie les chemins de `sources-studi.md` (§2, §4 bis, §5),
avec l'hôte des guidelines (§6.4) et le placeholder UTM. Les destinations
sans URL établie sont listées à part et ne sont pas proposables.

## Génération par modèle (préparée, non branchée)

`EmailGenerationRequest` porte les faits qu'un modèle ne doit jamais
inventer : offre (valeur, code, date de fin, compte à rebours, disclaimer),
faits validés, témoignage, partenaire, visuels HTTPS. `EmailBrief` et le
mode démo sont inchangés, et `emailBriefToGenerationRequest` fait le pont.

La sélection des lames du contexte ne s'appuie que sur ces champs. Le texte
du brief ne sert plus qu'à l'intention : quiz, choix, liens, surface.

`buildEmailAiPrompt(request)` renvoie l'un de ces trois cas :
- `ready`, avec :
  - `system` : les instructions ;
  - `user` : `{ request, context }` en JSON ;
  - `outputSchema` : le JSON Schema dérivé de `EmailConfigSchema`
    (`z.toJSONSchema`), restreint aux lames candidates ;
- `invalid-request` ;
- `impossible` : ni hero, ni footer, ou aucune lame de corps possible avec
  les données fournies.

La réponse du modèle passe par `validateGeneratedEmail` : d'abord Zod, puis
des contrôles propres à la requête :
- lames candidates seulement ;
- liens contrôlés, visuels fournis, disclaimers proposés ;
- faits recopiés à l'identique.

Elle passe ensuite par `renderEmail`. Le prompt n'est jamais une garantie.

## Banque d'images V2 (`image-bank.ts`, non branchée)

Douze photos, quatre intentions visuelles (`warm-reassurance`,
`editorial-work`, `career-movement`, `campaign-portrait`, trois images
chacune) et deux frises de portraits prédéfinies. Le futur modèle ne verra que
des intentions et des identifiants de frise : jamais de fichier, d'URL, de
chemin, de recadrage, de dimension ni d'alt.

- Module **additif** : `image-catalog.ts` (quatre photos de démo) reste le
  catalogue du moteur actuel. Rien de la banque n'est importé par le prompt,
  le brouillon ni le resolver. Les trois identifiants communs aux deux
  catalogues n'y désignent pas les mêmes fichiers.
- Dérivés : `public/images/email/v2/<image>--<format>.jpg`, à 2x du cadre
  exact du template. Formats : `medium` 600×270, `large` 600×534, `split`
  229×456, `band` 520×174 (`hero-newsletter-variant-02` et
  `text-and-cta-variant-02` partagent le même fichier). Un dérivé n'existe que
  si le recadrage a été jugé A ou B à l'œil ; il n'y a pas de produit
  cartésien.
- Frises : `portrait-strip-mixed-01` et `-02`, cinq images, jamais deux du
  même cluster (décor), un dérivé par position (`--strip-1` à `--strip-5`,
  cadres 96×174, 96×158, 96×190, 96×158, 104×174). La lame
  `hero-newsletter-variant-01` n'accepte aucune image seule.
- Recadrages : décidés hors génération dans
  `scripts/email-image-bank/crops.json` (rectangles dans les sources
  2016×1344, empreintes MD5 des sources). `node scripts/email-image-bank/build.mjs`
  régénère les dérivés depuis `ressources/email/assets/` (hors dépôt, jamais
  copiées).
- API : `emailImagesForIntent(intent, blockType)`,
  `resolveEmailBankImage(imageId, blockType)`, `resolveEmailPortraitStrip(stripId)`,
  `pickEmailBankImage(intent, blockType, seed)` (choix déterministe). Erreurs
  `EmailImageBankError` : `unknown-image`, `unknown-intent`, `unknown-strip`,
  `incompatible-block`, `missing-derivative`.
- Hors périmètre : `hero-cards` (186×274) et `hero-split-image-dark` (280×390)
  ne sont pas des lames de l'IA V1 ; aucun dérivé n'est produit pour elles.
- Provenance : **à confirmer** pour les douze sources (aucune licence ni crédit
  connus). Aucune image n'est « approuvée production ».
- Aperçu : les URL canoniques `demo-assets.invalid/email-v2/…` se mappent aux
  fichiers via `emailBankPreviews`, lu par `toPreviewHtml` (en plus du mapping
  des visuels de démo, inchangé).

## Recettes V2 (hors ligne, non branchées)

Trois recettes de composition (`recipes.ts`) : `discovery-reassurance` (R1),
`editorial-newsletter` (R2), `brand-proof` (R3). Une recette décrit des
contraintes (hero autorisés, rôles requis et facultatifs, 3 à 5 sections de
contenu hors shell, budget de boutons, politique d'images, zone colorée,
claims, chiffres, longueur), jamais du HTML ni du CSS. Le Draft V1, son
prompt, son resolver et la route de génération ne les connaissent pas.

- `recipe-resolver.ts` : `composeEmailRecipe(composition)` → EmailConfig. La
  composition ne contient que du sémantique : recette, disposition du hero,
  intention visuelle, frise, intention de surface (`default` ou `empathy`),
  textes, identifiants de destination, d'icône et de claim. Le resolver décide
  des lames, des identifiants, de la surface, des images (banque V2), des
  liens, du shell, des mentions légales (déduites des claims) et du découpage
  d'un bandeau de preuve. Il valide par `safeParseEmailConfig`, puis par la
  recette.
- `recipe-validation.ts` : `validateEmailRecipeConfig` (séquence, rôles,
  boutons, destinations, images, une seule zone colorée, claims, chiffres,
  mentions, densité) et `lintEmailRecipeContent` (`lintBrandText` sur tous les
  textes : diagnostic `error` / `warning` / `known-conflict`, jamais de
  réécriture ni de blocage).
- `recipe-fixtures.ts` : six compositions écrites à la main (R1-A/B, R2-A/B,
  R3-A/B), rendues par le vrai renderer.
- Claims : seules les six claims de `lib/brand/claims.ts` (document approuvé),
  copiées au caractère près ; un bandeau n'accepte que les claims à libellé
  court (valeur + libellé = la formulation exacte).
- Nouvelles lames ouvertes hors ligne : `hero-newsletter-variant-01` et `-02`
  (via la banque d'images), `text-and-cta-variant-02`,
  `benefits-compact-highlights` et le bandeau `preheader` (lien secondaire).
- `lib/brand` n'est importé que par ces deux modules.

### Contrat IA des recettes (non branché)

Le contrat que le futur appel de Claude recevra, préparé hors ligne :

```
requête → recette (déterministe) → contexte Brand compact → prompt de la
recette → Draft de la recette (Structured Output) → resolver V2 → EmailConfig
→ validation Zod → validation de recette → diagnostic de terminologie →
renderEmail → aperçu
```

- `recipe-selection.ts` : intentions V2 additives (`discovery`, `editorial`,
  `brand-proof`) → recette ; sans intention, l'ancien vocabulaire se rattache
  par ses champs structurés (newsletter → R2, objectif → R1), jamais par le
  texte libre. Promotion, offre, transactionnel, fin de séquence, témoignage,
  partenaire, visuels fournis et mention légale d'un fait : refus explicite.
- `recipe-drafts.ts` : trois Drafts stricts, distincts, sans optionnel (R1 :
  étapes et appuis ; R2 : édition `banner` ou `portrait-strip`, introduction et
  quatre rubriques ; R3 : 2 à 3 identifiants de claims approuvées et un texte
  d'appui par claim). Aucun schéma ne contient d'union des recettes. Le code
  décide de la disposition du hero, de la frise, de la surface d'empathie et du
  second bouton ; `resolveEmailRecipeDraft` enchaîne le tout.
- `recipe-brand-context.ts` : projection compacte de `lib/brand` (voix de
  l'audience, sept règles de rédaction, onze formulations à éviter,
  destinations, intentions visuelles, claims pour R3 seulement). La provenance
  reste à côté, jamais envoyée.
- `recipe-prompts.ts` : `buildR1EmailPrompt`, `buildR2EmailPrompt`,
  `buildR3EmailPrompt` et `buildEmailRecipePrompt`. Environ 5 000 caractères
  par prompt (système, message, contexte), schémas de transport de 1 500 à
  2 000 caractères.
- Terminologie : `classifyEmailRecipeDiagnostics` range les diagnostics
  (conflit connu → relecture humaine, règle de brouillon → information, erreur
  d'une règle approuvée → bloquante, erreur d'une règle en revue → relecture).
  Aucune règle actuelle n'est approuvée ; rien ne bloque, rien ne se corrige,
  aucune relance.

### Moteur V2 branché au produit

`POST /api/generate-email` appelle désormais le moteur V2 (`anthropic-v2.ts`),
pour les trois familles d'emails du formulaire :

```
formulaire (intention + cible contrôlées) → requête V2 → recette →
prompt et schéma de CETTE recette → UN messages.create → Draft de la recette →
resolver → EmailConfig → validation de recette → diagnostics de terminologie →
politique de blocage → renderEmail → toPreviewHtml → réponse publique compacte
```

- Un seul appel par génération, jamais de relance (`maxRetries: 0`, délai de
  `anthropic.ts`), jamais de repli : ni sur le moteur V1, ni sur la démo. Seul
  le schéma de la recette choisie est envoyé.
- Configuration, client, correspondance des erreurs du fournisseur et lecture
  de la réponse sont ceux de `anthropic.ts`, exportés et partagés.
- Politique de marque : seule une erreur d'une règle APPROUVÉE bloque
  (`brand-violation`). Aucune règle actuelle ne l'est : conflits connus,
  brouillons, avertissements et erreurs de règles en revue restent des
  diagnostics serveur. Aucune correction automatique.
- Formulaire : quatre intentions métier (orientation, accompagnement,
  newsletter, preuves) et cinq cibles (les audiences Brand). La cible décide de
  la voix (tutoiement des alternants, vouvoiement sinon) ; la recette, les
  claims, les images et les surfaces ne sont jamais visibles ni choisies par
  l'utilisateur.
- Réponse publique inchangée : `status`, `subject`, `preheader`, `blockCount`,
  `html`, `previewHtml`. Ni recette, ni Draft, ni prompt, ni contexte, ni
  provenance, ni jetons.
- Le moteur V1 (`anthropic.ts` : `generateEmailWithClaude`, Draft, resolver,
  catalogue de quatre images) est conservé, testé, mais plus appelé par la route.

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
- `email-v2-runtime.test.ts` : moteur V2 de bout en bout avec un
  fournisseur simulé (un appel, schéma de la recette seul, erreurs, aucun
  repli).
- `recipe-contract.test.ts` : contrat IA des recettes (sélection, trois
  Drafts, schémas de transport, contexte Brand, prompts, aller-retour de six
  Drafts, Drafts invalides, fuites, politique de terminologie, frontières).
- `recipes.test.ts` : recettes V2 (définitions, six fixtures rendues,
  claims, surfaces, images, terminologie, différenciation, validation,
  frontières).
- `image-bank.test.ts` : banque V2 (12 images, 4 intentions, dérivés et
  dimensions réels, frises, résolution, vue IA sans fichier ni URL).
- `demo-assets.test.ts` : photos de démo, URL `.invalid` canonique, mapping
  fermé de l'aperçu, dimensions des fichiers.

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
