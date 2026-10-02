import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import type { Tool } from "./dashboard-data"

/**
 * Toute la carte est cliquable via un lien « étiré » (::after) porté par le
 * CTA : un seul lien dans l'arbre d'accessibilité, focus visible sur la carte.
 */
export function ToolCard({ title, description, href, icon: Icon }: Tool) {
  return (
    <Card className="relative transition-colors hover:bg-accent has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
        <CardTitle className="text-h2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Link
          href={href}
          className={cn(buttonVariants({ variant: "outline" }), "outline-none after:absolute after:inset-0 after:content-['']")}
        >
          Accéder à l&apos;éditeur
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Link>
      </CardFooter>
    </Card>
  )
}
