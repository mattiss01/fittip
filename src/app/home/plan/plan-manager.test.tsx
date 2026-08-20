import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("./actions", () => ({ changePlanAction: vi.fn() }));

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionState,
} from "./action-state";
import { PlanManager, type PlanSessionView } from "./plan-manager";
import type { PlanSeriesView } from "./recurring-session-controls";

const TODAY = "2026-08-17";
const DATES = Array.from({ length: 14 }, (_, offset) => {
  const date = new Date(`${TODAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
});
const LATER = DATES[12];

const action = vi.fn();

function renderManager(
  state: PlanActionState = INITIAL_PLAN_ACTION_STATE,
  sessions: PlanSessionView[] = [],
  series: PlanSeriesView[] = [],
) {
  useActionStateMock.mockReturnValue([state, action, false]);
  return render(
    <PlanManager
      today={TODAY}
      dates={DATES}
      expectedRevision={3}
      sessions={sessions}
      recoveryDates={[DATES[3]]}
      series={series}
    />,
  );
}

function addTitleInput(date: string) {
  const day = document.querySelector(`[data-plan-date="${date}"]`);
  if (!day) throw new Error(`No day rendered for ${date}.`);
  return day.querySelector<HTMLInputElement>(`#add-${date}-title`)!;
}

function session(overrides: Partial<PlanSessionView> = {}): PlanSessionView {
  return {
    id: "7f000000-0000-4000-8000-000000000001",
    localDate: TODAY,
    position: 0,
    title: "Aerobic run",
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 60,
    note: null,
    isLocked: false,
    status: "active",
    activityCount: 0,
    seriesId: null,
    occurrenceDate: null,
    hasDiverged: false,
    ...overrides,
  };
}

describe("PlanManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(cleanup);

  it("shows the window from owner-local today and never a past date", () => {
    renderManager();
    const days = document.querySelectorAll("[data-plan-date]");

    expect(days).toHaveLength(14);
    expect(days[0].getAttribute("data-plan-date")).toBe(TODAY);
    expect(days[0].getAttribute("data-today")).toBe("true");
    expect(days[1].getAttribute("data-today")).toBe("false");
  });

  it("reads an unlabelled empty date as unplanned and a labelled one as recovery", () => {
    renderManager();
    const plain = document.querySelector(`[data-plan-date="${DATES[1]}"]`)!;
    const labelled = document.querySelector(`[data-plan-date="${DATES[3]}"]`)!;

    expect(plain.getAttribute("data-recovery")).toBe("false");
    expect(plain.textContent).toContain("Nothing planned.");
    expect(labelled.getAttribute("data-recovery")).toBe("true");
    expect(labelled.textContent).toContain(
      "Recovery day. Nothing is planned here.",
    );
    // Nothing on an empty date may imply completion, a streak, or a judgment.
    expect(plain.textContent).not.toMatch(/rest|complete|done|streak|missed/i);
  });

  it("keeps a cancelled session on the record rather than hiding it", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ status: "cancelled" }),
    ]);
    const day = document.querySelector(`[data-plan-date="${TODAY}"]`)!;

    expect(day.textContent).toContain("Cancelled, kept on the record");
    expect(day.textContent).toContain("Nothing planned.");
  });

  // The defect this test exists for: keying the uncontrolled forms on the
  // global submission counter remounted all fourteen add forms and every edit
  // form whenever anything on the surface was submitted.
  it("does not discard typing on one date when another date is submitted", () => {
    const { rerender } = renderManager();
    const details = document
      .querySelector(`[data-plan-date="${LATER}"]`)!
      .querySelector("details")!;
    details.open = true;
    fireEvent.change(addTitleInput(LATER), {
      target: { value: "Half in progress" },
    });
    expect(addTitleInput(LATER)).toHaveValue("Half in progress");

    // A recovery-day toggle on the first date now resolves.
    useActionStateMock.mockReturnValue([
      {
        status: "saved",
        message: "Recovery day set.",
        submission: 1,
        operation: "set_recovery_day",
        localDate: TODAY,
      } satisfies PlanActionState,
      action,
      false,
    ]);
    rerender(
      <PlanManager
        today={TODAY}
        dates={DATES}
        expectedRevision={4}
        sessions={[]}
        recoveryDates={[DATES[3], TODAY]}
      />,
    );

    expect(addTitleInput(LATER)).toHaveValue("Half in progress");
    expect(
      document
        .querySelector(`[data-plan-date="${LATER}"]`)!
        .querySelector("details")!.open,
    ).toBe(true);
  });

  it("clears the form that saved and re-seeds the form that was refused", () => {
    const { rerender } = renderManager();
    fireEvent.change(addTitleInput(TODAY), {
      target: { value: "Aerobic run" },
    });

    useActionStateMock.mockReturnValue([
      {
        status: "saved",
        message: "Session added.",
        submission: 1,
        operation: "add",
        localDate: TODAY,
      } satisfies PlanActionState,
      action,
      false,
    ]);
    rerender(
      <PlanManager
        today={TODAY}
        dates={DATES}
        expectedRevision={4}
        sessions={[session()]}
        recoveryDates={[DATES[3]]}
      />,
    );
    expect(addTitleInput(TODAY)).toHaveValue("");

    useActionStateMock.mockReturnValue([
      {
        status: "rule",
        message: "A date holds at most ten sessions. Cancel or move one first.",
        submission: 2,
        operation: "add",
        localDate: TODAY,
        conflict: "daily-session-limit",
        draft: {
          title: "Eleventh",
          sport: "Running",
          intent: "",
          expectedDurationMinutes: "",
          note: "",
        },
      } satisfies PlanActionState,
      action,
      false,
    ]);
    rerender(
      <PlanManager
        today={TODAY}
        dates={DATES}
        expectedRevision={4}
        sessions={[session()]}
        recoveryDates={[DATES[3]]}
      />,
    );

    expect(addTitleInput(TODAY)).toHaveValue("Eleventh");
    // M3-13 puts a second live region inside each session card, for the
    // save-to-library control. The manager's own notice is the first one.
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      /at most ten sessions/i,
    );
  });

  it("offers a reload only when the surface knows it is out of date", () => {
    const { rerender } = renderManager();
    expect(screen.queryByRole("link", { name: /Reload/ })).toBeNull();

    useActionStateMock.mockReturnValue([
      {
        status: "conflict",
        message: "Your plan changed somewhere else.",
        submission: 1,
        operation: "cancel",
        conflict: "stale",
      } satisfies PlanActionState,
      action,
      false,
    ]);
    rerender(
      <PlanManager
        today={TODAY}
        dates={DATES}
        expectedRevision={3}
        sessions={[]}
        recoveryDates={[]}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Reload the current plan" }),
    ).toHaveAttribute("href", "/home/plan");
  });

  it("identifies recurring and changed occurrences and states both scopes", () => {
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          seriesId: "7f000000-0000-4000-8000-000000000099",
          occurrenceDate: TODAY,
          hasDiverged: true,
        }),
      ],
      [series()],
    );

    expect(screen.getByText("Recurring")).toBeVisible();
    expect(screen.getByText("Changed")).toBeVisible();
    fireEvent.click(
      screen.getByText("Change recurring session", { selector: "summary" }),
    );
    expect(screen.getAllByText("Only this session").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("This and all future sessions").length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByText("Remove recurring session", { selector: "summary" }),
    );
    expect(
      screen.getByText(/Permanent\. Removes this occurrence/),
    ).toBeVisible();
    expect(screen.getByText(/Locked sessions are kept/)).toBeVisible();
    expect(screen.getByText(/completed training is untouched/)).toBeVisible();
    expect(screen.getByText(/no undo/)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Remove this and all future sessions",
      }),
    ).toBeVisible();
  });

  it("withholds future scopes from a locked survivor past the segment end", () => {
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          isLocked: true,
          seriesId: "7f000000-0000-4000-8000-000000000099",
          occurrenceDate: TODAY,
        }),
      ],
      [{ ...series(), endDate: DATES[0].replace(/17$/, "16") }],
    );

    fireEvent.click(
      screen.getByText("Remove recurring session", { selector: "summary" }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Remove this and all future sessions",
      }),
    ).toBeNull();
    expect(screen.getByText(/only this session can be removed/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove only this session" }),
    ).toBeVisible();
  });
});

function series(): PlanSeriesView {
  return {
    id: "7f000000-0000-4000-8000-000000000099",
    frequency: "daily",
    intervalCount: 1,
    weekdays: [],
    startDate: TODAY,
    endDate: null,
    title: "Aerobic run",
    sport: "Running",
    intent: null,
    expectedDurationMinutes: 60,
    note: null,
  };
}
