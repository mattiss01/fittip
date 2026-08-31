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

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: DATES[2] },
    });
    fireEvent.click(screen.getByLabelText("Repeat this session"));
    expect(operation).toHaveValue("add_series");
    expect(
      screen.getByText("Recurrence", { selector: "legend" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Wed")).toBeChecked();
    expect(screen.getByLabelText("Mon")).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: DATES[3] },
    });
    expect(screen.getByLabelText("Thu")).toBeChecked();
    expect(screen.getByLabelText("Wed")).not.toBeChecked();

    fireEvent.change(create.querySelector("#create-session-title")!, {
      target: { value: "Thursday tempo" },
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
    // Cancelled is not the end of the line: the owner who cancelled it may
    // next want it gone, and delete is the only verb left that can do that.
    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    expect(
      screen.getByRole("button", { name: "Delete session" }),
    ).toBeVisible();
    expect(
      day.querySelector("input[name='operation'][value='delete']"),
    ).not.toBeNull();
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

    fireEvent.click(screen.getByText("Cancel", { selector: "summary" }));
    expect(
      screen.getByText(/Permanent\. Removes this occurrence/),
    ).toBeVisible();
    expect(screen.getByText(/Locked sessions are kept/)).toBeVisible();
    expect(screen.getByText(/completed training is untouched/)).toBeVisible();
    // Scoped: the card's own Delete panel says "no undo" too, and it means
    // something narrower there.
    expect(
      screen.getByText(/Permanent\. Removes this occurrence/).textContent,
    ).toMatch(/no undo/);
    expect(
      screen.getByRole("button", {
        name: "Remove this and all future sessions",
      }),
    ).toBeVisible();
  });

  it("exposes Edit, Cancel, Delete, and the lock control on a session card", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = screen
      .getByRole("heading", { name: "Aerobic run" })
      .closest("li")!;
    const actionArea = card.querySelector<HTMLElement>(
      "[data-session-actions]",
    )!;

    expect(card).toContainElement(actionArea);
    expect(Array.from(actionArea.children)).toHaveLength(4);
    expect(
      Array.from(actionArea.querySelectorAll(":scope > details > summary")).map(
        (summary) => summary.textContent,
      ),
    ).toEqual(["Edit", "Cancel", "Delete"]);
    expect(actionArea.querySelector(":scope > form")?.textContent).toBe("Lock");
    // "Remove" is retired as a label: it could not tell the two verbs apart.
    expect(screen.queryByText("Remove", { selector: "summary" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Repeat" })).toBeNull();
    expect(screen.queryByText("Move", { selector: "summary" })).toBeNull();
    expect(screen.queryByText("Duplicate", { selector: "summary" })).toBeNull();
  });

  it("says what each removal verb keeps, and submits the matching operation", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = screen
      .getByRole("heading", { name: "Aerobic run" })
      .closest("li")!;

    fireEvent.click(screen.getByText("Cancel", { selector: "summary" }));
    expect(
      screen.getByText(/keeps the session on the record as cancelled/i),
    ).toBeVisible();
    const cancelForm = screen
      .getByRole("button", { name: "Cancel session" })
      .closest("form")!;
    expect(cancelForm.querySelector("input[name='operation']")).toHaveValue(
      "cancel",
    );

    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    const deletePanel = screen.getByText(
      /does not keep it on the record/i,
    ) as HTMLElement;
    expect(deletePanel).toBeVisible();
    expect(deletePanel.textContent).toMatch(/no undo/i);
    expect(deletePanel.textContent).toMatch(/logged training against/i);
    // A one-off delete really is permanent, so it says so and says nothing
    // about a series it does not belong to.
    expect(deletePanel.textContent).toMatch(/^Permanent\./);
    expect(deletePanel.textContent).not.toMatch(/repeats/i);
    const deleteForm = screen
      .getByRole("button", { name: "Delete session" })
      .closest("form")!;
    expect(deleteForm.querySelector("input[name='operation']")).toHaveValue(
      "delete",
    );
    expect(deleteForm.querySelector("input[name='sessionId']")).toHaveValue(
      session().id,
    );
    expect(card).toContainElement(deleteForm);
  });

  it("warns an occurrence owner that its series writes the date back", () => {
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          seriesId: "7f000000-0000-4000-8000-000000000099",
          occurrenceDate: TODAY,
        }),
      ],
      [series()],
    );

    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    const panel = screen.getByText(/This session repeats/i);
    expect(panel).toBeVisible();
    // The accepted behavior of 29 August 2026. Deleting an occurrence is not
    // permanent, so the panel must not claim it is.
    expect(panel.textContent).toMatch(
      /writes the occurrence back in the same step/i,
    );
    // What returns is the series' version, not the owner's. Naming the losses
    // is the whole point of this paragraph.
    expect(panel.textContent).toMatch(/is replaced/i);
    expect(panel.textContent).toMatch(/the lock is cleared/i);
    expect(panel.textContent).toMatch(
      /moved reappears on the series date rather than this one/i,
    );
    // The escape route quotes the control the owner will actually see.
    expect(panel.textContent).toContain("Remove this and all future sessions");
    expect(panel.textContent).not.toMatch(/Permanent\./);
    expect(panel.textContent).not.toMatch(/no undo/i);
    expect(panel.textContent).not.toMatch(/undoes your cancellation/i);
  });

  it("calls a moved occurrence permanent once its series stops filling that date", () => {
    // Reachable in a day: move an occurrence forward, wait for its rule date to
    // fall behind today. The materializer fills only today..today+13, so this
    // delete really does stick - and the control the refill warning quotes is
    // not rendered here either, which is why one predicate decides both.
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          localDate: DATES[4],
          seriesId: "7f000000-0000-4000-8000-000000000099",
          occurrenceDate: "2026-08-10",
        }),
      ],
      [{ ...series(), startDate: "2026-08-01" }],
    );

    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    const panel = screen.getByText(/^Permanent\./);
    expect(panel.textContent).toMatch(/series will not write this date back/i);
    expect(panel.textContent).not.toMatch(/This session repeats/i);
    // Naming a control the same predicate has withheld is the defect this
    // branch exists to prevent.
    expect(panel.textContent).not.toContain(
      "Remove this and all future sessions",
    );
    expect(
      screen.queryByRole("button", {
        name: "Remove this and all future sessions",
      }),
    ).toBeNull();
  });

  it("tells a cancelled occurrence owner that deleting undoes the cancel", () => {
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          status: "cancelled",
          seriesId: "7f000000-0000-4000-8000-000000000099",
          occurrenceDate: TODAY,
        }),
      ],
      [series()],
    );

    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    const panel = screen.getByText(/This session repeats/i);
    expect(panel.textContent).toMatch(/it comes back active/i);
    expect(panel.textContent).toMatch(/undoes your cancellation/i);
    expect(panel.textContent).toMatch(/the lock is cleared/i);
    // The cancelled card has no Cancel panel of its own, so the way out is on
    // the session that returns.
    expect(panel.textContent).toContain("Remove this and all future sessions");
    expect(panel.textContent).toMatch(/on the session that returns/i);
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

    fireEvent.click(screen.getByText("Cancel", { selector: "summary" }));
    expect(
      screen.queryByRole("button", {
        name: "Remove this and all future sessions",
      }),
    ).toBeNull();
    expect(
      screen.getByText(/only this session can be cancelled/i),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel only this session" }),
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

    fireEvent.click(screen.getByText("Cancel", { selector: "summary" }));
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
        "Future recurring sessions removed permanently: 1 unchanged removed, 1 changed removed, 1 locked kept, 1 completed kept.",
      submission: 1,
      operation: "end_series",
      sessionId: recurringSession.id,
      effect: {
        deleted: 2,
        divergedDeleted: 1,
        lockedKept: 1,
        completedKept: 1,
      },
    };
    rerender(<PlanManager {...props} sessions={[]} expectedRevision={4} />);

    const managerStatus = screen.getAllByRole("status")[0];
    expect(managerStatus).toBeVisible();
    expect(managerStatus).toHaveTextContent(/1 unchanged removed/);

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
