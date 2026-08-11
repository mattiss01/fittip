import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so this config never collects another ticket's spec on this port.
  testMatch: "m3-02-roadmap.spec.ts",
  // The compose step makes a network-free coaching request and then three
  // transactional writes, so the whole flow is slower than a form save.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 15_000,
    baseURL: "http://localhost:3017",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-02-mobile-chromium" }],
});
