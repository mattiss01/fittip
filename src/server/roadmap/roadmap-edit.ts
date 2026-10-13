import "server-only";

import type { CoachAIContext } from "@/server/ai/contracts";
import { emptyCoachProfile } from "@/server/profile/coach-profile-context";
import { createGoalRepository } from "@/server/repositories/goal-repository";
import { selectActiveGoalContext } from "@/server/goals/goal-records";
import type { RoadmapProposalView } from "@/server/roadmap/roadmap-records";

/**
 * The context an owner's edit is revalidated against.
 *
 * An edit goes through `validateRoadmapCandidate`, the same validator the
 * model's own output goes through, which needs a context to check against.
 * That context is not reassembled from scratch: the horizon belongs to the
 * proposal being edited, not to whatever is true right now, or an owner could
 * widen their own horizon by editing rather than by composing.
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
    // An edit is checked against the goals and the dates. It is never sent to
    // a coach, so the profile is not read for it.
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
    // Edit validation re-checks an owner-edited roadmap against the same
    // validator; it plans nothing, so it carries no roadmap context.
    roadmap: null,
    sessionDetail: null,
  };
}
