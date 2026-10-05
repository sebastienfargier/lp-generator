# Les modes de génération

Avant d'écrire une ligne, deux choses se décident : **d'où vient l'email**, et
**ce qu'on en reprend**. Ce sont deux questions distinctes, et elles se posent
au premier message.

---

## 1. Les deux questions d'ouverture

**D'où vient l'email ?**

| Mode | Le brief dit | Ce que tu fais |
|---|---|---|
| **Référence** | « voici un email dont je veux m'inspirer » | tu transposes dans les lames |
| **Modèle** | « reprends le même email que la dernière fois » | tu réutilises la séquence, tu changes le contenu |
| **Création** | « propose-moi quelque chose » | tu composes à partir du brief |

**Qu'est-ce qu'on reprend ?** La question ne se pose qu'en mode Référence et Modèle.

| Périmètre | Ce que tu reprends | Ce que tu réécris |
|---|---|---|
| **Structure seule** | l'enchaînement des blocs, le rythme | toute la copy, et la couleur |
| **Structure et angle** | l'enchaînement, plus l'intention de chaque bloc | les mots, toujours |
| **Libre** | l'esprit général | tout le reste |

Si le brief ne dit ni l'un ni l'autre, **tu ne demandes rien** : tu déduis. Référence
s'il y a un email fourni, Création sinon ; périmètre structure et angle par défaut. Tu
l'écris dans la restitution et tu livres. La personne corrigera en lisant, ce qui va
plus vite que de lui poser la question.

---

## 2. Mode Référence

Le cas le plus fréquent, et le plus délicat. La référence peut venir de Studi, d'une
autre marque du groupe, d'un concurrent, ou de n'importe quelle marque.

### La règle qui prime sur tout

**On transpose une structure, jamais des mots.** Quelle que soit la source et quel que
soit le périmètre demandé, la copy est réécrite depuis zéro avec les guidelines. Aucune
phrase de la référence ne se retrouve dans le livrable, même reformulée de près.

Recopier la copy d'une autre marque est un risque juridique, et ça produit un email qui
ne sonne pas Studi. « Structure et angle » veut dire que tu reprends *l'intention* d'un
bloc — ici on rassure, là on prouve, là on demande l'action — pas sa formulation.

Même chose pour la couleur : les couleurs de la référence ne se reprennent jamais. La
surface vient de `recettes-couleur.md`, toujours. D'une référence, tu prends le
**dosage** — où est la zone colorée, quelle part de la hauteur elle occupe — pas la
teinte.

### La marche à suivre

Découpe la référence en blocs, dans l'ordre. Pour chacun, cherche la lame qui fait le
même travail, dans les dix familles disponibles : Header (3 lames), Hero (11),
Story (4), Offer (3), Benefits (5), Features (4), Products (2), Diagnostic (1),
Divider (1), Footer (2).

Puis livre une **table de transposition**, avant toute copy :

| Bloc de la référence | Lame retenue | Statut |
|---|---|---|
| bandeau promo avec compte à rebours | `email-module-hero-countdown-variant-01` | exact |
| trois arguments avec pictogrammes | `email-module-icons-list` | exact |
| carrousel horizontal de 5 formations | — | **manquant** |
| encart avis clients avec note étoilée | `email-module-social-proof-testimonial-split` | approchant |

Trois statuts, et ils se distinguent :

**Exact** — la lame fait le même travail avec le même nombre d'éléments.

**Approchant** — la lame fait le même travail mais diffère sur un point, que tu nommes.
Trois colonnes au lieu de quatre, pas de note étoilée, pas de prix barré. Tu poses la
lame et tu signales l'écart ; tu ne la déformes pas pour qu'elle colle.

**Manquant** — aucune lame ne fait ce travail. Tu ne bricoles pas, tu ne détournes pas
une lame voisine en silence. Tu proposes la lame à créer, au format du paragraphe
suivant, et tu proposes un repli avec les lames existantes pour que l'email soit
livrable tout de suite.

### Suggérer une lame manquante

Une suggestion de lame se rédige dans le vocabulaire du catalogue, pour qu'elle soit
directement spécifiable dans Figma :

> **Nom** : Email Module / Products / Carousel Horizontal
> **Famille** : Products
> **À quoi elle sert** : présenter cinq formations ou plus sans empiler cinq blocs
> **Structure** : 640 px, une rangée défilante de cartes de 160 px, visuel, intitulé, lien
> **Slots** : `titre-section`, puis par carte `produit-N-titre`, `texte-descriptif-N`, `lien-N`, `image-N`
> **Réserve technique** : le défilement horizontal ne fonctionne pas en email. La forme
> réaliste est une grille de deux rangées, ou une sélection réduite à quatre.
> **Repli immédiat** : `email-module-products-four-column-grid`, limité à quatre formations.

La réserve technique compte autant que la proposition. Beaucoup de blocs vus sur le web
ne survivent pas à un client mail : défilement, survol, vidéo, accordéon, colonnes qui
ne s'empilent pas. Tu le dis plutôt que de laisser spécifier un module inutilisable.

---

## 3. Mode Modèle

Les modèles sont les **emails qui ont performé** — les tops. À terme ils viendront de
Marketing Cloud ; pour l'instant c'est un dossier constitué à la main, qui se remplit
au fil des envois.

### Ce qu'il faut pour qu'un top serve

Un email rangé sans son contexte n'est qu'un email. Il a peut-être gagné grâce à son
offre, à la chaleur de son segment ou à son timing, et pas du tout grâce à sa
structure. Quatre métadonnées par entrée suffisent, et elles sont connues au moment du
rangement :

| Champ | Exemple |
|---|---|
| Date d'envoi | 12 mars 2026 |
| Segment et volume | demandeurs d'emploi, 18 400 destinataires |
| Type d'email | lifecycle, fin de séquence |
| Métrique et valeur | taux de clic 7,2 %, contre 3,1 % de moyenne du type |

Ce sont les champs que Marketing Cloud exposera : le dossier manuel amorce
l'automatisation plutôt que de faire un travail jetable.

### La marche à suivre

Tu reprends **la séquence exacte de lames** et tu remplaces le contenu des slots.

Ce qui reste : l'ordre des lames, la surface, la position de la zone colorée.
Ce qui change : la copy, les liens, les visuels, et les disclaimers.

**Avant de reprendre un top, vérifie qu'il est comparable.** Un top de promo ne sert pas
de modèle à un lifecycle : sa structure suppose une offre, un compte à rebours, une
urgence. Si le type du modèle et celui du brief diffèrent, dis-le et propose plutôt le
top le plus proche, ou bascule en mode Création. Une métrique se lit toujours contre la
moyenne de son type, jamais dans l'absolu.

**Le piège du disclaimer hérité.** Un modèle qui portait une promo traîne un disclaimer
avec une date. Si le nouvel email n'a pas de promo, la lame disclaimer se retire. S'il
en a une autre, la date change. Un disclaimer périmé est pire que pas de disclaimer.

Si le dossier des tops n'est pas encore fourni au projet — c'est le cas aujourd'hui —
tu le signales en une ligne et tu bascules en mode Création à partir des exemples de
structure. Tu livres l'email dans la même réponse : l'absence de modèle n'est pas une
raison d'attendre.

## 4. Mode Création

Pas de référence, pas de modèle. Tu composes à partir du brief seul.

Tu ne pars pas de zéro pour autant : les neuf assemblages du dossier
`exemples-email-structure` sont des séquences éprouvées. Prends la plus proche de
l'intention et adapte-la, plutôt que d'inventer un enchaînement.

En création, **propose deux directions** avant d'écrire, en trois lignes chacune :
la séquence de lames, la surface retenue, et l'angle. La personne en choisit une. Ça
coûte trente secondes et ça évite de réécrire un email entier.

---

## 5. Ce qui ne change pas selon le mode

Le mode décide de la structure et de l'inspiration. Il ne décide de rien d'autre.

Les guidelines s'appliquent identiquement dans les trois cas : le lexique, les
promesses au conditionnel, les chiffres du chapitre 9, les disclaimers recopiés au
caractère près, le CTA unique, le vouvoiement hors alternance.

Une référence qui écrit « formation gratuite » ou « emploi garanti » ne transmet pas ce
droit. Tu transposes sa structure et tu signales, en réserve, que sa promesse serait
non conforme chez Studi.
