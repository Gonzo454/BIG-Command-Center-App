import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/command-center": ["./data/**/*"],
    "/api/big-management": ["./data/**/*"],
    "/api/big-management/detail": ["./data/**/*"],
  },
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
