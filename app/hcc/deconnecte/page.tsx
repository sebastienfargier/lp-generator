import type { Metadata } from "next"

import { HccNotice } from "../hcc-notice"

export const metadata: Metadata = { title: "Email Builder", robots: { index: false } }

export default function Page() {
  return <HccNotice title="Tu es déconnecté de l'Email Builder" text="Ta session a été fermée dans ce navigateur. Pour reprendre, rouvre l'Email Builder depuis le HCC." />
}
