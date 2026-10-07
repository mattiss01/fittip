import { describe, expect, it, vi } from "vitest";

import {
  GoalAuthenticationError,
  GoalConflictError,
  GoalPersistenceError,
  GoalRepository,
} from "./goal-repository";

const USER_ID = "51000000-0000-4000-8000-000000000001";
const GOAL_ID = "52000000-0000-4000-8000-000000000001";

describe("GoalRepository", () => {
  it("authenticates, derives no caller owner, and disables mutation retry", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: { goal_id: GOAL_ID, collection_revision: 1, result: "created" },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const repository = new GoalRepository(client({ rpc }));

    await repository.create(goal(), 0);

    expect(rpc).toHaveBeenCalledWith(
      "apply_goal_change",
      expect.not.objectContaining({ user_id: expect.anything() }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "apply_goal_change",
      expect.objectContaining({
        p_expected_collection_revision: 0,
        p_operation: "create",
        p_title: "Run a trail event",
      }),
    );
    expect(retry).toHaveBeenCalledWith(false);
  });

  it.each([
    ["Three core goals are already active.", "core-limit"],
    ["Goals changed. Reload and try again.", "stale"],
  ] as const)(
    "maps only deliberate PT409 conflicts",
    async (message, reason) => {
      const repository = new GoalRepository(
        client({
          rpc: vi.fn().mockReturnValue({
            retry: vi.fn().mockResolvedValue({
              data: null,
              error: { code: "PT409", message },
            }),
          }),
        }),
      );

      await expect(repository.create(goal(), 0)).rejects.toMatchObject({
        name: GoalConflictError.name,
        reason,
      });
    },
  );

  it("maps other database failures to a generic persistence error", async () => {
    const repository = new GoalRepository(
      client({
        rpc: vi.fn().mockReturnValue({
          retry: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "23514", message: "private text" },
          }),
        }),
      }),
    );
    await expect(repository.create(goal(), 0)).rejects.toThrow(
      GoalPersistenceError,
    );
  });

  it("does not call the RPC for an anonymous session", async () => {
    const rpc = vi.fn();
    const repository = new GoalRepository(
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
    await expect(repository.create(goal(), 0)).rejects.toThrow(
      GoalAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dates an achieved goal by its achieved moment and the others by their last change", async () => {
    const neq = vi.fn().mockResolvedValue({
      data: [
        {
          id: "achieved",
          status: "achieved",
          achieved_at: "2026-09-20T16:00:00.000Z",
          updated_at: "2026-10-01T09:00:00.000Z",
        },
        {
          id: "paused",
          status: "paused",
          achieved_at: null,
          updated_at: "2026-10-02T09:00:00.000Z",
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ neq });
    const from = vi
      .fn()
      .mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
    const repository = new GoalRepository(client({ from }));

    await expect(repository.listStatusChanges()).resolves.toEqual([
      // Not the later edit: the day it was achieved.
      {
        goalId: "achieved",
        status: "achieved",
        changedAt: "2026-09-20T16:00:00.000Z",
      },
      {
        goalId: "paused",
        status: "paused",
        changedAt: "2026-10-02T09:00:00.000Z",
      },
    ]);
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("rejects malformed goal content before authentication", async () => {
    const auth = { getClaims: vi.fn() };
    const rpc = vi.fn();
    const repository = new GoalRepository(client({ auth, rpc }));
    await expect(
      repository.create({ ...goal(), targetDate: "1 July 2026" }, 0),
    ).rejects.toThrow("The goal details are invalid.");
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

function goal() {
  return {
    title: "Run a trail event",
    desiredOutcome: "Finish with steady pacing.",
    sports: ["Trail running"],
    priorityTier: "core",
  };
}
