import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPlanMock,
  createProfileMock,
  createCompletionLogMock,
  readPlanWindowToppedUpMock,
} = vi.hoisted(() => ({
  createPlanMock: vi.fn(),
  createProfileMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
  readPlanWindowToppedUpMock: vi.fn(),
}));

vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createPlanMock };
});
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});
vi.mock("@/server/completions/plan-window-top-up", () => ({
  readPlanWindowToppedUp: readPlanWindowToppedUpMock,
}));

import TodayPage from "./page";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";

const TIMEZONE = "Europe/Berlin";
const SESSION_ID = "7e150000-0000-4000-8000-000000000001";
const COMPLETION_ID = "7e150000-0000-4000-8000-000000000002";
const today = () => isoDateInTimezone(new Date(), TIMEZONE);

const listCompletions = vi.fn();

describe("Today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "owner",
        timezoneName: TIMEZONE,
        createdAt: "",
      }),
    });
    createPlanMock.mockResolvedValue({});
    listCompletions.mockResolvedValue([]);
    createCompletionLogMock.mockResolvedValue({ list: listCompletions });
    readPlanWindowToppedUpMock.mockResolvedValue(planWindow());
  });

  afterEach(cleanup);

  it("reads owner-local today through the ADR-017 top-up when no date is given", async () => {
    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    expect(readPlanWindowToppedUpMock).toHaveBeenCalledWith(
      expect.anything(),
      today(),
      today(),
    );
    expect(listCompletions).toHaveBeenCalledWith(today(), today());
    expect(screen.getByRole("heading", { name: "Today." })).toBeTruthy();
    expect(
      document.querySelector(`[data-today-date="${today()}"]`),
    ).toBeTruthy();
  });

  it("falls back to owner-local today when the date parameter is unusable", async () => {
    render(
      await TodayPage({
        searchParams: Promise.resolve({ date: "2026-02-30" }),
      }),
    );

    expect(readPlanWindowToppedUpMock).toHaveBeenCalledWith(
      expect.anything(),
      today(),
      today(),
    );
  });

  it("bounds both reads by the requested day and offers the way back", async () => {
    const chosen = shiftIsoDate(today(), -3);
    render(
      await TodayPage({ searchParams: Promise.resolve({ date: chosen }) }),
    );

    expect(readPlanWindowToppedUpMock).toHaveBeenCalledWith(
      expect.anything(),
      chosen,
      chosen,
    );
    expect(listCompletions).toHaveBeenCalledWith(chosen, chosen);
    expect(screen.getByRole("link", { name: "Back to today" })).toBeTruthy();
    expect(screen.getByText("Nothing was planned on this day.")).toBeTruthy();
  });

  it("says the window is short rather than drawing an empty day", async () => {
    readPlanWindowToppedUpMock.mockResolvedValue({
      ...planWindow(),
      toppedUp: false,
    });

    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    const notice = document.querySelector('[data-today-notice="top-up"]');
    expect(notice?.textContent).toContain("not necessarily empty");
    // The notice and an empty-day sentence beneath it would contradict.
    expect(document.querySelector('[data-today-empty="sessions"]')).toBe(null);
  });

  it("says a date past the materialization window is unfilled, not empty", async () => {
    render(
      await TodayPage({
        searchParams: Promise.resolve({ date: shiftIsoDate(today(), 14) }),
      }),
    );

    const notice = document.querySelector(
      '[data-today-notice="beyond-window"]',
    );
    expect(notice?.textContent).toContain("unfilled rather than empty");
    expect(document.querySelector('[data-today-empty="sessions"]')).toBe(null);
  });

  it("still says a filled day is empty when it truly is", async () => {
    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    expect(
      document.querySelector('[data-today-empty="sessions"]')?.textContent,
    ).toBe("Nothing is planned on this day.");
  });

  it("stamps a logged session and links its edit instead of a second log", async () => {
    readPlanWindowToppedUpMock.mockResolvedValue(planWindow([session()]));
    listCompletions.mockResolvedValue([completion()]);

    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    const card = document.querySelector(
      `[data-today-session="${SESSION_ID}"]`,
    ) as HTMLElement;
    expect(within(card).getByText("Partly completed")).toBeTruthy();
    expect(
      within(card).getByRole("link", { name: "Edit log" }).getAttribute("href"),
    ).toBe(`/home/log?completion=${COMPLETION_ID}`);
    expect(within(card).queryByRole("link", { name: "Log this session" })).toBe(
      null,
    );
    expect(
      document.querySelector("[data-today-signals]")?.textContent,
    ).toContain("Pain");
  });

  it("offers the log link on a planned session that has none", async () => {
    readPlanWindowToppedUpMock.mockResolvedValue(planWindow([session()]));

    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen
        .getByRole("link", { name: "Log this session" })
        .getAttribute("href"),
    ).toBe(`/home/log?plannedSession=${SESSION_ID}&date=${today()}`);
  });

  it("keeps a completion no card on this day carries", async () => {
    listCompletions.mockResolvedValue([
      { ...completion(), planSessionId: null, plannedSnapshot: null },
    ]);

    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    const card = document.querySelector(
      `[data-today-completion="${COMPLETION_ID}"]`,
    ) as HTMLElement;
    expect(within(card).getByText("Unplanned training")).toBeTruthy();
  });

  it("names unplanned training by the activity the owner wrote it with", async () => {
    listCompletions.mockResolvedValue([
      {
        ...completion(),
        planSessionId: null,
        status: "unplanned" as const,
        plannedSnapshot: null,
        activities: [
          {
            position: 0,
            name: "Sunrise swim",
            sport: "Swimming",
            measurementMode: "custom" as const,
          },
        ],
      },
    ]);

    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    const card = document.querySelector(
      `[data-today-completion="${COMPLETION_ID}"]`,
    ) as HTMLElement;
    expect(
      within(card).getByRole("heading", { name: "Sunrise swim" }),
    ).toBeTruthy();
    expect(within(card).getByText("Swimming")).toBeTruthy();
    expect(within(card).queryByText("Unplanned training")).toBe(null);
  });

  it("refuses to guess a day for an owner with no stored zone", async () => {
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "owner",
        timezoneName: null,
        createdAt: "",
      }),
    });

    render(await TodayPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelector('[data-today-state="no-zone"]')).toBeTruthy();
    expect(readPlanWindowToppedUpMock).not.toHaveBeenCalled();
  });
});

function planWindow(sessions: ReturnType<typeof session>[] = []) {
  return {
    slice: {
      planId: "plan",
      revision: 7,
      sessions,
      recoveryDates: [],
    },
    createdCount: 0,
    skipped: [],
    toppedUp: true,
  };
}

function session() {
  return {
    id: SESSION_ID,
    localDate: today(),
    position: 0,
    title: "Threshold intervals",
    sport: "Running",
    isLocked: false,
    status: "active" as const,
    cancelledAt: null,
    seriesId: null,
    occurrenceDate: null,
    hasDiverged: false,
    activities: [],
  };
}

function completion() {
  return {
    id: COMPLETION_ID,
    planSessionId: SESSION_ID,
    status: "partially_completed" as const,
    actualLocalDate: today(),
    timezoneName: TIMEZONE,
    painReported: true,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: null,
    revision: 0,
    activities: [],
    updatedAt: "2026-08-30T10:00:00.000Z",
  };
}
