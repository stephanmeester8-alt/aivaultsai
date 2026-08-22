import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The agent-core package ships TypeScript sources; Next transpiles it
  // (server-side only — never imported from client components).
  transpilePackages: ["@aivaultsai/agent-core"],
};

export default nextConfig;
