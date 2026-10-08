import { handleHccLogout } from "@/lib/hcc/launch-handlers"

export const dynamic = "force-dynamic"

/** POST /hcc/logout : déconnexion locale du Builder (logique dans `launch-handlers`). */
export function POST(request: Request) {
  return handleHccLogout(request)
}
