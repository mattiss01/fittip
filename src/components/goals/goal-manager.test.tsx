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
  RECOVERY_NOTICE_MS,
  RENDER_GRACE_MS,
  WATCH_INTERVAL_MS,
} from "@/lib/app-router/transition-watchdog";
import { GoalManager, type GoalView } from "./goal-manager";

const RECOVERY_FLAG = "fittip.goals.recovered:v1";
const PAGE_ORIGIN = "http://localhost";
const PAGE_PATH = "/home/you/goals";

let clock = 0;
let reload: ReturnType<typeof vi.fn>;
let realLocation: Location | null = null;
let realPerformanceObserver: typeof globalThis.PerformanceObserver | undefined;
let observerStubbed = false;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  if (realLocation) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    realLocation = null;
  }
  if (observerStubbed) {
    if (realPerformanceObserver === undefined) {
      delete (globalThis as { PerformanceObserver?: unknown })
        .PerformanceObserver;
    } else {
      globalThis.PerformanceObserver = realPerformanceObserver;
    }
    observerStubbed = false;
  }
});

beforeEach(() => {
  useActionStateMock.mockReturnValue([
    INITIAL_GOAL_ACTION_STATE,
    vi.fn(),
    false,
  ]);
});

/**
 * The watchdog reads the monotonic clock rather than the wall clock, so the
 * fake timers are paired with an explicit `performance.now`. Nothing in these
 * tests depends on real elapsed time.
 */
function useControlledClock(startAt = 1_000) {
  clock = startAt;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => clock);
}

/** Steps the monotonic clock and the fake timers together, never in one jump,
 *  so a timer scheduled mid-way does not observe time that has not passed. */
function advance(ms: number) {
  const step = 50;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    clock += step;
    act(() => {
      vi.advanceTimersByTime(step);
    });
  }
}

function stubLocation() {
  realLocation = window.location;
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: PAGE_ORIGIN,
      pathname: PAGE_PATH,
      search: "",
      href: `${PAGE_ORIGIN}${PAGE_PATH}`,
      reload,
    },
  });
}

/** Reports the given resource entries as soon as the surface observes. */
function stubPerformanceObserver(
  entries: { name: string; responseEnd: number }[],
) {
  realPerformanceObserver = globalThis.PerformanceObserver;
  observerStubbed = true;
  globalThis.PerformanceObserver = class {
    constructor(
      private readonly report: (list: { getEntries: () => unknown[] }) => void,
    ) {}
    observe() {
      this.report({ getEntries: () => entries });
    }
    disconnect() {}
  } as unknown as typeof globalThis.PerformanceObserver;
}

describe("GoalManager", () => {
  it("separates ranked core and supporting attention", () => {
    render(
      <GoalManager
        today="2026-10-05"
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
        today="2026-10-05"
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
    expect(screen.getByText("History")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeEnabled();
  });

  it("provides a bounded empty state and add-goal control", () => {
    render(
      <GoalManager today="2026-10-05" expectedRevision={0} initialGoals={[]} />,
    );
    expect(screen.getByText(/no core goal yet/i)).toBeVisible();
    expect(screen.getByText("None yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add goal" })).toBeVisible();
  });

  it("asks a new goal for a title, an outcome, a sport, a date and its attention", () => {
    render(
      <GoalManager today="2026-10-05" expectedRevision={0} initialGoals={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));

    expect(screen.getByLabelText("Goal title")).toBeRequired();
    expect(screen.getByLabelText("Desired outcome")).toBeRequired();
    // Empty and required: there is no "Other" to leave standing.
    expect(screen.getByLabelText("Sports")).toBeRequired();
    expect(screen.getByLabelText("Sports")).toHaveValue("");
    // Typed, or picked from the calendar beside it; either way optional.
    expect(
      screen.getByRole("group", { name: "Target date (optional)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Pick target date (optional) from a calendar",
      }),
    ).toBeVisible();
    // Not asked: a new goal starts on the owner's day.
    expect(document.querySelector('input[name="startDate"]')).toHaveValue(
      "2026-10-05",
    );
    // A core slot is free, so that is where a new goal starts.
    expect(screen.getByRole("radio", { name: "Core" })).toBeChecked();
    for (const gone of ["Category", "Start date", "Target measure"]) {
      expect(screen.queryByLabelText(gone)).toBeNull();
    }

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Goal title")).toBeNull();
    expect(screen.getByRole("button", { name: "Add goal" })).toBeVisible();
  });

  it("starts a new goal on supporting once three core goals are active", () => {
    render(
      <GoalManager
        today="2026-10-05"
        expectedRevision={3}
        initialGoals={["1", "2", "3"].map((id) =>
          goal({ id, title: `Core ${id}`, activeRank: Number(id) }),
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));

    expect(screen.getByRole("radio", { name: "Supporting" })).toBeChecked();
  });

  it("closes the add form once its goal is created and keeps it on a refusal", () => {
    const view = render(
      <GoalManager today="2026-10-05" expectedRevision={0} initialGoals={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));

    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_GOAL_ACTION_STATE,
        status: "validation",
        message: "Check the goal details and dates.",
        submission: 1,
        operation: "create",
        draft: { title: "Half typed" },
      },
      vi.fn(),
      false,
    ]);
    view.rerender(
      <GoalManager today="2026-10-05" expectedRevision={0} initialGoals={[]} />,
    );
    expect(screen.getByLabelText("Goal title")).toHaveValue("Half typed");

    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_GOAL_ACTION_STATE,
        status: "saved",
        message: "Goal created.",
        submission: 2,
        operation: "create",
      },
      vi.fn(),
      false,
    ]);
    view.rerender(
      <GoalManager today="2026-10-05" expectedRevision={1} initialGoals={[]} />,
    );
    expect(screen.queryByLabelText("Goal title")).toBeNull();
  });

  it("reorders a list from the keyboard on a card's number", () => {
    const action = vi.fn();
    useActionStateMock.mockReturnValue([
      INITIAL_GOAL_ACTION_STATE,
      action,
      false,
    ]);
    render(
      <GoalManager
        today="2026-10-05"
        expectedRevision={7}
        initialGoals={[
          goal({ id: "1", title: "Trail event", activeRank: 1 }),
          goal({ id: "2", title: "Swim endurance", activeRank: 2 }),
        ]}
      />,
    );

    const handle = screen.getByRole("button", {
      name: /^Trail event: rank 1 of 2/,
    });
    // The first card has nowhere to go up to.
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(action).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(handle, { key: "ArrowDown" });
    });
    expect(action).toHaveBeenCalledTimes(1);
    // Still focusable, so the next arrow key lands on it.
    expect(handle).not.toBeDisabled();
    const sent = action.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(sent)).toEqual({
      operation: "reorder",
      expectedRevision: "7",
      priorityTier: "core",
      orderedGoalIds: "2,1",
    });
  });

  it("opens one goal for editing, without grips, and closes it on its save", () => {
    const goals = [
      goal({
        id: "1",
        title: "Trail event",
        activeRank: 1,
        activityAreas: ["Trail running"],
        targetDate: "2026-12-31",
      }),
      goal({ id: "2", title: "Swim endurance", activeRank: 2 }),
    ];
    const view = render(
      <GoalManager
        today="2026-10-05"
        expectedRevision={1}
        initialGoals={goals}
      />,
    );
    // The card says what the goal is for and by when, and nothing about its
    // kind or tier: the list it sits in says that.
    expect(screen.getByText("Trail running · By 31 Dec 2026")).toBeVisible();
    const handles = () => screen.getAllByRole("button", { name: /: rank \d/ });
    expect(
      handles().every(
        (handle) => handle.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByLabelText("Goal title")).toHaveValue("Trail event");
    expect(screen.getByRole("radio", { name: "Core" })).toBeChecked();
    expect(
      handles().every(
        (handle) => handle.getAttribute("aria-disabled") === "true",
      ),
    ).toBe(true);

    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_GOAL_ACTION_STATE,
        status: "saved",
        message: "Goal updated.",
        submission: 1,
        operation: "edit",
        goalId: "1",
      },
      vi.fn(),
      false,
    ]);
    view.rerender(
      <GoalManager
        today="2026-10-05"
        expectedRevision={2}
        initialGoals={goals}
      />,
    );
    expect(screen.queryByLabelText("Goal title")).toBeNull();
    expect(
      handles().every(
        (handle) => handle.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);
  });

  it("requires explicit confirmations with consequences and restores focus on cancel", () => {
    render(
      <GoalManager
        today="2026-10-05"
        expectedRevision={1}
        initialGoals={[goal({ title: "Trail event" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    for (const [action, consequence, confirmation] of [
      ["Achieved", /records the goal as achieved/i, "Confirm achieved"],
      ["Abandoned", /records the goal as abandoned/i, "Confirm abandoned"],
      [
        "Delete",
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

    render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );

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

    render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );
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

    render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );
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

  it("reloads a mutation whose reply never reached the screen", () => {
    useControlledClock();
    stubLocation();
    // A reply to this page's Server Action arrived and the surface is still
    // showing "Saving goal change…", which is the M2-05 shape exactly.
    stubPerformanceObserver([
      { name: `${PAGE_ORIGIN}${PAGE_PATH}`, responseEnd: clock },
    ]);
    useActionStateMock.mockReturnValue([
      INITIAL_GOAL_ACTION_STATE,
      vi.fn(),
      true,
    ]);

    render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );
    advance(RENDER_GRACE_MS + WATCH_INTERVAL_MS);

    const notice = screen.getByRole("status");
    // It must not claim the change saved: every outcome answers 200, so what
    // the reply said is unknown until the reload.
    expect(notice).toHaveTextContent(
      "This goal change did not appear. Reloading your goals to show what is saved.",
    );
    expect(notice).toHaveAttribute("data-state", "lost-render");
    // The marker must survive into the reloaded document so the surface can
    // explain the reload rather than flashing without a reason.
    expect(window.sessionStorage.getItem(RECOVERY_FLAG)).toBe("1");

    expect(reload).not.toHaveBeenCalled();
    advance(RECOVERY_NOTICE_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores a reply that belongs to a router prefetch", () => {
    useControlledClock();
    stubLocation();
    stubPerformanceObserver([
      { name: `${PAGE_ORIGIN}${PAGE_PATH}?_rsc=abc`, responseEnd: clock },
    ]);
    useActionStateMock.mockReturnValue([
      INITIAL_GOAL_ACTION_STATE,
      vi.fn(),
      true,
    ]);

    render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );
    advance(RENDER_GRACE_MS + WATCH_INTERVAL_MS);

    expect(screen.getByRole("status")).toHaveTextContent("Saving goal change…");
    expect(reload).not.toHaveBeenCalled();
  });

  it("cancels the queued reload when the mutation settles first", () => {
    useControlledClock();
    stubLocation();
    stubPerformanceObserver([
      { name: `${PAGE_ORIGIN}${PAGE_PATH}`, responseEnd: clock },
    ]);
    useActionStateMock.mockReturnValue([
      INITIAL_GOAL_ACTION_STATE,
      vi.fn(),
      true,
    ]);

    const view = render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );
    advance(RENDER_GRACE_MS + WATCH_INTERVAL_MS);
    expect(screen.getByRole("status")).toHaveAttribute(
      "data-state",
      "lost-render",
    );

    // The lost transition lands inside the notice window: the result is on
    // screen, so the reload that was queued for it must not fire.
    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_GOAL_ACTION_STATE,
        status: "saved",
        message: "Goal created.",
        submission: 1,
      },
      vi.fn(),
      false,
    ]);
    view.rerender(
      <GoalManager today="2026-10-05" expectedRevision={3} initialGoals={[]} />,
    );
    advance(RECOVERY_NOTICE_MS * 4);

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Goal created.");
  });

  it("explains a reload it triggered itself", () => {
    window.sessionStorage.setItem(RECOVERY_FLAG, "1");

    render(
      <GoalManager today="2026-10-05" expectedRevision={2} initialGoals={[]} />,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "Your last goal change did not appear, so these goals were reloaded. The list below is what is saved.",
    );
    expect(notice).toHaveAttribute("data-state", "recovered");
  });

  it("drops the explanation once another mutation reports its own result", () => {
    window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    useActionStateMock.mockReturnValue([
      {
        ...INITIAL_GOAL_ACTION_STATE,
        status: "saved",
        message: "Goal created.",
        submission: 1,
      },
      vi.fn(),
      false,
    ]);

    render(
      <GoalManager today="2026-10-05" expectedRevision={3} initialGoals={[]} />,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Goal created.");
    expect(notice).toHaveAttribute("data-state", "saved");
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
