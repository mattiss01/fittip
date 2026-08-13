import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "m3-03-plan-proposal.spec.ts",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 15_000,
    baseURL: "http://localhost:3018",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-03-mobile-chromium" }],
});
