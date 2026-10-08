import { handleHccCallback } from "@/lib/hcc/launch-handlers"

export const dynamic = "force-dynamic"

/** GET /hcc/callback?code=…&state=… : URL de rappel FIXE du HCC (logique dans `launch-handlers`). */
export function GET(request: Request) {
  return handleHccCallback(request)
}
