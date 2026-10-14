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
 *
 * The one exception is the roadmap in force being edited (ADR-030): its ended
 * phases are locked and come back as they were, so a goal one of them names
 * may have been achieved or archived since. `keepGoalIds` are those goals,
 * accepted when they are still the owner's. `activeGoalIds` says which goals
 * are active, so the caller can hold every phase that can still change to
 * them.
 */
export async function buildOwnerRoadmapValidationContext(source: {
  startDate: string;
  endDate: string;
}): Promise<CoachAIContext> {
  return (await buildOwnerRoadmapValidation(source)).context;
}

export async function buildOwnerRoadmapValidation(source: {
  startDate: string;
  endDate: string;
  keepGoalIds?: readonly string[];
}): Promise<{ context: CoachAIContext; activeGoalIds: Set<string> }> {
  const goals = await (await createGoalRepository()).list();
  const eligible = selectActiveGoalContext(goals.goals);
  const keep = new Set(source.keepGoalIds ?? []);
  const targetable = [
    ...eligible.targetable,
    ...goals.goals.filter(
      (goal) =>
        keep.has(goal.id) &&
        !eligible.targetable.some((active) => active.id === goal.id),
    ),
  ];

  const context: CoachAIContext = {
    today: source.startDate,
    horizonStartDate: source.startDate,
    horizonEndDate: source.endDate,
    // An owner's roadmap is checked against the goals and the dates. It is
    // never sent to a coach, so the profile is not read for it.
    ...emptyCoachProfile(),
    targetableGoals: targetable.map((goal) => ({
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
  return {
    context,
    activeGoalIds: new Set(eligible.targetable.map((goal) => goal.id)),
  };
}
