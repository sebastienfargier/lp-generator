# Mise en couleur des lames

Les 36 lames sont livrées en neutres. **Un email qui sort en gris n'est pas terminé.**
Ce fichier dit exactement quelles valeurs remplacer, par quoi, et où poser la couleur.

Il applique `design.md`, qui reste normatif, et il s'appuie sur la mesure des neuf
designs finis du dossier `exemples-email-design`.

---

## 1. Ce que font les designs finis

Mesure des neuf exemples, en part de surface occupée :

| Exemple | Base | Zone colorée |
|---|---|---|
| 1 | blanc 37 % | accent 2 doux 24 % |
| 2 | blanc 38 % | orange 50 — 14 % |
| 3 | blanc 54 % | vert de marque 11 % |
| 4 | blanc 33 % | encre 33 % |
| 5 | blanc 50 % | neutre 800 — 4 % |
| 6 | blanc 45 % | neutre 800 — 2 % |
| 7 | blanc 66 % | orange 50 — 19 % |
| 8 | blanc 55 % | vert de marque 27 % |
| 9 | blanc 36 % | accent 2 doux 16 % + accent 1 — 9 % |

**Trois règles s'en déduisent, et elles ne se négocient pas.**

Le blanc est la base, toujours, entre un tiers et deux tiers de la hauteur. La couleur
est une zone, pas une ambiance : une seule par email, entre un dixième et un tiers de
la surface. Et un seul exemple sur neuf combine deux accents — c'est l'exception, pas
le modèle.

Un email tout blanc est raté. Un email où chaque lame porte une couleur est raté aussi.

---

## 2. La table de substitution

Choisis **une surface** pour la zone colorée. Tout le reste en découle. Les ratios sont
calculés, pas estimés.

| Surface | Fond | Titre | Texte courant | Filet | Fond CTA | Libellé CTA |
|---|---|---|---|---|---|---|
| **Page** | `#FFFFFF` | `#1D1916` *17,5:1* | `#79726B` *4,7:1* | `#E7E5E4` | `#1D1916` | `#FFFFFF` |
| **Bloc** | `#FAFAF9` | `#1D1916` *16,7:1* | `#79726B` *4,5:1* | `#E7E5E4` | `#1D1916` | `#FFFFFF` |
| **Accent 1** | `#EDF878` | `#1D1916` *15,2:1* | `#58544D` *6,6:1* | `#1D1916` | `#1D1916` | `#FFFFFF` |
| **Accent 2 doux** | `#FED2CA` | `#1D1916` *12,7:1* | `#58544D` *5,5:1* | `#1D1916` | `#1D1916` | `#FFFFFF` |
| **Accent 2** | `#F8745D` | `#1D1916` *6,4:1* | `#1D1916` *6,4:1* | `#1D1916` | `#1D1916` | `#FFFFFF` |
| **Marque** | `#0D302D` | `#FFFFFF` *14,2:1* | `#A9A39D` *5,7:1* | `#2F2A28` | `#EDF878` | `#1D1916` |
| **Encre** | `#1D1916` | `#FFFFFF` *17,5:1* | `#A9A39D` *7,0:1* | `#2F2A28` | `#EDF878` | `#1D1916` |

### Le CTA Accent 1 sur fond clair

La table ci-dessus donne le CTA **par défaut**, qui est l'encre. Mais `design.md`
autorise le CTA Accent 1 sur fond clair, et le réserve aux **moments forts** : une
offre, une campagne, une fin de parcours. C'est ce qu'on voit dans les maquettes.

Quatre conditions, toutes obligatoires :

- **le libellé est à l'encre**, jamais blanc — blanc sur jaune donne 1,15:1, illisible ;
- **on lui donne de l'air.** Le jaune ne se détache pas du blanc (1,2:1) : c'est
  l'espace autour qui le fait exister, pas un contour. On ne lui ajoute pas de bordure ;
- **il est seul.** Pas d'autre bouton à côté, pas de rangée ;
- **son libellé dit l'action**, parce que la couleur seule ne signale pas qu'on peut
  cliquer.

Jamais sur une surface Accent 1 — le bouton et son fond se confondraient. Jamais sur
Accent 2 non plus : deux accents côte à côte se disputent l'œil.

Sur **Marque** et **Encre**, l'Accent 1 n'est pas un moment fort, c'est le CTA normal :
c'est la seule couleur qui ressorte d'un fond sombre.

Sur **Accent 2**, le texte courant et le titre sont identiques : l'orange ne laisse pas
de place à un second niveau de gris. Si la lame a besoin de deux niveaux de texte,
prends Accent 2 doux.

---

## 3. Quelle valeur remplacer

Dans une lame, le rôle d'une couleur se lit à la propriété qui la porte. Cette table
suffit à faire toute la substitution.

| Valeur dans la lame | Propriété | Rôle | Remplacer par |
|---|---|---|---|
| `#FFFFFF` | `background` de la table pleine largeur | fond de la lame | **Fond** |
| `#FAFAF9` `#F5F5F4` `#E7E5E4` | `background` | fond du bloc intérieur | **Fond** |
| `#1D1916` `#070A0D` | `background` | bouton, ou bandeau sombre | **Fond CTA** |
| `#1D1916` `#0C0A09` | `color` | titre | **Titre** |
| `#79726B` `#58544D` `#45413B` `#A9A39D` | `color` | texte courant | **Texte courant** |
| `#FFFFFF` | `color` | libellé sur fond sombre | **Libellé CTA** |
| `#79726B` `#1D1916` | `stroke` | trait d'icône | **Texte courant** |
| `#D7D3D0` `#E7E5E4` `#58544D` | `border`, `border-top` | filet | **Filet** |

**Le rond blanc derrière les icônes** — `background:#FFFFFF` dans une table de 44 px —
est une exception : il reste blanc sur les surfaces claires, et passe au **Filet** sur
Marque et Encre, sinon il crée un point lumineux qui attire l'œil pour rien.

---

## 4. Où poser la couleur

La zone colorée va sur **une** de ces trois lames, jamais sur deux à la suite :

- **le hero**, c'est le cas le plus fréquent et le plus sûr ;
- **la bannière d'offre**, quand l'email porte une promo ;
- **un bloc de corps** — bénéfices, témoignage, liste à icônes — quand le hero doit
  rester sobre parce qu'il porte une photo.

Tout le reste passe en **Page**. Le header et le footer restent en Page, toujours :
ce sont les repères de marque, ils ne changent pas d'un email à l'autre.

La lame disclaimer reste en Page, en texte courant. Une mention légale ne se met jamais
en valeur.

---

## 5. Choisir la surface

**Le vert de marque est la surface par défaut.** C'est la couleur qui identifie Studi ;
c'est donc elle qu'on voit le plus souvent, pas une teinte d'accent. Si tu hésites,
c'est Marque.

Le **type d'email** décide en premier, la cible ajuste ensuite.

| Type d'email | Surface de la zone |
|---|---|
| Lifecycle, newsletter, éditorial | **Marque** |
| Promo, offre, bourse d'études | **Accent 1** |
| Compte à rebours, échéance serrée | **Encre** |
| Annonce, lancement, campagne saisonnière | **Encre** ou **Marque** |
| B2B, partenaire académique, institutionnel | **Marque** |
| Transactionnel, service | **Bloc** |

**Accent 2 doux** ne se choisit pas par défaut. Il se réserve aux emails où la situation
de la personne est difficile et où le vert paraîtrait froid : un lifecycle destiné à des
demandeurs d'emploi, un parcours interrompu, un email de réassurance après un échec.
C'est une surface d'empathie, pas une surface d'acquisition.

**Accent 2** ne s'emploie que sur un bandeau court — une ou deux lignes. Sur une lame
entière, l'orange vif écrase tout ce qui l'entoure, et il ne laisse pas de place à un
second niveau de texte.

### Ne répète pas la même surface

Si tu as déjà produit un email dans cette conversation, **prends une autre surface**,
sauf si la personne a demandé une variante du même. Deux emails d'affilée sur le même
fond donnent l'impression que le système n'a qu'une idée.

Dans ta recommandation, **nomme la surface et propose l'alternative en un membre de
phrase** : « je pars sur le vert de marque, l'encre marcherait aussi si tu veux quelque
chose de plus tranchant ». Ça coûte six mots et ça rend le choix réversible.

---

## 6. Un point non tranché

Les exemples 2 et 7 utilisent un rose très pâle sur 14 à 19 % de leur surface, proche
d'`orange.50` `#FEF4F2`. Cette valeur appartient à l'échelle de teintes de `design.md`,
mais **elle ne figure pas dans la table des surfaces**, qui est fermée.

Deux lectures possibles : soit ces designs anticipent une surface « Accent 2 très
doux » qui n'a pas encore été formalisée, soit ils s'écartent du système.

**En attendant l'arbitrage, tu ne reportes pas ce cas sur Accent 2 doux** — ce serait
ajouter un troisième chemin vers la même couleur. Tu prends la surface que le type
d'email appelle au chapitre 5, et tu signales en réserve que deux maquettes utilisent
une teinte hors table.

`design.md` est explicite là-dessus : devant un cas non couvert, on le signale plutôt
que de trancher seul.
