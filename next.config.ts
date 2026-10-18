import type { NextConfig } from "next";

/** The Express bills API (server/index.ts). */
const API = process.env.API_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Every data route is served by Express; Next only renders pages.
  rewrites: () => [
    { source: "/api/inventory", destination: `${API}/api/inventory` },
    { source: "/api/bills", destination: `${API}/api/bills` },
    { source: "/api/analytics", destination: `${API}/api/analytics` },
  ],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
