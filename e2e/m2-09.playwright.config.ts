import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so this config never collects another ticket's spec on this port.
  // The probe file is also named `.probe.ts`, which no other config's default
  // `testMatch` collects, so continuous integration never runs it.
  testMatch: "m2-09-lost-render.probe.ts",
  // Hundreds of sequential transitions. The per-transition budget lives in the
  // probe; this only has to be larger than the whole run.
  timeout: 60 * 60_000,
  use: {
    // Bounded so a wedged surface is counted and reported rather than left to
    // retry until the whole run's timeout. A `/home/log` run stalled at
    // attempt 205 without these, after ~200 accumulated unplanned actuals made
    // the Today surface large.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    baseURL: "http://localhost:3019",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m2-09-mobile-chromium" }],
});
