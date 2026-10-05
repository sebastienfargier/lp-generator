/**
 * Lecture du corpus Markdown, pour les TESTS seulement : ils vérifient que
 * `lib/brand` ne dérive pas des documents. Le code de `lib/brand` ne lit jamais
 * ces fichiers.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const root = process.cwd()

export const guidelinesDir = "ressources/brand/guidelines"

export const readCorpus = (path: string) => readFileSync(join(root, path), "utf8")

export type FrontMatter = {
  id: string
  statut: string
  owner: string
  portee_legale: string
  derniere_revue: string
  canaux: string[]
  audiences: string[]
}

/** Front matter des documents du corpus : scalaires et listes `- valeur`, rien de plus. */
export function parseFrontMatter(markdown: string): FrontMatter {
  const block = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1]
  if (!block) throw new Error("front matter absent")
  const scalar = (key: string) => new RegExp(`^${key}:\\s*(.*)$`, "m").exec(block)?.[1]?.trim() ?? ""
  const list = (key: string) => {
    const lines = new RegExp(`^${key}:\\n((?:  - .+\\n?)+)`, "m").exec(block)?.[1] ?? ""
    return [...lines.matchAll(/^  - (.+)$/gm)].map((match) => match[1]!.trim())
  }
  return {
    id: scalar("id"),
    statut: scalar("statut"),
    owner: scalar("owner"),
    portee_legale: scalar("portee_legale"),
    derniere_revue: scalar("derniere_revue"),
    canaux: list("canaux"),
    audiences: list("audiences"),
  }
}

export const body = (markdown: string) => markdown.replace(/^---\n[\s\S]*?\n---\n/, "")

/** Paires `mot_interdit` / `alternative` du lexique (04). */
export function parseForbiddenWords(markdown: string) {
  return [...markdown.matchAll(/- mot_interdit: "([^"]+)"\n\s+probleme: "([^"]+)"\n\s+alternative: "([^"]+)"/g)].map((match) => ({
    forbidden: match[1]!,
    problem: match[2]!,
    alternative: match[3]!,
  }))
}
