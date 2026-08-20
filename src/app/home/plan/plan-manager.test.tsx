import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useActionStateMock,
  changePlanActionMock,
  changeSeriesActionMock,
  materializePlanSeriesActionMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  changePlanActionMock: vi.fn(),
  changeSeriesActionMock: vi.fn(),
  materializePlanSeriesActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("./actions", () => ({ changePlanAction: changePlanActionMock }));
vi.mock("./series-actions", () => ({
  changeSeriesAction: changeSeriesActionMock,
  materializePlanSeriesAction: materializePlanSeriesActionMock,
}));

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionState,
} from "./action-state";
import { PlanManager, type PlanSessionView } from "./plan-manager";
import type { PlanSeriesView } from "./recurring-session-controls";
import {
  INITIAL_MATERIALIZE_ACTION_STATE,
  INITIAL_SERIES_ACTION_STATE,
  type SeriesActionState,
} from "./series-action-state";

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

function createTitleInput() {
  return document.querySelector<HTMLInputElement>("#create-session-title")!;
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
    expect(
      screen.getAllByText("Create session", { selector: "summary" }),
    ).toHaveLength(1);
    expect(screen.queryByText("Add a session")).toBeNull();
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

  it("uses one create flow for a single session or reviewed recurrence", () => {
    renderManager();
    const create = screen
      .getByText("Create session", { selector: "summary" })
      .closest("details")!;
    fireEvent.click(create.querySelector("summary")!);
    const operation = create.querySelector<HTMLInputElement>(
      "input[name='operation']",
    )!;

    expect(operation).toHaveValue("add");
    expect(
      screen.getByRole("button", { name: "Create session" }),
    ).toBeVisible();
    expect(screen.queryByText("Recurrence", { selector: "legend" })).toBeNull();

    fireEvent.click(screen.getByLabelText("Repeat this session"));
    expect(operation).toHaveValue("add_series");
    expect(
      screen.getByText("Recurrence", { selector: "legend" }),
    ).toBeVisible();
    fireEvent.change(create.querySelector("#create-session-title")!, {
      target: { value: "Tuesday tempo" },
    });
    fireEvent.change(create.querySelector("#create-session-sport")!, {
      target: { value: "Running" },
    });
    fireEvent.change(screen.getByLabelText("Repeat"), {
      target: { value: "daily" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review recurring sessions" }),
    );

    expect(
      screen.getByRole("heading", { name: "First occurrences" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create recurring sessions" }),
    ).toBeVisible();
  });

  it("keeps a cancelled session on the record rather than hiding it", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ status: "cancelled" }),
    ]);
    const day = document.querySelector(`[data-plan-date="${TODAY}"]`)!;

    expect(day.textContent).toContain("Cancelled, kept on the record");
    expect(day.textContent).toContain("Nothing planned.");
  });

  it("does not discard a create draft when a date control is submitted", () => {
    const { rerender } = renderManager();
    const details = screen
      .getByText("Create session", { selector: "summary" })
      .closest("details")!;
    details.open = true;
    fireEvent.change(createTitleInput(), {
      target: { value: "Half in progress" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: LATER },
    });
    expect(createTitleInput()).toHaveValue("Half in progress");

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

    expect(createTitleInput()).toHaveValue("Half in progress");
    expect(details.open).toBe(true);
  });

  it("clears the form that saved and re-seeds the form that was refused", () => {
    const { rerender } = renderManager();
    fireEvent.change(createTitleInput(), {
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
    expect(createTitleInput()).toHaveValue("");

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

    expect(createTitleInput()).toHaveValue("Eleventh");
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
    fireEvent.click(screen.getByText("Edit", { selector: "summary" }));
    expect(screen.getAllByText("Only this session").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("This and all future sessions").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("Remove", { selector: "summary" }));
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

  it("exposes only Edit, Remove, and the lock control on a session card", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = screen
      .getByRole("heading", { name: "Aerobic run" })
      .closest("li")!;
    const actionArea = card.querySelector("[data-session-actions]")!;

    expect(card).toContainElement(actionArea);
    expect(Array.from(actionArea.children)).toHaveLength(3);
    expect(
      Array.from(actionArea.querySelectorAll(":scope > details > summary")).map(
        (summary) => summary.textContent,
      ),
    ).toEqual(["Edit", "Remove"]);
    expect(actionArea.querySelector(":scope > form")?.textContent).toBe("Lock");
    expect(screen.queryByRole("link", { name: "Repeat" })).toBeNull();
    expect(screen.queryByText("Move", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Duplicate", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Cancel", { selector: "summary" })).toBeNull();
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

    fireEvent.click(screen.getByText("Remove", { selector: "summary" }));
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

  it("yields a retained series receipt to a newer ordinary plan action", () => {
    let planState = INITIAL_PLAN_ACTION_STATE;
    let planPending = false;
    let seriesState: SeriesActionState = INITIAL_SERIES_ACTION_STATE;
    const planDispatch = vi.fn();
    const seriesDispatch = vi.fn();

    useActionStateMock.mockImplementation((actionDefinition) => {
      if (actionDefinition === changePlanActionMock) {
        return [planState, planDispatch, planPending];
      }
      if (actionDefinition === changeSeriesActionMock) {
        return [seriesState, seriesDispatch, false];
      }
      return [INITIAL_MATERIALIZE_ACTION_STATE, vi.fn(), false];
    });

    const recurringSession = session({
      seriesId: "7f000000-0000-4000-8000-000000000099",
      occurrenceDate: TODAY,
    });
    const props = {
      today: TODAY,
      dates: DATES,
      expectedRevision: 3,
      recoveryDates: [DATES[3]],
      series: [series()],
    };
    const { rerender } = render(
      <PlanManager {...props} sessions={[recurringSession]} />,
    );

    fireEvent.click(screen.getByText("Remove", { selector: "summary" }));
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Remove this and all future sessions",
        })
        .closest("form")!,
    );
    expect(seriesDispatch).toHaveBeenCalledOnce();

    seriesState = {
      status: "saved",
      message:
        "Future recurring sessions removed permanently: 2 unchanged removed, 1 changed removed, 1 locked kept.",
      submission: 1,
      operation: "end_series",
      sessionId: recurringSession.id,
      effect: { deleted: 2, divergedDeleted: 1, lockedKept: 1 },
    };
    rerender(<PlanManager {...props} sessions={[]} expectedRevision={4} />);

    const managerStatus = screen.getAllByRole("status")[0];
    expect(managerStatus).toBeVisible();
    expect(managerStatus).toHaveTextContent(/2 unchanged removed/);

    fireEvent.submit(
      screen
        .getAllByRole("button", { name: "Mark recovery day" })[0]
        .closest("form")!,
    );
    expect(planDispatch).toHaveBeenCalledOnce();
    planPending = true;
    rerender(<PlanManager {...props} sessions={[]} expectedRevision={4} />);
    expect(managerStatus).toBeVisible();
    expect(managerStatus).toHaveTextContent(/Saving plan change/);
    expect(managerStatus).not.toHaveTextContent(/unchanged removed/);

    planPending = false;
    planState = {
      status: "conflict",
      message: "Your plan changed somewhere else.",
      submission: 1,
      operation: "set_recovery_day",
      localDate: TODAY,
      conflict: "stale",
    };
    rerender(<PlanManager {...props} sessions={[]} expectedRevision={4} />);

    expect(managerStatus).toBeVisible();
    expect(managerStatus).toHaveAttribute("aria-live", "polite");
    expect(managerStatus).toHaveTextContent(
      "Your plan changed somewhere else.",
    );
    expect(managerStatus).not.toHaveTextContent(/unchanged removed/);
    expect(
      screen.getByRole("link", { name: "Reload the current plan" }),
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
