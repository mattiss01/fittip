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

  it("scopes plan, session, and activity reads to the verified owner", async () => {
    const planTable = table(
      { data: { id: "plan-id", revision: 3 }, error: null },
      true,
    );
    const sessionTable = table({
      data: [
        {
          id: SESSION_ID,
          local_date: "2026-08-16",
          position: 0,
          title: "Run",
          sport: "Running",
          intent: null,
          expected_duration_minutes: 40,
          note: null,
          is_locked: false,
          status: "active",
          cancelled_at: null,
        },
      ],
      error: null,
    });
    const activityTable = table({ data: [], error: null });
    const from = vi.fn((name: string) =>
      name === "rolling_plans"
        ? planTable.builder
        : name === "rolling_plan_sessions"
          ? sessionTable.builder
          : activityTable.builder,
    );
    const adapter = new PostgresRollingPlanAdapter(client({ from }));
    const slice = await adapter.getPlanSlice({
      startDate: "2026-08-16",
      endDate: "2026-08-17",
    });
    expect(planTable.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessionTable.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(activityTable.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(slice).toMatchObject({
      planId: "plan-id",
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

function table(result: unknown, single = false) {
  const eq = vi.fn();
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq,
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  eq.mockImplementation(() => builder);
  if (single) delete builder.then;
  return { builder, eq };
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
