"use client"

import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { emailBank, emailBankImageBlocks, emailBankImageIdFromSrc, emailBankImageIds, emailBankPreviews, resolveEmailBankImage, type EmailBankImageId } from "@/lib/email/image-bank"
import type { EmailBlockType } from "@/lib/email/types"

type ImagePickerPanelProps = {
  blockType: EmailBlockType
  /** `src` du visuel actuel, pour marquer l'image en place. */
  currentSrc: string | undefined
  onPick: (imageId: EmailBankImageId) => void
  onClose: () => void
}

/** Images de la banque Studi qui existent au format de cette lame, avec leur aperçu local. */
function candidates(blockType: EmailBlockType) {
  return emailBankImageIds
    .filter((id) => (emailBankImageBlocks(id) as readonly string[]).includes(blockType))
    .map((id) => {
      try {
        return { id, preview: emailBankPreviews.get(resolveEmailBankImage(id, blockType).src) }
      } catch {
        return { id, preview: undefined }
      }
    })
}

/**
 * La banque d'images Studi existante, ouverte pour UN visuel : seules ses images
 * compatibles avec la lame sont proposées. Choisir une image remplace le visuel
 * (opération `set-image`) et ferme la banque. Ni upload, ni URL, ni recadrage.
 */
export function ImagePickerPanel({ blockType, currentSrc, onPick, onClose }: ImagePickerPanelProps) {
  const current = currentSrc ? emailBankImageIdFromSrc(currentSrc) : undefined
  const options = candidates(blockType)

  return (
    <aside aria-label="Banque d'images" className="absolute inset-y-0 left-0 z-30 flex w-[min(20rem,100%)] shrink-0 flex-col border-r bg-background shadow-xl lg:static lg:z-auto lg:shadow-none">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-body font-semibold">Remplacer l&apos;image</h2>
          <p className="text-caption text-muted-foreground">Images de la banque Studi compatibles avec cette lame.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Fermer la banque d'images" onClick={onClose}>
          <XIcon aria-hidden />
        </Button>
      </div>
      {options.length === 0 ? (
        <p className="p-4 text-body text-muted-foreground">Aucune image de la banque n&apos;est disponible pour cette lame.</p>
      ) : (
        <ul role="list" className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4">
          {options.map(({ id, preview }) => (
            <li key={id}>
              <button
                type="button"
                aria-label={`${emailBank[id].alt}${id === current ? " (image actuelle)" : ""}`}
                aria-pressed={id === current}
                onClick={() => onPick(id)}
                className={`flex w-full flex-col gap-1.5 rounded-lg border bg-card p-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 ${id === current ? "border-brand-green ring-2 ring-brand-green" : ""}`}
              >
                {preview ? (
                  // Aperçu local d'un dérivé de la banque : un fichier statique de l'application, rien de distant.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="aspect-[4/3] w-full rounded-md bg-muted object-cover" loading="lazy" />
                ) : (
                  <span className="aspect-[4/3] w-full rounded-md bg-muted" />
                )}
                <span className="line-clamp-2 px-1 pb-1 text-caption text-muted-foreground">{id === current ? "Image actuelle" : emailBank[id].alt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
