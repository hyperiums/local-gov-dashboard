import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker runner ships .next/standalone (server.js plus only the node_modules the
  // build traces as imports) instead of the builder's full dependency tree.
  output: "standalone",
  // Loaded at runtime through paths the build's file tracing does not follow.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/playwright/**/*",
      "./node_modules/playwright-core/**/*",
      "./node_modules/css-tree/data/**/*",
      "./node_modules/mdn-data/css/**/*",
    ],
  },
  // compose bind-mounts /app/data, so a traced copy is dead weight.
  outputFileTracingExcludes: {
    "/**": ["./data/**/*"],
  },
};

export default nextConfig;
