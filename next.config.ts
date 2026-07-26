import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/auth/:path*",
        headers: privateSessionHeaders(),
      },
      {
        source: "/home/:path*",
        headers: privateSessionHeaders(),
      },
    ];
  },
};

export default nextConfig;

function privateSessionHeaders() {
  return [
    {
      key: "Cache-Control",
      value: "private, no-cache, no-store, must-revalidate, max-age=0",
    },
    { key: "Pragma", value: "no-cache" },
    { key: "Expires", value: "0" },
    { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  ];
}
