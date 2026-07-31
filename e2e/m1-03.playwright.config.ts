import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "m1-03-quick-log.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3013",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Pacific/Kiritimati",
  },
  projects: [{ name: "m1-03-mobile-chromium" }],
});
