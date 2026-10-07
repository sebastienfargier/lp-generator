/**
 * Modèles du Builder : les compositions Studi qui existent déjà dans le domaine
 * Email (les fixtures de recettes R1, R2 et R3, écrites à la main, résolues par
 * `composeEmailRecipe`), chacune enveloppée dans un EmailDocument. SERVEUR
 * UNIQUEMENT (resolver et fixtures du domaine Email) ; la page en passe une copie
 * JSON au navigateur.
 *
 * Un modèle est un POINT DE DÉPART, pas un formulaire : il produit un document,
 * puis n'a plus aucun comportement spécial (même Builder, mêmes opérations).
 * Seuls les modèles qui se résolvent réellement en un document exploitable sont
 * proposés : aucun faux catalogue.
 *
 * Pas de modèle « Promotion » : une promotion repose sur des Promotion Facts
 * (valeur, code, date de fin) que seule une saisie dédiée peut fournir ; les
 * fixtures n'ont que des valeurs de démonstration, et la mention légale de leur
 * date ne se modifie pas dans le Builder. Elle viendra avec cette saisie.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailRecipeFixtures, resolveEmailRecipeFixture } from "../email/recipe-fixtures"
import { createEmailDocument, type EmailDocument } from "./document"
import { validateDocumentIntegrity } from "./integrity"

export type BuilderTemplate = {
  id: string
  /** « Newsletter », « Découverte »… : la famille de composition. */
  title: string
  /** Ce qui distingue ce modèle des autres de sa famille. */
  description: string
  /** Nombre de lames du point de départ. */
  blockCount: number
  document: EmailDocument
}

const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

let cached: BuilderTemplate[] | undefined

/** Les modèles qui produisent un document valide, dans l'ordre des fixtures. */
export function builderTemplates(): BuilderTemplate[] {
  cached ??= emailRecipeFixtures.flatMap((fixture) => {
    const resolution = resolveEmailRecipeFixture(fixture.id)
    if (resolution.status !== "resolved") return []
    const [title = fixture.label, ...rest] = fixture.label.split(" — ")
    const claimIds = resolution.claims.map((claim) => claim.id)
    const document = createEmailDocument(
      { ...resolution.config, name: `Nouvel email · ${title}` },
      { ...(claimIds.length > 0 ? { facts: { claimIds } } : {}), provenance: { origin: "recipe", recipe: fixture.recipe } },
    )
    if (validateDocumentIntegrity(document).length > 0) return []
    return [{ id: fixture.id, title, description: capitalized(rest.join(" — ")), blockCount: document.config.blocks.length, document }]
  })
  return cached
}
