import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/command-center": ["./data/**/*"],
  },
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
