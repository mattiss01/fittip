import { describe, expect, it } from "vitest";

import type { CoachAIContext } from "@/server/ai/contracts";
import { decidePlanSafety } from "@/server/plan-proposal/plan-safety";

describe("plan safety decision", () => {
  it("continues through an accepted ordinary limitation", () => {
    expect(
      decidePlanSafety(
        context({
          memory: [
            {
              id: "c3000000-0000-4000-8000-000000000001",
              memoryType: "constraint",
              content:
                "Avoid running while the knee settles; swimming is comfortable.",
            },
          ],
        }),
      ),
    ).toEqual({ tier: "ordinary", generation: "continue" });
  });

  it("pauses all generation when an eligible signal has no accepted severity", () => {
    expect(decidePlanSafety(context({ hasSafetySignal: true }))).toEqual({
      tier: "severe",
      generation: "pause-all",
      reason: "uncertain",
    });
  });

  it("does not infer a tier from planning-note text", () => {
    expect(
      decidePlanSafety(
        context({ planningNote: "My knee suddenly hurts badly." }),
      ),
    ).toEqual({ tier: "none", generation: "continue" });
  });
});

function context(overrides: Partial<CoachAIContext> = {}): CoachAIContext {
  return {
    today: "2026-08-12",
    horizonStartDate: "2026-08-12",
    horizonEndDate: "2026-08-18",
    targetableGoals: [],
    historicalGoals: [],
    goalsOutsideHorizon: [],
    memory: [],
    trainingHistory: {
      windowStartDate: "2026-06-18",
      windowEndDate: "2026-08-12",
      sessionsInWindow: 0,
      sessionsIncluded: 0,
      completions: [],
      missedPlannedSessions: [],
    },
    planCommitments: [],
    hasSafetySignal: false,
    planningNote: null,
    regenerationFeedback: null,
    previousProposal: null,
    ...overrides,
  };
}
