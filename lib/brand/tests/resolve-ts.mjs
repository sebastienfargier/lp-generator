// Hook de résolution pour `npm run test:brand` : les sources de lib/brand
// importent sans extension (`"./types"`, résolution « bundler » de Next).
// Le test de cohérence des disclaimers lit aussi `lib/email/disclaimers.ts`,
// qui est déclaré comme module ES de la même façon.
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
    if (url.startsWith("file:") && (url.includes("/lib/brand/") || url.includes("/lib/email/disclaimers")) && url.endsWith(".ts")) {
      return nextLoad(url, { ...context, format: "module-typescript" })
    }
    return nextLoad(url, context)
  },
})
