/**
 * Catalogue des lames que le Builder peut AJOUTER, et leur contenu initial.
 * SERVEUR UNIQUEMENT (les fixtures de la bibliothèque s'appuient sur le
 * renderer) ; la page en passe une copie JSON au navigateur.
 *
 * Contenu initial : celui de la bibliothèque (`buildEmailLibraryBlock`), un
 * contenu de DÉMONSTRATION explicitement fictif (« Titre exemple », « Texte de
 * démonstration… ») : c'est un emplacement provisoire à remplacer, jamais du
 * contenu final. Seule retouche : un visuel vient de la banque contrôlée
 * (seules ses images sont publiables). Une lame dont le cadre n'a aucune image
 * de la banque n'est pas ajoutable pour l'instant, avec sa raison.
 *
 * Une lame est ajoutable seulement si l'opération `add-block` l'accepte
 * réellement : le catalogue ne promet rien que le Builder ne sait pas faire.
 *
 * Domaine Email Builder uniquement : aucun import depuis `lib/landing`.
 */
import { emailImagesForIntent, emailVisualIntents, resolveEmailBankImage } from "../email/image-bank"
import { buildEmailLibraryBlock } from "../email/library-fixtures"
import { emailLibraryEntries, type EmailLibraryEntry } from "../email/library"
import { emailBlockManifest } from "../email/manifest"
import type { EmailBlock, EmailBlockType, EmailConfig } from "../email/types"
import { createEmailDocument } from "./document"
import { applyDocumentOperation } from "./operations"

export type BuilderLame = {
  type: EmailBlockType
  name: string
  family: string
  role: string
  surfaceMode: "configurable" | "fixed"
  /** Contenu provisoire (slots) ; absent si la lame n'est pas ajoutable. */
  starter?: Record<string, unknown>
  /** Pourquoi la lame n'est pas ajoutable. */
  unavailable?: string
}

type Slots = Record<string, Record<string, unknown>>

/** Contenu provisoire d'une lame, ou la raison pour laquelle il n'existe pas. */
export function starterSlots(type: EmailBlockType): { ok: true; slots: Slots } | { ok: false; reason: string } {
  const slots = structuredClone((buildEmailLibraryBlock(type) as unknown as { slots: Slots }).slots)
  const manifestSlots = emailBlockManifest[type].slots as Record<string, string>
  for (const [name, kind] of Object.entries(manifestSlots)) {
    if (kind !== "asset:visuel" || !slots[name]) continue
    const image = emailVisualIntents.flatMap((intent) => emailImagesForIntent(intent, type))[0]
    if (!image) return { ok: false, reason: "Cette lame demande un visuel que la banque d'images ne fournit pas encore." }
    slots[name] = resolveEmailBankImage(image, type)
  }
  return { ok: true, slots }
}

/** Email technique minimal (un footer) sur lequel on vérifie qu'une lame s'ajoute. */
function probeDocument() {
  const footer = { ...(buildEmailLibraryBlock("email-module-footer-compact-legal") as unknown as EmailBlock), id: "footer" }
  return createEmailDocument({ version: 1, id: "sonde", name: "Sonde", subject: "Sonde", preheader: "Sonde", blocks: [footer] } as EmailConfig)
}

function describe(entry: EmailLibraryEntry): BuilderLame {
  const base = { type: entry.type, name: entry.name, family: entry.family, role: entry.role, surfaceMode: entry.surfaceMode }
  const starter = starterSlots(entry.type)
  if (!starter.ok) return { ...base, unavailable: starter.reason }
  const tried = applyDocumentOperation(probeDocument(), { type: "add-block", blockType: entry.type, slots: starter.slots })
  if (!tried.ok) return { ...base, unavailable: tried.error.message }
  return { ...base, starter: starter.slots }
}

let cached: BuilderLame[] | undefined

/** Les lames de la bibliothèque, dans l'ordre du manifeste, avec leur disponibilité. */
export function builderLames(): BuilderLame[] {
  cached ??= emailLibraryEntries.map(describe)
  return cached
}
