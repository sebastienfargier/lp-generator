import type { Metadata } from "next"

import { PageHeader } from "@/components/dashboard/page-header"
import { EmailLibraryBrowser } from "@/components/email/email-library-browser"
import { emailLibraryEntries, emailLibraryFamilies } from "@/lib/email/library"

export const metadata: Metadata = {
  title: "Bibliothèque Email",
}

export default function EmailLibraryPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Bibliothèque Email"
        description={`${emailLibraryEntries.length} lames du système Email, rendues par le vrai renderer à leur largeur d'email (600 px). Le contenu affiché est une démonstration. « IA V1 » indique les lames que le générateur Claude peut produire aujourd'hui.`}
      />
      <EmailLibraryBrowser entries={emailLibraryEntries} families={emailLibraryFamilies} />
    </div>
  )
}
