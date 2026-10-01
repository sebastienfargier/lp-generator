/**
 * Smoke test MANUEL : un seul appel réel à Claude pour la génération Landing.
 *
 *   npm run smoke:landing
 *
 * Il n'est exécuté ni par `test:landing`, ni par `test:email`, ni par `lint`,
 * ni par `build`. Il exige `ANTHROPIC_API_KEY` (lue dans `.env.local` ou
 * l'environnement) et utilise `ANTHROPIC_MODEL` s'il est défini. La clé n'est
 * jamais affichée. L'appel est facturé.
 */
import { generateLandingWithClaude, LANDING_MAX_TOKENS, resolveLandingModel } from "./anthropic"

const request = {
  projectName: "Orientation Studi",
  audience: "Personnes qui réfléchissent à leur orientation professionnelle",
  objective: "discover-trainings",
  brief:
    "Créer une landing page claire et engageante pour présenter les possibilités de formation et inviter les visiteurs à découvrir le catalogue Studi.",
}

const excerptLength = 6000

async function main() {
  console.log(`Modèle : ${resolveLandingModel()} (max_tokens ${LANDING_MAX_TOKENS})`)
  console.log(`ANTHROPIC_API_KEY : ${process.env.ANTHROPIC_API_KEY?.trim() ? "présente" : "ABSENTE"}`)

  const started = performance.now()
  const result = await generateLandingWithClaude(request)
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  console.log(`Durée totale : ${seconds} s`)

  if (result.status === "success") {
    console.log(`Modèle ayant répondu : ${result.model} · arrêt : ${result.stopReason}`)
    if (result.requestId) console.log(`Requête : ${result.requestId}`)
    if (result.usage) console.log("Tokens :", JSON.stringify(result.usage))
    console.log("Validation : OK (brouillon, résolution, configuration finale)")
    console.log(`Sections : ${result.config.sections.map((section) => section.type).join(", ")}`)
    console.log("Brouillon de Claude :")
    console.log(JSON.stringify(result.draft, null, 2))
    console.log("LandingPageConfig résolue :")
    console.log(JSON.stringify(result.config, null, 2))
    return
  }

  const { error } = result
  console.log(`Validation : ÉCHEC (${error.kind})`)
  console.log(error.message)
  if (error.status) console.log(`HTTP ${error.status}`)
  if (error.requestId) console.log(`Requête : ${error.requestId}`)
  if (error.usage) console.log("Tokens :", JSON.stringify(error.usage))
  for (const issue of error.issues ?? []) console.log(`  - ${issue.path} : ${issue.message}`)
  if (error.resolved) {
    console.log("Configuration résolue (refusée) :")
    console.log(JSON.stringify(error.resolved, null, 2))
  }
  if (error.output) {
    console.log("Sortie du modèle :")
    console.log(error.output.length > excerptLength ? `${error.output.slice(0, excerptLength)}\n… (tronquée)` : error.output)
  }
  process.exitCode = 1
}

main().catch((error: unknown) => {
  // Aucun détail interne : ni pile, ni contenu de requête.
  console.error(`Erreur inattendue : ${error instanceof Error ? error.name : "inconnue"}`)
  process.exitCode = 1
})
