import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCompletionLogMock,
  createPlanMock,
  createProfileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createCompletionLogMock: vi.fn(),
  createPlanMock: vi.fn(),
  createProfileMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/repositories/completion-log-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/completion-log-repository")
    >();
  return { ...actual, createCompletionLog: createCompletionLogMock };
});
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

import { skipUnloggedSessionAction } from "./unlogged-actions";
import { INITIAL_SKIP_STATE } from "./unlogged-state";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import { CompletionDuplicateError } from "@/server/completions/completion-log";

const TIMEZONE = "Europe/Berlin";
const SESSION_ID = "7e15c000-0000-4000-8000-000000000001";
const COMPLETION_ID = "7e15c000-0000-4000-8000-000000000002";
const yesterday = () =>
  shiftIsoDate(isoDateInTimezone(new Date(), TIMEZONE), -1);

const applyChange = vi.fn();
const getPlanCards = vi.fn();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function session(status: "active" | "cancelled" = "active") {
  return {
    id: SESSION_ID,
    localDate: yesterday(),
    position: 0,
    title: "Easy run",
    sport: "Running",
    status,
  };
}

describe("skipUnloggedSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProfileMock.mockResolvedValue({
      getCurrentProfile: vi.fn().mockResolvedValue({ timezoneName: TIMEZONE }),
    });
    getPlanCards.mockResolvedValue({ sessions: [session()] });
    createPlanMock.mockResolvedValue({ getPlanCards });
    applyChange.mockResolvedValue({
      completionId: COMPLETION_ID,
      revision: 0,
      result: "created",
    });
    createCompletionLogMock.mockResolvedValue({ applyChange });
  });

  it("writes a Skipped log on the planned day, named by the plan row", async () => {
    const state = await skipUnloggedSessionAction(
      INITIAL_SKIP_STATE,
      form({
        plannedSessionId: SESSION_ID,
        plannedDate: yesterday(),
        // Ignored: the name is the plan's, not the form's.
        title: "Forged",
      }),
    );

    expect(state).toMatchObject({
      status: "saved",
      completionId: COMPLETION_ID,
      submission: 1,
    });
    expect(getPlanCards).toHaveBeenCalledWith(yesterday(), yesterday());
    expect(applyChange).toHaveBeenCalledWith({
      operation: "create",
      completion: {
        status: "skipped",
        actualLocalDate: yesterday(),
        planSessionId: SESSION_ID,
        title: "Easy run",
        sport: "Running",
        activities: [],
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/home", "layout");
  });

  it("refuses today, so a session whose day is not over is never skipped here", async () => {
    const state = await skipUnloggedSessionAction(
      INITIAL_SKIP_STATE,
      form({
        plannedSessionId: SESSION_ID,
        plannedDate: isoDateInTimezone(new Date(), TIMEZONE),
      }),
    );

    expect(state.status).toBe("error");
    expect(getPlanCards).not.toHaveBeenCalled();
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("refuses a session not on that day, or cancelled", async () => {
    getPlanCards.mockResolvedValueOnce({ sessions: [] });
    const moved = await skipUnloggedSessionAction(
      INITIAL_SKIP_STATE,
      form({ plannedSessionId: SESSION_ID, plannedDate: yesterday() }),
    );
    getPlanCards.mockResolvedValueOnce({ sessions: [session("cancelled")] });
    const cancelled = await skipUnloggedSessionAction(
      INITIAL_SKIP_STATE,
      form({ plannedSessionId: SESSION_ID, plannedDate: yesterday() }),
    );

    expect(moved.message).toBe(
      "That session has moved or changed. Reload Today. Nothing was logged.",
    );
    expect(cancelled.status).toBe("error");
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("says when the session already has a log", async () => {
    applyChange.mockRejectedValueOnce(new CompletionDuplicateError());

    const state = await skipUnloggedSessionAction(
      INITIAL_SKIP_STATE,
      form({ plannedSessionId: SESSION_ID, plannedDate: yesterday() }),
    );

    expect(state).toMatchObject({
      status: "error",
      message: "That session already has a log. Reload Today to see it.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
