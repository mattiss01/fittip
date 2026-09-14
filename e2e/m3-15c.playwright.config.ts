import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so a bare run collects only M3-15C on its isolated production port.
  testMatch: "m3-15c-progress.spec.ts",
  // The flow arranges a plan day, logs against it twice, and then edits the
  // plan again to prove the stored snapshot did not move, so it is longer than
  // the single-surface flows.
  timeout: 300_000,
  expect: { timeout: 8_000 },
  use: {
    actionTimeout: 12_000,
    baseURL: "http://localhost:3025",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    // The flow confirms this zone into the profile and then plans, logs and
    // pages months against the dates it produces, so it must be fixed to be
    // deterministic.
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-15c-mobile-chromium" }],
});
