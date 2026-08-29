import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so a bare run collects only M3-19 on its isolated production port.
  testMatch: "m3-19-delete-session.spec.ts",
  timeout: 180_000,
  expect: { timeout: 8_000 },
  use: {
    actionTimeout: 12_000,
    baseURL: "http://localhost:3023",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    // The flow confirms this zone into the profile and then plans against the
    // dates it produces, so it must be fixed for the run to be deterministic.
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-19-mobile-chromium" }],
});
