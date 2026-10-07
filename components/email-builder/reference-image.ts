import { planClientResize, referenceLimits, referenceMediaTypes } from "@/lib/email-builder/reference-file"

export type PreparedReference = {
  /** Ce qui part au serveur : l'original, ou une version réduite (JPEG). */
  blob: Blob
  name: string
  width: number
  height: number
}

const accepted: readonly string[] = referenceMediaTypes

/**
 * Prépare une image choisie par la personne : type accepté, décodage réel (une
 * image illisible est refusée), dimensions, réduction éventuelle côté navigateur
 * (la règle de l'API, faite avant l'envoi pour alléger la requête). Rien n'est
 * écrit nulle part : le résultat vit en mémoire le temps de la requête.
 */
export async function prepareReferenceImage(file: File): Promise<{ ok: true; image: PreparedReference } | { ok: false; message: string }> {
  if (file.type === "image/gif") return { ok: false, message: "Les GIF ne sont pas acceptés : utilise une capture PNG, JPEG ou WebP." }
  if (!accepted.includes(file.type)) return { ok: false, message: "Format non accepté : utilise une capture PNG, JPEG ou WebP." }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, message: "Cette image est illisible." }
  }
  try {
    const plan = planClientResize(bitmap.width, bitmap.height)
    if (!plan.ok) return plan
    if (!plan.scaled && file.size <= referenceLimits.maxBytes) return { ok: true, image: { blob: file, name: file.name, width: bitmap.width, height: bitmap.height } }

    const canvas = document.createElement("canvas")
    canvas.width = plan.width
    canvas.height = plan.height
    const context = canvas.getContext("2d")
    if (!context) return { ok: false, message: "Cette image n'a pas pu être réduite." }
    context.drawImage(bitmap, 0, 0, plan.width, plan.height)
    for (const quality of [0.92, 0.85, 0.75]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
      if (blob && blob.size <= referenceLimits.maxBytes) return { ok: true, image: { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", width: plan.width, height: plan.height } }
    }
    return { ok: false, message: `L'image pèse trop lourd même réduite (plus de ${referenceLimits.maxBytes / 1024 / 1024} Mo) : recadre la capture.` }
  } finally {
    bitmap.close()
  }
}
