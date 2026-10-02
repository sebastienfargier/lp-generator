import type { LandingGenerationContext } from "./generation-context"

/**
 * Vue IA : ce que Claude reçoit du contexte d'une génération. Projection
 * compacte du contexte riche de l'application ; les sources (catalogue,
 * règles, ressources) ne sont ni raccourcies ni modifiées, seul ce qui est
 * sérialisé dans le message l'est.
 *
 * Le contexte complet garde ce dont l'application a besoin (chemins d'image,
 * URL, libellés, ids de règles, catégories) : le modèle désigne les ressources
 * par id et n'a besoin de rien de plus. Module pur, sérialisable, sans React ni
 * SDK.
 *
 * Choix de projection :
 * - sections : `category` et `isHero:false` ne sont pas envoyés (la décision de
 *   choix vient de la description et des usages) ; `isHero:true` porte le
 *   placement « première section » des heroes ; `guidance` vide est omise.
 *   Les textes sont recopiés tels quels.
 * - règles : seulement leur texte, sélectionnées par id stable. Les autres
 *   restent dans la source : leur contenu est porté ailleurs (système, schéma
 *   du Draft ou règles de page de `LandingPageSchema`, voir `ai-view.test.ts`).
 * - images : `{ id, hint }`, jamais le `alt` (texte alternatif de la page).
 * - destinations : `{ id, usage }` ; l'URL et le libellé restent côté application.
 */

/** Règles de composition envoyées au modèle, par id. */
export const aiViewCompositionRuleIds = [
  "hero-by-message",
  "closing-last",
  "no-exhaustive-use",
  "editorial-purpose",
  "no-redundancy",
] as const

/** Règles de ressources envoyées au modèle, par id. */
export const aiViewResourceRuleIds = ["image-reuse", "cta-label", "no-contact"] as const

const compositionIds: ReadonlySet<string> = new Set(aiViewCompositionRuleIds)
const resourceIds: ReadonlySet<string> = new Set(aiViewResourceRuleIds)

export function buildLandingAiView(context: LandingGenerationContext) {
  return {
    sections: context.sections.map((section) => ({
      type: section.type,
      ...(section.isHero ? { isHero: true as const } : {}),
      description: section.description,
      bestFor: section.bestFor,
      avoidWhen: section.avoidWhen,
      ...(section.guidance.length > 0 ? { guidance: section.guidance } : {}),
    })),
    destinations: context.destinations.map(({ id, usage }) => ({ id, usage })),
    images: context.images.map(({ id, hint }) => ({ id, hint })),
    rules: {
      composition: context.rules.composition.filter((entry) => compositionIds.has(entry.id)).map((entry) => entry.rule),
      resources: context.rules.resources.filter((entry) => resourceIds.has(entry.id)).map((entry) => entry.rule),
    },
  }
}

export type LandingAiView = ReturnType<typeof buildLandingAiView>
