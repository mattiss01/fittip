import { describe, expect, it } from "vitest";

import { InMemoryRollingPlanAdapter } from "./in-memory-rolling-plan-adapter";
import {
  RollingPlan,
  RollingPlanConflictError,
  RollingPlanValidationError,
} from "./rolling-plan";

const SESSION_ID = "75000000-0000-4000-8000-000000000001";
const SECOND_ID = "75000000-0000-4000-8000-000000000002";
const KEY_1 = "75000000-0000-4000-8000-000000000101";

describe("rolling plan module through the in-memory adapter", () => {
  it("applies grouped session operations and preserves cancelled current state", async () => {
    const plan = new RollingPlan(new InMemoryRollingPlanAdapter());
    const added = await plan.applyChangeSet(
      changeSet(KEY_1, [add(SESSION_ID)]),
      0,
    );
    expect(added).toMatchObject({ planRevision: 1, result: "applied" });

    await plan.applyChangeSet(
      changeSet("75000000-0000-4000-8000-000000000102", [
        {
          operation: "edit",
          sessionId: SESSION_ID,
          session: {
            title: "Long aerobic run",
            sport: "Running",
            expectedDurationMinutes: 75,
            activities: [],
          },
        },
        {
          operation: "move",
          sessionId: SESSION_ID,
          localDate: "2026-08-17",
          position: 1,
        },
        { operation: "set_lock", sessionId: SESSION_ID, isLocked: true },
      ]),
      1,
    );
    await plan.applyChangeSet(
      changeSet("75000000-0000-4000-8000-000000000103", [
        { operation: "cancel", sessionId: SESSION_ID },
      ]),
      2,
    );

    const slice = await plan.getPlanSlice("2026-08-17", "2026-08-17");
    expect(slice.revision).toBe(3);
    expect(slice.sessions).toEqual([
      expect.objectContaining({
        id: SESSION_ID,
        title: "Long aerobic run",
        localDate: "2026-08-17",
        position: 1,
        isLocked: true,
        status: "cancelled",
      }),
    ]);
  });

  it("keeps a failed grouped change atomic", async () => {
    const plan = new RollingPlan(new InMemoryRollingPlanAdapter());
    await expect(
      plan.applyChangeSet(
        changeSet(KEY_1, [add(SESSION_ID), add(SESSION_ID)]),
        0,
      ),
    ).rejects.toThrow(RollingPlanValidationError);
    expect(await plan.getPlanSlice("2026-08-01", "2026-08-31")).toEqual({
      planId: null,
      revision: 0,
      sessions: [],
    });
  });

  it("returns an honest replay and rejects stale or conflicting keys", async () => {
    const plan = new RollingPlan(new InMemoryRollingPlanAdapter());
    const request = changeSet(KEY_1, [add(SESSION_ID)]);
    const first = await plan.applyChangeSet(request, 0);
    await expect(plan.applyChangeSet(request, 0)).resolves.toMatchObject({
      changeSetId: first.changeSetId,
      planRevision: 1,
      result: "replayed",
    });
    await expect(
      plan.applyChangeSet(changeSet(KEY_1, [add(SECOND_ID, "2026-08-18")]), 1),
    ).rejects.toThrow(RollingPlanConflictError);
    await expect(
      plan.applyChangeSet(
        changeSet("75000000-0000-4000-8000-000000000104", [add(SECOND_ID)]),
        0,
      ),
    ).rejects.toThrow(RollingPlanConflictError);
  });

  it("requires bounded valid dates and rejects unknown input keys before persistence", async () => {
    const plan = new RollingPlan(new InMemoryRollingPlanAdapter());
    await expect(plan.getPlanSlice("2026-08-20", "2026-08-19")).rejects.toThrow(
      RollingPlanValidationError,
    );
    await expect(
      plan.applyChangeSet(
        { ...changeSet(KEY_1, [add(SESSION_ID)]), userId: SESSION_ID },
        0,
      ),
    ).rejects.toThrow(RollingPlanValidationError);
  });
});

function changeSet(idempotencyKey: string, changes: unknown[]) {
  return { idempotencyKey, provenance: "owner_manual", changes };
}

function add(sessionId: string, localDate = "2026-08-16") {
  return {
    operation: "add",
    sessionId,
    session: {
      localDate,
      position: 0,
      title: "Aerobic run",
      sport: "Running",
      expectedDurationMinutes: 60,
      isLocked: false,
      activities: [],
    },
  };
}
