import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
