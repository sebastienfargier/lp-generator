import { type ColorGroup } from "@/lib/design-system/landing-css"

/**
 * Palette Landing. Les groupes viennent de la lecture de `app/globals.css`
 * (lib/design-system/landing-css.ts) ; chaque pastille est peinte avec
 * `var(--token)`, la vraie couleur du runtime, sans valeur recopiée.
 */
export function ColorGroups({ groups }: { groups: ColorGroup[] }) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-3">
          <h4 className="text-body font-medium">
            {group.label} <span className="text-muted-foreground">· {group.tokens.length}</span>
          </h4>
          <ul role="list" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {group.tokens.map((token) => (
              <li key={token.name} className="flex min-w-0 flex-col gap-2">
                <div
                  aria-hidden
                  className="h-12 rounded-md border border-border"
                  style={{ backgroundColor: `var(--${token.name})` }}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <code className="text-caption break-all">--{token.name}</code>
                  <span className="text-caption break-all text-muted-foreground">
                    {token.alias ? `${token.value} → ${token.resolved}` : token.value}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
