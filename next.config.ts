import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  experimental: { cpus: 2 },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      ...[
        "/shopkeeper/:path*",
        "/landlord/:path*",
        "/security",
        "/contact/:path*",
        "/api/guest/:path*",
        "/api/public/:path*",
        "/shops/:path*",
        "/search",
        "/categories/:path*",
        "/sign-in",
        "/recover",
        "/api/auth/:path*",
        "/api/workspace/:path*",
        "/api/operator/:path*",
      ].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      })),
    ];
  },
};

export default nextConfig;
