import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
    // Prevent bundler from breaking apidom's dynamic namespace registration
    optimizePackageImports: [],
  },
  // Transpile swagger-ui packages to ensure proper module resolution
  transpilePackages: ["swagger-ui-react", "swagger-client"],
  webpack: (config) => {
    // Ensure apidom packages are not incorrectly tree-shaken
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

export default nextConfig;
