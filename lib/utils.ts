import { createCn } from "cn/config"

// Déclare les styles typographiques Studi comme tailles de police, pour que
// `text-body` et une couleur (`text-muted-foreground`) ne s'écrasent pas.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "body", "caption"] }],
    },
  },
})
