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
    { source: "/api/chat-log", destination: `${API}/api/chat-log` },
    { source: "/api/mcp", destination: `${API}/api/mcp` },
    { source: "/api/chat", destination: `${API}/api/chat` },
    { source: "/api/settings", destination: `${API}/api/settings` },
  ],
  partialPrefetching: true,
  experimental: {
    /**
     * The dev proxy that serves the rewrites above gives up after 30s by
     * default (`proxyTimeout || 30000` in next/dist/server/lib/router-utils/
     * proxy-request.js) and answers a plain-text "Internal Server Error" that
     * tells you nothing. A reasoning model with two tool rounds takes 10-30s,
     * so that was being hit regularly on /api/chat.
     *
     * This has to stay ABOVE the whole-turn budget in server/chat.ts (110s),
     * so a slow provider comes back as that file's legible 502 or its
     * part-way answer, rather than as the proxy's opaque 500.
     */
    proxyTimeout: 150_000,
  },
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
