import { beforeEach, describe, expect, it, vi } from "vitest";

const { createLibraryMock, createCompletionLogMock, revalidatePathMock } =
  vi.hoisted(() => ({
    createLibraryMock: vi.fn(),
    createCompletionLogMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/saved-session-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/saved-session-repository")
    >();
  return { ...actual, createSavedSessionLibrary: createLibraryMock };
});
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});

import { INITIAL_LIBRARY_SAVE_ACTION_STATE } from "./action-state";
import {
  saveLogToLibraryAction,
  saveSessionDraftToLibraryAction,
} from "./actions";

import type { Completion } from "@/server/completions/completion-log";
import { parseSavedSessionChange } from "@/server/saved-sessions/saved-sessions";

const COMPLETION_ID = "7e000000-0000-4000-8000-000000000011";

describe("saving a log to the session library", () => {
  // The library parses what it is given exactly as the real one does, so a
  // draft these actions build is proven to be one it would accept.
  const applyChange = vi.fn((change: unknown) => {
    parseSavedSessionChange(change);
    return Promise.resolve({ result: "created" });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createLibraryMock.mockResolvedValue({ applyChange });
  });

  it("saves a written log with what was done as its targets", async () => {
    const get = vi.fn().mockResolvedValue(completion());
    createCompletionLogMock.mockResolvedValue({ get });

    const state = await saveLogToLibraryAction(
      INITIAL_LIBRARY_SAVE_ACTION_STATE,
      form({ completionId: COMPLETION_ID, name: "  Tuesday gym " }),
    );

    expect(state.status).toBe("saved");
    expect(get).toHaveBeenCalledWith(COMPLETION_ID);
    expect(applyChange).toHaveBeenCalledWith({
      operation: "create",
      session: {
        // Named by its title, whatever name the form sends.
        name: "Upper body",
        title: "Upper body",
        sport: "Strength",
        expectedDurationMinutes: 55,
        activities: [
          {
            personalActivityId: "7e000000-0000-4000-8000-0000000000a1",
            position: 0,
            name: "Bench press",
            sport: "Strength",
            measurementMode: "sets_reps_load",
            target: {
              groups: [{ sets: 3, reps: 8, load: 62.5 }],
              load_unit: "kg",
            },
          },
          {
            position: 1,
            name: "Stretching",
            sport: "Mobility",
            measurementMode: "unmeasured",
          },
        ],
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/plan/saved");
  });

  it("refuses a skipped log, which records no training to reuse", async () => {
    createCompletionLogMock.mockResolvedValue({
      get: vi.fn().mockResolvedValue({
        ...completion(),
        status: "skipped",
        activities: [],
      }),
    });

    const state = await saveLogToLibraryAction(
      INITIAL_LIBRARY_SAVE_ACTION_STATE,
      form({ completionId: COMPLETION_ID, name: "Nothing" }),
    );

    expect(state.status).toBe("validation");
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("saves the log form as it stands, through the library's own parser", async () => {
    await expect(
      saveSessionDraftToLibraryAction({
        name: "Tuesday gym",
        title: "Upper body",
        sport: "Strength",
        activities: [
          {
            position: 0,
            name: "Latzug",
            sport: "Strength",
            measurementMode: "unmeasured",
          },
        ],
      }),
    ).resolves.toEqual({ status: "saved", message: "Saved to your library." });
  });

  it("says what is missing when the form cannot be saved", async () => {
    const result = await saveSessionDraftToLibraryAction({
      name: "Tuesday gym",
      title: "",
      sport: "Strength",
      activities: [],
    });

    expect(result.status).toBe("refused");
    expect(result.message).toMatch(/a title and a sport/);
  });
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function completion(): Completion {
  return {
    id: COMPLETION_ID,
    planSessionId: null,
    status: "unplanned",
    actualLocalDate: "2026-09-27",
    timezoneName: "Europe/Berlin",
    durationMinutes: 55,
    perceivedEffort: 7,
    note: "Felt strong",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    plannedSnapshot: null,
    title: "Upper body",
    sport: "Strength",
    replacedBy: null,
    replaces: [],
    revision: 1,
    updatedAt: "2026-09-27T10:00:00.000Z",
    // Stored out of order: the saved session takes the order they were done.
    activities: [
      {
        position: 1,
        name: "Stretching",
        sport: "Mobility",
        measurementMode: "unmeasured",
      },
      {
        personalActivityId: "7e000000-0000-4000-8000-0000000000a1",
        position: 0,
        name: "Bench press",
        sport: "Strength",
        measurementMode: "sets_reps_load",
        actualMeasurement: {
          groups: [{ sets: 3, reps: 8, load: 62.5 }],
          load_unit: "kg",
        },
      },
    ],
  };
}
