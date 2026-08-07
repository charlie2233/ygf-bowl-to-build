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
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
        source: "/redeem",
      },
      {
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; form-action 'self' https://formspree.io",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
        source: "/:path*",
      },
    ];
  },
};

export default nextConfig;
