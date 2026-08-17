import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so a bare run collects only this ticket's flow, not every other
  // ticket's spec on this port and time zone.
  testMatch: "m3-12-plan.spec.ts",
  timeout: 120_000,
  expect: { timeout: 5_000 },
  use: {
    actionTimeout: 10_000,
    baseURL: "http://localhost:3020",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    // The flow confirms this zone into the profile and then plans against the
    // dates it produces, so it must be fixed for the run to be deterministic.
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-12-mobile-chromium" }],
});
