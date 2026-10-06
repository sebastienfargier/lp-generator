// Hook de résolution pour `npm run test:email-builder` : mêmes besoins que
// `lib/email/tests/resolve-ts.mjs` (imports sans extension, TypeScript natif),
// étendus aux sources du Builder. Le Builder importe le domaine Email, qui
// importe lib/brand : les trois arbres sont chargés comme modules ES.
import { registerHooks } from "node:module"

const roots = ["/lib/email/", "/lib/email-builder/", "/lib/brand/"]

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
    if (url.startsWith("file:") && url.endsWith(".ts") && roots.some((root) => url.includes(root))) {
      return nextLoad(url, { ...context, format: "module-typescript" })
    }
    return nextLoad(url, context)
  },
})
