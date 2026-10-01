/**
 * Adaptation du JSON Schema de sortie au transport Anthropic (Structured
 * Outputs, `output_config.format`). Cette transformation ne touche ni
 * `LandingPageSchema` ni `buildLandingAiPrompt` : elle reçoit le JSON Schema
 * dérivé de Zod et en produit une copie que l'API accepte.
 *
 * Le schéma de transport ne sert qu'à CONTRAINDRE la génération. Il est plus
 * souple que le contrat : tout ce qu'il retire est rattrapé par
 * `LandingPageSchema` et `validateGeneratedLanding`, qui restent obligatoires
 * après la réponse.
 *
 * Source : documentation Anthropic « Structured outputs », vérifiée pour ce
 * checkpoint, et types du SDK installé.
 * - Supportés : types de base, `enum`, `const`, `anyOf`, `allOf`, `$ref`,
 *   `$defs`, `required`, `default`, `description`, `title`, `format`
 *   (date-time, time, date, duration, email, hostname, uri, ipv4, ipv6,
 *   uuid), `minItems` à 0 ou 1, `pattern` (sous-ensemble), et
 *   `additionalProperties: false`, obligatoire sur tout objet.
 * - Non supportés : `oneOf`, `minimum`, `maximum`, `exclusiveMinimum`,
 *   `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `maxItems`,
 *   `uniqueItems`, `minItems` au-delà de 1, `additionalProperties` autre que
 *   `false`, `$schema`, et dans les patterns : `\S` (et `\D`, `\W`), `\b`,
 *   références arrière, lookahead et lookbehind, grands intervalles `{n,m}`.
 *
 * La transformation est une liste blanche : un mot-clé inconnu est retiré
 * plutôt que de faire rejeter la requête.
 *
 * `oneOf` → `anyOf` est sûr ici : les sections d'une page sont des objets
 * stricts discriminés par un `type` constant et distinct. Un objet ne peut
 * correspondre qu'à une seule branche, donc « exactement une » et « au moins
 * une » désignent les mêmes objets. Un test le vérifie, et Zod revérifie
 * l'union discriminée après la réponse.
 */

export type JsonSchema = { [key: string]: unknown }

/** Limites documentées, cumulées sur une requête. */
export const anthropicSchemaLimits = { optionalParameters: 24, unionParameters: 16 } as const

const supportedFormats: ReadonlySet<string> = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
])

/** Plus grand intervalle `{n,m}` conservé : au-delà, le support n'est pas établi. */
const maxQuantifierBound = 10

/**
 * Le pattern appartient-il au sous-ensemble regex supporté ? Prudent : dans le
 * doute, il est retiré, et Zod le contrôle après la réponse.
 */
export function isSupportedAnthropicPattern(pattern: string): boolean {
  if (/\\[SDWbB]/.test(pattern)) return false
  if (/\\[1-9]|\\k</.test(pattern)) return false
  if (/\(\?[=!<]/.test(pattern)) return false
  for (const [, min, max] of pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    if (Number(min) > maxQuantifierBound || (max !== undefined && max !== "" && Number(max) > maxQuantifierBound)) return false
  }
  return true
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const mapSchemas = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((entry) => (isRecord(entry) ? transform(entry) : entry))

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
      case "definitions":
        result[key] = mapNamed(value)
        break
      case "items":
        result.items = isRecord(value) ? transform(value) : value
        break
      case "minItems":
        if (value === 0 || value === 1) result.minItems = value
        break
      case "format":
        if (typeof value === "string" && supportedFormats.has(value)) result.format = value
        break
      case "pattern":
        if (typeof value === "string" && isSupportedAnthropicPattern(value)) result.pattern = value
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
      // additionalProperties (fixé ci-dessous), $schema, minimum, maximum,
      // exclusiveMinimum, exclusiveMaximum, multipleOf, minLength, maxLength,
      // maxItems, uniqueItems et tout mot-clé inconnu : retirés.
      default:
        break
    }
  }
  if (result.type === "object" || "properties" in result) result.additionalProperties = false
  return result
}

/** Copie du JSON Schema de sortie, adaptée au transport Anthropic. N'altère pas l'original. */
export function toAnthropicJsonSchema(outputSchema: JsonSchema): JsonSchema {
  return transform(outputSchema)
}
