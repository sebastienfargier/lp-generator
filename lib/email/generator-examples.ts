/**
 * Exemples de brief de /email-generator : les trois scénarios du jeu d'essai
 * que le moteur V1 sait générer, présentés comme « Exemples ». Les autres
 * briefs du jeu d'essai (Promotion, campagnes visuelles) restent dans
 * `demo-generator.ts` pour les tests et la bibliothèque, mais ne sont pas
 * proposés ici : le moteur les refuse.
 *
 * Module serveur (il lit le jeu d'essai) : la page passe les exemples au client.
 */
import { emailDemoPresets } from "./demo-generator"
import type { EmailGeneratorExample } from "./generator-form"

const exampleIds = ["reconversion", "accompagnement", "evolution"] as const

export function buildEmailGeneratorExamples(): EmailGeneratorExample[] {
  return exampleIds.map((id) => {
    const preset = emailDemoPresets.find((entry) => entry.id === id)
    if (!preset) throw new Error(`Exemple inconnu : ${id}`)
    const { campaignName, subject, brief, audience, objective } = preset.brief
    if (objective === "promotion") throw new Error(`L'exemple ${id} n'est pas générable.`)
    return { id, label: preset.label, form: { campaignName, subject, brief, audience, objective, facts: "" } }
  })
}
