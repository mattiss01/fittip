import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createPlanMock,
  createCompletionLogMock,
  useActionStateMock,
  logCompletionActionMock,
} = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  createPlanMock: vi.fn(),
  createCompletionLogMock: vi.fn(),
  useActionStateMock: vi.fn(),
  logCompletionActionMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("./actions", () => ({ logCompletionAction: logCompletionActionMock }));
vi.mock("@/server/repositories/profile-repository", async (original) => {
  const actual =
    await original<typeof import("@/server/repositories/profile-repository")>();
  return { ...actual, createProfileRepository: createProfileMock };
});
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createPlanMock };
});
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});

import LogPage from "./page";
import { INITIAL_LOG_ACTION_STATE } from "./log-action-state";
import { isoDateInTimezone } from "@/lib/date/local-date";

const TIMEZONE = "Europe/Berlin";
const SESSION_ID = "7e15b000-0000-4000-8000-000000000001";
const COMPLETION_ID = "7e15b000-0000-4000-8000-000000000002";
const today = () => isoDateInTimezone(new Date(), TIMEZONE);

const getPlanSlice = vi.fn();
const getCompletion = vi.fn();

describe("Log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([
      INITIAL_LOG_ACTION_STATE,
      vi.fn(),
      false,
    ]);
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "owner",
        timezoneName: TIMEZONE,
        createdAt: "",
      }),
    });
    getPlanSlice.mockResolvedValue({
      planId: "plan",
      revision: 3,
      sessions: [session()],
      recoveryDates: [],
    });
    createPlanMock.mockResolvedValue({ getPlanSlice });
    getCompletion.mockResolvedValue(null);
    createCompletionLogMock.mockResolvedValue({ get: getCompletion });
  });

  afterEach(cleanup);

  it("opens a planned session bounded by the day its link named", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    expect(getPlanSlice).toHaveBeenCalledWith(today(), today());
    expect(screen.getByText("Threshold intervals")).toBeTruthy();
    expect(hiddenValue("plannedSessionId")).toBe(SESSION_ID);
    expect(hiddenValue("plannedDate")).toBe(today());
    expect(hiddenValue("operation")).toBe("create");
  });

  it("offers skip as one outcome among the four a planned session may have", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    const outcomes = [
      ...document.querySelectorAll<HTMLInputElement>(
        "input[type='radio'][name='status']",
      ),
    ].map((input) => input.value);
    expect(outcomes).toEqual([
      "completed",
      "partially_completed",
      "skipped",
      "replaced",
    ]);
    expect(screen.getByText("Skipped")).toBeTruthy();
  });

  it("says so when the named session is not on that day", async () => {
    getPlanSlice.mockResolvedValue({
      planId: "plan",
      revision: 3,
      sessions: [],
      recoveryDates: [],
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    expect(
      document.querySelector('[data-log-state="no-session"]'),
    ).toBeTruthy();
    expect(document.querySelector("[data-log-form]")).toBe(null);
  });

  it("logs unplanned training without reading the plan at all", async () => {
    render(await LogPage({ searchParams: Promise.resolve({}) }));

    expect(getPlanSlice).not.toHaveBeenCalled();
    expect(hiddenValue("status")).toBe("unplanned");
    expect(
      document.querySelector("[data-log-fixed-outcome]")?.textContent,
    ).toContain("no planned session attached");
  });

  it("asks unplanned training for a title and a sport", async () => {
    render(await LogPage({ searchParams: Promise.resolve({}) }));

    const title = document.querySelector<HTMLInputElement>("#log-title")!;
    const sport = document.querySelector<HTMLInputElement>("#log-sport")!;
    expect(title.name).toBe("title");
    expect(title.required).toBe(true);
    expect(title.maxLength).toBe(120);
    expect(sport.name).toBe("sport");
    expect(sport.required).toBe(true);
    expect(sport.maxLength).toBe(80);
    expect(screen.getByLabelText("Title")).toBe(title);
    expect(screen.getByLabelText("Sport")).toBe(sport);
  });

  it("never offers a title or a sport on a planned session", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    expect(document.querySelector("#log-title")).toBe(null);
    expect(document.querySelector("#log-sport")).toBe(null);
  });

  it("reads an unplanned log's title and sport back rather than offering them", async () => {
    getCompletion.mockResolvedValue({
      ...completion(),
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
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    // An input here would take what the owner typed and drop it: the write
    // function refuses an activity list on an edit.
    expect(document.querySelector("#log-title")).toBe(null);
    expect(document.querySelector("#log-sport")).toBe(null);
    const readback = document.querySelector(
      "[data-log-fixed-naming]",
    ) as HTMLElement;
    expect(readback.textContent).toContain("Sunrise swim");
    expect(readback.textContent).toContain("Swimming");
    expect(readback.textContent).toContain("cannot be changed yet");
  });

  it("still names an unplanned log written before a title was collected", async () => {
    getCompletion.mockResolvedValue(completion());

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    expect(
      document.querySelector("[data-log-fixed-naming]")?.textContent,
    ).toContain("Unplanned training");
  });

  it("stops asking for duration, effort and how it felt once skipped is chosen", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    expect(document.querySelector("#log-duration")).toBeTruthy();
    fireEvent.click(
      document.querySelector("input[type='radio'][value='skipped']")!,
    );
    expect(document.querySelector("#log-duration")).toBe(null);
    expect(document.querySelector("#log-effort")).toBe(null);
    expect(document.querySelector("#log-feeling")).toBe(null);
    // An owner may skip precisely because of pain, so the note and all four
    // signals stay, and so does the notice that qualifies them.
    expect(document.querySelector("#log-note")).toBeTruthy();
    expect(screen.getByLabelText("I felt pain")).toBeTruthy();
    expect(screen.getByLabelText("I was ill")).toBeTruthy();
    expect(screen.getByLabelText("I was injured")).toBeTruthy();
    expect(screen.getByLabelText("I was severely fatigued")).toBeTruthy();
    expect(
      screen.getByText(/stop training and speak to a qualified/),
    ).toBeTruthy();
  });

  it("warns before a skip clears numbers the log already carries", async () => {
    getCompletion.mockResolvedValue({
      ...completion(),
      planSessionId: SESSION_ID,
      status: "completed" as const,
      perceivedEffort: 7,
      feeling: "good" as const,
      plannedSnapshot: snapshot(),
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    expect(document.querySelector("[data-log-clears]")).toBe(null);
    fireEvent.click(
      document.querySelector("input[type='radio'][value='skipped']")!,
    );
    expect(document.querySelector("[data-log-clears]")?.textContent).toContain(
      "removes the duration, the effort and how it felt",
    );
  });

  it("warns before a skip discards what was done instead", async () => {
    // The likeliest shape of this: a replaced log carries a description and no
    // numbers at all, so the three-number condition alone would say nothing.
    getCompletion.mockResolvedValue({
      ...completion(),
      planSessionId: SESSION_ID,
      status: "replaced" as const,
      durationMinutes: undefined,
      replacementDescription: "Swam instead.",
      plannedSnapshot: snapshot(),
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    expect(document.querySelector("[data-log-clears]")).toBe(null);
    fireEvent.click(
      document.querySelector("input[type='radio'][value='skipped']")!,
    );
    const warning = document.querySelector("[data-log-clears]") as HTMLElement;
    expect(warning.textContent).toContain("removes what you did instead");
    expect(warning.textContent).not.toContain("the duration");
    // The textarea it names is indeed gone, which is what makes it true.
    expect(document.querySelector("#log-replacement")).toBe(null);
  });

  it("warns whenever a description is discarded, not only on a skip", async () => {
    getCompletion.mockResolvedValue({
      ...completion(),
      planSessionId: SESSION_ID,
      status: "replaced" as const,
      durationMinutes: undefined,
      replacementDescription: "Swam instead.",
      plannedSnapshot: snapshot(),
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    fireEvent.click(
      document.querySelector("input[type='radio'][value='completed']")!,
    );
    expect(document.querySelector("[data-log-clears]")?.textContent).toContain(
      "removes what you did instead",
    );
  });

  it("names every field a skip discards, and only those", async () => {
    getCompletion.mockResolvedValue({
      ...completion(),
      planSessionId: SESSION_ID,
      status: "replaced" as const,
      perceivedEffort: 7,
      replacementDescription: "Swam instead.",
      plannedSnapshot: snapshot(),
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    fireEvent.click(
      document.querySelector("input[type='radio'][value='skipped']")!,
    );
    const warning = document.querySelector("[data-log-clears]") as HTMLElement;
    expect(warning.textContent).toContain(
      "removes the duration, the effort and what you did instead",
    );
    // No feeling was recorded, so the warning does not claim to remove one.
    expect(warning.textContent).not.toContain("how it felt");
  });

  it("says nothing about clearing when there is nothing to clear", async () => {
    getCompletion.mockResolvedValue({
      ...completion(),
      planSessionId: SESSION_ID,
      status: "skipped" as const,
      durationMinutes: undefined,
      plannedSnapshot: snapshot(),
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    // Not vacuous: this fixture differs from the three positive cases above
    // only in carrying none of the four values the warning is about.
    expect(document.querySelector("[data-log-clears]")).toBe(null);
    expect(document.querySelector("#log-duration")).toBe(null);
  });

  it("reopens an existing log against the revision it was read at", async () => {
    getCompletion.mockResolvedValue(completion());

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    expect(getCompletion).toHaveBeenCalledWith(COMPLETION_ID);
    expect(hiddenValue("operation")).toBe("edit");
    expect(hiddenValue("completionId")).toBe(COMPLETION_ID);
    expect(hiddenValue("expectedRevision")).toBe("4");
    expect(hiddenValue("plannedSessionId")).toBe(undefined);
    expect(
      document.querySelector<HTMLInputElement>("#log-duration")?.value,
    ).toBe("45");
  });

  it("says so when the log behind the link is not there", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    expect(
      document.querySelector('[data-log-state="no-completion"]'),
    ).toBeTruthy();
  });

  it("ignores a malformed identifier rather than looking it up", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: "not-an-id" }),
      }),
    );

    expect(getCompletion).not.toHaveBeenCalled();
    expect(hiddenValue("status")).toBe("unplanned");
  });

  it("refuses to anchor a day for an owner with no stored zone", async () => {
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({
        userId: "owner",
        timezoneName: null,
        createdAt: "",
      }),
    });

    render(await LogPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelector('[data-log-state="no-zone"]')).toBeTruthy();
    expect(document.querySelector("[data-log-form]")).toBe(null);
  });

  it("carries the established safety notice wherever a signal is reported", async () => {
    render(await LogPage({ searchParams: Promise.resolve({}) }));

    const notice = screen.getByText(/stop training and speak to a qualified/);
    expect(notice.textContent).toContain("gives no medical advice");
    // The four signals and the notice belong to the same fieldset, so the
    // notice cannot be scrolled away from what it qualifies.
    expect(notice.closest("fieldset")?.textContent).toContain("I felt pain");
  });

  it("asks what was done instead only once replaced is chosen", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    expect(document.querySelector("#log-replacement")).toBe(null);
    fireEvent.click(
      document.querySelector("input[type='radio'][value='replaced']")!,
    );
    expect(document.querySelector("#log-replacement")).toBeTruthy();
  });

  it("replaces the form with a receipt that leads back to the day", async () => {
    useActionStateMock.mockReturnValue([
      {
        status: "saved",
        message: "Log saved.",
        submission: 1,
        result: "created",
        returnDate: today(),
      },
      vi.fn(),
      false,
    ]);

    render(await LogPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelector("[data-log-form]")).toBe(null);
    expect(screen.getByRole("heading", { name: "Log saved." })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to that day" })
        .getAttribute("href"),
    ).toBe(`/home/today?date=${today()}`);
  });
});

function hiddenValue(name: string) {
  return document.querySelector<HTMLInputElement>(
    `input[type='hidden'][name='${name}']`,
  )?.value;
}

function session() {
  return {
    id: SESSION_ID,
    localDate: today(),
    position: 0,
    title: "Threshold intervals",
    sport: "Running",
    expectedDurationMinutes: 60,
    isLocked: false,
    status: "active" as const,
    cancelledAt: null,
    seriesId: null,
    occurrenceDate: null,
    hasDiverged: false,
    activities: [],
  };
}

function snapshot() {
  return {
    localDate: today(),
    position: 0,
    title: "Threshold intervals",
    sport: "Running",
    isLocked: false,
    status: "active" as const,
    seriesId: null,
    occurrenceDate: null,
    activities: [],
  };
}

function completion() {
  return {
    id: COMPLETION_ID,
    planSessionId: null,
    status: "unplanned" as const,
    actualLocalDate: today(),
    timezoneName: TIMEZONE,
    durationMinutes: 45,
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: null,
    revision: 4,
    activities: [],
    updatedAt: "2026-08-30T10:00:00.000Z",
  };
}
