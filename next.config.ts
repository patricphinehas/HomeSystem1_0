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
    { source: "/api/subscriptions", destination: `${API}/api/subscriptions` },
    { source: "/api/calendar", destination: `${API}/api/calendar` },
    { source: "/api/family", destination: `${API}/api/family` },
    { source: "/api/mcp", destination: `${API}/api/mcp` },
    { source: "/api/chat", destination: `${API}/api/chat` },
    { source: "/api/settings", destination: `${API}/api/settings` },
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
