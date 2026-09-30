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
  replaceMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  changePlanActionMock: vi.fn(),
  changeSeriesActionMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("../../actions", () => ({ changePlanAction: changePlanActionMock }));
vi.mock("../../cancellation-actions", () => ({
  setCancellationReasonAction: vi.fn(),
}));
vi.mock("../../series-actions", () => ({
  changeSeriesAction: changeSeriesActionMock,
}));

import {
  INITIAL_PLAN_ACTION_STATE,
  type PlanActionState,
} from "../../action-state";
import type { PlanSeriesView } from "../../recurring-session-controls";
import {
  INITIAL_SERIES_ACTION_STATE,
  type SeriesActionState,
} from "../../series-action-state";
import type { PlanSessionView } from "../../session-view";
import { SessionPage, type SessionCancellationView } from "./session-page";

const TODAY = "2026-08-17";
const DATES = Array.from({ length: 14 }, (_, offset) => {
  const date = new Date(`${TODAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
});
const SERIES_ID = "7f000000-0000-4000-8000-000000000099";

let planState: PlanActionState;
let seriesState: SeriesActionState;
const planDispatch = vi.fn();
const seriesDispatch = vi.fn();

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

function series(overrides: Partial<PlanSeriesView> = {}): PlanSeriesView {
  return {
    id: SERIES_ID,
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
    ...overrides,
  };
}

function occurrence(overrides: Partial<PlanSessionView> = {}) {
  return session({ seriesId: SERIES_ID, occurrenceDate: TODAY, ...overrides });
}

function page(
  value: PlanSessionView | null,
  segment?: PlanSeriesView,
  origin: "plan" | "today" = "plan",
  cancellation: SessionCancellationView | null = null,
) {
  return (
    <SessionPage
      session={value}
      series={segment}
      today={TODAY}
      dates={DATES}
      expectedRevision={3}
      origin={origin}
      originDate={null}
      cancellation={cancellation}
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
}

function choose(label: string) {
  openMenu();
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("SessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    planState = INITIAL_PLAN_ACTION_STATE;
    seriesState = INITIAL_SERIES_ACTION_STATE;
    useActionStateMock.mockImplementation((definition) =>
      definition === changeSeriesActionMock
        ? [seriesState, seriesDispatch, false]
        : [planState, planDispatch, false],
    );
  });

  afterEach(cleanup);

  it("reads the session first, with Edit in sight and the rest behind ⋯", () => {
    render(page(session({ intent: "Easy, conversational." })));

    expect(
      screen.getByRole("heading", { level: 1, name: "Aerobic run" }),
    ).toBeVisible();
    expect(screen.getByText("Easy, conversational.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Plan/ })).toHaveAttribute(
      "href",
      `/home/plan?day=${TODAY}#plan-day-${TODAY}`,
    );
    // Nothing edits until Edit is chosen.
    expect(document.querySelector("form")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();

    const more = screen.getByRole("button", { name: "More actions" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    openMenu();
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(
      Array.from(
        document.querySelectorAll(
          `#${CSS.escape(more.getAttribute("aria-controls")!)} li`,
        ),
      ).map((item) => item.textContent),
    ).toEqual([
      "Log this session",
      "Duplicate",
      "Save to library",
      "Lock",
      "Cancel session",
      "Delete",
    ]);
    expect(
      screen.getByRole("link", { name: "Log this session" }),
    ).toHaveAttribute(
      "href",
      `/home/log?plannedSession=${session().id}&date=${TODAY}`,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("returns to Today when it was opened from there", () => {
    render(page(session(), undefined, "today"));
    expect(screen.getByRole("link", { name: /Today/ })).toHaveAttribute(
      "href",
      `/home/today?date=${TODAY}`,
    );
  });

  it("asks for the date on the edit form, and closes it once the save lands", () => {
    const { rerender } = render(page(session()));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const date = screen.getByLabelText("Date", {
      selector: `#edit-date-${session().id}`,
    });
    expect(date).toHaveValue(TODAY);
    expect(
      date.closest("form")?.querySelector("input[name='operation']"),
    ).toHaveValue("edit");

    planState = {
      status: "validation",
      message: "Check the session.",
      submission: 1,
      operation: "edit",
      sessionId: session().id,
    };
    rerender(page(session()));
    expect(screen.getByRole("button", { name: "Save session" })).toBeVisible();

    planState = {
      status: "saved",
      message: "Session updated.",
      submission: 2,
      operation: "edit",
      sessionId: session().id,
    };
    rerender(page(session({ title: "Long run" })));
    expect(screen.queryByRole("button", { name: "Save session" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Session updated.");
    expect(
      screen.getByRole("heading", { level: 1, name: "Long run" }),
    ).toBeVisible();
  });

  it("locks in one tap from the menu", () => {
    render(page(session()));
    choose("Lock");

    const [formData] = planDispatch.mock.calls.at(-1) as [FormData];
    expect(Object.fromEntries(formData)).toEqual({
      operation: "set_lock",
      isLocked: "true",
      sessionId: session().id,
      expectedRevision: "3",
    });
  });

  it("offers a copy on any date in the window", () => {
    render(page(session()));
    choose("Duplicate");

    const form = screen
      .getByRole("button", { name: "Duplicate session" })
      .closest("form")!;
    expect(form.querySelector("input[name='operation']")).toHaveValue(
      "duplicate",
    );
    expect(form.querySelectorAll("option")).toHaveLength(14);
  });

  it("says what each removal verb keeps, and submits the matching operation", () => {
    render(page(session()));

    choose("Cancel session");
    expect(
      screen.getByText(/keeps the session on the record as cancelled/i),
    ).toBeVisible();
    expect(
      screen
        .getByRole("button", { name: "Cancel session" })
        .closest("form")!
        .querySelector("input[name='operation']"),
    ).toHaveValue("cancel");

    choose("Delete");
    const warning = screen.getByText(/does not keep it on the record/i);
    // A one-off delete really is permanent, so it says so and says nothing
    // about a series it does not belong to.
    expect(warning.textContent).toMatch(/^Permanent\./);
    expect(warning.textContent).toMatch(/no undo/i);
    expect(warning.textContent).toMatch(/logged training against/i);
    expect(warning.textContent).not.toMatch(/repeats/i);
    const form = screen
      .getByRole("button", { name: "Delete session" })
      .closest("form")!;
    expect(form.querySelector("input[name='operation']")).toHaveValue("delete");
    expect(form.querySelector("input[name='sessionId']")).toHaveValue(
      session().id,
    );
  });

  it("asks why on cancel, optionally, in the owner's own words", () => {
    render(page(session()));
    choose("Cancel session");

    const form = screen
      .getByRole("button", { name: "Cancel session" })
      .closest("form")!;
    const why = screen.getByLabelText("Why? (optional)");
    expect(form).toContainElement(why);
    expect(why).toHaveAttribute("name", "cancelReason");
    expect(why).toHaveAttribute("maxLength", "500");
    expect(why).toHaveValue("");
    expect(form.querySelector("input[type='radio']")).toBeNull();
  });

  it("asks why when cancelling only one occurrence too", () => {
    render(page(occurrence(), series()));
    choose("Cancel session");
    const form = screen
      .getByRole("button", { name: "Cancel only this session" })
      .closest("form")!;
    expect(form.querySelector("textarea[name='cancelReason']")).not.toBeNull();
  });

  it("shows why a session was cancelled, says Reactivate clears it, and edits it", () => {
    render(
      page(session({ status: "cancelled" }), undefined, "plan", {
        reason: "work ran late",
      }),
    );

    expect(
      document.querySelector("[data-cancellation-reason]")?.textContent,
    ).toBe("Why “work ran late”");
    expect(screen.getByText(/clears the reason/)).toBeVisible();

    choose("Edit reason");
    expect(screen.getByLabelText("Why? (optional)")).toHaveValue(
      "work ran late",
    );
    expect(screen.getByRole("button", { name: "Save reason" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear reason" })).toBeVisible();
    expect(screen.getByText(/not sent to a coach/)).toBeVisible();
  });

  it("lets a reason be added to a cancelled session from a past day", () => {
    render(page(session({ status: "cancelled", localDate: "2026-08-10" })));
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
    openMenu();
    expect(screen.getByRole("button", { name: "Add reason" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("goes back to the Plan at that day once a delete has removed the session", () => {
    const { rerender } = render(page(session()));
    choose("Delete");
    fireEvent.submit(
      screen.getByRole("button", { name: "Delete session" }).closest("form")!,
    );
    expect(planDispatch).toHaveBeenCalledOnce();

    planState = {
      status: "saved",
      message: "Session deleted.",
      submission: 1,
      operation: "delete",
      sessionId: session().id,
    };
    rerender(page(null));

    expect(screen.getByText("Session removed.")).toBeVisible();
    expect(replaceMock).toHaveBeenCalledWith(
      `/home/plan?day=${TODAY}#plan-day-${TODAY}`,
    );
  });

  it("offers a way back in when the sign-in has expired", () => {
    planState = {
      status: "session",
      message: "Your session ended. Sign in again before changing your plan.",
      submission: 1,
      operation: "set_lock",
      sessionId: session().id,
    };
    render(page(session()));
    expect(screen.getByRole("status")).toHaveTextContent(/Sign in again/);
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("returns to Today, and says so, when a delete was made from there", () => {
    const { rerender } = render(page(session(), undefined, "today"));
    choose("Delete");
    fireEvent.submit(
      screen.getByRole("button", { name: "Delete session" }).closest("form")!,
    );
    planState = {
      status: "saved",
      message: "Session deleted.",
      submission: 1,
      operation: "delete",
      sessionId: session().id,
    };
    rerender(page(null, undefined, "today"));

    expect(screen.getByText("Taking you back to Today.")).toBeVisible();
    expect(replaceMock).toHaveBeenCalledWith(`/home/today?date=${TODAY}`);
  });

  it("calls a this-and-future edit that replaced the occurrence a save", () => {
    const { rerender } = render(page(occurrence(), series()));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Change this and future sessions" }),
      );
    });
    seriesState = {
      status: "saved",
      message: "This and future sessions changed.",
      submission: 1,
      operation: "edit_series",
      sessionId: session().id,
    };
    rerender(page(null));

    expect(screen.getByText("Change saved.")).toBeVisible();
    expect(screen.queryByText("Session removed.")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith(
      `/home/plan?day=${TODAY}#plan-day-${TODAY}`,
    );
  });

  it("says a session is not there, without guessing why, when nothing removed it here", () => {
    render(page(null));
    expect(
      screen.getByRole("heading", { name: "That session is not there." }),
    ).toBeVisible();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("edits a recurring session in one form whose two buttons choose the scope", async () => {
    render(
      page(
        occurrence({
          hasDiverged: true,
          activities: [
            {
              personalActivityId: null,
              name: "Strides",
              sport: "Running",
              instructions: null,
              measurementMode: "unmeasured",
              target: null,
            },
          ],
        }),
        series(),
      ),
    );
    expect(screen.getByText("Recurring")).toBeVisible();
    expect(screen.getByText("Changed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const only = screen.getByRole("button", {
      name: "Change only this session",
    });
    const future = screen.getByRole("button", {
      name: "Change this and future sessions",
    });
    const form = only.closest("form")!;
    expect(future.closest("form")).toBe(form);
    // Asserted on what is submitted: React drops a submitter's name and value
    // when it has a `formAction`, which an attribute check cannot see.
    await act(async () => fireEvent.click(only));
    expect(
      (planDispatch.mock.calls.at(-1) as [FormData])[0].get("operation"),
    ).toBe("edit");
    await act(async () => fireEvent.click(future));
    expect(
      (seriesDispatch.mock.calls.at(-1) as [FormData])[0].get("operation"),
    ).toBe("edit_series");
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

  it("cancels an occurrence alone; removing the future is a delete", () => {
    render(page(occurrence(), series()));
    choose("Cancel session");
    expect(
      screen.getByRole("button", { name: "Cancel only this session" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /all future sessions/ }),
    ).toBeNull();
  });

  it("asks an occurrence owner whether to delete only this session or the rest too", () => {
    render(page(occurrence(), series()));
    choose("Delete");

    const only = screen.getByRole("button", {
      name: "Delete only this session",
    });
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
    expect(
      future.closest("form")!.querySelector("input[name='operation']"),
    ).toHaveValue("end_series");
    expect(screen.getByText(/Locked sessions are kept/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete session" })).toBeNull();
  });

  it("withholds future scopes from a locked survivor past the segment end", () => {
    render(
      page(occurrence({ isLocked: true }), series({ endDate: "2026-08-16" })),
    );
    choose("Delete");
    expect(
      screen.queryByRole("button", {
        name: "Delete this and all future sessions",
      }),
    ).toBeNull();
    expect(screen.getByText(/only this session can be deleted/i)).toBeVisible();
  });

  it("offers a cancelled session Reactivate in one tap, and Delete behind ⋯", () => {
    render(page(occurrence({ status: "cancelled" }), series()));

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    const [formData] = planDispatch.mock.calls.at(-1) as [FormData];
    expect(formData.get("operation")).toBe("reactivate");
    expect(formData.get("sessionId")).toBe(session().id);

    choose("Delete");
    expect(
      screen.getByRole("button", { name: "Delete only this session" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Delete this and all future sessions",
      }),
    ).toBeVisible();
  });

  it("offers a session logged on another day only its log", () => {
    render(
      page(
        session({
          localDate: DATES[3],
          log: {
            completionId: "7f000000-0000-4000-8000-0000000000c2",
            outcome: "completed",
            actualLocalDate: TODAY,
          },
        }),
      ),
    );

    expect(screen.getByRole("link", { name: "Edit log" })).toHaveAttribute(
      "href",
      "/home/log?completion=7f000000-0000-4000-8000-0000000000c2",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("keeps every plan verb for a session logged on its own day", () => {
    render(
      page(
        occurrence({
          log: {
            completionId: "7f000000-0000-4000-8000-0000000000c3",
            outcome: "completed",
            actualLocalDate: TODAY,
          },
        }),
        series(),
      ),
    );

    // Ending a series from today's logged occurrence starts here.
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    openMenu();
    expect(screen.getByRole("link", { name: "Edit log" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  it("lets a past session be logged and nothing else", () => {
    render(page(session({ localDate: "2026-08-10" }), undefined, "today"));

    expect(screen.getByText(/can no longer change it/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Log this session" }),
    ).toHaveAttribute(
      "href",
      `/home/log?plannedSession=${session().id}&date=2026-08-10`,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("yields a retained series receipt to a newer ordinary plan action", () => {
    const { rerender } = render(page(occurrence({ isLocked: true }), series()));
    choose("Delete");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Delete this and all future sessions" })
        .closest("form")!,
    );
    expect(seriesDispatch).toHaveBeenCalledOnce();

    // The locked occurrence survives its own series' end.
    seriesState = {
      status: "saved",
      message:
        "Future recurring sessions removed permanently: 1 unchanged removed, 0 changed removed, 1 locked kept, 0 completed kept.",
      submission: 1,
      operation: "end_series",
      sessionId: session().id,
    };
    rerender(page(occurrence({ isLocked: true }), series()));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/1 unchanged removed/);
    expect(replaceMock).not.toHaveBeenCalled();

    choose("Unlock");
    expect(planDispatch).toHaveBeenCalledOnce();
    planState = {
      status: "conflict",
      message: "Your plan changed somewhere else.",
      submission: 1,
      operation: "set_lock",
      sessionId: session().id,
      conflict: "stale",
    };
    rerender(page(occurrence({ isLocked: true }), series()));

    expect(status).toHaveTextContent("Your plan changed somewhere else.");
    expect(status).not.toHaveTextContent(/unchanged removed/);
    expect(
      screen.getByRole("link", { name: "Reload this session" }),
    ).toBeVisible();
  });
});
