import {
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react"

import type { LandingIconName } from "@/lib/landing/types"

/**
 * Traduction des noms d'icônes de la config vers les composants Lucide.
 * `satisfies` rend le mapping exhaustif : une valeur ajoutée à LandingIconName
 * sans entrée ici (ou une clé en trop) est une erreur TypeScript.
 */
const landingIcons = {
  "arrow-right": ArrowRightIcon,
  check: CheckIcon,
  download: DownloadIcon,
  phone: PhoneIcon,
} satisfies { [Name in LandingIconName]: LucideIcon }

export function resolveLandingIcon(name: LandingIconName): LucideIcon {
  return landingIcons[name]
}
