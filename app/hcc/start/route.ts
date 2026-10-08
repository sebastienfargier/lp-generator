import { handleHccStart } from "@/lib/hcc/launch-handlers"

export const dynamic = "force-dynamic"

/** GET /hcc/start?asset=… : début du lancement depuis le HCC (logique dans `launch-handlers`). */
export function GET(request: Request) {
  return handleHccStart(request)
}
