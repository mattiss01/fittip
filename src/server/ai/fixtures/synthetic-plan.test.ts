import { describe, expect, it } from "vitest";

import type { CoachAIContext } from "@/server/ai/contracts";
import {
  COACH_AI_FIXTURE_PLAN_CONTEXT,
  COACH_AI_FIXTURE_PLAN_HORIZON_START,
  COACH_AI_FIXTURE_PLAN_SAFETY_CONTEXT,
} from "@/server/ai/fixtures/fixture-corpus";
import { synthesizePlanBody } from "@/server/ai/fixtures/synthetic-plan";
import { validatePlanCandidate } from "@/server/ai/output-validation";

/**
 * The synthetic body exists so a network-free Preview is reviewable. If it does
 * not pass the same validator a real response must pass, it is not standing in
 * for a real response — it is hiding a gap.
 */
function horizonOf(dayCount: number): CoachAIContext {
  const startMs = Date.parse(
    `${COACH_AI_FIXTURE_PLAN_HORIZON_START}T00:00:00.000Z`,
  );
  const endMs = startMs + (dayCount - 1) * 86_400_000;
  return {
    ...COACH_AI_FIXTURE_PLAN_CONTEXT,
    horizonEndDate: new Date(endMs).toISOString().slice(0, 10),
  };
}

describe("the synthetic plan body", () => {
  it.each([1, 2, 3, 7])("validates over a %i day horizon", (dayCount) => {
    const context = horizonOf(dayCount);
    const result = validatePlanCandidate({
      body: synthesizePlanBody(context),
      context,
    });

    if (result.outcome !== "accepted") {
      throw new Error(`expected acceptance, got ${result.reason}`);
    }
    expect(result.response.plan.startDate).toBe(context.horizonStartDate);
    expect(result.response.plan.endDate).toBe(context.horizonEndDate);
    for (const session of result.response.plan.sessions) {
      expect(session.date >= context.horizonStartDate).toBe(true);
      expect(session.date <= context.horizonEndDate).toBe(true);
    }
  });

  it("is a pure function of its context", () => {
    // No clock, no randomness, no environment read: same context, same bytes.
    expect(synthesizePlanBody(COACH_AI_FIXTURE_PLAN_CONTEXT)).toBe(
      synthesizePlanBody(COACH_AI_FIXTURE_PLAN_CONTEXT),
    );
  });

  it("leaves explicit rest days in a horizon long enough to have them", () => {
    const context = horizonOf(7);
    const result = validatePlanCandidate({
      body: synthesizePlanBody(context),
      context,
    });
    if (result.outcome !== "accepted") throw new Error("expected acceptance");

    const dated = new Set(result.response.plan.sessions.map((s) => s.date));
    expect(dated.size).toBeLessThan(7);
  });

  it("acknowledges a reported signal rather than inventing one", () => {
    const withSignal = validatePlanCandidate({
      body: synthesizePlanBody(COACH_AI_FIXTURE_PLAN_SAFETY_CONTEXT),
      context: COACH_AI_FIXTURE_PLAN_SAFETY_CONTEXT,
    });
    if (withSignal.outcome !== "accepted") {
      throw new Error("expected acceptance");
    }
    expect(withSignal.response.plan.safetyConsiderations).toHaveLength(1);

    const withoutSignal = validatePlanCandidate({
      body: synthesizePlanBody(COACH_AI_FIXTURE_PLAN_CONTEXT),
      context: COACH_AI_FIXTURE_PLAN_CONTEXT,
    });
    if (withoutSignal.outcome !== "accepted") {
      throw new Error("expected acceptance");
    }
    expect(withoutSignal.response.plan.safetyConsiderations).toBeUndefined();
  });

  it("quotes the planning note exactly when it proposes memory", () => {
    const result = validatePlanCandidate({
      body: synthesizePlanBody(COACH_AI_FIXTURE_PLAN_CONTEXT),
      context: COACH_AI_FIXTURE_PLAN_CONTEXT,
    });
    if (result.outcome !== "accepted") throw new Error("expected acceptance");

    expect(result.memoryRejectionReason).toBeNull();
    for (const candidate of result.response.memoryCandidates) {
      expect(COACH_AI_FIXTURE_PLAN_CONTEXT.planningNote).toContain(
        candidate.sourceExcerpt,
      );
    }
  });
});
