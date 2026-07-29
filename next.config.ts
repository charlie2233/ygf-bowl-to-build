import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        destination: "https://malatangai.com/:path*",
        has: [{ type: "host", value: "www.malatangai.com" }],
        permanent: true,
        source: "/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
        source: "/:path*",
      },
    ];
  },
};

export default nextConfig;
