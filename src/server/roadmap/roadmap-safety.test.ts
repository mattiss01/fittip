import { describe, expect, it } from "vitest";

import type { Completion } from "@/server/completions/completion-log";
import { hasRecentSafetySignal } from "@/server/roadmap/roadmap-safety";
import {
  TRAINING_HISTORY_MAX_SESSIONS,
  TRAINING_HISTORY_WINDOW_DAYS,
} from "@/server/training/training-history-context";

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

  /**
   * The cap the AI path inherits bounds a provider payload. Inheriting it here
   * truncated the newest 20 sessions *before* the flag was computed, so an
   * ordinary trainee — roughly two and a half sessions a week — lost the notice
   * three weeks after reporting anything, with nothing on screen to say so.
   */
  it("still reports a symptom buried under more than twenty later sessions", () => {
    const reported = completion({
      actualLocalDate: shift(TODAY, -21),
      painReported: true,
    });
    const later = Array.from({ length: 25 }, (_, offset) =>
      completion({ actualLocalDate: shift(TODAY, -offset) }),
    );

    expect(later.length).toBeGreaterThan(TRAINING_HISTORY_MAX_SESSIONS);
    expect(hasRecentSafetySignal([...later, reported], TODAY)).toBe(true);
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
    title: null,
    sport: null,
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
