import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "m1-04-today-progress.spec.ts",
  timeout: 180_000,
  use: {
    baseURL: "http://localhost:3014",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m1-04-mobile-chromium" }],
});
