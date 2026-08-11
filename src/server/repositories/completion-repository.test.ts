import { describe, expect, it, vi } from "vitest";

import {
  CompletionAuthenticationError,
  CompletionConflictError,
  CompletionRepository,
  CompletionWriteUnconfirmedError,
} from "@/server/repositories/completion-repository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PLANNED_ID = "00000000-0000-4000-8000-000000000010";
const IDEMPOTENCY_ID = "00000000-0000-4000-8000-000000000030";

describe("CompletionRepository", () => {
  it("authenticates before saving and disables retry for the transactional RPC", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000" },
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const repository = new CompletionRepository(
      client({
        rpc,
      }),
    );

    await expect(repository.save(completion())).rejects.toThrow(
      CompletionWriteUnconfirmedError,
    );
    expect(rpc).toHaveBeenCalledWith(
      "save_training_completion",
      expect.objectContaining({
        p_idempotency_key: IDEMPOTENCY_ID,
        p_planned_session_id: PLANNED_ID,
      }),
    );
    expect(retry).toHaveBeenCalledWith(false);
  });

  it("returns the successful RPC receipt without a follow-up read", async () => {
    const from = vi.fn();
    const repository = new CompletionRepository(
      client({
        from,
        rpc: vi.fn().mockReturnValue({
          retry: vi.fn().mockResolvedValue({
            data: {
              id: "00000000-0000-4000-8000-000000000040",
              completion_group_id: "00000000-0000-4000-8000-000000000050",
              revision_number: 1,
              status: "completed",
            },
            error: null,
          }),
        }),
      }),
    );

    await expect(repository.save(completion())).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000040",
      completionGroupId: "00000000-0000-4000-8000-000000000050",
      revisionNumber: 1,
      status: "completed",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps only PT409 to a correction/idempotency conflict", async () => {
    const repository = new CompletionRepository(
      client({
        rpc: vi.fn().mockReturnValue({
          retry: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "PT409" },
          }),
        }),
      }),
    );
    await expect(repository.save(completion())).rejects.toThrow(
      CompletionConflictError,
    );
  });

  it("does not call the write RPC for an anonymous session", async () => {
    const rpc = vi.fn();
    const repository = new CompletionRepository(
      client({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: null },
            error: new Error("no session"),
          }),
        },
        rpc,
      }),
    );
    await expect(repository.save(completion())).rejects.toThrow(
      CompletionAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed values before authentication or persistence", async () => {
    const rpc = vi.fn();
    const auth = { getClaims: vi.fn() };
    const repository = new CompletionRepository(client({ auth, rpc }));
    await expect(
      repository.save({ ...completion(), perceivedEffort: 99 }),
    ).rejects.toThrow("The completion is invalid.");
    expect(auth.getClaims).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lists only current owner-scoped completion heads in factual order", async () => {
    const currentId = "00000000-0000-4000-8000-000000000040";
    const groupId = "00000000-0000-4000-8000-000000000050";
    const headOrder = vi.fn().mockResolvedValue({
      data: [
        {
          completion_group_id: groupId,
          current_completion_id: currentId,
          revision: 2,
          updated_at: "2026-07-29T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const headEq = vi.fn().mockReturnValue({ order: headOrder });
    const sessionIn = vi.fn().mockResolvedValue({
      data: [
        {
          id: currentId,
          user_id: USER_ID,
          completion_group_id: groupId,
          revision_number: 2,
          previous_completion_id: "00000000-0000-4000-8000-000000000039",
          planned_session_id: PLANNED_ID,
          actual_local_date: "2026-07-29",
          actual_started_at: null,
          timezone_name: "Europe/Berlin",
          duration_minutes: 35,
          status: "partially_completed",
          perceived_effort: 5,
          feeling: "as_expected",
          note: null,
          replacement_description: null,
          pain_reported: false,
          illness_reported: false,
          injury_reported: false,
          severe_fatigue_reported: false,
          correction_reason: "Adjusted duration",
          created_at: "2026-07-29T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ in: sessionIn });
    const from = vi.fn((table: string) => {
      if (table === "completion_heads") {
        return { select: vi.fn(() => ({ eq: headEq })) };
      }
      if (table === "completed_sessions") {
        return { select: vi.fn(() => ({ eq: sessionEq })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const repository = new CompletionRepository(client({ from }));

    await expect(repository.listCurrentCompletions()).resolves.toEqual([
      expect.objectContaining({
        id: currentId,
        completionGroupId: groupId,
        revisionNumber: 2,
        status: "partially_completed",
        activities: [],
      }),
    ]);
    expect(headEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessionEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessionIn).toHaveBeenCalledWith("id", [currentId]);
  });

  // M3-02. ADR-013 decision 4 lists the session sport among the fields a coach
  // may read, and a completion carries none of its own: it lives on the
  // activities. The coaching read is the only one that joins them.
  it("reads the recorded activities and their sport for the coaching path", async () => {
    const currentId = "00000000-0000-4000-8000-000000000041";
    const groupId = "00000000-0000-4000-8000-000000000051";
    const headOrder = vi.fn().mockResolvedValue({
      data: [
        {
          completion_group_id: groupId,
          current_completion_id: currentId,
          revision: 1,
          updated_at: "2026-07-29T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const headEq = vi.fn().mockReturnValue({ order: headOrder });
    const sessionIn = vi.fn().mockResolvedValue({
      data: [completionRow(currentId, groupId)],
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ in: sessionIn });
    const activityOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000060",
          completed_session_id: currentId,
          planned_activity_id: null,
          personal_activity_id: null,
          position: 1,
          name: "Hill repeats",
          sport: "Running",
          instructions: null,
          measurement_mode: "time_distance_pace",
          actual_measurement: null,
        },
      ],
      error: null,
    });
    const activityIn = vi.fn().mockReturnValue({ order: activityOrder });
    const activityEq = vi.fn().mockReturnValue({ in: activityIn });
    const from = vi.fn((table: string) => {
      if (table === "completion_heads") {
        return { select: vi.fn(() => ({ eq: headEq })) };
      }
      if (table === "completed_sessions") {
        return { select: vi.fn(() => ({ eq: sessionEq })) };
      }
      if (table === "completed_activities") {
        return { select: vi.fn(() => ({ eq: activityEq })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const repository = new CompletionRepository(client({ from }));

    await expect(repository.listCoachingCompletions()).resolves.toEqual([
      expect.objectContaining({
        id: currentId,
        activities: [
          expect.objectContaining({ name: "Hill repeats", sport: "Running" }),
        ],
      }),
    ]);
    // The owner predicate is repeated on every read, RLS notwithstanding.
    expect(headEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessionEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(activityEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(activityIn).toHaveBeenCalledWith("completed_session_id", [
      currentId,
    ]);
  });
});

function completionRow(id: string, groupId: string) {
  return {
    id,
    user_id: USER_ID,
    completion_group_id: groupId,
    revision_number: 1,
    previous_completion_id: null,
    planned_session_id: PLANNED_ID,
    actual_local_date: "2026-07-29",
    actual_started_at: null,
    timezone_name: "Europe/Berlin",
    duration_minutes: 45,
    status: "completed",
    perceived_effort: 6,
    feeling: "as_expected",
    note: null,
    replacement_description: null,
    pain_reported: false,
    illness_reported: false,
    injury_reported: false,
    severe_fatigue_reported: false,
    correction_reason: null,
    created_at: "2026-07-29T12:00:00.000Z",
  };
}

function client(overrides: Record<string, unknown>) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: USER_ID } },
        error: null,
      }),
    },
    ...overrides,
  } as never;
}

function completion() {
  return {
    idempotencyKey: IDEMPOTENCY_ID,
    expectedRevision: 0,
    plannedSessionId: PLANNED_ID,
    actualLocalDate: "2026-07-28",
    timezoneName: "Europe/Berlin",
    status: "completed",
    painReported: false,
    illnessReported: false,
    injuryReported: false,
    severeFatigueReported: false,
    activities: [],
  };
}
