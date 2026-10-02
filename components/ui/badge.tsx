import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Configuration des variants, sortie de `cva` pour pouvoir être lue (ex. par
 * /design-system) : la page itère sur les vraies clés, sans en recopier la liste.
 * Le rendu du composant ne change pas.
 */
const badgeVariantConfig = {
  variant: {
    default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
    secondary:
      "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
    destructive:
      "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
    outline:
      "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
    ghost:
      "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
    link: "text-primary underline-offset-4 hover:underline",
    /* Aplats d'appel : encre ou vert de marque uniquement */
    "accent-1": "bg-accent-1 text-neutral-900 [a]:hover:bg-accent-1-hover",
    "accent-2-soft": "bg-accent-2-soft text-neutral-900",
    "brand-soft": "bg-brand-green-soft text-brand-green",
  },
  size: {
    default: "",
    lg: "h-7 px-3",
  },
}

export const badgeVariantOptions = {
  variant: Object.keys(badgeVariantConfig.variant) as (keyof typeof badgeVariantConfig.variant)[],
  size: Object.keys(badgeVariantConfig.size) as (keyof typeof badgeVariantConfig.size)[],
}

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: badgeVariantConfig,
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
      size,
    },
  })
}

export { Badge, badgeVariants }
