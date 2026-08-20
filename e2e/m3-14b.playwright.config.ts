import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so a bare run collects only M3-14B on its isolated production port.
  testMatch: "m3-14b-recurring-series.spec.ts",
  timeout: 180_000,
  expect: { timeout: 8_000 },
  use: {
    actionTimeout: 12_000,
    baseURL: "http://localhost:3022",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-14b-mobile-chromium" }],
});
