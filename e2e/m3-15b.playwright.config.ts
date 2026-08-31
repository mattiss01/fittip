import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so a bare run collects only M3-15B on its isolated production port.
  testMatch: "m3-15b-today-and-logging.spec.ts",
  // The flow arranges a whole plan day before it logs against it, so it is
  // longer than the single-surface flows that came before it.
  timeout: 300_000,
  expect: { timeout: 8_000 },
  use: {
    actionTimeout: 12_000,
    baseURL: "http://localhost:3024",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    // The flow confirms this zone into the profile and then plans and logs
    // against the dates it produces, so it must be fixed to be deterministic.
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-15b-mobile-chromium" }],
});
