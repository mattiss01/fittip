import "server-only";

import type { CoachAIContext } from "@/server/ai/contracts";
import { createGoalRepository } from "@/server/repositories/goal-repository";
import { selectActiveGoalContext } from "@/server/goals/goal-records";
import type { RoadmapProposalView } from "@/server/roadmap/roadmap-records";

/**
 * The context an owner's edit is revalidated against.
 *
 * An edit goes through `validateRoadmapCandidate`, the same validator the
 * model's own output goes through, which needs a context to check against.
 * That context is not reassembled from scratch: the horizon and the safety
 * requirement belong to the proposal being edited, not to whatever is true
 * right now, or an owner could widen their own horizon by editing rather than
 * by composing.
 *
 * Goals are the exception and are re-read deliberately. A goal abandoned since
 * the proposal was generated must not survive into an edited version; the
 * validator rejects it here, and acceptance would reject it again.
 */
export async function buildEditValidationContext(
  source: RoadmapProposalView,
): Promise<CoachAIContext> {
  const goals = await (await createGoalRepository()).list();
  const eligible = selectActiveGoalContext(goals.goals);

  return {
    today: source.startDate,
    horizonStartDate: source.startDate,
    horizonEndDate: source.endDate,
    targetableGoals: eligible.targetable.map((goal) => ({
      id: goal.id,
      title: goal.title,
      category: goal.category,
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
    // If the proposal carried a safety consideration, the signal that required
    // it was real, and editing is not how it stops being real. The validator
    // therefore still demands at least one, so an owner cannot quietly delete
    // the sentence that acknowledges what they reported.
    hasSafetySignal: (source.content.safetyConsiderations ?? []).length > 0,
    // Not the note itself: an edit produces no memory candidates, and the
    // validator only reads this to check excerpts that will not be present.
    planningNote: null,
    regenerationFeedback: null,
    previousProposal: null,
  };
}
