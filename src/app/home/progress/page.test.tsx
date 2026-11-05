import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createProfileMock, createCompletionLogMock } = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
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
import ProgressPage from "./page";
import { isoDateInTimezone } from "@/lib/date/local-date";

const TIMEZONE = "Europe/Berlin";
const COMPLETION_ID = "7e150000-0000-4000-8000-000000000011";
const OTHER_ID = "7e150000-0000-4000-8000-000000000012";

const today = () => isoDateInTimezone(new Date(), TIMEZONE);
const currentMonth = () => today().slice(0, 7);

const listCompletions = vi.fn();
const sportUse = vi.fn();

describe("Progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileIs({
      timezoneName: TIMEZONE,
      createdAt: "2020-01-15T09:00:00.000Z",
    });
    listCompletions.mockResolvedValue([]);
    sportUse.mockResolvedValue([]);
    createCompletionLogMock.mockResolvedValue({
      list: listCompletions,
      sportUse,
    });
  });

  afterEach(cleanup);

  it("reads the owner-local current month when no month is given", async () => {
    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    expect(listCompletions).toHaveBeenCalledWith(
      `${currentMonth()}-01`,
      expect.stringMatching(new RegExp(`^${currentMonth()}-\\d{2}$`)),
    );
    expect(screen.getByRole("heading", { name: "Progress" })).toBeTruthy();
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

  // That Progress makes no plan read at all is asserted in
  // `src/architecture/m3-11-legacy-reset.test.ts`, against the route sources
  // themselves. A mock of `plan-window-top-up` used to assert it here. That
  // would have caught this page acquiring that one import on the one render
  // path the test exercised, and nothing else; the invariant test covers every
  // plan module, both routes, and every path, so the weaker check is not kept
  // beside it.

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
    expect(within(entry).getByText("Effort 7 of 10")).toBeTruthy();
    // A log no longer carries how it felt (owner, 7 Oct 2026).
    expect(within(entry).queryByText("Felt")).toBeNull();
    expect(
      document.querySelector("[data-progress-signals]")?.textContent,
    ).toContain("Pain");
  });

  it("names unplanned training by the name it was logged under", async () => {
    listCompletions.mockResolvedValue([
      {
        ...completion(),
        planSessionId: null,
        status: "unplanned" as const,
        plannedSnapshot: null,
        title: "Sunrise swim",
        sport: "Swimming",
        activities: [],
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

  it("names a renamed planned log by its own name, not the plan's", async () => {
    listCompletions.mockResolvedValue([
      { ...completion(), title: "Hill reps instead", sport: "Trail running" },
    ]);

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    const entry = document.querySelector(
      `[data-progress-entry="${COMPLETION_ID}"]`,
    ) as HTMLElement;
    expect(
      within(entry).getByRole("link", { name: /Hill reps instead/ }),
    ).toBeTruthy();
    expect(within(entry).queryByText(/Threshold intervals/)).toBe(null);
  });

  it("keeps two logs from one week under that week, in the order read", async () => {
    listCompletions.mockResolvedValue([
      completion(),
      { ...completion(), id: OTHER_ID },
    ]);

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    const entries = [...document.querySelectorAll("[data-progress-entry]")];
    expect(
      entries.map((entry) => entry.getAttribute("data-progress-entry")),
    ).toEqual([COMPLETION_ID, OTHER_ID]);
    // One week heading, not two: both were logged in this owner-local week.
    expect(
      document.querySelectorAll("[data-progress-month] > ol > li"),
    ).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "This week" })).toBeTruthy();
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
    expect(empty?.textContent).toContain("Your record starts here");
    // The two empty states are different sentences, never the same one twice.
    expect(document.querySelector('[data-progress-empty="month"]')).toBe(null);
  });

  it("never claims an account age it does not know", async () => {
    profileIs({ timezoneName: TIMEZONE, createdAt: "not-a-date" });

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    // The first-run sentence tells the owner they created their account this
    // month, so it must not appear when nothing established which month that
    // was. The ordinary empty-month sentence is true either way.
    expect(document.querySelector('[data-progress-empty="never"]')).toBe(null);
    expect(
      document.querySelector('[data-progress-empty="month"]'),
    ).toBeTruthy();
  });

  it("lists the owner's sports most-logged first, keeping the month", async () => {
    sportUse.mockResolvedValue([
      { sport: "Running", logs: 9 },
      { sport: "Swimming", logs: 2 },
    ]);

    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-02" }),
      }),
    );

    const chips = within(screen.getByRole("navigation", { name: "Sports" }))
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(chips).toEqual([
      ["All", "/home/progress?month=2026-02"],
      ["Running", "/home/progress?month=2026-02&sport=Running"],
      ["Swimming", "/home/progress?month=2026-02&sport=Swimming"],
    ]);
    expect(
      screen.getByRole("link", { name: "All" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("shows one sport alone, and keeps it when the month changes", async () => {
    sportUse.mockResolvedValue([
      { sport: "Running", logs: 9 },
      { sport: "Swimming", logs: 2 },
    ]);
    listCompletions.mockResolvedValue([completion(), swim()]);

    render(
      await ProgressPage({
        searchParams: Promise.resolve({ sport: "Swimming" }),
      }),
    );

    expect(
      [...document.querySelectorAll("[data-progress-entry]")].map((entry) =>
        entry.getAttribute("data-progress-entry"),
      ),
    ).toEqual([OTHER_ID]);
    expect(
      document
        .querySelector("[data-progress-month]")
        ?.getAttribute("data-progress-sport"),
    ).toBe("Swimming");
    expect(
      screen.getByRole("link", { name: /Previous month/ }).getAttribute("href"),
    ).toMatch(/^\/home\/progress\?month=\d{4}-\d{2}&sport=Swimming$/);
    expect(
      screen
        .getByRole("link", { name: "Swimming" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("shows every sport for a sport the owner has never logged", async () => {
    sportUse.mockResolvedValue([{ sport: "Running", logs: 9 }]);
    listCompletions.mockResolvedValue([completion(), swim()]);

    render(
      await ProgressPage({
        searchParams: Promise.resolve({ sport: "Curling" }),
      }),
    );

    expect(
      document
        .querySelector("[data-progress-month]")
        ?.getAttribute("data-progress-sport"),
    ).toBe("all");
    expect(document.querySelectorAll("[data-progress-entry]")).toHaveLength(2);
  });

  it("counts training and its time, never a skip, and names a missing duration", async () => {
    sportUse.mockResolvedValue([
      { sport: "Running", logs: 9 },
      { sport: "Swimming", logs: 2 },
    ]);
    listCompletions.mockResolvedValue([
      { ...completion(), status: "completed" as const },
      { ...swim(), durationMinutes: null },
      {
        ...completion(),
        id: "7e150000-0000-4000-8000-000000000013",
        status: "skipped" as const,
        durationMinutes: null,
      },
    ]);

    render(await ProgressPage({ searchParams: Promise.resolve({}) }));

    const summary = document.querySelector(
      "[data-progress-summary]",
    ) as HTMLElement;
    expect(summary.textContent).toContain("2 sessions · 42 min");
    expect(summary.textContent).toContain(
      "1 session has no duration and is not in the time.",
    );
    expect(summary.textContent).toContain("1 skipped");
    expect(
      within(summary)
        .getByRole("link", { name: "Swimming: 1 session" })
        .getAttribute("href"),
    ).toBe("/home/progress?sport=Swimming");
    // It counts the owner's logs; it never totals, streaks or averages them.
    expect(document.body.textContent).not.toMatch(/total|streak|average/i);
  });

  it("heads a week by the days of it in the month, and names what it cannot time", async () => {
    // 1 March 2026 is a Sunday: its week began in February, which this month
    // does not count, so its heading says only the day it does.
    listCompletions.mockResolvedValue([
      {
        ...completion(),
        id: OTHER_ID,
        actualLocalDate: "2026-03-02",
        durationMinutes: null,
      },
      { ...completion(), actualLocalDate: "2026-03-01" },
    ]);

    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-03" }),
      }),
    );

    const weeks = [
      ...document.querySelectorAll("[data-progress-month] > ol > li"),
    ];
    expect(weeks.map((week) => week.querySelector("h3")?.textContent)).toEqual([
      "2 Mar – 8 Mar",
      "1 Mar",
    ]);
    expect(weeks[0]?.textContent).toContain("1 session · 1 without a duration");
    expect(weeks[1]?.textContent).toContain("1 session · 42 min");
  });

  it("says which sport an empty month has none of", async () => {
    sportUse.mockResolvedValue([{ sport: "Swimming", logs: 2 }]);

    render(
      await ProgressPage({
        searchParams: Promise.resolve({ month: "2026-02", sport: "Swimming" }),
      }),
    );

    expect(
      document.querySelector('[data-progress-empty="month"]')?.textContent,
    ).toContain("No Swimming was logged in February 2026.");
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

function swim() {
  return {
    ...completion(),
    id: OTHER_ID,
    planSessionId: null,
    status: "unplanned" as const,
    plannedSnapshot: null,
    title: "Sunrise swim",
    sport: "Swimming",
    durationMinutes: 30,
  };
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
    painReported: true,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: {
      localDate: today(),
      position: 0,
      title: "Threshold intervals",
      sport: "Running",
      status: "active" as const,
      seriesId: null,
      occurrenceDate: null,
      activities: [],
    },
    revision: 0,
    replacedBy: null,
    replaces: [],
    activities: [],
    updatedAt: "2026-08-31T10:00:00.000Z",
  };
}
