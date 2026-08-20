import "server-only";

import { randomUUID } from "node:crypto";

import type {
  RollingPlan,
  RollingPlanMaterializationReceipt,
} from "@/server/rolling-plan/rolling-plan";

export type PlanTopUpResult =
  | { ok: true; receipt: RollingPlanMaterializationReceipt }
  | { ok: false };

/**
 * A Plan mutation is already permanent when this follow-up starts. Keep a
 * failed top-up distinguishable so callers never report the first save as
 * failed or silently claim the window is current.
 */
export async function topUpAfterPlanChange(
  plan: RollingPlan,
  planRevision: number,
): Promise<PlanTopUpResult> {
  try {
    return {
      ok: true,
      receipt: await plan.materializeSeries(randomUUID(), planRevision),
    };
  } catch {
    return { ok: false };
  }
}

export function planChangeCopy(
  savedMessage: string,
  topUp: PlanTopUpResult,
): string {
  return topUp.ok
    ? savedMessage
    : `${savedMessage} Recurring sessions could not be extended. Reload the plan to retry.`;
}
