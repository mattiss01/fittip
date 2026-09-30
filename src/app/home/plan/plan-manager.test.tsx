import {
  cleanup,
  fireEvent,
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
      lastDate={LAST}
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

  it("opens on the week of the day it was sent back to", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], { initialDate: DATES[8] });
    expect(day(DATES[8])).not.toBeNull();
    expect(day(TODAY)).toBeNull();
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

  it("offers a new session, the library, and the recovery label from a day's +", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [], {
      savedSessions: [
        {
          id: "7f000000-0000-4000-8000-0000000000a1",
          name: "Hill reps",
          title: "Hills",
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
    expect(createTitleInput()).toHaveValue("Hills");
    expect(
      document.querySelector<HTMLInputElement>("input[name='localDate']"),
    ).toHaveValue(DATES[3]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
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
      `/home/plan/session/${session().id}`,
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
