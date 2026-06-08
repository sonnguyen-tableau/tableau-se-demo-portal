import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ["@portal/tableau-jwt", "@portal/mcp-tools"],
  webpack(config, { isServer }) {
    if (!isServer) {
      // vega-canvas (pulled in by vega-embed) tries to resolve the native
      // `canvas` package and Node's `fs/promises` for server-side rendering.
      // Neither exists in the browser bundle — stub them so the build passes.
      config.resolve.fallback = {
        ...(config.resolve.fallback as Record<string, unknown> | undefined),
        canvas: false,
        "fs/promises": false,
        fs: false,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
