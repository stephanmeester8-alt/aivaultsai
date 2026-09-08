import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The agent-core package ships TypeScript sources; Next transpiles it
  // (server-side only — never imported from client components).
  transpilePackages: ["@aivaultsai/agent-core"],
  // Baseline security headers (SEO/trust audit 2026-09). Conservative:
  // no CSP yet (inline scripts for GA4/JSON-LD need a careful allow-list
  // first), SAMEORIGIN framing keeps existing embeds working.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
