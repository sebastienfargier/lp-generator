import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/lib/hcc/session"

/**
 * Filtre OPTIMISTE (Next 16 : Proxy, runtime Node) : sans cookie de session Builder, une page protégée part vers
 * « Ouvre depuis le HCC » et une API répond 401, sans exécuter la route. Ce n'est PAS la protection : chaque route et
 * chaque page revérifie la session scellée (`lib/hcc/guard.ts`, `lib/hcc/page-session.ts`).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ status: "error", code: "session", message: "Ouvre l'Email Builder depuis le HCC pour utiliser cette fonction." }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.redirect(new URL("/hcc/requis", request.url), 303)
}

export const config = {
  matcher: [
    "/email-builder/:path*",
    "/email-library/preview/:path*",
    "/api/email-builder/:path*",
    "/api/generate",
    "/api/generate-email",
    "/api/edit-email",
    "/api/export-email",
  ],
}
