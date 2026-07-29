import { describe, expect, it } from "vitest";

import {
  GoalValidationError,
  parseExpectedRevision,
  parseGoalInput,
  parseOrderedGoalIds,
} from "./goal-records";

const VALID = {
  title: "Run a trail event",
  desiredOutcome: "Finish with steady pacing.",
  category: "performance_event",
  activityAreas: ["Trail running"],
  startDate: "2026-07-29",
  targetDate: "2026-10-10",
  targetMetricLabel: "Finish time",
  targetMetricValue: "Under 3 hours",
  targetMetricUnit: "hours",
  priorityTier: "core",
};

describe("goal record validation", () => {
  it("normalizes a bounded sport-agnostic goal", () => {
    expect(
      parseGoalInput({ ...VALID, title: "  Run a trail event  " }),
    ).toEqual(VALID);
  });

  it.each([
    { ...VALID, title: "" },
    { ...VALID, desiredOutcome: "x".repeat(1001) },
    { ...VALID, category: "running_only" },
    { ...VALID, activityAreas: ["Run", "run"] },
    { ...VALID, targetDate: "2026-07-28" },
    { ...VALID, targetMetricValue: undefined },
    { ...VALID, priorityTier: "core", targetRank: 4 },
  ])("rejects invalid field boundaries", (input) => {
    expect(() => parseGoalInput(input)).toThrow(GoalValidationError);
  });

  it("validates collection revisions and unique ordered ids", () => {
    expect(parseExpectedRevision("4")).toBe(4);
    expect(
      parseOrderedGoalIds([
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000002",
      ]),
    ).toHaveLength(2);
    expect(() => parseExpectedRevision(-1)).toThrow(GoalValidationError);
    expect(() =>
      parseOrderedGoalIds([
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000001",
      ]),
    ).toThrow(GoalValidationError);
  });
});
