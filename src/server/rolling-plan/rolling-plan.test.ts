import { describe, expect, it } from "vitest";

import { isoDateInTimezone } from "@/lib/date/local-date";

import { InMemoryRollingPlanAdapter } from "./in-memory-rolling-plan-adapter";
import { registerRollingPlanContract } from "./rolling-plan-contract";
import {
  RollingPlan,
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
} from "./rolling-plan";

const CONTRACT_TIMEZONE = "Europe/Berlin";
const CONTRACT_NOW = new Date("2026-08-17T09:30:00.000Z");

registerRollingPlanContract("the in-memory adapter", async () => {
  const adapter = new InMemoryRollingPlanAdapter({
    timezoneName: CONTRACT_TIMEZONE,
    clock: () => CONTRACT_NOW,
  });
  return {
    plan: new RollingPlan(adapter),
    today: isoDateInTimezone(CONTRACT_NOW, CONTRACT_TIMEZONE),
    clearTimezone: async () => adapter.clearTimezone(),
  };
});

describe("rolling plan interface validation", () => {
  it("requires bounded valid dates and rejects unknown input keys", async () => {
    const plan = new RollingPlan(
      new InMemoryRollingPlanAdapter({ timezoneName: CONTRACT_TIMEZONE }),
    );
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

  it("refuses every change while the owner has no stored zone", async () => {
    const plan = new RollingPlan(new InMemoryRollingPlanAdapter());
    await expect(
      plan.applyChangeSet(
        {
          idempotencyKey: "75000000-0000-4000-8000-000000000102",
          provenance: "owner_manual",
          changes: [
            {
              operation: "set_recovery_day",
              localDate: "2126-08-20",
              isRecoveryDay: true,
            },
          ],
        },
        0,
      ),
    ).rejects.toThrow(RollingPlanTimezoneRequiredError);
  });

  it("derives today in the owner's own zone, not the runtime's", async () => {
    // 23:30 UTC on the 17th is already the 18th in Auckland, so a change
    // targeting the 18th is planning today rather than planning the past.
    const nearMidnight = new Date("2026-08-17T23:30:00.000Z");
    const plan = new RollingPlan(
      new InMemoryRollingPlanAdapter({
        timezoneName: "Pacific/Auckland",
        clock: () => nearMidnight,
      }),
    );
    await expect(
      plan.applyChangeSet(
        {
          idempotencyKey: "75000000-0000-4000-8000-000000000103",
          provenance: "owner_manual",
          changes: [
            {
              operation: "set_recovery_day",
              localDate: "2026-08-18",
              isRecoveryDay: true,
            },
          ],
        },
        0,
      ),
    ).resolves.toMatchObject({ planRevision: 1, result: "applied" });
  });
});
