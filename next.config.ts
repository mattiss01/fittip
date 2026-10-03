import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Development only: lets a phone on the same network load the dev server's
  // scripts when it is opened at the laptop's address. Named per run, e.g.
  // FITTIP_DEV_ORIGINS=10.0.0.75, so no address is written down here.
  allowedDevOrigins: (process.env.FITTIP_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
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
