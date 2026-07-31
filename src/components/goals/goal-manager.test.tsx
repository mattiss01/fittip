import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("@/app/home/you/goals/actions", () => ({
  changeGoalAction: vi.fn(),
  INITIAL_GOAL_ACTION_STATE: { status: "idle", message: "" },
}));

import { INITIAL_GOAL_ACTION_STATE } from "@/app/home/you/goals/action-state";
import {
  CONFIRMATION_BUDGET_MS,
  WATCH_INTERVAL_MS,
} from "@/features/goals/mutation-watchdog";
import { GoalManager, type GoalView } from "./goal-manager";

afterEach(cleanup);
beforeEach(() => {
  useActionStateMock.mockReturnValue([
    INITIAL_GOAL_ACTION_STATE,
    vi.fn(),
    false,
  ]);
});

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

  it("requires explicit confirmations with consequences and restores focus on cancel", () => {
    render(
      <GoalManager
        expectedRevision={1}
        initialGoals={[goal({ title: "Trail event" })]}
      />,
    );
    const editor = screen
      .getByText("Review and edit", { selector: "summary" })
      .closest("details");
    expect(editor).not.toBeNull();
    editor!.open = true;

    for (const [action, consequence, confirmation] of [
      ["Mark achieved", /records the goal as achieved/i, "Confirm achieved"],
      ["Mark abandoned", /records the goal as abandoned/i, "Confirm abandoned"],
      ["Archive", /remain in your archive/i, "Confirm archive"],
      [
        "Delete if unused",
        /permanently deletes an unused goal/i,
        "Confirm permanent delete",
      ],
    ] as const) {
      const summary = screen.getByText(action, { selector: "summary" });
      const details = summary.closest("details");
      expect(details).not.toBeNull();
      details!.open = true;
      expect(screen.getByText(consequence)).toBeVisible();
      expect(screen.getByRole("button", { name: confirmation })).toBeEnabled();
      fireEvent.click(details!.querySelector('button[type="button"]')!);
      expect(summary).toHaveFocus();
    }
  });

  it("offers a usable reload action only for stale conflicts", () => {
    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_GOAL_ACTION_STATE,
        status: "conflict",
        conflict: "stale",
        message:
          "Goals changed in another tab. Reload before trying this change again.",
      },
      vi.fn(),
      false,
    ]);

    render(<GoalManager expectedRevision={2} initialGoals={[]} />);

    expect(
      screen.getByRole("link", { name: "Reload current goals" }),
    ).toHaveAttribute("href", "/home/you/goals");
  });

  it("keeps a submitted mutation silent while it is still in flight", () => {
    vi.useFakeTimers();
    useActionStateMock.mockReturnValue([
      INITIAL_GOAL_ACTION_STATE,
      vi.fn(),
      true,
    ]);

    render(<GoalManager expectedRevision={2} initialGoals={[]} />);
    act(() => {
      vi.advanceTimersByTime(CONFIRMATION_BUDGET_MS - WATCH_INTERVAL_MS);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Saving goal change…");
    expect(
      screen.queryByRole("link", { name: "Reload current goals" }),
    ).toBeNull();
    vi.useRealTimers();
  });

  it("reports an unconfirmed mutation instead of staying on Saving", () => {
    vi.useFakeTimers();
    useActionStateMock.mockReturnValue([
      INITIAL_GOAL_ACTION_STATE,
      vi.fn(),
      true,
    ]);

    render(<GoalManager expectedRevision={2} initialGoals={[]} />);
    act(() => {
      vi.advanceTimersByTime(CONFIRMATION_BUDGET_MS + WATCH_INTERVAL_MS);
    });

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "This goal change has not been confirmed. Reload to see whether it was saved.",
    );
    expect(notice).toHaveAttribute("data-state", "unconfirmed");
    expect(
      screen.getByRole("link", { name: "Reload current goals" }),
    ).toHaveAttribute("href", "/home/you/goals");
    vi.useRealTimers();
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
