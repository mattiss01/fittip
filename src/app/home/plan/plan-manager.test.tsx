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
) {
  useActionStateMock.mockReturnValue([state, action, false]);
  return render(
    <PlanManager
      today={TODAY}
      dates={DATES}
      expectedRevision={3}
      sessions={sessions}
      recoveryDates={[DATES[3]]}
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
    // Reactivate and Delete are on the session's page, one tap away.
    expect(
      screen.getByRole("link", { name: "Aerobic run" }).getAttribute("href"),
    ).toBe(`/home/plan/session/${session().id}`);
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
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

  it("opens a session from its card, which carries no verbs of its own", () => {
    renderManager(INITIAL_PLAN_ACTION_STATE, [
      session({ intent: "Easy, conversational." }),
    ]);
    const card = document.querySelector<HTMLElement>("[data-session-card]")!;

    // Owner, 29 Sep 2026: every verb lives on the session's own page.
    expect(
      screen.getByRole("link", { name: "Aerobic run" }).getAttribute("href"),
    ).toBe(`/home/plan/session/${session().id}`);
    expect(card.querySelector("button, summary, form")).toBeNull();
    expect(card.textContent).toContain("Easy, conversational.");
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
    const day = document.querySelector(`[data-plan-date="${DATES[3]}"]`)!;

    // Logged early, it is not still ahead on the day it was planned for.
    expect(day.querySelector("[data-logged]")?.textContent).toMatch(
      /Running · Completed on \w{3} \d{1,2} \w{3}/,
    );
    expect(day.querySelector("[data-logged] a")?.getAttribute("href")).toBe(
      `/home/plan/session/${session().id}`,
    );
    expect(day.querySelector("[data-session-card]")).toBeNull();
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
    const day = document.querySelector(`[data-plan-date="${DATES[3]}"]`)!;

    expect(day.querySelector("[data-logged]")).toBeNull();
    expect(day.querySelector("[data-session-card]")).not.toBeNull();
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
    const day = document.querySelector(`[data-plan-date="${TODAY}"]`)!;

    // Logged on its own day, so no date is added.
    expect(day.textContent).toContain("Running · Completed");
    expect(day.textContent).not.toMatch(/Completed on/);
    expect(day.textContent).not.toContain("Cancelled");
    expect(day.textContent).not.toContain("Nothing planned.");
  });
});
