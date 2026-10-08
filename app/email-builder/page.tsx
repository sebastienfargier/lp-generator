import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { readPageSession, refusalPath } from "@/lib/hcc/page-session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Email Builder",
  robots: { index: false },
}

/**
 * `/email-builder` n'ouvre plus l'éditeur directement : l'accès passe par un lancement HCC (`/hcc/start`), qui mène à
 * `/email-builder/[assetId]`. Avec une session valide, on y retourne ; sinon, la page « Ouvre depuis le HCC ».
 */
export default async function EmailBuilderPage() {
  const read = await readPageSession()
  redirect(read.status === "valid" ? `/email-builder/${encodeURIComponent(read.session.assetId)}` : refusalPath(read.status))
}
