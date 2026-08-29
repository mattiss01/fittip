import "server-only";

import { randomUUID } from "node:crypto";

import type {
  RollingPlan,
  RollingPlanSkippedOccurrence,
  RollingPlanSlice,
} from "@/server/rolling-plan/rolling-plan";

export type ToppedUpPlanWindow = {
  slice: RollingPlanSlice;
  /** Occurrences this call wrote; zero when the window was already current. */
  createdCount: number;
  /** Rule dates the window could not take, which a surface may report. */
  skipped: RollingPlanSkippedOccurrence[];
  /**
   * False when the top-up itself could not run, so the slice may be short of
   * occurrences a series would otherwise have produced. A caller that shows a
   * window to an owner has to be able to say so rather than imply the plan is
   * empty on those dates.
   */
  toppedUp: boolean;
};

/**
 * ADR-017 consequence 3: coverage depends on the Plan being opened. An owner
 * who does not visit has no materialized occurrences past their last visit, so
 * every consumer that is not the Plan - Today, Progress, and the AI context -
 * must top the window up before reading it, or knowingly read an incomplete
 * plan. This is that call, and it lives beside the completion log because those
 * are the consumers M3-15 builds and every one of them reads the two together.
 *
 * It is deliberately thin: it reads the window, hands the revision it read to
 * the existing `materialize_rolling_plan_series` owner-derived RPC, and re-reads
 * only when that wrote something. Materialization returns `unchanged` without
 * advancing the revision when nothing is missing, so calling this on every read
 * costs one extra statement rather than a revision.
 *
 * A top-up that fails is never allowed to fail the read. Another tab racing
 * this one wins the revision and this call reports `toppedUp: false`; the
 * occurrences it wanted are usually already there because the other tab wrote
 * them, and the caller re-reads on its own schedule either way.
 */
export async function readPlanWindowToppedUp(
  plan: RollingPlan,
  startDate: string,
  endDate: string,
): Promise<ToppedUpPlanWindow> {
  const slice = await plan.getPlanSlice(startDate, endDate);
  try {
    const receipt = await plan.materializeSeries(randomUUID(), slice.revision);
    return {
      slice:
        receipt.createdCount === 0
          ? slice
          : await plan.getPlanSlice(startDate, endDate),
      createdCount: receipt.createdCount,
      skipped: receipt.skipped,
      toppedUp: true,
    };
  } catch {
    return { slice, createdCount: 0, skipped: [], toppedUp: false };
  }
}
