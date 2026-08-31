import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createCompletionLogMock,
  readPlanWindowToppedUpMock,
} = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
  readPlanWindowToppedUpMock: vi.fn(),
}));

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

import ProgressPage from "./page";
import { isoDateInTimezone } from "@/lib/date/local-date";

const TIMEZONE = "Europe/Berlin";
const COMPLETION_ID = "7e150000-0000-4000-8000-000000000011";
const OTHER_ID = "7e150000-0000-4000-8000-000000000012";

const today = () => isoDateInTimezone(new Date(), TIMEZONE);
const currentMonth = () => today().slice(0, 7);

const listCompletions = vi.fn();

describe("Progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileIs({
      timezoneName: TIMEZONE,
      createdAt: "2020-01-15T09:00:00.000Z",
    });
    listCompletions.mockResolvedValue([]);
    createCompletionLogMock.mockResolvedValue({ list: listCompletions });
  });

  afterEach(cleanup);

  it("reads the owner-local current month when no month is given", async () => {
    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    expect(listCompletions).toHaveBeenCalledWith(
      `${currentMonth()}-01`,
      expect.stringMatching(new RegExp(`^${currentMonth()}-\\d{2}$`)),
    );
    expect(screen.getByRole("heading", { name: "Progress." })).toBeTruthy();
    expect(
      document.querySelector(`[data-progress-month="${currentMonth()}"]`),
    ).toBeTruthy();
  });

  it("falls back to the current month when the parameter is unusable", async () => {
    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-13" }),
      }),
    );

    expect(
      document.querySelector(`[data-progress-month="${currentMonth()}"]`),
    ).toBeTruthy();
  });

  it("bounds the read by the month asked for and offers the way back", async () => {
    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-02" }),
      }),
    );

    expect(listCompletions).toHaveBeenCalledWith("2026-02-01", "2026-02-28");
    expect(listCompletions).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "February 2026" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to this month" })
        .getAttribute("href"),
    ).toBe("/home/progress");
  });

  it("pages to the month either side of the one it is showing", async () => {
    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-01" }),
      }),
    );

    expect(
      screen.getByRole("link", { name: /Previous month/ }).getAttribute("href"),
    ).toBe("/home/progress?month=2025-12");
    expect(
      screen.getByRole("link", { name: /Next month/ }).getAttribute("href"),
    ).toBe("/home/progress?month=2026-02");
  });

  it("never materializes plan occurrences to show history", async () => {
    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    expect(readPlanWindowToppedUpMock).not.toHaveBeenCalled();
  });

  it("shows each entry with its outcome, its record and its signal", async () => {
    listCompletions.mockResolvedValue([completion()]);

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    const entry = document.querySelector(
      `[data-progress-entry="${COMPLETION_ID}"]`,
    ) as HTMLElement;
    expect(
      within(entry)
        .getByRole("link", { name: /Threshold intervals/ })
        .getAttribute("href"),
    ).toBe(`/home/progress/${COMPLETION_ID}`);
    expect(within(entry).getByText("Partly completed")).toBeTruthy();
    expect(within(entry).getByText("Running")).toBeTruthy();
    expect(within(entry).getByText("42 min")).toBeTruthy();
    expect(within(entry).getByText("7 of 10")).toBeTruthy();
    expect(within(entry).getByText("Good")).toBeTruthy();
    expect(
      document.querySelector("[data-progress-signals]")?.textContent,
    ).toContain("Pain");
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

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    const entry = document.querySelector(
      `[data-progress-entry="${COMPLETION_ID}"]`,
    ) as HTMLElement;
    expect(
      within(entry).getByRole("link", { name: /Sunrise swim/ }),
    ).toBeTruthy();
    expect(within(entry).getByText("Swimming")).toBeTruthy();
    expect(within(entry).queryByText("Unplanned training")).toBe(null);
  });

  it("keeps two logs from one day under that day, in the order read", async () => {
    listCompletions.mockResolvedValue([
      completion(),
      { ...completion(), id: OTHER_ID },
    ]);

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelectorAll("[data-progress-entry]")).toHaveLength(2);
    // One day mark, not two: both were logged for the same owner-local date.
    expect(
      document.querySelectorAll("[data-progress-month] > ol > li"),
    ).toHaveLength(1);
  });

  it("says a month with nothing in it is empty, and never says zero", async () => {
    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-02" }),
      }),
    );

    const empty = document.querySelector('[data-progress-empty="month"]');
    expect(empty?.textContent).toContain(
      "Nothing was logged in February 2026.",
    );
    expect(document.querySelector('[data-progress-empty="never"]')).toBe(null);
  });

  it("says the record starts here for an owner whose first month it is", async () => {
    profileIs({ timezoneName: TIMEZONE, createdAt: new Date().toISOString() });

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    const empty = document.querySelector('[data-progress-empty="never"]');
    expect(empty?.textContent).toContain("Your record starts here.");
    // The two empty states are different sentences, never the same one twice.
    expect(document.querySelector('[data-progress-empty="month"]')).toBe(null);
  });

  it("refuses to guess a month for an owner with no stored zone", async () => {
    profileIs({ timezoneName: null, createdAt: "2020-01-15T09:00:00.000Z" });

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    expect(
      document.querySelector('[data-progress-state="no-zone"]'),
    ).toBeTruthy();
    expect(listCompletions).not.toHaveBeenCalled();
  });
});

function profileIs(profile: {
  timezoneName: string | null;
  createdAt: string;
}) {
  createProfileMock.mockResolvedValue({
    getCurrentProfile: vi
      .fn()
      .mockResolvedValue({ userId: "owner", ...profile }),
  });
}

function completion() {
  return {
    id: COMPLETION_ID,
    planSessionId: "7e150000-0000-4000-8000-000000000001",
    status: "partially_completed" as const,
    actualLocalDate: today(),
    timezoneName: TIMEZONE,
    durationMinutes: 42,
    perceivedEffort: 7,
    feeling: "good" as const,
    painReported: true,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: {
      localDate: today(),
      position: 0,
      title: "Threshold intervals",
      sport: "Running",
      isLocked: false,
      status: "active" as const,
      seriesId: null,
      occurrenceDate: null,
      activities: [],
    },
    revision: 0,
    activities: [],
    updatedAt: "2026-08-31T10:00:00.000Z",
  };
}
