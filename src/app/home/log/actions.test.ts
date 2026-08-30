import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionLogMock, createPlanMock, revalidatePathMock } =
  vi.hoisted(() => ({
    createCompletionLogMock: vi.fn(),
    createPlanMock: vi.fn(),
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
vi.mock("@/server/repositories/rolling-plan-repository", async (original) => {
  const actual =
    await original<
      typeof import("@/server/repositories/rolling-plan-repository")
    >();
  return { ...actual, createRollingPlan: createPlanMock };
});

import { logCompletionAction } from "./actions";
import { INITIAL_LOG_ACTION_STATE } from "./log-action-state";
import {
  CompletionConflictError,
  CompletionTimezoneRequiredError,
  CompletionValidationError,
} from "@/server/completions/completion-log";
import { CompletionAuthenticationError } from "@/server/repositories/completion-log-repository";

const SESSION_ID = "7e15b000-0000-4000-8000-000000000001";
const COMPLETION_ID = "7e15b000-0000-4000-8000-000000000002";
const DAY = "2026-08-30";

const applyChange = vi.fn();
const applyChangeSet = vi.fn();
const getPlanSlice = vi.fn();

describe("logCompletionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyChange.mockResolvedValue({
      completionId: COMPLETION_ID,
      revision: 0,
      result: "created",
    });
    createCompletionLogMock.mockResolvedValue({ applyChange });
    getPlanSlice.mockResolvedValue({
      planId: "plan",
      revision: 3,
      sessions: [{ id: SESSION_ID, localDate: DAY }],
      recoveryDates: [],
    });
    createPlanMock.mockResolvedValue({ getPlanSlice, applyChangeSet });
  });

  it("writes a planned completion through the completion seam only", async () => {
    const result = await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "create",
        status: "completed",
        actualLocalDate: DAY,
        plannedSessionId: SESSION_ID,
        plannedDate: DAY,
        returnDate: DAY,
        durationMinutes: "45",
        perceivedEffort: "7",
        feeling: "good",
        note: "Held the pace.",
        painReported: "true",
      }),
    );

    expect(applyChange).toHaveBeenCalledWith({
      operation: "create",
      completion: {
        status: "completed",
        actualLocalDate: DAY,
        planSessionId: SESSION_ID,
        durationMinutes: 45,
        perceivedEffort: 7,
        feeling: "good",
        note: "Held the pace.",
        painReported: true,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
        activities: [],
      },
    });
    expect(applyChangeSet).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "saved",
      message: "Log saved.",
      returnDate: DAY,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/home/today");
  });

  it("writes skip as a completion status and never as a plan change", async () => {
    await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "create",
        status: "skipped",
        actualLocalDate: DAY,
        plannedSessionId: SESSION_ID,
        plannedDate: DAY,
      }),
    );

    expect(applyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "create",
        completion: expect.objectContaining({
          status: "skipped",
          planSessionId: SESSION_ID,
        }),
      }),
    );
    expect(applyChangeSet).not.toHaveBeenCalled();
  });

  it("refuses a planned create whose session is not on the named day", async () => {
    getPlanSlice.mockResolvedValue({
      planId: "plan",
      revision: 3,
      sessions: [],
      recoveryDates: [],
    });

    const result = await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "create",
        status: "completed",
        actualLocalDate: DAY,
        plannedSessionId: SESSION_ID,
        plannedDate: DAY,
      }),
    );

    expect(getPlanSlice).toHaveBeenCalledWith(DAY, DAY);
    expect(applyChange).not.toHaveBeenCalled();
    expect(result.status).toBe("validation");
    expect(result.message).toContain("Nothing was logged.");
  });

  it("writes unplanned training with no planned session and no plan read", async () => {
    await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "create",
        status: "unplanned",
        actualLocalDate: DAY,
      }),
    );

    expect(getPlanSlice).not.toHaveBeenCalled();
    const [change] = applyChange.mock.calls[0];
    expect(change.completion.planSessionId).toBeUndefined();
    expect(change.completion.status).toBe("unplanned");
  });

  it("edits a mistaken log to skipped against the revision it was read at", async () => {
    applyChange.mockResolvedValue({
      completionId: COMPLETION_ID,
      revision: 2,
      result: "updated",
    });

    const result = await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "edit",
        completionId: COMPLETION_ID,
        expectedRevision: "1",
        status: "skipped",
        actualLocalDate: DAY,
        returnDate: DAY,
      }),
    );

    expect(applyChange).toHaveBeenCalledWith({
      operation: "edit",
      completionId: COMPLETION_ID,
      expectedRevision: 1,
      completion: {
        status: "skipped",
        actualLocalDate: DAY,
        painReported: false,
        illnessReported: false,
        injuryReported: false,
        severeFatigueReported: false,
      },
    });
    expect(result).toMatchObject({
      status: "saved",
      message: "Log updated.",
      result: "updated",
    });
  });

  it("never sends a planned snapshot or an activity list on an edit", async () => {
    await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "edit",
        completionId: COMPLETION_ID,
        expectedRevision: "0",
        status: "completed",
        actualLocalDate: DAY,
      }),
    );

    const [change] = applyChange.mock.calls[0];
    expect(Object.keys(change.completion)).not.toContain("plannedSnapshot");
    expect(Object.keys(change.completion)).not.toContain("activities");
  });

  it.each([
    [new CompletionConflictError(), "conflict", /Reload before saving/],
    [
      new CompletionTimezoneRequiredError(),
      "conflict",
      /Confirm your time zone/,
    ],
    [new CompletionValidationError(), "validation", /Nothing was logged/],
    [new CompletionAuthenticationError(), "session", /Sign in again/],
  ])("reports %# in the owner's own words", async (error, status, copy) => {
    applyChange.mockRejectedValue(error);

    const result = await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({
        operation: "create",
        status: "unplanned",
        actualLocalDate: DAY,
      }),
    );

    expect(result.status).toBe(status);
    expect(result.message).toMatch(copy);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("refuses an operation it does not offer", async () => {
    const result = await logCompletionAction(
      INITIAL_LOG_ACTION_STATE,
      form({ operation: "delete", status: "skipped", actualLocalDate: DAY }),
    );

    expect(result.status).toBe("validation");
    expect(applyChange).not.toHaveBeenCalled();
  });
});

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
