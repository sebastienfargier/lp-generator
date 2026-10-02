import { ArrowRightIcon } from "lucide-react"

import { Button, buttonVariantOptions } from "@/components/ui/button"

const iconSizes = buttonVariantOptions.size.filter((size) => size.startsWith("icon"))
const textSizes = buttonVariantOptions.size.filter((size) => !size.startsWith("icon"))

/**
 * Le vrai `Button`. Les variants et les tailles viennent de la configuration
 * exportée par `components/ui/button.tsx` : aucune liste recopiée, aucun
 * faux bouton.
 */
export function ButtonShowcase() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h4 className="text-body font-medium">Variants</h4>
        <ul role="list" className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {buttonVariantOptions.variant.map((variant) => (
            <li
              key={variant}
              // `inverse` est conçu pour un fond sombre.
              className={`flex min-w-0 flex-col items-start gap-3 ${variant === "inverse" ? "rounded-lg bg-primary p-3" : ""}`}
            >
              <Button variant={variant} type="button">
                Libellé
              </Button>
              <code className={`text-caption ${variant === "inverse" ? "text-primary-foreground" : ""}`}>{variant}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        <h4 className="text-body font-medium">Tailles</h4>
        <ul role="list" className="flex flex-wrap items-end gap-6">
          {textSizes.map((size) => (
            <li key={size} className="flex flex-col items-start gap-3">
              <Button size={size} type="button">
                Libellé
              </Button>
              <code className="text-caption">{size}</code>
            </li>
          ))}
        </ul>
        <ul role="list" className="flex flex-wrap items-end gap-6">
          {iconSizes.map((size) => (
            <li key={size} className="flex flex-col items-start gap-3">
              <Button size={size} variant="outline" type="button" aria-label={`Bouton icône ${size}`}>
                <ArrowRightIcon aria-hidden />
              </Button>
              <code className="text-caption">{size}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
