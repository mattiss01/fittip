import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "m3-11-maintenance.spec.ts",
  timeout: 90_000,
  expect: { timeout: 5_000 },
  use: {
    actionTimeout: 10_000,
    baseURL: "http://localhost:3019",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-11-mobile-chromium" }],
});
