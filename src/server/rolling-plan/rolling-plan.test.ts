import { describe, expect, it } from "vitest";

import { InMemoryRollingPlanAdapter } from "./in-memory-rolling-plan-adapter";
import { registerRollingPlanContract } from "./rolling-plan-contract";
import { RollingPlan, RollingPlanValidationError } from "./rolling-plan";

registerRollingPlanContract("the in-memory adapter", async () => ({
  plan: new RollingPlan(new InMemoryRollingPlanAdapter()),
}));

describe("rolling plan interface validation", () => {
  it("requires bounded valid dates and rejects unknown input keys", async () => {
    const plan = new RollingPlan(new InMemoryRollingPlanAdapter());
    await expect(plan.getPlanSlice("2026-08-20", "2026-08-19")).rejects.toThrow(
      RollingPlanValidationError,
    );
    await expect(
      plan.applyChangeSet(
        {
          idempotencyKey: "75000000-0000-4000-8000-000000000101",
          provenance: "owner_manual",
          changes: [],
          userId: "75000000-0000-4000-8000-000000000001",
        },
        0,
      ),
    ).rejects.toThrow(RollingPlanValidationError);
  });
});
