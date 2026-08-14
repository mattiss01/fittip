import { describe, expect, it, vi } from "vitest";

import {
  PostgresRollingPlanAdapter,
  RollingPlanAuthenticationError,
} from "./rolling-plan-repository";
import {
  RollingPlan,
  RollingPlanConflictError,
  RollingPlanPersistenceError,
  RollingPlanValidationError,
} from "@/server/rolling-plan/rolling-plan";

const USER_ID = "76000000-0000-4000-8000-000000000001";
const SESSION_ID = "76000000-0000-4000-8000-000000000002";
const KEY = "76000000-0000-4000-8000-000000000003";

describe("PostgresRollingPlanAdapter", () => {
  it("derives the owner, supplies no owner to the RPC, and disables retries", async () => {
    const retry = vi.fn().mockResolvedValue({
      data: {
        plan_id: "76000000-0000-4000-8000-000000000004",
        plan_revision: 1,
        change_set_id: "76000000-0000-4000-8000-000000000005",
        result: "applied",
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ retry });
    const plan = new RollingPlan(
      new PostgresRollingPlanAdapter(client({ rpc })),
    );
    await plan.applyChangeSet(request(), 0);
    expect(rpc).toHaveBeenCalledWith("apply_rolling_plan_change_set", {
      p_expected_plan_revision: 0,
      p_idempotency_key: KEY,
      p_provenance: "owner_manual",
      p_changes: request().changes,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(retry).toHaveBeenCalledWith(false);
  });

  it.each([
    ["PT409", RollingPlanConflictError],
    ["22023", RollingPlanValidationError],
    ["23514", RollingPlanPersistenceError],
  ])(
    "maps %s without forwarding private database text",
    async (code, ErrorType) => {
      const adapter = new PostgresRollingPlanAdapter(
        client({
          rpc: vi.fn().mockReturnValue({
            retry: vi.fn().mockResolvedValue({
              data: null,
              error: { code, message: "Knee pain supplied in a row" },
            }),
          }),
        }),
      );
      await expect(adapter.applyChangeSet(request(), 0)).rejects.toThrow(
        ErrorType,
      );
      await expect(adapter.applyChangeSet(request(), 0)).rejects.not.toThrow(
        /Knee pain/,
      );
    },
  );

  it("reads one state snapshot RPC and never composes table snapshots", async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        plan_id: "76000000-0000-4000-8000-000000000004",
        plan_revision: 3,
        sessions: [
          {
            id: SESSION_ID,
            localDate: "2026-08-16",
            position: 0,
            title: "Run",
            sport: "Running",
            intent: null,
            expectedDurationMinutes: 40,
            note: null,
            isLocked: false,
            status: "active",
            cancelledAt: null,
            activities: [],
          },
        ],
      },
      error: null,
    });
    const plan = new RollingPlan(
      new PostgresRollingPlanAdapter(client({ from, rpc })),
    );
    const slice = await plan.getPlanSlice("2026-08-16", "2026-08-17");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_rolling_plan_slice", {
      p_start_date: "2026-08-16",
      p_end_date: "2026-08-17",
    });
    expect(from).not.toHaveBeenCalled();
    expect(slice).toMatchObject({
      planId: "76000000-0000-4000-8000-000000000004",
      revision: 3,
      sessions: [{ id: SESSION_ID }],
    });
  });

  it("does not call persistence for an anonymous session", async () => {
    const rpc = vi.fn();
    const adapter = new PostgresRollingPlanAdapter(
      client({
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: null },
            error: new Error("none"),
          }),
        },
        rpc,
      }),
    );
    await expect(adapter.applyChangeSet(request(), 0)).rejects.toThrow(
      RollingPlanAuthenticationError,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

function request() {
  return {
    idempotencyKey: KEY,
    provenance: "owner_manual",
    changes: [
      {
        operation: "add" as const,
        sessionId: SESSION_ID,
        session: {
          localDate: "2026-08-16",
          position: 0,
          title: "Run",
          sport: "Running",
          isLocked: false,
          activities: [],
        },
      },
    ],
  };
}

function client(overrides: Record<string, unknown>) {
  return {
    auth: {
      getClaims: vi
        .fn()
        .mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null }),
    },
    ...overrides,
  } as never;
}
