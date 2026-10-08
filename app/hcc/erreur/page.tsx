import type { Metadata } from "next"

import { HccNotice } from "../hcc-notice"

export const metadata: Metadata = { title: "Email Builder", robots: { index: false } }

const messages: Record<string, { title: string; text: string }> = {
  lancement_expire: { title: "Ce lancement a expiré", text: "Le lien d'ouverture ne sert qu'une fois et quelques secondes. Rouvre l'Email Builder depuis le HCC." },
  lancement_invalide: { title: "Ce lancement n'est pas valide", text: "Rouvre l'Email Builder depuis le HCC." },
  hcc_indisponible: { title: "L'Email Builder n'est pas disponible", text: "La connexion avec le HCC n'a pas abouti. Réessaie dans un instant depuis le HCC." },
  document_invalide: { title: "Le document enregistré n'a pas pu être lu", text: "Il n'a pas été ouvert pour ne pas risquer de l'écraser. Contacte l'équipe." },
  trop_de_requetes: { title: "Trop de tentatives", text: "Patiente une minute, puis rouvre l'Email Builder depuis le HCC." },
}

/** Raison FERMÉE (jamais un texte reçu affiché tel quel). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const reason = (await searchParams).raison
  const message = (typeof reason === "string" && messages[reason]) || messages.lancement_invalide!
  return <HccNotice title={message.title} text={message.text} />
}
