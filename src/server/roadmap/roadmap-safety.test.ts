import { describe, expect, it } from "vitest";

import type { Completion } from "@/server/completions/completion-log";
import { hasRecentSafetySignal } from "@/server/roadmap/roadmap-safety";
import { TRAINING_HISTORY_WINDOW_DAYS } from "@/server/training/training-history-context";

const TODAY = "2026-09-14";

describe("hasRecentSafetySignal", () => {
  it("reports nothing when no completion carries a flag", () => {
    expect(hasRecentSafetySignal([completion({})], TODAY)).toBe(false);
  });

  it.each([
    ["painReported"],
    ["illnessReported"],
    ["injuryReported"],
    ["severeFatigueReported"],
  ] as const)("reports a completion that carries %s", (flag) => {
    expect(hasRecentSafetySignal([completion({ [flag]: true })], TODAY)).toBe(
      true,
    );
  });

  // The window is M3-15D's, not a second one declared here: the roadmap screen
  // and a roadmap generation have to agree on what "recent" means.
  it("reads the same window the coaching context reads", () => {
    const first = shift(TODAY, -(TRAINING_HISTORY_WINDOW_DAYS - 1));
    const before = shift(TODAY, -TRAINING_HISTORY_WINDOW_DAYS);

    expect(
      hasRecentSafetySignal(
        [completion({ actualLocalDate: first, painReported: true })],
        TODAY,
      ),
    ).toBe(true);
    expect(
      hasRecentSafetySignal(
        [completion({ actualLocalDate: before, painReported: true })],
        TODAY,
      ),
    ).toBe(false);
  });

  it("reports nothing for an owner with no completions at all", () => {
    expect(hasRecentSafetySignal([], TODAY)).toBe(false);
  });
});

function shift(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function completion(overrides: Partial<Completion>): Completion {
  return {
    id: "7e150000-0000-4000-8000-000000000001",
    planSessionId: null,
    status: "completed",
    actualLocalDate: TODAY,
    timezoneName: "Europe/Berlin",
    plannedSnapshot: null,
    revision: 1,
    activities: [],
    updatedAt: "2026-09-14T09:00:00.000Z",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    ...overrides,
  };
}
