import Image from "next/image"

import { cn } from "@/lib/utils"

import type { ProductPartner as ProductPartnerData } from "./types"

type ProductPartnerProps = ProductPartnerData & {
  /** `lg` met davantage en avant le nom du partenaire (carte produit). */
  size?: "md" | "lg"
  className?: string
}

export function ProductPartner({
  label,
  name,
  logo,
  size = "md",
  className,
}: ProductPartnerProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <p className="text-body text-muted-foreground">{label}</p>
      {logo ? (
        <Image
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={logo.height}
          className={cn("w-auto", size === "lg" ? "h-9" : "h-8")}
        />
      ) : (
        <p className={cn("text-foreground", size === "lg" ? "text-h1" : "text-h2")}>
          {name}
        </p>
      )}
    </div>
  )
}
