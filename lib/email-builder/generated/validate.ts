/**
 * Validation d'une `GeneratedBlockSpec` : PURE, tout ou rien (une spec invalide est
 * rejetée entièrement, jamais corrigée en silence). Elle valide UNE lame ; la limite
 * de lames générées PAR EMAIL (`maxGeneratedBlocksPerEmail`) appartient à
 * l'intégration au document.
 *
 * Couches, dans cet ordre :
 *   1. taille (octets UTF-8) — avant tout parcours, donc une charge énorme ne coûte rien ;
 *   2. version — une version inconnue n'est pas interprétée ;
 *   3. mesures du JSON brut (profondeur, nombre de nœuds) — des messages précis ;
 *   4. schéma strict (primitives, enums, clés inconnues, ratio et nombre d'enfants) ;
 *   5. sémantique (slots : grammaire, réservés, unicité, plafond ; chevauchement).
 *
 * Aucun HTML n'est produit ici : ce module ne sait pas rendre.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { z } from "zod"

import { deriveGeneratedSlots, slotNameProblem, walkNodes, type GeneratedSlot } from "./slots"
import { GeneratedBlockSpecSchema, type GeneratedBlockSpec, type GeneratedNode } from "./schema"
import { generatedLimits, generatedSpecVersion } from "./tokens"

export type GeneratedSpecIssueCode = "size" | "version" | "depth" | "nodes" | "schema" | "slots" | "slot-name" | "slot-reserved" | "slot-duplicate" | "overlap"
export type GeneratedSpecIssue = { code: GeneratedSpecIssueCode; path: string; message: string }

export type GeneratedSpecStats = { nodes: number; depth: number; slots: number; bytes: number }
export type GeneratedSpecResult = { ok: true; spec: GeneratedBlockSpec; slots: GeneratedSlot[]; stats: GeneratedSpecStats } | { ok: false; issues: GeneratedSpecIssue[] }

const fail = (...issues: GeneratedSpecIssue[]): GeneratedSpecResult => ({ ok: false, issues })
const issue = (code: GeneratedSpecIssueCode, path: string, message: string): GeneratedSpecIssue => ({ code, path, message })

const encoder = new TextEncoder()
/** Taille de la spec sérialisée, en octets UTF-8 (« é » en vaut 2, un emoji 4). */
export const generatedSpecBytes = (value: unknown): number => encoder.encode(JSON.stringify(value) ?? "").length

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Profondeur et nombre de nœuds d'une entrée BRUTE (avant le schéma), sans suivre plus loin qu'il ne faut. */
function measure(input: unknown): { nodes: number; depth: number } {
  let nodes = 0
  let depth = 0
  const visit = (value: unknown, level: number) => {
    if (!isRecord(value)) return
    nodes += 1
    depth = Math.max(depth, level)
    if (nodes > 1000 || level > 64) return
    if (Array.isArray(value.children)) value.children.forEach((child) => visit(child, level + 1))
  }
  if (isRecord(input) && isRecord(input.root) && Array.isArray(input.root.children)) input.root.children.forEach((child) => visit(child, 1))
  return { nodes, depth }
}

export function validateGeneratedBlockSpec(input: unknown): GeneratedSpecResult {
  let bytes: number
  try {
    bytes = generatedSpecBytes(input)
  } catch {
    return fail(issue("schema", "spec", "La spec n'est pas du JSON sérialisable."))
  }
  if (bytes > generatedLimits.maxBytes) return fail(issue("size", "spec", `La spec pèse ${bytes} octets : ${generatedLimits.maxBytes} au plus.`))

  if (isRecord(input) && "specVersion" in input && input.specVersion !== generatedSpecVersion) return fail(issue("version", "specVersion", `Version de spec inconnue : seule la version ${generatedSpecVersion} existe.`))

  const { nodes, depth } = measure(input)
  if (depth > generatedLimits.maxDepth) return fail(issue("depth", "root", `La spec descend sur ${depth} niveaux : ${generatedLimits.maxDepth} au plus sous la racine.`))
  if (nodes > generatedLimits.maxNodes) return fail(issue("nodes", "root", `La spec compte ${nodes} nœuds : ${generatedLimits.maxNodes} au plus.`))

  const parsed = GeneratedBlockSpecSchema.safeParse(input, { error: z.locales.fr().localeError })
  if (!parsed.success) return fail(...parsed.error.issues.map((entry) => issue("schema", entry.path.join(".") || "spec", entry.message)))
  const spec = parsed.data as GeneratedBlockSpec

  const issues: GeneratedSpecIssue[] = []
  const slots = deriveGeneratedSlots(spec)
  if (slots.length > generatedLimits.maxSlots) issues.push(issue("slots", "root", `La spec déclare ${slots.length} slots : ${generatedLimits.maxSlots} au plus.`))
  const seen = new Set<string>()
  for (const slot of slots) {
    const problem = slotNameProblem(slot.name)
    if (problem) issues.push(issue(problem.problem === "reserved" ? "slot-reserved" : "slot-name", slot.name, problem.message))
    if (seen.has(slot.name)) issues.push(issue("slot-duplicate", slot.name, `Le slot « ${slot.name} » est déclaré deux fois : chaque nœud a son propre slot.`))
    seen.add(slot.name)
  }
  // Un chevauchement n'a de sens que sur une carte placée juste après une image.
  const checkOverlap = (children: readonly GeneratedNode[]) => {
    children.forEach((node, index) => {
      if (node.t === "card" && node.overlap > 0 && children[index - 1]?.t !== "image") issues.push(issue("overlap", "card", "Une carte ne chevauche qu'une image placée juste avant elle."))
      if ("children" in node) checkOverlap(node.children)
    })
  }
  checkOverlap(spec.root.children)
  if (issues.length > 0) return fail(...issues)

  return { ok: true, spec, slots, stats: { nodes: walkNodes(spec).length, depth, slots: slots.length, bytes } }
}

/**
 * Ce que la spec EXIGE d'un futur renderer, dérivé sans polluer la spec : le
 * validateur de compatibilité décidera plus tard entre « générée » et « approchée ».
 */
export function deriveGeneratedCapabilities(spec: GeneratedBlockSpec) {
  const nodes = walkNodes(spec)
  return {
    usesOverlap: nodes.some((node) => node.t === "card" && node.overlap > 0),
    maxColumns: Math.max(1, ...nodes.map((node) => (node.t === "columns" ? node.children.length : 1))),
    imageFormats: [...new Set(nodes.flatMap((node) => (node.t === "image" ? [node.format] : [])))],
  }
}
