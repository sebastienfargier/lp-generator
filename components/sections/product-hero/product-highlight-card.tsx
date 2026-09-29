import { CheckIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import type { ProductHighlight } from "./types"

type ProductHighlightCardProps = ProductHighlight & {
  className?: string
}

export function ProductHighlightCard({
  title,
  items,
  icon: Icon = CheckIcon,
  className,
}: ProductHighlightCardProps) {
  return (
    <Card className={cn("shadow-xl shadow-foreground/5", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-green-soft text-brand-green">
            <Icon className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-2 pl-4 text-body text-muted-foreground marker:text-neutral-400">
          {items.map((item) => (
            <li key={item}>
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
