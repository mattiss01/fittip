import { describe, expect, it } from "vitest";

import {
  selectTrainingHistoryContext,
  type TrainingHistoryPlannedSession,
} from "@/server/training/training-history-context";

const SERIES = "77000000-0000-4000-8000-000000000001";

function planned(
  localDate: string,
  title: string,
  ruleSeriesId: string | null = null,
): TrainingHistoryPlannedSession {
  return {
    localDate,
    title,
    sport: "Running",
    hasCompletion: false,
    ruleSeriesId,
  };
}

/**
 * Mia, 17 Oct 2026: a plan for Sat 17 to Fri 23, a repeating run/walk on
 * Sat 24 and a one-off 2 km on Sun 25. The plan reads no series rules, so the
 * Saturday reached the coach nowhere and it put a run on the Friday before.
 */
const records = {
  today: "2026-10-17",
  horizonEndDate: "2026-10-23",
  completions: [],
  plannedSessions: [
    planned("2026-10-20", "Run/walk", SERIES),
    planned("2026-10-24", "Run/walk", SERIES),
    planned("2026-10-25", "First continuous 2 km"),
    planned("2026-10-27", "Run/walk", SERIES),
  ],
  series: [],
};

const titlesByDate = (
  selection: ReturnType<typeof selectTrainingHistoryContext>,
) =>
  selection.planCommitments.map((entry) => `${entry.localDate} ${entry.title}`);

describe("the days right after a plan's horizon (owner, 17 Oct 2026)", () => {
  it("sends a repeating session's occurrence there, dated, when no rule is sent", () => {
    const selection = selectTrainingHistoryContext(records, {
      forwardDaysPastHorizon: 28,
      datedDaysPastHorizon: 3,
    });

    expect(titlesByDate(selection)).toEqual([
      "2026-10-20 Run/walk",
      "2026-10-24 Run/walk",
      "2026-10-25 First continuous 2 km",
    ]);
  });

  it("leaves occurrences further out to the one-offs-only rule, as before", () => {
    const selection = selectTrainingHistoryContext(records, {
      forwardDaysPastHorizon: 28,
      datedDaysPastHorizon: 3,
    });

    expect(titlesByDate(selection)).not.toContain("2026-10-27 Run/walk");
  });

  it("without the setting, sends no occurrence past the horizon, as before", () => {
    const selection = selectTrainingHistoryContext(records, {
      forwardDaysPastHorizon: 28,
    });

    expect(titlesByDate(selection)).toEqual([
      "2026-10-20 Run/walk",
      "2026-10-25 First continuous 2 km",
    ]);
  });
});
