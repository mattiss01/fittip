import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
    activities: [],
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
    // Cancelled is not the end of the line: the owner may want it back, which
    // is one tap because nothing is lost, or gone, which sits behind its panel.
    const reactivate = screen.getByRole("button", { name: "Reactivate" });
    expect(reactivate).toBeVisible();
    const reactivateForm = reactivate.closest("form")!;
    expect(reactivateForm.querySelector("input[name='operation']")).toHaveValue(
      "reactivate",
    );
    expect(reactivateForm.querySelector("input[name='sessionId']")).toHaveValue(
      session().id,
    );
    expect(reactivateForm.closest("details")).toBeNull();
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

  it("closes the create panel on a save that created a session, not on a refusal", () => {
    const { rerender } = renderManager();
    const panel = screen
      .getByText("Create session", { selector: "summary" })
      .closest("details")!;
    fireEvent.click(
      screen.getByText("Create session", { selector: "summary" }),
    );
    // jsdom opens the element but, unlike a browser, never fires `toggle`.
    fireEvent(panel, new Event("toggle"));
    expect(panel.open).toBe(true);

    const rerenderWith = (state: PlanActionState) => {
      useActionStateMock.mockReturnValue([state, action, false]);
      rerender(
        <PlanManager
          today={TODAY}
          dates={DATES}
          expectedRevision={4}
          sessions={[]}
          recoveryDates={[]}
        />,
      );
    };
    rerenderWith({
      status: "validation",
      message: "Check the session.",
      submission: 1,
      operation: "add",
    });
    expect(panel.open).toBe(true);

    rerenderWith({
      status: "saved",
      message: "Session added.",
      submission: 2,
      operation: "add",
    });
    expect(panel.open).toBe(false);
  });

  it("edits a recurring session in one form whose two buttons choose the scope", async () => {
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          seriesId: "7f000000-0000-4000-8000-000000000099",
          occurrenceDate: TODAY,
          hasDiverged: true,
          activities: [
            {
              name: "Strides",
              sport: "Running",
              instructions: null,
              measurementMode: "unmeasured",
              target: null,
            },
          ],
        }),
      ],
      [series()],
    );
    fireEvent.click(screen.getByText("Edit", { selector: "summary" }));

    const only = screen.getByRole("button", {
      name: "Change only this session",
    });
    const future = screen.getByRole("button", {
      name: "Change this and future sessions",
    });
    const form = only.closest("form")!;
    expect(future.closest("form")).toBe(form);
    // Each button carries its own operation, so the scope is chosen last.
    // Asserted on what is submitted: React drops a submitter's name and value
    // when it has a `formAction`, which an attribute check cannot see.
    const submittedOperation = async (button: HTMLElement) => {
      action.mockClear();
      await act(async () => fireEvent.click(button));
      const [formData] = action.mock.calls.at(-1) as [FormData];
      return formData.get("operation");
    };
    await expect(submittedOperation(only)).resolves.toBe("edit");
    await expect(submittedOperation(future)).resolves.toBe("edit_series");
    // The form submits the whole list, so an editor that opened empty would
    // erase what the occurrence already holds.
    const activities = form.querySelector<HTMLInputElement>(
      'input[name="activities"]',
    )!;
    expect(
      (JSON.parse(activities.value) as { name: string }[]).map(
        ({ name }) => name,
      ),
    ).toEqual(["Strides"]);
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

    // Cancel keeps its one scope: removing the future deletes, so it lives
    // under Delete.
    fireEvent.click(screen.getByText("Cancel", { selector: "summary" }));
    expect(
      screen.getByRole("button", { name: "Cancel only this session" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Remove this and all future sessions",
      }),
    ).toBeNull();
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
    // The card's own actions are still these four. Duplicate is a disclosure
    // inside the Edit panel rather than a standing section, and Move is gone
    // outright: the date is a field on the edit form now, asked once.
    expect(screen.queryByText("Move session")).toBeNull();
    expect(screen.queryByText("Move to")).toBeNull();
    // Present but nested inside the collapsed Edit panel, which is why this
    // asks whether it exists rather than whether it is visible.
    expect(screen.getByText("Duplicate", { selector: "summary" })).toBeTruthy();
  });

  it("asks for the date on the edit form and not in a section of its own", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const date = screen.getByLabelText("Date", {
      selector: "#edit-date-7f000000-0000-4000-8000-000000000001",
    });
    expect(date).toHaveValue(TODAY);
    expect(
      date.closest("form")?.querySelector("input[name='operation']"),
    ).toHaveValue("edit");
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

  it("asks an occurrence owner whether to delete only this session or the rest too", () => {
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
    const only = screen.getByRole("button", {
      name: "Delete only this session",
    });
    expect(only).toBeVisible();
    expect(
      only.closest("form")!.querySelector("input[name='operation']"),
    ).toHaveValue("delete");
    // M3-20: the series records the deleted date and leaves it empty.
    expect(
      screen.getByText(/series will not write this date back/i),
    ).toBeVisible();

    const future = screen.getByRole("button", {
      name: "Delete this and all future sessions",
    });
    expect(future).toBeVisible();
    expect(
      future.closest("form")!.querySelector("input[name='operation']"),
    ).toHaveValue("end_series");
    expect(screen.getByText(/Locked sessions are kept/)).toBeVisible();
    // The one-off's single button is not offered beside the two scopes.
    expect(screen.queryByRole("button", { name: "Delete session" })).toBeNull();
  });

  it("offers a cancelled occurrence Reactivate and both delete scopes", () => {
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

    expect(screen.getByRole("button", { name: "Reactivate" })).toBeVisible();
    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    expect(
      screen.getByRole("button", { name: "Delete only this session" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Delete this and all future sessions",
      }),
    ).toBeVisible();
  });

  it("reads a session logged on another day as done there, with no plan controls", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        localDate: DATES[3],
        log: {
          completionId: "7f000000-0000-4000-8000-0000000000c2",
          outcome: "completed",
          actualLocalDate: TODAY,
        },
      }),
    ]);
    const day = document.querySelector(`[data-plan-date="${DATES[3]}"]`)!;

    // Logged early, it is not still ahead on the day it was planned for.
    expect(day.querySelector("[data-logged]")?.textContent).toMatch(
      /Running · Completed on \w{3} \d{1,2} \w{3}/,
    );
    expect(day.querySelector("[data-logged] a")?.getAttribute("href")).toBe(
      "/home/log?completion=7f000000-0000-4000-8000-0000000000c2",
    );
    expect(day.querySelector("summary")).toBeNull();
  });

  it("keeps the card and its controls for a session logged on its own day", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        log: {
          completionId: "7f000000-0000-4000-8000-0000000000c3",
          outcome: "completed",
          actualLocalDate: TODAY,
        },
      }),
    ]);

    // Ending a series from today's logged occurrence starts here.
    expect(document.querySelector("[data-logged]")).toBeNull();
    expect(screen.getByText("Delete", { selector: "summary" })).toBeVisible();
  });

  it("reads a cancelled session trained anyway as logged, with no plan controls", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        status: "cancelled",
        log: {
          completionId: "7f000000-0000-4000-8000-0000000000c1",
          outcome: "completed",
          actualLocalDate: TODAY,
        },
      }),
    ]);
    const day = document.querySelector(`[data-plan-date="${TODAY}"]`)!;

    // Logged on its own day, so no date is added.
    expect(day.textContent).toContain("Running · Completed");
    expect(day.textContent).not.toMatch(/Completed on/);
    expect(day.textContent).not.toContain("Cancelled");
    expect(day.textContent).not.toContain("Nothing planned.");
    expect(
      screen.getByRole("link", { name: "Edit log" }).getAttribute("href"),
    ).toBe("/home/log?completion=7f000000-0000-4000-8000-0000000000c1");
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
    expect(screen.queryByText("Delete", { selector: "summary" })).toBeNull();
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

    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    expect(
      screen.queryByRole("button", {
        name: "Delete this and all future sessions",
      }),
    ).toBeNull();
    expect(screen.getByText(/only this session can be deleted/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete only this session" }),
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

    fireEvent.click(screen.getByText("Delete", { selector: "summary" }));
    fireEvent.submit(
      screen
        .getByRole("button", {
          name: "Delete this and all future sessions",
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
