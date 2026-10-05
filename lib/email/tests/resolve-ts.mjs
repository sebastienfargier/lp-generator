// Hook de résolution pour `npm run test:email` : les sources de lib/email
// importent sans extension (`"./manifest"`, résolution « bundler » de Next).
// Node exécute le TypeScript nativement mais exige l'extension : on la
// complète pour les imports relatifs, et l'on déclare ces fichiers comme
// modules ES (sans toucher au "type" du package.json du projet). Les
// recettes V2 importent `lib/brand` (claims, terminologie) : même traitement.
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../")
    if (relative && !/\.[cm]?[jt]s$|\.json$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context)
      } catch {
        // Pas de fichier .ts : résolution normale.
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && (url.includes("/lib/email/") || url.includes("/lib/brand/")) && url.endsWith(".ts")) {
      return nextLoad(url, { ...context, format: "module-typescript" })
    }
    return nextLoad(url, context)
  },
})
