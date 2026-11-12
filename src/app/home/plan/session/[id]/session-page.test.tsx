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
import {
  SessionPage,
  type CoachCancellationView,
  type SessionCancellationView,
  type StandsInForView,
} from "./session-page";

const TODAY = "2026-08-17";
const DATES = Array.from({ length: 14 }, (_, offset) => {
  const date = new Date(`${TODAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
});
const SERIES_ID = "7f000000-0000-4000-8000-000000000099";
const OLD_SESSION_ID = "7f000000-0000-4000-8000-000000000098";

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
    startTime: null,
    note: null,
    coachNote: null,
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
    startTime: null,
    note: null,
    coachNote: null,
    ...overrides,
  };
}

/** The session's edit page (owner, 19 Oct 2026). */
function editPage(value: PlanSessionView | null, segment?: PlanSeriesView) {
  return page(value, segment, "plan", null, {}, true);
}

function occurrence(overrides: Partial<PlanSessionView> = {}) {
  return session({ seriesId: SERIES_ID, occurrenceDate: TODAY, ...overrides });
}

function page(
  value: PlanSessionView | null,
  segment?: PlanSeriesView,
  origin: "plan" | "today" = "plan",
  cancellation: SessionCancellationView | null = null,
  coach: {
    coachCancellation?: CoachCancellationView | null;
    standsInFor?: StandsInForView | null;
  } = {},
  editing = false,
) {
  return (
    <SessionPage
      editing={editing}
      session={value}
      series={segment}
      today={TODAY}
      dateRange={{ first: DATES[0], last: DATES[DATES.length - 1] }}
      repeatsThrough={DATES[DATES.length - 1]}
      expectedRevision={3}
      origin={origin}
      originDate={null}
      cancellation={cancellation}
      coachCancellation={coach.coachCancellation ?? null}
      standsInFor={coach.standsInFor ?? null}
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

/** The future scope reads "The whole series" before any date has passed. */
const FUTURE_SCOPE = /^(The whole series|This and following)/;

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
    // Nothing edits here: Edit is a page of its own (owner, 19 Oct 2026).
    expect(document.querySelector("form")).toBeNull();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/home/plan/session/${session().id}/edit`,
    );

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
      "Log results",
      // On its own day it can be tracked live (ADR-037).
      "Track live",
      "Duplicate",
      "Repeat…",
      "Save to library",
      "Cancel session",
      "Delete",
    ]);
    expect(screen.getByRole("link", { name: "Log results" })).toHaveAttribute(
      "href",
      `/home/log?plannedSession=${session().id}&date=${TODAY}`,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("shows each activity's instructions, with the coach's reason folded behind Why", () => {
    render(
      page(
        session({
          activities: [
            {
              personalActivityId: null,
              name: "Wall handstand",
              sport: "Gymnastics",
              instructions: "Chest to wall, push tall through the shoulders.",
              rationale: "Builds the line for a free hold.",
              measurementMode: "unmeasured",
              target: null,
            },
          ],
        }),
      ),
    );

    expect(
      screen.getByText("Chest to wall, push tall through the shoulders."),
    ).toBeVisible();
    const why = screen.getByText("Why").closest("details")!;
    expect(why).not.toHaveAttribute("open");
    expect(
      screen.getByText("Builds the line for a free hold."),
    ).not.toBeVisible();
  });

  it("folds the coach's note until it is opened", () => {
    const note = "Wall line first, then free kick-ups. Keep the wrists warm.";
    render(page(session({ coachNote: note })));

    const fold = document.querySelector("[data-coach-note]")!;
    expect(fold.tagName).toBe("DETAILS");
    expect(fold).not.toHaveAttribute("open");
    expect(screen.getByText("Coach's note")).toBeVisible();

    fireEvent.click(screen.getByText("Coach's note"));
    expect(fold).toHaveAttribute("open");
  });

  it("returns to Today when it was opened from there", () => {
    render(page(session(), undefined, "today"));
    expect(screen.getByRole("link", { name: /Today/ })).toHaveAttribute(
      "href",
      `/home/today?date=${TODAY}`,
    );
  });

  it("asks for the date on the edit page, and goes back once the save lands", () => {
    const { rerender } = render(editPage(session()));
    expect(
      screen.getByRole("heading", { level: 1, name: "Edit session" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Aerobic run/ })).toHaveAttribute(
      "href",
      `/home/plan/session/${session().id}`,
    );

    // One date field, sent as one date.
    const date = screen.getByLabelText("Date");
    expect(date).toHaveAttribute("name", "localDate");
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
    rerender(editPage(session()));
    expect(screen.getByRole("button", { name: "Save session" })).toBeVisible();
    expect(replaceMock).not.toHaveBeenCalled();

    planState = {
      status: "saved",
      message: "Session updated.",
      submission: 2,
      operation: "edit",
      sessionId: session().id,
    };
    rerender(editPage(session({ title: "Long run" })));
    expect(replaceMock).toHaveBeenCalledWith(
      `/home/plan/session/${session().id}`,
    );
  });

  it("offers a copy on any date a single session may sit on", () => {
    render(page(session()));
    choose("Duplicate");

    const form = screen
      .getByRole("button", { name: "Duplicate" })
      .closest("form")!;
    expect(form.querySelector("input[name='operation']")).toHaveValue(
      "duplicate",
    );
    // Opening on the session's own day, with a calendar bounded by the range.
    expect(form.querySelector("input[name='localDate']")).toHaveValue(
      session().localDate,
    );
    const calendar = form.querySelector("input[type='date']");
    expect(calendar).toHaveAttribute("min", DATES[0]);
    expect(calendar).toHaveAttribute("max", DATES[DATES.length - 1]);
  });

  it("says what each removal verb keeps, and submits the matching operation", () => {
    render(page(session()));

    choose("Cancel session");
    expect(screen.getByText(/stays on the record as cancelled/i)).toBeVisible();
    expect(
      screen
        .getByRole("button", { name: "Cancel session" })
        .closest("form")!
        .querySelector("input[name='operation']"),
    ).toHaveValue("cancel");

    choose("Delete");
    // The dialog's title and its button say it; no sentence (owner, 5 Nov
    // 2026).
    expect(screen.queryByText(/gone for good|no undo/i)).toBeNull();
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
    // Said plainly as the card's first line (owner, 19 Oct 2026); the old
    // "kept on the record" aside is gone.
    expect(document.querySelector("[data-cancelled-banner]")?.textContent).toBe(
      "Cancelled",
    );
    expect(screen.queryByText(/kept on the record/)).toBeNull();

    choose("Edit reason");
    expect(screen.getByLabelText("Why? (optional)")).toHaveValue(
      "work ran late",
    );
    expect(screen.getByRole("button", { name: "Save reason" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear reason" })).toBeVisible();
    expect(screen.getByText("Only you see this.")).toBeVisible();
  });

  it("says the coach's accepted proposal cancelled it (ADR-033)", () => {
    render(
      page(session({ status: "cancelled" }), undefined, "plan", null, {
        coachCancellation: { kind: "replaced", replacementTitle: "Easy spin" },
      }),
    );
    expect(
      document.querySelector("[data-coach-cancellation]")?.textContent,
    ).toBe("Replaced by Easy spin, which the coach proposed and you accepted.");

    cleanup();
    render(
      page(session({ status: "cancelled" }), undefined, "plan", null, {
        coachCancellation: { kind: "suggested" },
      }),
    );
    expect(
      document.querySelector("[data-coach-cancellation]")?.textContent,
    ).toBe("Cancelled on the coach's suggestion, which you accepted.");
    // Already says why, so the menu offers to edit it (owner, 19 Oct 2026).
    openMenu();
    expect(screen.getByRole("button", { name: "Edit reason" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add reason" })).toBeNull();
  });

  it("brings back the session a coach's replacement stands in for", () => {
    render(
      page(session({ title: "Easy spin" }), undefined, "plan", null, {
        standsInFor: { sessionId: OLD_SESSION_ID, title: "Long run" },
      }),
    );

    expect(
      document.querySelector("[data-stands-in-for]")?.textContent,
    ).toContain("Stands in for Long run, which the coach replaced.");
    fireEvent.click(
      screen.getByRole("button", { name: "Bring Long run back" }),
    );

    const sent = planDispatch.mock.calls.at(-1)?.[0] as FormData;
    expect(sent.get("operation")).toBe("reactivate");
    expect(sent.get("sessionId")).toBe(OLD_SESSION_ID);
    expect(sent.get("expectedRevision")).toBe("3");
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

    expect(screen.getByText("Session removed")).toBeVisible();
    expect(replaceMock).toHaveBeenCalledWith(
      `/home/plan?day=${TODAY}#plan-day-${TODAY}`,
    );
  });

  it("offers a way back in when the sign-in has expired", () => {
    planState = {
      status: "session",
      message: "Your session ended. Sign in again before changing your plan.",
      submission: 1,
      operation: "cancel",
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
    const { rerender } = render(editPage(occurrence(), series()));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: FUTURE_SCOPE }));
    });
    seriesState = {
      status: "saved",
      message: "This and future sessions changed.",
      submission: 1,
      operation: "edit_series",
      sessionId: session().id,
    };
    rerender(editPage(null));

    expect(screen.getByText("Change saved")).toBeVisible();
    expect(screen.queryByText("Session removed")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith(
      `/home/plan?day=${TODAY}#plan-day-${TODAY}`,
    );
  });

  it("says a session is not there, without guessing why, when nothing removed it here", () => {
    render(page(null));
    expect(
      screen.getByRole("heading", { name: "That session is not there" }),
    ).toBeVisible();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("edits a recurring session in one form and asks the scope in a dialog", async () => {
    const diverged = occurrence({
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
    });
    render(page(diverged, series()));
    expect(
      screen.getByRole("button", { name: /^Repeats Every day/ }),
    ).toBeVisible();
    expect(screen.getByText("Changed")).toBeVisible();
    cleanup();
    render(editPage(diverged, series()));
    const form = screen
      .getByLabelText("Title", { exact: true })
      .closest("form")!;

    // The repeat is a row here, not fields of the form.
    expect(screen.queryByRole("radio", { name: "Custom" })).toBeNull();
    expect(screen.queryByRole("button", { name: FUTURE_SCOPE })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = screen.getByRole("dialog", {
      name: "Save changes to Aerobic run",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: /^Only this session/ }),
      ),
    );
    expect(
      (planDispatch.mock.calls.at(-1) as [FormData])[0].get("operation"),
    ).toBe("edit");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: FUTURE_SCOPE })),
    );
    const sent = (seriesDispatch.mock.calls.at(-1) as [FormData])[0];
    expect(sent.get("operation")).toBe("edit_series");
    expect(sent.get("title")).toBe("Aerobic run");
    // The repeat goes as the series has it, as the series action reads it:
    // a daily series sends no weekdays.
    expect(sent.get("frequency")).toBe("daily");
    expect(sent.get("intervalCount")).toBe("1");
    expect(sent.getAll("weekdays")).toEqual([]);
    expect(sent.get("noEnd")).toBe("true");
    expect(sent.get("endDate")).toBeNull();
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

  it("changes the repeat in its own sheet, which saves the whole edit form", async () => {
    render(editPage(occurrence(), series()));
    fireEvent.change(screen.getByLabelText("Title", { exact: true }), {
      target: { value: "Tempo run" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Repeats/ }));
    const sheet = screen.getByRole("dialog", { name: "Repeat" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    // Unchanged, the sheet only closes.
    expect(
      screen.queryByRole("button", { name: /^Save all changes/ }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Repeat less often" }));
    // A changed repeat counts from here on, so nothing asks "only this one?".
    expect(
      screen.queryByRole("button", { name: /^Only this session/ }),
    ).toBeNull();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Save all changes to the whole series",
        }),
      ),
    );
    const sent = (seriesDispatch.mock.calls.at(-1) as [FormData])[0];
    expect(sent.get("operation")).toBe("edit_series");
    expect(sent.get("title")).toBe("Tempo run");
    expect(sent.get("frequency")).toBe("daily");
    expect(sent.get("intervalCount")).toBe("2");
    expect(sent.getAll("intervalCount")).toEqual(["2"]);
    expect(sent.get("noEnd")).toBe("true");
  });

  it("puts the repeat back as it was when its sheet is cancelled", () => {
    render(editPage(occurrence(), series()));
    fireEvent.click(screen.getByRole("button", { name: /^Repeats/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Every Monday" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Repeats Every day/ }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /^Repeats/ }));
    expect(screen.getByRole("radio", { name: "Every day" })).toBeChecked();
    expect(seriesDispatch).not.toHaveBeenCalled();
  });

  it("saves a new repeat from the session page with the session as saved", async () => {
    render(
      page(
        occurrence({ note: "Easy pace", startTime: "07:30" }),
        series({ note: "Easy pace" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Repeats Every day/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Every Monday" }));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Save to the whole series" }),
      ),
    );
    const sent = (seriesDispatch.mock.calls.at(-1) as [FormData])[0];
    expect(sent.get("operation")).toBe("edit_series");
    expect(sent.get("sessionId")).toBe(session().id);
    expect(sent.get("expectedRevision")).toBe("3");
    expect(sent.get("title")).toBe("Aerobic run");
    expect(sent.get("note")).toBe("Easy pace");
    expect(sent.get("startTime")).toBe("07:30");
    expect(sent.get("activities")).toBe("[]");
    expect(sent.get("frequency")).toBe("weekly");
    expect(sent.getAll("weekdays")).toEqual(["1"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the date a later occurrence's repeat change starts from", () => {
    render(
      page(
        occurrence({ localDate: DATES[3], occurrenceDate: DATES[3] }),
        series(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Repeats/ }));
    fireEvent.click(
      screen.getByRole("radio", { name: "Every other Thursday" }),
    );
    expect(
      screen.getByRole("button", { name: "Save from Thu 20 Aug on" }),
    ).toBeVisible();
  });

  it("keeps a weekly repeat with an end date as it is on a this-and-following save", async () => {
    const weekly = series({
      frequency: "weekly",
      weekdays: [1, 4],
      endDate: "2026-09-30",
    });
    render(
      editPage(
        occurrence({ localDate: DATES[3], occurrenceDate: DATES[3] }),
        weekly,
      ),
    );
    expect(
      screen.getByRole("button", {
        name: /^Repeats Every week on Monday and Thursday, until Wed 30 Sep/,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: /^This and following/ }),
      ),
    );
    const sent = (seriesDispatch.mock.calls.at(-1) as [FormData])[0];
    expect(sent.get("frequency")).toBe("weekly");
    expect(sent.getAll("weekdays")).toEqual(["1", "4"]);
    expect(sent.get("noEnd")).toBe("false");
    expect(sent.get("endDate")).toBe("2026-09-30");
  });

  it("moves an occurrence from its edit form, which saves it alone", async () => {
    render(editPage(occurrence(), series()));
    const date = screen.getByLabelText("Date", { exact: true });
    expect(date).toHaveValue(TODAY);
    fireEvent.change(date, { target: { value: DATES[2] } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // A series has no date to move to, so only this session is offered.
    expect(screen.queryByRole("button", { name: FUTURE_SCOPE })).toBeNull();
    expect(
      screen.getByText(
        /moved it to another day, so this saves this session only/,
      ),
    ).toBeVisible();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: /^Only this session/ }),
      ),
    );
    const sent = (planDispatch.mock.calls.at(-1) as [FormData])[0];
    expect(sent.get("operation")).toBe("edit");
    expect(sent.get("localDate")).toBe(DATES[2]);
  });

  it("only shows the repeat of an occurrence its series no longer fills", () => {
    render(page(occurrence(), series({ endDate: "2026-08-16" })));
    expect(screen.queryByRole("button", { name: /^Repeats/ })).toBeNull();
    expect(
      screen.getByText("Every day, until Sun 16 Aug").closest("p"),
    ).toHaveTextContent("Repeats Every day, until Sun 16 Aug");
    expect(
      screen.getByText(/repeat cannot be changed from here/),
    ).toBeVisible();
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
    // Two buttons and nothing else (owner, 5 Nov 2026).
    expect(screen.queryByText(/gone for good|no undo/i)).toBeNull();
    const future = screen.getByRole("button", {
      name: "Delete this and all future sessions",
    });
    expect(
      future.closest("form")!.querySelector("input[name='operation']"),
    ).toHaveValue("end_series");
    expect(screen.queryByText(/Permanent\./)).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete session" })).toBeNull();
  });

  it("withholds future scopes from an occurrence past the segment end", () => {
    render(page(occurrence(), series({ endDate: "2026-08-16" })));
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

  it("offers a session trained on another day its log and Save to library", () => {
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
      "/home/log?completion=7f000000-0000-4000-8000-0000000000c2&from=session",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    openMenu();
    expect(
      screen.getByRole("button", { name: "Save to library" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
  });

  // Owner, 3 Oct 2026: once logged, the log is what changes, not the plan.
  it("settles a session logged on its own day: Edit log, Save to library", () => {
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

    expect(screen.getByRole("link", { name: "Edit log" })).toHaveAttribute(
      "href",
      "/home/log?completion=7f000000-0000-4000-8000-0000000000c3&from=session",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    openMenu();
    expect(
      screen.getByRole("button", { name: "Save to library" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
    for (const verb of ["Cancel session", "Delete"]) {
      expect(screen.queryByRole("button", { name: verb })).toBeNull();
    }
  });

  it("settles a skip written ahead the same way", () => {
    render(
      page(
        session({
          localDate: DATES[3],
          log: {
            completionId: "7f000000-0000-4000-8000-0000000000c4",
            outcome: "skipped",
            actualLocalDate: DATES[3],
          },
        }),
      ),
    );

    expect(screen.getByRole("link", { name: "Edit log" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    // A skip records no training, so there is nothing to save; a one-off
    // still ahead may only be made to repeat (R2).
    openMenu();
    expect(
      screen.queryByRole("button", { name: "Save to library" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Repeat…" })).toBeVisible();
  });

  it("lets a past session be logged and nothing else", () => {
    render(page(session({ localDate: "2026-08-10" }), undefined, "today"));

    expect(screen.getByText(/can no longer change it/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Log results" })).toHaveAttribute(
      "href",
      `/home/log?plannedSession=${session().id}&date=2026-08-10`,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("yields a retained series receipt to a newer ordinary plan action", () => {
    const { rerender } = render(page(occurrence(), series()));
    choose("Delete");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Delete this and all future sessions" })
        .closest("form")!,
    );
    expect(seriesDispatch).toHaveBeenCalledOnce();

    // The receipt arrives while the page still holds the occurrence.
    seriesState = {
      status: "saved",
      message:
        "Future recurring sessions removed permanently: 1 unchanged removed, 0 changed removed, 0 completed kept.",
      submission: 1,
      operation: "end_series",
      sessionId: session().id,
    };
    rerender(page(occurrence(), series()));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/1 unchanged removed/);
    expect(replaceMock).not.toHaveBeenCalled();

    // The receipt closed the panel, so the owner opens Delete again.
    choose("Delete");
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Delete only this session" })
        .closest("form")!,
    );
    expect(planDispatch).toHaveBeenCalledOnce();
    planState = {
      status: "conflict",
      message: "Your plan changed somewhere else.",
      submission: 1,
      operation: "delete",
      sessionId: session().id,
      conflict: "stale",
    };
    rerender(page(occurrence(), series()));

    // Said in the pop-up that is still open, where the owner is looking.
    const refusal = screen.getByRole("status");
    expect(refusal).toHaveTextContent("Your plan changed somewhere else.");
    expect(refusal).not.toHaveTextContent(/unchanged removed/);
    expect(
      screen.getByRole("link", { name: "Reload this session" }),
    ).toBeVisible();
  });

  // R2: a one-off becomes the first session of a series of its own.
  it("makes a one-off repeat from its own date, from the repeat row", async () => {
    render(page(session()));
    fireEvent.click(screen.getByRole("button", { name: /Doesn't repeat/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /becomes the first of the repeat/,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Repeat from / })),
    );
    const sent = (seriesDispatch.mock.calls.at(-1) as [FormData])[0];
    expect(sent.get("operation")).toBe("repeat_session");
    expect(sent.get("sessionId")).toBe(session().id);
    expect(sent.get("expectedRevision")).toBe("3");
    expect(sent.get("frequency")).toBe("weekly");
    // Monday, the day the session is on.
    expect(sent.getAll("weekdays")).toEqual(["1"]);
    // The template is read from the session in the database, not sent.
    expect(sent.get("title")).toBeNull();
  });

  it("refuses a repeat that leaves out the session's own day", async () => {
    render(page(session()));
    fireEvent.click(screen.getByRole("button", { name: /Doesn't repeat/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Tue/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mon/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Repeat from / })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Include Monday, the day this session is on.",
    );
    expect(seriesDispatch).not.toHaveBeenCalled();
  });

  it("offers Repeat… on a logged one-off still ahead, whose log stays", () => {
    render(
      page(
        session({
          log: {
            completionId: "7f000000-0000-4000-8000-0000000000c2",
            outcome: "completed",
            actualLocalDate: TODAY,
          },
        }),
      ),
    );
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Repeat…" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /stays as it is with anything logged on it/,
    );
  });

  it("offers no repeat for a one-off past the dates recurring sessions reach", () => {
    render(
      <SessionPage
        session={session({ localDate: DATES[5] })}
        today={TODAY}
        dateRange={{ first: DATES[0], last: DATES[DATES.length - 1] }}
        repeatsThrough={DATES[4]}
        expectedRevision={3}
        origin="plan"
        originDate={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /Doesn't repeat/ })).toBeNull();
    openMenu();
    expect(screen.queryByRole("button", { name: "Repeat…" })).toBeNull();
  });

  it("asks for unsaved edits to be saved before a one-off repeats", async () => {
    render(editPage(session()));
    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Longer run" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Doesn't repeat/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Repeat from / })),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /save your changes first/,
    );
    expect(seriesDispatch).not.toHaveBeenCalled();
  });
});
