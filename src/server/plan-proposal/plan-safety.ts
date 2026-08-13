import "server-only";

import type { CoachAIContext } from "@/server/ai/contracts";

export type PlanSafetyDecision =
  | { tier: "ordinary"; generation: "continue" }
  | {
      tier: "severe";
      generation: "pause-all";
      reason: "reported-signal" | "uncertain";
    }
  | { tier: "none"; generation: "continue" };

/**
 * The model never classifies safety. Accepted constraint memory is an ordinary
 * limitation and remains in context so the coach can avoid conflicting work.
 * A reported completion signal has no accepted severity field. Its tier is
 * therefore uncertain and resolves to the conservative pause-all branch.
 * Planning-note prose is deliberately ignored: parsing severity from new free
 * text would silently turn an unreviewed inference into a safety fact.
 */
export function decidePlanSafety(context: CoachAIContext): PlanSafetyDecision {
  if (context.hasSafetySignal) {
    return { tier: "severe", generation: "pause-all", reason: "uncertain" };
  }

  const hasAcceptedLimitation = context.memory.some(
    (item) => item.memoryType === "constraint",
  );
  if (hasAcceptedLimitation) {
    return { tier: "ordinary", generation: "continue" };
  }
  return { tier: "none", generation: "continue" };
}
