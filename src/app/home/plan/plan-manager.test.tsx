import {
  cleanup,
  fireEvent,
  waitFor,
  render,
  screen,
  within,
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

// A Wednesday, so the first week has two days before today.
const TODAY = "2026-08-19";
const DATES = Array.from({ length: 14 }, (_, offset) => {
  const date = new Date(`${TODAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
});
const LAST = DATES[13];

const action = vi.fn();

function manager(
  sessions: PlanSessionView[] = [],
  extra: Partial<Parameters<typeof PlanManager>[0]> = {},
) {
  return (
    <PlanManager
      today={TODAY}
      lastPlaceableDate={LAST}
      repeatsThrough={LAST}
      expectedRevision={3}
      sessions={sessions}
      recoveryDates={[DATES[3]]}
      {...extra}
    />
  );
}

function renderManager(
  state: PlanActionState = INITIAL_PLAN_ACTION_STATE,
  sessions: PlanSessionView[] = [],
  extra: Partial<Parameters<typeof PlanManager>[0]> = {},
) {
  useActionStateMock.mockReturnValue([state, action, false]);
  return render(manager(sessions, extra));
}

function day(date: string) {
  return document.querySelector<HTMLElement>(`[data-plan-date="${date}"]`)!;
}

function openNewSession(date: string) {
  fireEvent.click(within(day(date)).getByRole("button", { name: /^Add to / }));
  fireEvent.click(screen.getByRole("button", { name: "New session" }));
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

  it("shows one week from Monday, with a + only from today on", () => {
    renderManager();
    const days = document.querySelectorAll("[data-plan-date]");

    expect(days).toHaveLength(7);
    expect(days[0].getAttribute("data-plan-date")).toBe("2026-08-17");
    expect(day(TODAY).getAttribute("data-today")).toBe("true");
    expect(day("2026-08-18").getAttribute("data-past")).toBe("true");
    expect(
      within(day("2026-08-18")).queryByRole("button", { name: /^Add to / }),
    ).toBeNull();
    expect(
      within(day(TODAY)).getByRole("button", { name: /^Add to / }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "This week" })).toBeVisible();
    expect(screen.queryByText("Create session")).toBeNull();
  });

  // Owner, 19 Oct 2026: a card dragged onto another open day moves there.
  it("moves a session dropped on another open day, and on no other", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = day(TODAY).querySelector<HTMLElement>("[data-draggable]")!;
    const pointAt = vi.fn();
    document.elementFromPoint = pointAt;

    // jsdom has no PointerEvent: a mouse event carries the coordinates.
    const pointer = (
      target: EventTarget,
      type: string,
      init: { clientX?: number; clientY?: number } = {},
    ) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        ...init,
      });
      Object.assign(event, { pointerId: 1, pointerType: "mouse" });
      fireEvent(target as Element, event);
    };
    const dragTo = (target: HTMLElement) => {
      pointAt.mockReturnValue(target);
      pointer(card, "pointerdown", { clientX: 10, clientY: 10 });
      pointer(document, "pointermove", { clientX: 10, clientY: 60 });
      pointer(document, "pointerup");
    };

    // A day before today takes nothing.
    dragTo(day("2026-08-18"));
    expect(action).not.toHaveBeenCalled();

    dragTo(day(DATES[2]));
    expect(action).toHaveBeenCalledOnce();
    const sent = action.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(sent)).toEqual({
      operation: "move",
      sessionId: session().id,
      localDate: DATES[2],
      expectedRevision: "3",
    });
    Reflect.deleteProperty(document, "elementFromPoint");
  });

  // Owner, 19 Oct 2026: a card swiped left offers Cancel and Delete.
  it("swipes a card open to cancel it, or to delete it after asking", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = day(TODAY).querySelector<HTMLElement>("[data-session-card]")!;
    // At rest a card carries no verbs.
    expect(within(card).queryByRole("button")).toBeNull();

    const swipeLeft = () => {
      fireEvent.touchStart(card, { touches: [{ clientX: 300, clientY: 10 }] });
      fireEvent.touchMove(card, { touches: [{ clientX: 120, clientY: 14 }] });
      fireEvent.touchEnd(card, { touches: [] });
    };
    swipeLeft();
    expect(card.getAttribute("data-swiped")).toBe("true");
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(Object.fromEntries(action.mock.calls[0][0] as FormData)).toEqual({
      operation: "cancel",
      sessionId: session().id,
      expectedRevision: "3",
    });
    expect(card.getAttribute("data-swiped")).toBeNull();

    swipeLeft();
    fireEvent.click(within(card).getByRole("button", { name: "Delete" }));
    // Asked first: a delete keeps nothing.
    expect(action).toHaveBeenCalledOnce();
    const ask = screen.getByRole("dialog", { name: "Delete Aerobic run?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(Object.fromEntries(action.mock.calls[1][0] as FormData)).toEqual({
      operation: "delete",
      sessionId: session().id,
      expectedRevision: "3",
    });
  });

  it("swipes a card right to its edit page", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = day(TODAY).querySelector<HTMLElement>("[data-session-card]")!;
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 220, clientY: 12 }] });
    fireEvent.touchEnd(card, { touches: [] });
    expect(within(card).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/home/plan/session/${session().id}/edit`,
    );
    expect(within(card).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("offers no edit on a cancelled card", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ status: "cancelled" }),
    ]);
    const card = day(TODAY).querySelector<HTMLElement>("[data-cancelled]")!;
    fireEvent.touchStart(card, { touches: [{ clientX: 100, clientY: 10 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 220, clientY: 12 }] });
    fireEvent.touchEnd(card, { touches: [] });
    expect(within(card).queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("leaves a mostly vertical move to the scroll", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [session()]);
    const card = day(TODAY).querySelector<HTMLElement>("[data-session-card]")!;
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 10 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 170, clientY: 120 }] });
    fireEvent.touchEnd(card, { touches: [] });
    expect(card.getAttribute("data-swiped")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("offers no drag on a logged session", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        log: {
          completionId: "c",
          outcome: "completed",
          actualLocalDate: TODAY,
        },
      }),
    ]);
    expect(day(TODAY).querySelector("[data-draggable]")).toBeNull();
  });

  it("pages between weeks with the arrows and the tiles", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ localDate: DATES[13], expectedDurationMinutes: 90 }),
    ]);
    expect(screen.queryByRole("button", { name: "Previous week" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByRole("heading", { name: "Next week" })).toBeVisible();
    expect(day("2026-08-24")).not.toBeNull();

    // The last week ends past the window: its days are not open yet.
    fireEvent.click(screen.getByRole("button", { name: /Week of Mon 31 Aug/ }));
    expect(day(LAST).getAttribute("data-beyond")).toBe("false");
    expect(day("2026-09-02").getAttribute("data-beyond")).toBe("true");
    expect(day("2026-09-02").textContent).toContain("Not open yet");
    expect(
      within(day("2026-09-02")).queryByRole("button", { name: /^Add to / }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Next week" })).toBeNull();
    // Totals say planned, never done.
    expect(screen.getByText(/1 session · 1 h 30 planned/)).toBeVisible();
  });

  it("keeps a day past the recurring window open for a single session only", () => {
    // Repeats are written through Friday of the first week; sessions may be placed
    // through the whole fortnight.
    renderManager(INITIAL_PLAN_ACTION_STATE, [], {
      repeatsThrough: DATES[2],
      hasRepeats: true,
    });

    // The week that straddles the bound says where repeats stop.
    expect(screen.getByText(/^Repeats are added through /)).toBeVisible();
    // A day inside the recurring window offers the repeat...
    fireEvent.click(
      within(day(DATES[2])).getByRole("button", { name: /^Add to / }),
    );
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    expect(screen.getByLabelText("Repeat this session")).toBeVisible();
    fireEvent.click(screen.getByText("Close"));

    // ...and one past it still has its "+", for a session without one.
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(day(DATES[8]).getAttribute("data-beyond")).toBe("false");
    fireEvent.click(
      within(day(DATES[8])).getByRole("button", { name: /^Add to / }),
    );
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    expect(screen.getByLabelText("Title")).toBeVisible();
    expect(screen.queryByLabelText("Repeat this session")).toBeNull();
  });

  it("says nothing about repeats to an owner who has none", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], { repeatsThrough: DATES[4] });
    expect(screen.queryByText(/^Repeats are added through /)).toBeNull();
  });

  it("goes to a day's week from the month calendar without opening its sheet", () => {
    renderManager();

    // Named after the week title it sits on, so the visible words are in it.
    fireEvent.click(
      screen.getByRole("button", { name: "This week, open calendar" }),
    );
    const calendar = screen.getByRole("dialog");
    expect(
      within(calendar).getByRole("heading", { name: "August 2026" }),
    ).toBeVisible();

    // DATES[8] is in next week.
    fireEvent.click(calendar.querySelector(`[data-month-date="${DATES[8]}"]`)!);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Next week" })).toBeVisible();
    expect(day(DATES[8])).not.toBeNull();
  });

  it("opens on the week of the day it was sent back to", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], { initialDate: DATES[8] });
    expect(day(DATES[8])).not.toBeNull();
    expect(day(TODAY)).toBeNull();
  });

  it("opens on this week with the weeks before it behind, read-only", () => {
    // Two weeks of history: the Mondays of 3 and 10 August.
    renderManager(
      INITIAL_PLAN_ACTION_STATE,
      [
        session({
          id: "7f000000-0000-4000-8000-0000000000a1",
          localDate: "2026-08-12",
          title: "Tempo run",
          log: {
            completionId: "7f000000-0000-4000-8000-0000000000c9",
            outcome: "completed",
            actualLocalDate: "2026-08-12",
          },
        }),
        session({
          id: "7f000000-0000-4000-8000-0000000000a3",
          localDate: "2026-08-13",
          title: "Hill run",
          log: {
            completionId: "7f000000-0000-4000-8000-0000000000ca",
            outcome: "completed",
            actualLocalDate: "2026-08-13",
            durationMinutes: 55,
          },
        }),
        session({
          id: "7f000000-0000-4000-8000-0000000000a2",
          localDate: "2026-08-04",
          title: "Long ride",
        }),
      ],
      { firstDate: "2026-08-03" },
    );

    // History does not move where the Plan opens.
    expect(screen.getByRole("heading", { name: "This week" })).toBeVisible();
    expect(day(TODAY)).not.toBeNull();
    expect(
      document
        .querySelector('[aria-current="true"]')
        ?.getAttribute("data-week-start"),
    ).toBe("2026-08-17");
    expect(
      document.querySelector('[data-week-start="2026-08-17"]')?.textContent,
    ).toContain("This wk");

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByRole("heading", { name: "Last week" })).toBeVisible();
    // What was planned and how it was logged, opened by its day.
    const logged = day("2026-08-12");
    expect(logged.getAttribute("data-past")).toBe("true");
    // The planned minutes stay beside how it went.
    expect(logged.textContent).toContain("60 min planned · Completed");
    // A log that gives its minutes shows them instead.
    expect(day("2026-08-13").textContent).toContain("55 min · Completed");
    expect(day("2026-08-13").textContent).not.toContain("planned");
    expect(
      within(logged)
        .getByRole("link", { name: "Tempo run" })
        .getAttribute("href"),
    ).toBe(
      // A logged session opens its log's record (owner, 20 Oct 2026).
      "/home/progress/7f000000-0000-4000-8000-0000000000c9?from=plan&date=2026-08-12",
    );
    // No day of a past week can be added to.
    expect(screen.queryByRole("button", { name: /^Add to / })).toBeNull();

    // Further back a week is named by its dates, and the earliest is the end.
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(
      screen.getByRole("heading", { name: "3 Aug – 9 Aug" }),
    ).toBeVisible();
    expect(within(day("2026-08-04")).getByText("Long ride")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Previous week" })).toBeNull();
  });

  it("reaches a past week from the month calendar", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], { firstDate: "2026-08-03" });

    fireEvent.click(
      screen.getByRole("button", { name: "This week, open calendar" }),
    );
    fireEvent.click(
      screen
        .getByRole("dialog")
        .querySelector('[data-month-date="2026-08-05"]')!,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(day("2026-08-05")).not.toBeNull();
  });

  it("shows the roadmap phase the week sits in", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], {
      phases: [
        {
          title: "Base",
          focus: "Easy volume",
          startDate: "2026-08-01",
          endDate: "2026-08-23",
        },
        {
          title: "Sharpen",
          focus: "10k under 48 min",
          startDate: "2026-08-24",
          endDate: "2026-09-30",
        },
      ],
    });
    expect(screen.getByText("Base")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Sharpen")).toBeVisible();
    expect(screen.queryByText("Base")).toBeNull();
  });

  it("reads an empty date as a dash and a labelled one as recovery", () => {
    renderManager();
    const plain = day(DATES[1]);
    const labelled = day(DATES[3]);

    expect(plain.getAttribute("data-recovery")).toBe("false");
    expect(plain.textContent).toContain("—");
    expect(labelled.getAttribute("data-recovery")).toBe("true");
    expect(labelled.textContent).toContain("Recovery day");
    // Nothing on an empty date may imply completion, a streak, or a judgment.
    expect(plain.textContent).not.toMatch(/rest|complete|done|streak|missed/i);
  });

  it("keeps a recovery day's sessions and its + in the same place", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ localDate: DATES[3] }),
    ]);
    expect(day(DATES[3]).textContent).toContain("Aerobic run");
    expect(day(DATES[3]).textContent).toContain("Recovery day");
    expect(
      within(day(DATES[3])).getByRole("button", { name: /^Add to / }),
    ).toBeVisible();
  });

  it("offers a new session, the library, and the recovery label from a day's +", async () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], {
      savedSessions: [
        {
          id: "7f000000-0000-4000-8000-0000000000a1",
          title: "Hill reps",
          sport: "Running",
          expectedDurationMinutes: 50,
          intent: null,
          note: null,
          activities: [],
        },
      ],
    });
    fireEvent.click(
      within(day(DATES[3])).getByRole("button", { name: /^Add to / }),
    );
    const sheet = screen.getByRole("dialog");
    expect(
      within(sheet).getByRole("button", { name: "New session" }),
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", { name: "Remove recovery day" }),
    ).toBeVisible();

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Use session from library" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Hill reps/ }));
    expect(createTitleInput()).toHaveValue("Hill reps");
    expect(
      document.querySelector<HTMLInputElement>("input[name='localDate']"),
    ).toHaveValue(DATES[3]);

    fireEvent.keyDown(document, { key: "Escape" });
    // The sheet slides away before it is gone (R4).
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the sheet over a refused recovery label and closes it on a saved one", () => {
    const { rerender } = renderManager();
    fireEvent.click(
      within(day(DATES[1])).getByRole("button", { name: /^Add to / }),
    );
    const rerenderWith = (state: PlanActionState) => {
      useActionStateMock.mockReturnValue([state, action, false]);
      rerender(manager());
    };

    rerenderWith({
      status: "conflict",
      message: "Your plan changed somewhere else.",
      submission: 1,
      operation: "set_recovery_day",
      conflict: "stale",
    });
    expect(
      within(screen.getByRole("dialog")).getByRole("alert"),
    ).toHaveTextContent("Your plan changed somewhere else.");

    rerenderWith({
      status: "saved",
      message: "Recovery day set.",
      submission: 2,
      operation: "set_recovery_day",
      localDate: DATES[1],
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses one editor for a single session or reviewed recurrence", () => {
    renderManager();
    openNewSession(DATES[2]);
    const form = document.querySelector<HTMLFormElement>(
      "[data-create-session]",
    )!;
    const operation = form.querySelector<HTMLInputElement>(
      "input[name='operation']",
    )!;

    expect(operation).toHaveValue("add");
    expect(
      form.querySelector<HTMLInputElement>("input[name='localDate']"),
    ).toHaveValue(DATES[2]);
    expect(
      screen.getByRole("button", { name: "Create session" }),
    ).toBeVisible();
    expect(screen.queryByText("Recurrence", { selector: "legend" })).toBeNull();

    fireEvent.click(screen.getByLabelText("Repeat this session"));
    expect(operation).toHaveValue("add_series");
    expect(
      screen.getByText("Recurrence", { selector: "legend" }),
    ).toBeVisible();
    // DATES[2] is a Friday.
    expect(screen.getByLabelText("Fri")).toBeChecked();
    expect(screen.getByLabelText("Mon")).not.toBeChecked();

    fireEvent.change(createTitleInput(), {
      target: { value: "Friday tempo" },
    });
    fireEvent.change(form.querySelector("#create-session-sport")!, {
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

    expect(day(TODAY).querySelector("[data-cancelled]")?.textContent).toContain(
      "Cancelled",
    );
    // Reactivate and Delete are on the session's page, one tap away.
    expect(
      screen.getByRole("link", { name: "Aerobic run" }).getAttribute("href"),
    ).toBe(`/home/plan/session/${session().id}`);
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
  });

  it("keeps a draft open when a recovery label resolves meanwhile", () => {
    const { rerender } = renderManager();
    openNewSession(DATES[2]);
    fireEvent.change(createTitleInput(), {
      target: { value: "Half in progress" },
    });

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
    rerender(manager([], { recoveryDates: [DATES[3], TODAY] }));

    expect(createTitleInput()).toHaveValue("Half in progress");
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("closes the sheet on a save that created a session and re-seeds a refused one", () => {
    const { rerender } = renderManager();
    const rerenderWith = (state: PlanActionState) => {
      useActionStateMock.mockReturnValue([state, action, false]);
      rerender(manager([session()]));
    };
    openNewSession(TODAY);

    rerenderWith({
      status: "rule",
      message: "A date holds at most ten sessions. Cancel or move one first.",
      submission: 1,
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
    });
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(createTitleInput()).toHaveValue("Eleventh");
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(
      /at most ten sessions/i,
    );

    rerenderWith({
      status: "saved",
      message: "Session added.",
      submission: 2,
      operation: "add",
      localDate: TODAY,
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    // A new sheet starts empty rather than from the refusal before.
    openNewSession(TODAY);
    expect(createTitleInput()).toHaveValue("");
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
    rerender(manager([], { recoveryDates: [] }));

    expect(
      screen.getByRole("link", { name: "Reload the current plan" }),
    ).toHaveAttribute("href", "/home/plan");
  });

  it("opens a session from a compact card that carries no verbs", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        intent: "Easy, conversational.",
        seriesId: "7f000000-0000-4000-8000-0000000000b1",
      }),
    ]);
    const card = document.querySelector<HTMLElement>("[data-session-card]")!;

    // Owner, 29 Sep 2026: every verb lives on the session's own page.
    expect(
      screen.getByRole("link", { name: "Aerobic run" }).getAttribute("href"),
    ).toBe(`/home/plan/session/${session().id}`);
    expect(card.querySelector("button, summary, form")).toBeNull();
    expect(card.textContent).toContain("60 min");
    expect(card.textContent).toContain("Recurring");
    expect(card.textContent).not.toContain("Easy, conversational.");
  });

  it("opens a session from before today by its day", () => {
    // The session's page reads the window from today on, so a card on one of
    // the week's past days has to say which day it is on to be found.
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ localDate: "2026-08-18" }),
    ]);

    expect(
      screen.getByRole("link", { name: "Aerobic run" }).getAttribute("href"),
    ).toBe(`/home/plan/session/${session().id}?date=2026-08-18`);
  });

  it("gives the same sport the same tone whatever its case", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session(),
      session({
        id: "7f000000-0000-4000-8000-000000000002",
        position: 1,
        sport: " running ",
      }),
    ]);
    const [first, second] = document.querySelectorAll("[data-session-card]");
    expect(first.getAttribute("data-tone")).toBe(
      second.getAttribute("data-tone"),
    );
  });

  it("reads a session logged on another day as done there, and opens it", () => {
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
    const planned = day(DATES[3]);

    // Logged early, it is not still ahead on the day it was planned for.
    expect(planned.querySelector("[data-logged]")?.textContent).toMatch(
      /Completed on \w{3} \d{1,2} \w{3}/,
    );
    expect(planned.querySelector("[data-logged] a")?.getAttribute("href")).toBe(
      `/home/progress/7f000000-0000-4000-8000-0000000000c2?from=plan&date=${DATES[3]}`,
    );
    expect(planned.querySelector("[data-session-card]")).toBeNull();
  });

  it("keeps the card for a skip written ahead, which is about the planned day", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        localDate: DATES[3],
        log: {
          completionId: "7f000000-0000-4000-8000-0000000000c4",
          outcome: "skipped",
          actualLocalDate: TODAY,
        },
      }),
    ]);
    const planned = day(DATES[3]);

    expect(planned.querySelector("[data-logged]")).toBeNull();
    expect(planned.querySelector("[data-session-card]")?.textContent).toContain(
      "Skipped",
    );
  });

  it("keeps the card for a session logged on its own day", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({
        log: {
          completionId: "7f000000-0000-4000-8000-0000000000c3",
          outcome: "completed",
          actualLocalDate: TODAY,
        },
      }),
    ]);

    // Ending a series from today's logged occurrence starts from this card.
    expect(document.querySelector("[data-logged]")).toBeNull();
    expect(document.querySelector("[data-session-card]")).not.toBeNull();
  });

  it("reads a cancelled session trained anyway as logged", () => {
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
    const today = day(TODAY);

    // Logged on its own day, so no date is added.
    expect(today.querySelector("[data-logged]")?.textContent).toContain(
      "Completed",
    );
    expect(today.textContent).not.toMatch(/Completed on/);
    expect(today.textContent).not.toContain("Cancelled");
  });
});
