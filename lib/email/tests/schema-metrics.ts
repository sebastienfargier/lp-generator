/** Mesure de complexité d'un JSON Schema (proxies de grammaire) : `$ref` dépliés, `$defs` comptés à l'usage. */
export type JsonSchema = Record<string, unknown>

export function measure(schema: JsonSchema) {
  const defs = (schema.$defs ?? {}) as Record<string, unknown>
  const counts = { objects: 0, properties: 0, optional: 0, enums: 0, enumValues: 0, constants: 0, patterns: 0, unions: 0, alternatives: 0, depth: 0 }
  const walk = (node: unknown, depth: number): void => {
    if (Array.isArray(node)) return void node.forEach((entry) => walk(entry, depth))
    if (!node || typeof node !== "object") return
    const object = node as Record<string, unknown>
    counts.depth = Math.max(counts.depth, depth)
    if (typeof object.$ref === "string" && object.$ref.startsWith("#/$defs/")) return walk(defs[object.$ref.slice(8)], depth)
    if (object.properties && typeof object.properties === "object") {
      const keys = Object.keys(object.properties)
      counts.objects += 1
      counts.properties += keys.length
      counts.optional += keys.length - ((object.required as string[] | undefined)?.length ?? 0)
    }
    if (Array.isArray(object.enum)) {
      counts.enums += 1
      counts.enumValues += object.enum.length
    }
    if (object.const !== undefined) counts.constants += 1
    if (object.pattern) counts.patterns += 1
    const union = (object.anyOf ?? object.oneOf) as unknown[] | undefined
    if (union) {
      counts.unions += 1
      counts.alternatives += union.length
    }
    for (const [key, value] of Object.entries(object)) if (key !== "$defs") walk(value, depth + 1)
  }
  walk(schema, 0)
  const inline = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(inline)
    if (!node || typeof node !== "object") return node
    const object = node as Record<string, unknown>
    if (typeof object.$ref === "string" && object.$ref.startsWith("#/$defs/")) return inline(defs[object.$ref.slice(8)])
    return Object.fromEntries(Object.entries(object).filter(([key]) => key !== "$defs").map(([key, value]) => [key, inline(value)]))
  }
  return { ...counts, bytes: JSON.stringify(schema).length, expandedBytes: JSON.stringify(inline(schema)).length }
}

