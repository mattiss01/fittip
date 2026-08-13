import "server-only";

import { selectActiveGoalContext } from "@/server/goals/goal-records";
import {
  selectActiveMemoryContext,
  utcIsoDate,
  type MemoryItemView,
} from "@/server/memory/memory-records";
import type {
  CoachAIGoalRecord,
  CoachAIOwnedRecords,
} from "@/server/ai/context";
import type { CoachAISourceReference } from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import type {
  TrainingHistoryCompletion,
  TrainingHistoryPlannedSession,
} from "@/server/training/training-history-context";

/**
 * The seam between the coaching boundary and the database.
 *
 * Only this module and `owner.ts` may reach the accepted repositories, and an
 * adapter may never reach them at all. The repositories derive their own owner
 * from verified Auth claims and repeat the `user_id` predicate on every read, so
 * what arrives here is already owner-scoped; the verified owner is carried
 * through so the request that follows is stamped with an id no caller supplied.
 */

export interface CoachAIContextSource {
  load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords>;
}

/** The reads this needs, stated structurally so a fake needs no database. */
type GoalReader = {
  list(): Promise<{ revision: number; goals: CoachAIGoalRecord[] }>;
};

type MemoryReader = {
  list(today?: string): Promise<{
    revision: number;
    today: string;
    items: MemoryItemView[];
  }>;
};

/**
 * ADR-013's reads. `listCoachingCompletions` returns the current revision of
 * each completion group with the activities it recorded, and nothing from the
 * correction trail — decision 2 enforced by the repository rather than restated
 * here. The activities are why this is not `listCurrentCompletions`: a
 * completion carries no `sport` of its own, so decision 4's session sport and
 * activity names are only reachable through them.
 */
type CompletionReader = {
  listCoachingCompletions(): Promise<
    {
      id: string;
      completionGroupId: string;
      revisionNumber: number;
      plannedSessionId?: string | undefined;
      actualLocalDate: string;
      status: string;
      durationMinutes?: number | undefined;
      perceivedEffort?: number | undefined;
      feeling?: string | undefined;
      note?: string | undefined;
      replacementDescription?: string | undefined;
      correctionReason?: string | undefined;
      painReported: boolean;
      illnessReported: boolean;
      injuryReported: boolean;
      severeFatigueReported: boolean;
      activities: { name: string; sport: string }[];
    }[]
  >;
};

type PlanReader = {
  getCurrentManualPlan(): Promise<{
    head: { revision: number };
    version: { id: string };
    plan: {
      sessions: {
        localDate: string;
        title: string;
        sport: string;
        isLocked: boolean;
      }[];
    };
  } | null>;
};

export type { CoachAISourceReference } from "@/server/ai/contracts";

export type CoachAILoadedRecords = CoachAIOwnedRecords & {
  sources: CoachAISourceReference[];
};

export class RepositoryCoachAIContextSource implements CoachAIContextSource {
  constructor(
    private readonly goals: GoalReader,
    private readonly memory: MemoryReader,
    private readonly completions: CompletionReader,
    private readonly plans: PlanReader,
    private readonly today: () => string = utcIsoDate,
    /** M3-03 supplies the browser-resolved IANA zone after server validation. */
    private readonly timezoneName: () => string | null = () => null,
  ) {}

  async load(owner: CoachAIOwner): Promise<CoachAILoadedRecords> {
    const today = this.today();

    // Four independent owner-scoped reads, issued together rather than as a
    // waterfall. Each repository derives its own owner from verified claims.
    const [goalCollection, memoryCollection, completions, currentPlan] =
      await Promise.all([
        this.goals.list(),
        this.memory.list(today),
        this.completions.listCoachingCompletions(),
        this.plans.getCurrentManualPlan(),
      ]);

    if (memoryCollection.today !== today) {
      // The owner date decides which memory is review-due. If the two reads
      // disagree about it, the context is not reproducible and does not go out.
      throw new CoachAIError("context_invalid");
    }

    const plannedSessions: TrainingHistoryPlannedSession[] = (
      currentPlan?.plan.sessions ?? []
    ).map((session) => ({
      localDate: session.localDate,
      title: session.title,
      sport: session.sport,
      isLocked: session.isLocked,
      // The current plan does not carry planned-session ids through this shape,
      // so adherence is judged by date: a planned date with no completion on it
      // is a miss. That is coarser than an id join and never invents a miss,
      // which is the direction to be wrong in.
      hasCompletion: completions.some(
        (entry) => entry.actualLocalDate === session.localDate,
      ),
    }));

    const training = {
      today,
      // Replaced by the selected horizon in `buildCoachAIContext`; the source
      // has no opinion about how far forward the coach may look.
      horizonEndDate: today,
      completions: completions.map(toHistoryCompletion),
      plannedSessions,
    };

    // Only what actually travels is recorded, because acceptance rechecks every
    // stored source against its current eligible state. A paused goal or a
    // proposed memory candidate never reaches the coach, so recording one would
    // make an unrelated record able to block an acceptance — and a planning
    // note that produces a memory candidate would then conflict with the very
    // proposal that produced it. The eligibility rules are the same two
    // selectors `buildCoachAIContext` applies, so the two cannot drift.
    const eligibleGoals = selectActiveGoalContext(goalCollection.goals);
    const eligibleMemory = selectActiveMemoryContext(
      memoryCollection.items,
      today,
    );

    const sources: CoachAISourceReference[] = [
      ...[...eligibleGoals.targetable, ...eligibleGoals.historical].map(
        (goal) => ({
          kind: "goal" as const,
          recordId: goal.id,
        }),
      ),
      ...eligibleMemory.map((item) => ({
        kind: "memory" as const,
        recordId: item.id,
        revisionNumber: item.revisionNumber,
      })),
      ...completions.map((entry) => ({
        kind: "completion" as const,
        recordId: entry.completionGroupId,
        revisionId: entry.id,
        revisionNumber: entry.revisionNumber,
      })),
      ...(currentPlan
        ? [
            {
              kind: "plan_version" as const,
              recordId: currentPlan.version.id,
              revisionNumber: currentPlan.head.revision,
            },
          ]
        : []),
    ];

    return {
      ownerId: owner.id,
      today,
      goalCollectionRevision: goalCollection.revision,
      memoryCollectionRevision: memoryCollection.revision,
      goals: goalCollection.goals,
      memory: memoryCollection.items,
      training,
      timezoneName: this.timezoneName(),
      sources,
    };
  }
}

/**
 * Copies exactly the fields ADR-013 decision 4 enumerates. A completion has a
 * title only through the activities it recorded, so the first activity's name
 * and sport stand in rather than an invented one.
 */
function toHistoryCompletion(entry: {
  actualLocalDate: string;
  status: string;
  durationMinutes?: number | undefined;
  perceivedEffort?: number | undefined;
  feeling?: string | undefined;
  note?: string | undefined;
  replacementDescription?: string | undefined;
  correctionReason?: string | undefined;
  painReported: boolean;
  illnessReported: boolean;
  injuryReported: boolean;
  severeFatigueReported: boolean;
  activities: { name: string; sport: string }[];
}): TrainingHistoryCompletion {
  // A completion has no title or sport column. Decision 4 names both as
  // sendable, and the first recorded activity is where they actually live: a
  // session logged as one activity is that activity, and one logged as several
  // is named by the first, with the rest travelling in `activityNames`.
  return {
    localDate: entry.actualLocalDate,
    status: entry.status,
    title: entry.activities[0]?.name ?? null,
    sport: entry.activities[0]?.sport ?? null,
    durationMinutes: entry.durationMinutes ?? null,
    perceivedEffort: entry.perceivedEffort ?? null,
    feeling: entry.feeling ?? null,
    painReported: entry.painReported,
    illnessReported: entry.illnessReported,
    injuryReported: entry.injuryReported,
    severeFatigueReported: entry.severeFatigueReported,
    note: entry.note ?? null,
    replacementDescription: entry.replacementDescription ?? null,
    correctionReason: entry.correctionReason ?? null,
    activityNames: entry.activities.map((activity) => activity.name),
  };
}
