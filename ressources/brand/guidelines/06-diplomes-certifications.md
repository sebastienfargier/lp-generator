---
id: diplomes-certifications
titre: Diplômes et certifications
owner: Aurélie Lasselin
statut: en_revue
portee_legale: True
derniere_revue: 2026-10-02
canaux:
  - tous
audiences:
  - tous
source: Guidelines Communication Studi — section 5
---
# Diplômes et certifications

## Niveaux de diplôme

La correspondance entre niveaux RNCP et années post-bac est réglementée. Ne jamais inventer une équivalence.

| Années / Bac | Niveau | Diplôme d'État | Titre RNCP |
|---|---|---|---|
| — | Niv 3 | CAP | — |
| Bac | Niv 4 | Bac Pro | Pré-graduate |
| Bac +2 | Niv 5 | BTS | Graduate |
| Bac +3 / +4 | Niv 6 | DCG | Bachelor |
| Bac +5 | Niv 7 | DSCG | MBA / Mastère |

Exemple de formulation correcte pour un Bac+2 : « Formation Niveau 5 (Bac+2) » ou « Diplôme Bac+2 ».

## « Reconnu par l'État » — règle clé

C'est la règle la plus souvent violée en communication. **Les diplômes sont reconnus, pas les formations.**

```yaml
id: reconnu-par-etat
type: regle_terminologique
declencheur: "toute mention de reconnaissance par l'État"
a_utiliser:
  - "Diplôme(s) reconnu(s) par l'État"
  - "Titre RNCP de niveau X"
  - "Certification professionnelle de niveau X"
a_proscrire:
  - "Formation(s) reconnue(s) par l'État"
  - "Diplôme(s) d'État certifié(s)"
  - "Diplôme certifié par l'État"
  - "Le niveau de nos parcours est certifié par l'État français"
  - "Certificat(s) reconnu(s) par l'État"
pourquoi: >
  Studi est un organisme de formation privé qui délivre des titres
  enregistrés au RNCP (Répertoire National des Certifications
  Professionnelles). Ce sont ces titres qui sont reconnus par l'État
  — la formation elle-même ne l'est pas. Confondre les deux constitue
  une fausse représentation qui peut être sanctionnée par France
  Compétences et la DGCCRF.
```

## Intitulés de formation

Toujours utiliser les intitulés officiels du catalogue Studi, sans les couper ni les modifier. Exemple : écrire « CAP Boulanger » et non « CAP Boulangerie ».

## Le terme « Master » — interdiction absolue

```yaml
id: terme-master-interdit
type: terme_reglemente
declencheur: "toute mention, même comparative ou implicite, du mot Master"
a_utiliser:
  - "Titre RNCP de niveau 7"
  - "Certification professionnelle de niveau 7"
  - "Mastère ou MBA (uniquement si c'est l'intitulé officiel Studi)"
a_proscrire:
  - "Master"
  - "Niveau master"
  - "Équivalent master"
  - "Master-like"
  - "Diplôme de type Master"
avertissement: >
  Le mot "Master" est réservé exclusivement aux diplômes nationaux
  délivrés par l'État français. Son utilisation dans nos communications,
  même à titre comparatif ou implicite, est strictement interdite et
  engage la responsabilité pénale de Studi.
```

## Garantie « Diplômé ou Remboursé »

```yaml
id: garantie-diplome-rembourse
type: disclaimer_conditionnel
declencheur: "mention de la garantie Diplômé ou Remboursé"
a_utiliser:
  - "Garantie Diplômé ou Remboursé*"
  - "Diplômé ou Remboursé* (avec disclaimer *Soumis à conditions)"
a_proscrire:
  - "Diplôme garanti"
  - "Diplôme garanti ou remboursé (sans disclaimer)"
  - "Utiliser la formule sans l'astérisque et le disclaimer"
disclaimer_obligatoire: "*Soumis à conditions."
```
