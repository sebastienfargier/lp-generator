/**
 * Adaptation du JSON Schema du Draft Email au transport Anthropic (Structured
 * Outputs, `output_config.format`). Elle ne touche ni le schéma Zod du Draft ni
 * le prompt : elle en produit une copie que l'API accepte.
 *
 * Le schéma de transport ne sert qu'à CONTRAINDRE la génération ; ce qu'il
 * retire est rattrapé par `EmailGenerationDraftSchema`, le resolver, puis
 * `schemas.ts` et la validation finale, toujours obligatoires après la réponse.
 *
 * Source : documentation Anthropic « Structured outputs » (même base que le
 * domaine Landing, qui a son propre module : rien n'est partagé).
 * - Supportés : types de base, `enum`, `const`, `anyOf`, `allOf`, `$ref`,
 *   `$defs`, `required`, `default`, `description`, `title`, `minItems` à 0 ou
 *   1, et `additionalProperties: false`, obligatoire sur tout objet.
 * - Non supportés : `oneOf`, `minLength`, `maxLength`, `maxItems`,
 *   `minItems` au-delà de 1, `$schema`, patterns avancés.
 *
 * Conséquence pour le Draft : les longueurs d'items (3, 4, 3) et de `blocks`
 * (2 à 5) ne sont plus portées par la grammaire. Le prompt les énonce ; Zod
 * les impose après la réponse (un mauvais compte donne « Draft invalide »).
 *
 * `oneOf` → `anyOf` est sûr ici : les blocs sont des objets stricts
 * discriminés par un `type` constant et distinct, donc « exactement une » et
 * « au moins une » désignent les mêmes objets (testé ; Zod revérifie l'union).
 */

export type JsonSchema = { [key: string]: unknown }

const isRecord = (value: unknown): value is JsonSchema => typeof value === "object" && value !== null && !Array.isArray(value)

const mapSchemas = (value: unknown) => (Array.isArray(value) ? value : []).map((entry) => (isRecord(entry) ? transform(entry) : entry))

const mapNamed = (value: unknown) =>
  Object.fromEntries(Object.entries(isRecord(value) ? value : {}).map(([name, schema]) => [name, isRecord(schema) ? transform(schema) : schema]))

function transform(schema: JsonSchema): JsonSchema {
  if ("oneOf" in schema && "anyOf" in schema) {
    throw new Error("oneOf et anyOf sur le même noeud : la conversion en anyOf ne serait pas sûre.")
  }
  const result: JsonSchema = {}
  for (const [key, value] of Object.entries(schema)) {
    switch (key) {
      case "oneOf":
        result.anyOf = mapSchemas(value)
        break
      case "anyOf":
      case "allOf":
        result[key] = mapSchemas(value)
        break
      // Tables de noms : les clés sont des noms, jamais des mots-clés à filtrer.
      case "properties":
      case "$defs":
        result[key] = mapNamed(value)
        break
      case "items":
        result.items = isRecord(value) ? transform(value) : value
        break
      case "minItems":
        if (value === 0 || value === 1) result.minItems = value
        break
      case "type":
      case "required":
      case "enum":
      case "const":
      case "default":
      case "description":
      case "title":
      case "$ref":
        result[key] = structuredClone(value)
        break
      // $schema, maxItems, minLength, maxLength, pattern, format et tout
      // mot-clé inconnu : retirés (liste blanche).
      default:
        break
    }
  }
  if (result.type === "object" || "properties" in result) result.additionalProperties = false
  return result
}

/** Copie du JSON Schema du Draft, adaptée au transport Anthropic. N'altère pas l'original. */
export function toAnthropicEmailJsonSchema(schema: JsonSchema): JsonSchema {
  return transform(schema)
}
