import { Badge } from "@/components/ui/badge"
import { getSectionGeneration } from "@/lib/landing/section-generation"
import type { LandingSectionType } from "@/lib/landing/types"

/**
 * Statut de génération IA d'une lame : « Générable par IA » ou « Bibliothèque
 * uniquement » (avec sa raison). Composant serveur : il lit la décision du
 * moteur de génération (`section-generation`), sans jamais l'embarquer côté
 * client. Une lame n'a pas besoin d'être générable pour appartenir à la
 * bibliothèque.
 */
export function GenerationStatus({ type, showReason = false }: { type: LandingSectionType; showReason?: boolean }) {
  const generation = getSectionGeneration(type)
  const generable = generation.status === "generable"

  return (
    <>
      <Badge variant={generable ? "brand-soft" : "outline"}>
        {generable ? "Générable par IA" : "Bibliothèque uniquement"}
      </Badge>
      {showReason && generation.status === "library-only" && (
        <p className="text-caption text-muted-foreground">Non générable par IA. {generation.reason}</p>
      )}
    </>
  )
}
