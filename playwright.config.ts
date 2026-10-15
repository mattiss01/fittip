import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { claimedSpecs } from "./e2e/support/claimed-specs";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  // Every spec no per-ticket config claims, so a plain new spec runs in CI
  // (the "plain" flow in .github/scripts/browser-flows.sh) without being named.
  testIgnore: claimedSpecs(join(__dirname, "e2e")),
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
