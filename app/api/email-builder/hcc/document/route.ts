import { handleHccDocumentSave } from "@/lib/hcc/document-handlers"

export const dynamic = "force-dynamic"

/** PUT : enregistre le document de travail dans le HCC (garde, validation et signature dans `document-handlers`). */
export async function PUT(request: Request) {
  return handleHccDocumentSave(request)
}
