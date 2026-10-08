import type { Metadata } from "next"

import { HccNotice } from "../hcc-notice"

export const metadata: Metadata = { title: "Email Builder", robots: { index: false } }

export default function Page() {
  return <HccNotice title="Ouvre l'Email Builder depuis le HCC" text="L'Email Builder s'ouvre depuis une création du Creative Content Hub : il n'est pas accessible directement." />
}
