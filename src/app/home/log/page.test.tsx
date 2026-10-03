import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProfileMock,
  createPlanMock,
  createCompletionLogMock,
  useActionStateMock,
  logCompletionActionMock,
  readLibraryOptionsMock,
  createSavedSessionLibraryMock,
} = vi.hoisted(() => ({
  readLibraryOptionsMock: vi.fn(),
  createSavedSessionLibraryMock: vi.fn(),
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

vi.mock("../plan/activities/library-options", () => ({
  readLibraryOptions: readLibraryOptionsMock,
}));
vi.mock("@/server/repositories/saved-session-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/saved-session-repository")
    >();
  return {
    ...actual,
    createSavedSessionLibrary: createSavedSessionLibraryMock,
  };
});

import LogPage from "./page";
import { INITIAL_LOG_ACTION_STATE } from "./log-action-state";
import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";

const TIMEZONE = "Europe/Berlin";
const SESSION_ID = "7e15b000-0000-4000-8000-000000000001";
const COMPLETION_ID = "7e15b000-0000-4000-8000-000000000002";
const today = () => isoDateInTimezone(new Date(), TIMEZONE);

const getPlanSlice = vi.fn();
const getCompletion = vi.fn();
const findByPlanSession = vi.fn();
const listCompletions = vi.fn();
const listSavedSessions = vi.fn();

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
    findByPlanSession.mockResolvedValue(null);
    listCompletions.mockResolvedValue([]);
    createCompletionLogMock.mockResolvedValue({
      get: getCompletion,
      findByPlanSession,
      list: listCompletions,
    });
    readLibraryOptionsMock.mockResolvedValue([]);
    listSavedSessions.mockResolvedValue([]);
    createSavedSessionLibraryMock.mockResolvedValue({
      list: listSavedSessions,
    });
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

  it.each([
    ["progress", `/home/progress/${COMPLETION_ID}`],
    // Anything else is ignored: the page never echoes a destination.
    ["https://example.com", null],
    [undefined, null],
  ])(
    "returns an edit opened from %s to where it came from",
    async (from, expected) => {
      getCompletion.mockResolvedValue(completion());

      render(
        await LogPage({
          searchParams: Promise.resolve({ completion: COMPLETION_ID, from }),
        }),
      );

      const cancel = screen.getByRole("link", { name: "Cancel" });
      // The page's own way back agrees with the form's Cancel.
      expect(
        screen.queryByRole("link", {
          name: expected === null ? "Back to the record" : "Back to Today",
        }),
      ).toBeNull();
      if (expected === null) {
        expect(
          cancel.getAttribute("href")?.startsWith("/home/today?date="),
        ).toBe(true);
      } else {
        expect(cancel.getAttribute("href")).toBe(expected);
      }
    },
  );

  it("asks whether training on another day replaced the planned session or was extra", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );
    const choice = () => document.querySelector("[data-log-day-choice]");

    // On the planned day there is nothing to ask.
    expect(choice()).toBeNull();

    // The day is a line on the first question; its Change opens the date
    // and returns to the question it was opened from.
    expect(currentStep()).toBe("outcome");
    fireEvent.click(screen.getByRole("button", { name: /Change the date/ }));
    expect(currentStep()).toBe("date");
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: shiftIsoDate(today(), -1) },
    });
    expect(hiddenValue("actualLocalDate")).toBe(shiftIsoDate(today(), -1));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toBe("outcome");
    chooseOutcome("Partly completed");
    expect(currentStep()).toBe("what");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toBe("day");
    expect(choice()?.textContent).toMatch(/Instead of .+ session/);
    expect(choice()?.textContent).toMatch(/Extra .+ still do/);
    // Nothing is sent until the owner answers.
    expect(hiddenValue("dayChoice")).toBe(undefined);

    // Extra can only have happened, so the outcome is no longer asked: Back
    // from the next question passes the day question and stops at "what".
    fireEvent.click(screen.getByRole("button", { name: /Extra/ }));
    expect(hiddenValue("dayChoice")).toBe("extra");
    expect(hiddenValue("status")).toBe("completed");
    expect(currentStep()).toBe("minutes");
    back();
    expect(currentStep()).toBe("day");
    back();
    expect(currentStep()).toBe("what");
    expect(screen.queryByRole("button", { name: /Back$/ })).toBeNull();

    // Choosing "instead" gives the question back.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Instead of/ }));
    expect(hiddenValue("dayChoice")).toBe("instead");
    back();
    back();
    back();
    expect(currentStep()).toBe("outcome");

    // A skip is about the planned session whatever day it is written on.
    chooseOutcome("Skipped");
    expect(choice()).toBeNull();
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
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-log-step="outcome"] [role="group"] button strong',
      ),
    ].map((label) => label.textContent);
    expect(outcomes).toEqual([
      "Completed",
      "Partly completed",
      "Skipped",
      "Replaced",
    ]);
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
    // Unplanned training has one outcome, so "How did it go?" is not asked.
    expect(document.querySelector('[data-log-step="outcome"]')).toBe(null);
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

  it("starts an unplanned log from a saved session, copied to be changed", async () => {
    listSavedSessions.mockResolvedValue([
      {
        id: "5a7ed000-0000-4000-8000-000000000001",
        revision: 1,
        name: "Tuesday gym",
        title: "Upper body",
        sport: "Strength",
        updatedAt: "",
        // Stored out of order: the log lists them by position.
        activities: [
          {
            position: 1,
            name: "Latzug",
            sport: "Strength",
            measurementMode: "unmeasured",
          },
          {
            position: 0,
            personalActivityId: "9e7a0000-0000-4000-8000-000000000001",
            name: "Bench press",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            target: {
              groups: [{ sets: 3, reps: 8, load: 60 }],
              load_unit: "kg",
            },
          },
        ],
      },
    ]);
    render(await LogPage({ searchParams: Promise.resolve({}) }));

    const title = () => document.querySelector<HTMLInputElement>("#log-title")!;
    expect(title().value).toBe("");
    fireEvent.click(
      screen.getByRole("button", { name: "Use session from library" }),
    );
    // The picker lists an entry by its title, the one name it has now.
    fireEvent.click(screen.getByRole("button", { name: /Upper body/ }));

    expect(title().value).toBe("Upper body");
    expect(document.querySelector<HTMLInputElement>("#log-sport")!.value).toBe(
      "Strength",
    );
    expect(JSON.parse(hiddenValue("activities") ?? "[]")).toEqual([
      {
        personalActivityId: "9e7a0000-0000-4000-8000-000000000001",
        position: 0,
        name: "Bench press",
        sport: "Strength",
        measurementMode: "sets_reps_load",
        actualMeasurement: {
          groups: [{ sets: 3, reps: 8, load: 60 }],
          load_unit: "kg",
        },
      },
      {
        position: 1,
        name: "Latzug",
        sport: "Strength",
        measurementMode: "unmeasured",
        actualMeasurement: null,
      },
    ]);
  });

  it("offers saved sessions only to an unplanned log", async () => {
    listSavedSessions.mockResolvedValue([
      {
        id: "5a7ed000-0000-4000-8000-000000000001",
        revision: 1,
        name: "Tuesday gym",
        title: "Upper body",
        sport: "Strength",
        updatedAt: "",
        activities: [],
      },
    ]);
    render(
      await LogPage({
        searchParams: Promise.resolve({ plannedSession: SESSION_ID }),
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Use session from library" }),
    ).toBeNull();
    expect(listSavedSessions).not.toHaveBeenCalled();
  });

  it("offers a planned session's title and sport, starting as the plan's", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    // The log's own name. Changing it renames the log and never the plan.
    expect(
      (document.querySelector("#log-title") as HTMLInputElement).value,
    ).toBe("Threshold intervals");
    expect(
      (document.querySelector("#log-sport") as HTMLInputElement).value,
    ).toBe("Running");
  });

  it("offers an unplanned log's title and sport for correction", async () => {
    getCompletion.mockResolvedValue({
      ...completion(),
      title: "Sunrise swim",
      sport: "Swimming",
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    // The name lives on the log, so a typo in it is an ordinary correction.
    expect(
      (document.querySelector("#log-title") as HTMLInputElement).value,
    ).toBe("Sunrise swim");
    expect(
      (document.querySelector("#log-sport") as HTMLInputElement).value,
    ).toBe("Swimming");
  });

  it("leaves the naming empty on a log written before a title was collected", async () => {
    getCompletion.mockResolvedValue(completion());

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    // It has no name of its own, so the owner gives it one rather than being
    // shown a name FitTip invented.
    expect(
      (document.querySelector("#log-title") as HTMLInputElement).value,
    ).toBe("");
  });

  it("refuses a second log for a session that already has one", async () => {
    findByPlanSession.mockResolvedValue({
      ...completion(),
      id: "8f000000-0000-4000-8000-0000000000c1",
      actualLocalDate: "2026-09-14",
    });

    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    // Said before the owner fills anything in: `list` is bounded by the actual
    // date, so a log written on another day was invisible to this surface.
    expect(screen.getByText("This session is already logged.")).toBeTruthy();
    expect(document.querySelector("#log-date")).toBe(null);
    expect(
      screen.getByRole("link", { name: "Open that log" }).getAttribute("href"),
    ).toBe("/home/log?completion=8f000000-0000-4000-8000-0000000000c1");
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
    chooseOutcome("Skipped");
    expect(document.querySelector("#log-duration")).toBe(null);
    expect(document.querySelector('[data-log-step="effort"]')).toBe(null);
    expect(document.querySelector('[data-log-step="feeling"]')).toBe(null);
    // A skip goes straight to "Anything off?": an owner may skip precisely
    // because of pain, so the note and all four signals stay, and so does
    // the notice that qualifies them.
    expect(currentStep()).toBe("off");
    expect(document.querySelector("#log-note")).toBeTruthy();
    for (const signal of [
      "I felt pain",
      "I was ill",
      "I was injured",
      "I was severely fatigued",
    ]) {
      expect(screen.getByRole("button", { name: signal })).toBeTruthy();
    }
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
    chooseOutcome("Skipped");
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
    chooseOutcome("Skipped");
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

    chooseOutcome("Completed");
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

    chooseOutcome("Skipped");
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
    // A correction opens on the summary, one Change per answer (owner).
    expect(currentStep()).toBe("summary");
    expect(screen.getByText("45 min")).toBeTruthy();
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
    // The four signals and the notice are one question, shown before any is
    // picked, so the notice is never a step away from what it qualifies.
    expect(notice.closest('[data-log-step="off"]')?.textContent).toContain(
      "I felt pain",
    );
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

    expect(document.querySelector("[data-log-replaced-by]")).toBe(null);
    chooseOutcome("Replaced");
    // With nothing unplanned logged, the only way is to log it now, and the
    // numbers move to what was actually done.
    expect(document.querySelector("[data-log-replaced-by]")).toBeTruthy();
    expect(
      (screen.getByLabelText("Log it now") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("I already logged it") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByLabelText("Title of what you did")).toBeTruthy();
    expect(screen.getAllByLabelText("Duration (minutes)")).toHaveLength(1);
    expect(document.querySelector("#log-duration")).toBe(null);
  });

  it("offers the week's unplanned training for a replaced session to point at", async () => {
    listCompletions.mockResolvedValue([
      {
        ...completion(),
        id: "7e150000-0000-4000-8000-0000000000aa",
        title: "Hill ride",
        sport: "Cycling",
      },
    ]);
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    chooseOutcome("Replaced");
    fireEvent.click(screen.getByLabelText("I already logged it"));

    const select = screen.getByLabelText("Which training") as HTMLSelectElement;
    expect(select.value).toBe("7e150000-0000-4000-8000-0000000000aa");
    expect(select.selectedOptions[0].textContent).toMatch(
      /Hill ride · Cycling$/,
    );
    // The read is this owner's history from a week before the session.
    expect(listCompletions).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      today(),
    );
  });

  // Review of logging in steps, 3 Oct 2026: a hidden invalid field makes a
  // browser refuse the submit and say nothing, so it must never be hidden.
  it("opens the question Save cannot pass rather than failing silently", async () => {
    // A replaced log written before replacements were linked: its "what you
    // did instead" is still to be named, and the correction opens on the
    // summary, where that field is out of sight.
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

    expect(currentStep()).toBe("summary");
    const save = screen.getByRole("button", { name: "Save log" });
    expect(fireEvent.click(save)).toBe(false);
    expect(currentStep()).toBe("replaced");
  });

  it("does not return to the summary with an answer that cannot be saved", async () => {
    getCompletion.mockResolvedValue(completion());

    render(
      await LogPage({
        searchParams: Promise.resolve({ completion: COMPLETION_ID }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Change what" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Summary$/ }));
    expect(currentStep()).toBe("what");
  });

  it("gives back the outcome Extra replaced when Instead is chosen", async () => {
    render(
      await LogPage({
        searchParams: Promise.resolve({
          plannedSession: SESSION_ID,
          date: today(),
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Change the date/ }));
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: shiftIsoDate(today(), -1) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    chooseOutcome("Partly completed");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Extra/ }));
    expect(hiddenValue("status")).toBe("completed");
    back();
    fireEvent.click(screen.getByRole("button", { name: /Instead of/ }));
    expect(hiddenValue("status")).toBe("partially_completed");
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

/** Answers "How did it go?" with one tap, as the owner would. */
function chooseOutcome(label: string) {
  fireEvent.click(
    screen.getByRole("button", {
      name: new RegExp(`^${label}`),
      hidden: true,
    }),
  );
}

function currentStep() {
  return document
    .querySelector("[data-log-form]")
    ?.getAttribute("data-log-step-current");
}

function back() {
  fireEvent.click(screen.getByRole("button", { name: /Back$/ }));
}

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
