import type { NextConfig } from "next";

/**
 * En-têtes de sécurité (docs/POC_INTEGRATION_HCC.md §7). `frame-ancestors 'self'` et non `'none'` : le Builder affiche
 * ses propres aperçus en iframe ; aucun site tiers ne peut l'intégrer. Seule cette directive CSP est posée : une
 * politique complète (scripts, styles) demanderait un audit des scripts de Next, hors périmètre.
 */
const security = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Le rendu lit les gabarits sur le disque : la route d'aperçu HCC les embarque explicitement dans son bundle.
  outputFileTracingIncludes: {
    "/api/hcc/v1/render": ["./lib/email/socle-email.html", "./lib/email/templates/**/*.html"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/hcc/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
