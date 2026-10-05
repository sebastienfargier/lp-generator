# Écrire la copy

Les guidelines fixent ce qu'on a le droit d'écrire. Ce fichier dit **comment bien
l'écrire**. Les deux ne se contredisent jamais : quand un principe d'ici se heurte à une
règle des guidelines, la règle gagne.

---

## 1. Les quatre principes

### Le bénéfice avant la caractéristique

Une caractéristique décrit le produit. Un bénéfice décrit ce que la personne y gagne.
On écrit le second, et on garde le premier comme preuve juste derrière.

| Caractéristique | Bénéfice |
|---|---|
| seize séances individuelles de trente minutes | quelqu'un à qui poser la question qui bloque, seize fois dans l'année |
| accès aux contenus 24h/24 | réviser à 6 h du matin ou à 23 h, sans demander la permission |
| paiement échelonné sur 36 mois | une mensualité qui tient dans un budget sans le déformer |
| plus de 400 fiches métiers | savoir ce que fait vraiment quelqu'un qui exerce le métier, avant de s'engager |

L'ordre compte : **bénéfice, puis preuve chiffrée**. « Vous n'avez pas à poser de congé :
les cours sont accessibles 24h/24 » se lit mieux que l'inverse.

### Le centrage sur la personne

Le sujet des phrases est la personne, pas Studi. Compte les *vous* et les *nous* : s'il
y a plus de *nous*, la copy parle de l'école au lieu de parler du lecteur.

*Studi vous accompagne de A à Z* parle de Studi. *Vous avancez avec quelqu'un qui répond
sous 48 h* parle du lecteur, et dit la même chose en étant vérifiable.

### Le concret

Un mot abstrait se remplace par ce qu'il recouvre. C'est la table de traduction du
chapitre 9 de `studi-services.md`, et elle vaut au-delà de ses lignes : *à votre rythme*
devient une durée, *nos experts* devient un délai de réponse, *flexible* devient une
situation réelle — poser une question à 23 h, réviser dans le train.

Le test : si la phrase pourrait figurer sur le site d'un concurrent sans changer un mot,
elle n'est pas assez concrète.

### La promesse mesurée

C'est le point où Studi a le plus à gagner. Le réflexe du marché est la promesse forte ;
les guidelines l'interdisent, et ce n'est pas seulement une contrainte juridique — une
promesse invérifiable se lit comme du bruit publicitaire, et une information vérifiable
se lit.

*Décrochez le job de vos rêves* ne veut rien dire. *Plus que trois mois pour vous
inscrire au DCG* est une information, et elle fait agir.

---

## 2. Ce que les maquettes font bien

La copy des neuf maquettes de `exemples-email-design` est du texte de calage : elle n'a
pas été validée, et son contenu ne se recopie pas. **Mais sa manière est un bon modèle**,
et elle mérite d'être imitée.

Ce qu'elles font, et qu'il faut reproduire :

- **court** — une idée par bloc, pas de paragraphe de remplissage ;
- **concret** — « Prochaine rentrée : 12 octobre », « Plus que 2 jours », « en plusieurs
  fois sans frais jusqu'à 36 mois » ;
- **orienté bénéfice** — « Votre prochaine évolution, maintenant 20 % moins chère » dit
  ce que la personne gagne, pas ce que Studi propose ;
- **sans promesse démesurée** — aucune ne promet un emploi, un salaire ni une réussite.

Ce qu'on n'en reprend pas : les sujets traités, les chiffres, les intitulés. Seulement
le registre.

---

## 3. Les remises

La forme par défaut est **« jusqu'à −X % »**. Elle couvre le cas réel, où le taux dépend
du profil et du parcours, et elle est la seule formulation que les guidelines valident
sans condition jusqu'à 30 %.

**Les taux pratiqués vont jusqu'à 40 et 50 %.** Au-delà de 30 %, la validation d'Anaig
EPIE en acquisition ou d'Olivia Matmuller en CRM est requise — tu écris le taux que le
brief donne, et tu rappelles la validation en réserve.

**Un taux fixe — « −30 % » sans le « jusqu'à » — existe**, mais il demande lui aussi une
validation préalable, parce qu'il engage un montant. Tu ne le choisis jamais de
toi-même : si le brief écrit « jusqu'à », tu gardes « jusqu'à ».

Le disclaimer de bourse d'études accompagne toujours la mention, au caractère près.

### Le « jusqu'à » en objet

Il allonge, c'est vrai, et un objet se joue sur quarante caractères. Trois parades, dans
cet ordre :

1. **Mettre le taux en tête et couper le complément.** « Jusqu'à −50 % sur votre
   formation » fait 34 caractères ; « sur votre formation » peut tomber, le contexte est
   dans le préheader.
2. **Déplacer la remise dans le préheader** et donner l'objet à autre chose — une
   échéance, une situation. C'est souvent le meilleur choix : un objet qui annonce une
   remise se lit comme une publicité, un objet qui annonce une échéance se lit.
3. **Garder « jusqu'à −X % » seul**, sans verbe ni complément, en tête d'objet.

Ce qu'on ne fait pas pour gagner des caractères : supprimer le « jusqu'à » quand le
brief l'a écrit, ni déplacer la nuance dans l'astérisque. L'astérisque porte le
disclaimer, pas la correction d'une promesse inexacte.

---

## 4. L'article de blog en fin d'email

Le blog est du contenu, pas une offre. Il sert à donner de la valeur sans rien demander,
et c'est particulièrement utile en fin de newsletter ou de lifecycle de début de
séquence, là où un second argument commercial ferait reculer.

**Ce n'est pas un second CTA.** La règle du CTA principal unique tient : le bouton reste
le bouton. Un article se pose en **lien texte**, dans une lame `story-text-only` ou dans
une lame de liste, sous le corps et au-dessus du footer.

| Type d'email | Article de blog |
|---|---|
| Newsletter | **oui**, c'est même la matière naturelle — jusqu'à trois articles |
| Lifecycle, début de séquence | **oui**, un seul, en fin d'email |
| Lifecycle, fin de séquence | **non**, le métier est choisi, un article fait reculer |
| Promo | **non**, il disperse le clic |
| Transactionnel | **non** |

**Tu ne cumules pas.** Le Parcours Découverte, un live et un article sont trois liens
secondaires concurrents : il n'en vit qu'un seul par email.

**L'URL se vérifie avant d'être écrite.** Les listes du blog tournent. Tu ouvres la
catégorie, tu relèves le titre exact et son URL. Sans vérification possible, tu lies la
page de catégorie — elle, elle est stable — et tu le signales en réserve. La liste des
dix catégories est dans `sources-studi.md`.

**Tu choisis l'article pour la cible, pas pour le sujet du jour.** Un article Parcoursup
n'a rien à faire dans un email adressé à des personnes en poste, et Studi Team ou RSE ne
vont dans aucun email d'acquisition.

---

## 5. La relecture avant livraison

Cinq vérifications, dans l'ordre. Elles prennent dix secondes et évitent l'essentiel.

1. **Compter les *vous* et les *nous*.** Plus de *nous* que de *vous* : la copy parle de
   l'école, à réécrire.
2. **Chercher la phrase la plus longue.** Au-delà de vingt mots, la couper.
3. **Chercher le mot le plus abstrait.** Le remplacer par ce qu'il recouvre.
4. **Vérifier qu'il y a un seul CTA principal**, et que son libellé dit ce qui va se
   passer au clic.
5. **Relire l'objet seul**, comme il apparaîtra dans une boîte tronquée à quarante
   caractères. S'il ne dit rien à ce stade, le réécrire.

---

## 6. Ce que tu dis en réserve

La réserve porte tes recommandations de copy, pas seulement les alertes. Deux ou trois
lignes, concrètes :

- **ce que tu as optimisé** — « j'ai retourné l'accroche pour mettre le bénéfice avant
  la caractéristique » ;
- **ce que tu testerais** — « l'objet 2 est plus sobre, je le testerais contre le 1 sur
  cette cible » ;
- **ce qui manque et qui porterait** — « un chiffre d'insertion validé tiendrait
  l'argument mieux que la formulation actuelle ».

Tu ne commentes pas ce qui va bien. La réserve sert à faire avancer, pas à rendre compte.
