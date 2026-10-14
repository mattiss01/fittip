import "server-only";

import type { CoachAIContext } from "@/server/ai/contracts";
import { emptyCoachProfile } from "@/server/profile/coach-profile-context";
import { createGoalRepository } from "@/server/repositories/goal-repository";
import { selectActiveGoalContext } from "@/server/goals/goal-records";

/**
 * The context an owner's own roadmap is validated against: an edit of a
 * proposal, or a roadmap written by hand (ADR-029).
 *
 * Either goes through `validateRoadmapCandidate`, the same validator the
 * model's own output goes through, which needs a context to check against.
 * That context is not reassembled from scratch. For an edit the horizon is the
 * proposal's, not whatever is true right now, or an owner could widen their
 * own horizon by editing rather than by composing. For a roadmap written by
 * hand it is the one the action has already held to a coach request's range.
 *
 * Goals are re-read deliberately. A goal abandoned since the proposal was
 * generated must not survive into an edited version, and a hand-written
 * roadmap may name only the owner's active goals; the validator rejects any
 * other.
 */
export async function buildOwnerRoadmapValidationContext(source: {
  startDate: string;
  endDate: string;
}): Promise<CoachAIContext> {
  const goals = await (await createGoalRepository()).list();
  const eligible = selectActiveGoalContext(goals.goals);

  return {
    today: source.startDate,
    horizonStartDate: source.startDate,
    horizonEndDate: source.endDate,
    // An owner's roadmap is checked against the goals and the dates. It is
    // never sent to a coach, so the profile is not read for it.
    ...emptyCoachProfile(),
    targetableGoals: eligible.targetable.map((goal) => ({
      id: goal.id,
      title: goal.title,
      sports: goal.sports,
      priorityTier: goal.priorityTier,
      targetDate: goal.targetDate,
    })),
    historicalGoals: [],
    goalsOutsideHorizon: [],
    memory: [],
    trainingHistory: {
      windowStartDate: source.startDate,
      windowEndDate: source.startDate,
      sessionsInWindow: 0,
      sessionsIncluded: 0,
      completions: [],
      missedPlannedSessions: [],
    },
    planCommitments: [],
    // Nothing in a v3 roadmap depends on it (ADR-025): the validator demands no
    // safety sentence, so an edit has none to keep.
    hasSafetySignal: false,
    // Not the note itself: an edit produces no memory candidates, and the
    // validator only reads this to check excerpts that will not be present.
    planningNote: null,
    regenerationFeedback: null,
    previousProposal: null,
    // This re-checks an owner's roadmap against the same validator; it plans
    // nothing, so it carries no roadmap context.
    roadmap: null,
    sessionDetail: null,
  };
}
