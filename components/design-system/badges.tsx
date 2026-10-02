import { Badge, badgeVariantOptions } from "@/components/ui/badge"

/**
 * Le vrai `Badge`. Variants et tailles viennent de la configuration exportée
 * par `components/ui/badge.tsx`.
 */
export function BadgeShowcase() {
  return (
    <div className="flex flex-col gap-8">
      {badgeVariantOptions.size.map((size) => (
        <div key={size} className="flex flex-col gap-4">
          <h4 className="text-body font-medium">
            Taille <code className="text-caption">{size}</code>
          </h4>
          <ul role="list" className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
            {badgeVariantOptions.variant.map((variant) => (
              <li key={variant} className="flex min-w-0 flex-col items-start gap-3">
                <Badge variant={variant} size={size}>
                  Libellé
                </Badge>
                <code className="text-caption">{variant}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
