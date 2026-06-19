import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a small container image
  // running `node server.js`. See Dockerfile.
  output: "standalone",
};

export default nextConfig;
