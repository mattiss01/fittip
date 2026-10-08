import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next response safety headers", () => {
  it("marks all paths as noindex and keeps session routes private", async () => {
    const headers = await nextConfig.headers?.();
    const allPaths = headers?.find((rule) => rule.source === "/:path*");
    const protectedPaths = headers?.find(
      (rule) => rule.source === "/home/:path*",
    );

    expect(allPaths?.headers).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow, noarchive",
    });
    expect(protectedPaths?.headers).toContainEqual({
      key: "Cache-Control",
      value: "private, no-cache, no-store, must-revalidate, max-age=0",
    });
  });

  it("keeps the reset pages out of caches and referrers", async () => {
    const headers = await nextConfig.headers?.();
    for (const source of ["/forgot-password", "/reset-password"]) {
      const rule = headers?.find((candidate) => candidate.source === source);
      expect(rule?.headers).toContainEqual({
        key: "Cache-Control",
        value: "private, no-cache, no-store, must-revalidate, max-age=0",
      });
      expect(rule?.headers).toContainEqual({
        key: "Referrer-Policy",
        value: "no-referrer",
      });
    }
  });
});
