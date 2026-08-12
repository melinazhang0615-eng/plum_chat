import type { NextConfig } from "next";

const apiOrigin = process.env.PLUM_API_ORIGIN ?? "http://127.0.0.1:8180";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/api/v1/products/plum/:path*",
        destination: `${apiOrigin}/api/v1/products/plum/:path*`,
      },
      {
        source: "/auth/google/callback",
        destination: `${apiOrigin}/api/v1/products/plum/auth/oauth/google/callback`,
      },
    ];
  },
};

export default nextConfig;
