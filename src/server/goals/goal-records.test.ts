import { describe, expect, it } from "vitest";

import {
  GOAL_STATUSES,
  GoalValidationError,
  parseExpectedRevision,
  parseGoalInput,
  parseOrderedGoalIds,
  selectActiveGoalContext,
  type GoalContextCandidate,
  type GoalStatus,
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

/** ADR-012 fixes this policy; these cases assert it status by status. */
describe("active goal context", () => {
  it.each<[GoalStatus, "targetable" | "historical" | "excluded"]>([
    ["active", "targetable"],
    ["achieved", "historical"],
    ["paused", "excluded"],
    ["abandoned", "excluded"],
  ])("places an unarchived %s goal in %s", (status, placement) => {
    const context = selectActiveGoalContext([goal({ status })]);

    expect(context.targetable).toHaveLength(placement === "targetable" ? 1 : 0);
    expect(context.historical).toHaveLength(placement === "historical" ? 1 : 0);
  });

  it.each(GOAL_STATUSES)("excludes an archived %s goal", (status) => {
    const context = selectActiveGoalContext([
      goal({ status, archivedAt: "2026-07-30T09:00:00.000Z" }),
    ]);

    expect(context.targetable).toHaveLength(0);
    expect(context.historical).toHaveLength(0);
  });

  it("never lets an achieved goal reach the targetable field", () => {
    const context = selectActiveGoalContext([
      goal({ id: "active", status: "active" }),
      goal({ id: "achieved", status: "achieved" }),
      goal({ id: "paused", status: "paused" }),
      goal({ id: "abandoned", status: "abandoned" }),
    ]);

    expect(context.targetable.map((entry) => entry.id)).toEqual(["active"]);
    expect(context.historical.map((entry) => entry.id)).toEqual(["achieved"]);
  });

  it("admits nothing for a status the policy has never named", () => {
    // A status added to the database later must stay invisible until ADR-012
    // is amended, so the gate is asserted against a value outside the union.
    const context = selectActiveGoalContext([
      goal({ status: "deferred" as GoalStatus }),
    ]);

    expect(context.targetable).toHaveLength(0);
    expect(context.historical).toHaveLength(0);
  });

  it("returns empty fields for an owner with no goals", () => {
    expect(selectActiveGoalContext([])).toEqual({
      targetable: [],
      historical: [],
    });
  });
});

function goal(
  overrides: Partial<GoalContextCandidate & { id: string }> = {},
): GoalContextCandidate & { id: string } {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    status: "active",
    archivedAt: null,
    ...overrides,
  };
}
