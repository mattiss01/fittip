import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/home/you/goals/actions", () => ({
  changeGoalAction: vi.fn(),
  INITIAL_GOAL_ACTION_STATE: { status: "idle", message: "" },
}));

import { GoalManager, type GoalView } from "./goal-manager";

afterEach(cleanup);

describe("GoalManager", () => {
  it("separates ranked core and supporting attention", () => {
    render(
      <GoalManager
        expectedRevision={4}
        initialGoals={[
          goal({ id: "1", title: "Trail event", priorityTier: "core" }),
          goal({
            id: "2",
            title: "Mobility habit",
            priorityTier: "supporting",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Core goals" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Supporting goals" }),
    ).toBeVisible();
    expect(screen.getByText("Trail event")).toBeVisible();
    expect(screen.getByText("Mobility habit")).toBeVisible();
    expect(screen.getByLabelText("2 core slots open")).toBeVisible();
  });

  it("keeps paused and terminal records outside active ranks", () => {
    render(
      <GoalManager
        expectedRevision={2}
        initialGoals={[
          goal({
            id: "3",
            title: "Paused run",
            status: "paused",
            activeRank: null,
          }),
          goal({
            id: "4",
            title: "Finished event",
            status: "achieved",
            activeRank: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Paused")).toBeVisible();
    expect(screen.getByText("History and archive")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeEnabled();
  });

  it("provides a bounded empty state and add-goal control", () => {
    render(<GoalManager expectedRevision={0} initialGoals={[]} />);
    expect(screen.getByText(/no core goal yet/i)).toBeVisible();
    expect(screen.getByText(/supporting goals stay visible/i)).toBeVisible();
    expect(screen.getByText("Add goal")).toBeVisible();
  });
});

function goal(overrides: Partial<GoalView>): GoalView {
  return {
    id: "0",
    title: "Goal",
    desiredOutcome: "Outcome",
    category: "other",
    activityAreas: [],
    startDate: "2026-07-29",
    targetDate: null,
    targetDetail: null,
    targetMetricLabel: null,
    targetMetricValue: null,
    targetMetricUnit: null,
    priorityTier: "core",
    status: "active",
    activeRank: 1,
    rationale: null,
    constraints: null,
    archivedAt: null,
    ...overrides,
  };
}
