# Landing : shell global et sections

Une landing page est composée de deux choses distinctes :

**SHELL GLOBAL** (`LandingHeader` et `LandingFooter`)
- automatiquement présent, rendu par `LandingPageRenderer` autour des sections ;
- hors de `sections[]` : ni `LandingPageSchema`, ni `LandingGenerationDraft`, ni `section-catalog`, ni `nonGenerableSections` ne le connaissent ;
- non choisi par Claude : son contenu (logo, CTA du header ; liens du footer dans `footer-links.ts`) est fixé dans le code ;
- présenté à part dans `/library`, sous « Shell global » (`libraryShellParts` dans le registre), sans statut « Générable par IA » ni « Bibliothèque uniquement ».

**SECTIONS** (les lames)
- composables, présentes dans `LandingPageConfig.sections` ;
- éventuellement générables par Claude (voir ci-dessous).

Ce qui suit concerne l'ajout d'une **section**. Une nouvelle pièce du shell global suit un autre chemin : composant dans `components/landing/`, intégration dans le renderer, page `app/examples/<slug>`, entrée `libraryShellParts`, test (`landing-header.test.ts` sert de modèle).

# Ajouter une lame Landing

Une lame a deux statuts, **indépendants** :

- **A. Disponible** : elle existe dans le contrat, le renderer, le catalogue et la bibliothèque `/library`.
- **B. Générable par IA** : Claude peut en plus la choisir et la remplir.

> Une lame n'a pas besoin d'être générable par IA pour appartenir à la bibliothèque.

`ProductHero` et `ProductGrid` sont de statut A seulement : elles exigent des données commerciales (formation, prix, partenaire) sans source contrôlée.

Les tests `lib/landing/tests/section-alignment.test.ts` (et un type dans `section-generation.ts`) échouent tant qu'une étape de A ou la décision de B manque.

## Étape A — rendre la lame disponible

1. **Composant** : `components/sections/<type>/` (+ `index.ts`). Le dossier porte le nom du `type`.
2. **Props sérialisables** : uniquement des données (texte, images `{src, alt}`, actions `{label, href}`) ; ni JSX, ni `className`, ni fonction.
3. **Schéma Zod** : `lib/landing/schemas.ts`, un `…ConfigSchema` strict, puis `section("<type>", …)` dans `LandingPageSectionSchema`. Compléter le `switch` de `sectionActions` s'il y a des CTA.
4. **Type `LandingPageConfig`** : exporter le type de config dans `lib/landing/types.ts` (le type de section en découle).
5. **Renderer** : un `case "<type>"` dans `components/landing/section-renderer.tsx` (exhaustif : `assertNever`).
6. **Section catalog** : une entrée dans `lib/landing/section-catalog.ts` (rôle, `bestFor`, `avoidWhen`, `guidance`), avec le même `name` que la bibliothèque.
7. **Page example** : `app/examples/<type>/page.tsx`, avec les vrais composants et des données de démonstration.
8. **Entrée `/library`** : une entrée dans `components/library/registry.ts` (`slug` = `type`, `name`, catégorie, description, `importPath`, `example`, `usage`). Le statut IA s'affiche tout seul.
9. **Tests** : `npm run test:landing`. Le test d'alignement signale ce qui manque ; ajouter un test du schéma (cas valide, cas refusé).

## Étape B — décider si Claude peut la générer

Questions, dans l'ordre :

- Claude possède-t-il toutes les données nécessaires ?
- La lame exige-t-elle un prix, un produit, un partenaire ou un fait commercial ?
- Les images nécessaires sont-elles contrôlées (`lib/landing/image-catalog.ts`) ?
- Les destinations des CTA sont-elles contrôlées (`lib/landing/destinations.ts`) ?
- Peut-on écrire un Draft compact (sans option, sans id, sans `src`/`href`) ?
- Le résolveur peut-il reconstruire le contrat final sans rien inventer ?

**Si oui — la lame devient générable** :

1. Branche dans `lib/landing/generation-draft.ts` (strict, sans propriété optionnelle).
2. `case` dans `lib/landing/draft-resolver.ts` (exhaustif).
3. Ressources contrôlées si besoin (images, destinations) ; vérifier la taille du schéma de transport (`anthropic-schema.test.ts`).
4. Tests du Draft et du résolveur (`generation-draft.test.ts`, `draft-resolver.test.ts`).

Le statut « Générable par IA » en découle : il est dérivé du Draft, rien à déclarer.

**Si non — exclusion explicite** : ajouter une entrée **avec raison** dans `nonGenerableSections` (`lib/landing/section-generation.ts`). La lame reste dans le contrat, le renderer et la bibliothèque, mais n'est pas proposée à Claude. La raison s'affiche sur sa page `/library/<slug>`.

Sans l'une de ces deux issues, ni la compilation ni les tests ne passent : une lame ne peut pas disparaître silencieusement de la décision IA.

## Hors périmètre

Les pages `/examples` utilisent les composants directement (pas `LandingPageConfig`) ; les migrer est une amélioration possible, pas un prérequis.
