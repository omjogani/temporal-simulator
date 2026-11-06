import type { NextConfig } from "next";

// The simulator is a client-side app (live WebSocket + animation), so server
// caching (cacheComponents / partial prefetching) brings nothing and makes
// reading the [step] param a prerender error. Keep the config plain.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false, // keep the projected screen clean
};

export default nextConfig;
