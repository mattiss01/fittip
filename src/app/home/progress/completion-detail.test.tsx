import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionLogMock } = vi.hoisted(() => ({
  createCompletionLogMock: vi.fn(),
}));

vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});

import CompletionPage from "./[id]/page";

const TIMEZONE = "Europe/Berlin";
const COMPLETION_ID = "7e150000-0000-4000-8000-000000000021";
const UNOWNED_ID = "7e150000-0000-4000-8000-0000000000ff";

const getCompletion = vi.fn();

describe("one completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCompletion.mockResolvedValue(null);
    createCompletionLogMock.mockResolvedValue({ get: getCompletion });
  });

  afterEach(cleanup);

  it("shows what was recorded beside the plan it was measured against", async () => {
    getCompletion.mockResolvedValue(completion());

    render(
      await CompletionPage({ params: Promise.resolve({ id: COMPLETION_ID }) }),
    );

    expect(getCompletion).toHaveBeenCalledWith(COMPLETION_ID);

    const recorded = document.querySelector(
      '[data-progress-sheet="recorded"]',
    ) as HTMLElement;
    expect(
      within(recorded).getByRole("heading", { name: "Threshold intervals" }),
    ).toBeTruthy();
    expect(within(recorded).getByText("Partly completed")).toBeTruthy();
    expect(within(recorded).getByText("42 min")).toBeTruthy();
    expect(within(recorded).getByText(TIMEZONE)).toBeTruthy();
    expect(within(recorded).getByText(/You reported: Pain/)).toBeTruthy();

    const planned = document.querySelector(
      '[data-progress-sheet="planned"]',
    ) as HTMLElement;
    expect(within(planned).getByText("Carbon copy")).toBeTruthy();
    expect(within(planned).getByText("Locked")).toBeTruthy();
    expect(within(planned).getByText("Recurring")).toBeTruthy();
    expect(within(planned).getByText("55 min")).toBeTruthy();
    expect(
      within(planned).getByText("Six by three minutes, floating the rest."),
    ).toBeTruthy();
    expect(within(planned).getByText("Warm-up")).toBeTruthy();
    expect(within(planned).getByText("Running · 15 min · Easy")).toBeTruthy();
    expect(
      within(planned).getByText(/Editing the plan now does not change/),
    ).toBeTruthy();
  });

  it("shows the stored snapshot rather than anything the plan says now", async () => {
    // The plan row this session came from is mutable. Nothing on this page may
    // read it, so a changed title or date can only reach the page through the
    // completion's own copy - which is what is asserted here.
    const stored = completion();
    getCompletion.mockResolvedValue(stored);

    render(
      await CompletionPage({ params: Promise.resolve({ id: COMPLETION_ID }) }),
    );

    const planned = document.querySelector(
      '[data-progress-sheet="planned"]',
    ) as HTMLElement;
    expect(
      within(planned).getByRole("heading", { name: "Threshold intervals" }),
    ).toBeTruthy();
    expect(within(planned).getByText("Monday, 3 August 2026")).toBeTruthy();
  });

  it("says plainly that unplanned training had no plan beside it", async () => {
    getCompletion.mockResolvedValue({
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
    });

    render(
      await CompletionPage({ params: Promise.resolve({ id: COMPLETION_ID }) }),
    );

    expect(screen.getByRole("heading", { name: "Sunrise swim" })).toBeTruthy();
    expect(
      document.querySelector('[data-progress-sheet="unplanned"]')?.textContent,
    ).toContain("This training was not planned.");
    expect(document.querySelector('[data-progress-sheet="planned"]')).toBe(
      null,
    );
  });

  it("links back to the month the record belongs to", async () => {
    getCompletion.mockResolvedValue(completion());

    render(
      await CompletionPage({ params: Promise.resolve({ id: COMPLETION_ID }) }),
    );

    expect(
      screen
        .getByRole("link", { name: /Back to August 2026/ })
        .getAttribute("href"),
    ).toBe("/home/progress?month=2026-08");
  });

  it("refuses an id that is not a UUID before it reads anything", async () => {
    render(
      await CompletionPage({ params: Promise.resolve({ id: "not-a-uuid" }) }),
    );

    expect(getCompletion).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-progress-state="no-completion"]'),
    ).toBeTruthy();
  });

  it("answers a missing record and an unowned one identically", async () => {
    render(
      await CompletionPage({ params: Promise.resolve({ id: COMPLETION_ID }) }),
    );
    const missing = document.body.innerHTML;
    cleanup();

    render(
      await CompletionPage({ params: Promise.resolve({ id: UNOWNED_ID }) }),
    );
    const unowned = document.body.innerHTML;

    // Both reached the same owner-scoped read and both got nothing back, so
    // the owner of the other record learns nothing from the difference.
    expect(getCompletion).toHaveBeenNthCalledWith(1, COMPLETION_ID);
    expect(getCompletion).toHaveBeenNthCalledWith(2, UNOWNED_ID);
    expect(unowned).toBe(missing);
  });
});

function completion() {
  return {
    id: COMPLETION_ID,
    planSessionId: "7e150000-0000-4000-8000-000000000001",
    status: "partially_completed" as const,
    actualLocalDate: "2026-08-04",
    timezoneName: TIMEZONE,
    durationMinutes: 42,
    perceivedEffort: 7,
    feeling: "good" as const,
    note: "Held the pace to the last rep.",
    painReported: true,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: {
      localDate: "2026-08-03",
      position: 0,
      title: "Threshold intervals",
      sport: "Running",
      intent: "Six by three minutes, floating the rest.",
      expectedDurationMinutes: 55,
      isLocked: true,
      status: "active" as const,
      seriesId: "7e150000-0000-4000-8000-000000000002",
      occurrenceDate: "2026-08-03",
      activities: [
        {
          position: 0,
          name: "Warm-up",
          sport: "Running",
          measurementMode: "duration_intensity" as const,
          target: { duration_minutes: 15, intensity: "easy" as const },
        },
      ],
    },
    revision: 1,
    activities: [],
    updatedAt: "2026-08-31T10:00:00.000Z",
  };
}
