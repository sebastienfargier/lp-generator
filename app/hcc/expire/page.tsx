import type { Metadata } from "next"

import { HccNotice } from "../hcc-notice"

export const metadata: Metadata = { title: "Email Builder", robots: { index: false } }

export default function Page() {
  return <HccNotice title="Ta session a expiré" text="Pour continuer, rouvre l'Email Builder depuis le HCC." />
}
