import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Pinned so a bare run collects only M3-15F on its isolated production port.
  // Without it this config would pick up every other ticket's spec and rewrite
  // their accepted evidence against the wrong port and time zone.
  testMatch: "m3-15f-roadmap.spec.ts",
  // The flow runs the whole loop twice: confirm a zone, add a goal, generate,
  // edit, decline, regenerate, accept, then generate and accept again to prove
  // the first version is preserved. Each generation is a round trip through the
  // coaching service, so it is longer than the single-surface flows.
  timeout: 360_000,
  // Generous, and measured rather than guessed. One generation is around a
  // dozen round trips to a containerized Postgres — the owner's context, the
  // claim, the persist, the memory batch, then the whole route re-read — and on
  // a loaded machine that ran past ten seconds more than once while this flow
  // was being written. A shared CI runner is not faster.
  expect: { timeout: 30_000 },
  use: {
    actionTimeout: 15_000,
    baseURL: "http://localhost:3026",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    // The flow confirms this zone into the profile, and every roadmap date is
    // derived from the owner's zone afterwards, so it must be fixed to be
    // deterministic.
    timezoneId: "Europe/Berlin",
  },
  projects: [{ name: "m3-15f-mobile-chromium" }],
});
