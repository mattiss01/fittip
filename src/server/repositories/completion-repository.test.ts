import { describe, expect, it, vi } from "vitest";

import {
  CompletionAuthenticationError,
  CompletionConflictError,
  CompletionPersistenceError,
  CompletionRepository,
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
      CompletionPersistenceError,
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
});

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
