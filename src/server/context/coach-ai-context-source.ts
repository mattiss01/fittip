import "server-only";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";
import {
  CoachAIContextBelowMinimumError,
  COACH_AI_CONTEXT_LIMITS,
  type CoachAIOwnedRecords,
} from "@/server/ai/context";
import type { CoachAIContextSource } from "@/server/ai/context-source";
import type {
  CoachAIOperation,
  CoachAISourceReference,
} from "@/server/ai/contracts";
import { CoachAIError } from "@/server/ai/errors";
import type { CoachAIOwner } from "@/server/ai/owner";
import type { Completion } from "@/server/completions/completion-log";
import { readPlanWindowToppedUp } from "@/server/completions/plan-window-top-up";
import { createCompletionLog } from "@/server/repositories/completion-log-repository";
import { createGoalRepository } from "@/server/repositories/goal-repository";
import { createMemoryRepository } from "@/server/repositories/memory-repository";
import { createProfileRepository } from "@/server/repositories/profile-repository";
import { createRollingPlan } from "@/server/repositories/rolling-plan-repository";
import type { RollingPlanSession } from "@/server/rolling-plan/rolling-plan";
import {
  ROADMAP_FORWARD_LOCKED_WINDOW_DAYS,
  selectTrainingHistoryContext,
  TRAINING_HISTORY_WINDOW_DAYS,
  type TrainingHistoryCompletion,
  type TrainingHistoryPlannedSession,
  type TrainingHistoryRecords,
} from "@/server/training/training-history-context";

/**
 * The production `CoachAIContextSource`: the first and only implementation that
 * reads a real owner's records.
 *
 * M3-11 deleted the legacy database adapter, so until this module existed every
 * implementation of the seam was a test stub or a fixture. That is why this is a
 * new source rather than a rewiring, and why it is the file that decides what
 * owner data can reach a paid external provider.
 *
 * ## What it may read, and how
 *
 * Only through the accepted owner-scoped factories. There is no SQL here, no
 * Supabase client, and no owner id parameter: every factory derives identity
 * from the verified session. `load` is handed a `CoachAIOwner` so that the id
 * the profile read returns can be checked against the id the request was made
 * for, and so the service can repeat that check on what it gets back. The
 * branded owner is never the value any read is scoped by; passing an id in to
 * scope a read would create exactly the confused deputy the brand exists to
 * prevent.
 *
 * ## The completion boundary
 *
 * Completions are the one source this module reshapes itself, and every field is
 * copied one at a time in `toTrainingHistoryCompletion`. Nothing spreads a
 * `Completion`, so a column added to the completion schema later is invisible to
 * a provider until ADR-013 and `training-history-context.ts` change together.
 * The record's `id`, `planSessionId`, `timezoneName`, `revision`, `updatedAt`,
 * `actualStartedAt`, planned snapshot, and per-activity measurements all stay
 * behind: `actualStartedAt` in particular exists on every completion and is
 * coaching-relevant, and the product owner decided on 14 September 2026 to leave
 * it out of the first data that leaves the country.
 *
 * Goals and memory are passed as the repository returns them, which is what
 * `CoachAIGoalRecord` and `MemoryItemView` were accepted as, because assembly
 * reduces both through its own field-by-field allowlist before anything is
 * serialized. Completions have no such second gate — `selectTrainingHistoryContext`
 * is it — which is why they are reduced here instead.
 *
 * ## Why it does not live in `src/server/ai`
 *
 * `server-boundary.test.ts` holds `src/server/ai/owner.ts` as the only file in
 * that module allowed to import a repository, so that no adapter, prompt, or
 * validator can widen the context past what the domain service authorized. This
 * module reads repositories, so putting it there would mean weakening that
 * invariant in the one ticket whose subject is the data boundary. It sits beside
 * the AI's other data-shaping modules instead — `training/training-history-context`,
 * `goals/goal-records`, `memory/memory-records` — all of which are outside
 * `src/server/ai` for the same reason.
 */
export type OwnedRecordsContextSourceOptions = {
  /**
   * Which operation the composition root is building. It selects the accepted
   * per-source limits, and the only thing this module uses them for is deciding
   * which completions will be transmitted; see `#completionSources`.
   */
  operation: CoachAIOperation;
  /** Injected only so a test can pin owner-local today. */
  clock?: () => Date;
};

export class OwnedRecordsCoachAIContextSource implements CoachAIContextSource {
  readonly #operation: CoachAIOperation;
  readonly #clock: () => Date;

  constructor(options: OwnedRecordsContextSourceOptions) {
    this.#operation = options.operation;
    this.#clock = options.clock ?? (() => new Date());
  }

  async load(owner: CoachAIOwner): Promise<CoachAIOwnedRecords> {
    const profile = await (await createProfileRepository()).getCurrentProfile();

    // The identity this source read, checked against the identity it was asked
    // about. Both derive from the same verified session, so they can disagree
    // only if identity was derived twice and differently — which is the case
    // `coach-ai-service`'s own `records.ownerId !== owner.id` guard exists to
    // catch, and which that guard could never catch here while `ownerId` was
    // the caller's own value echoed back. Round 1 of M3-15D's review found that
    // echo; this is what makes the predicate real rather than tautological.
    if (profile !== null && profile.userId !== owner.id) {
      throw new CoachAIError("owner_denied");
    }

    // Every date below is an owner-local calendar date: the eligibility window,
    // the miss list, the forward commitment window. Without a confirmed zone
    // there is no owner-local today to derive them from, and defaulting to the
    // server's zone would silently build a coaching context for the wrong days.
    // This is the same refusal assembly makes for a plan, raised earlier and for
    // both operations, because the source cannot even read the right window.
    if (profile === null || profile.timezoneName === null) {
      throw new CoachAIContextBelowMinimumError(["resolved_timezone"]);
    }
    const timezoneName = profile.timezoneName;

    const today = isoDateInTimezone(this.#clock(), timezoneName);
    const windowStartDate = shiftIsoDate(
      today,
      -(TRAINING_HISTORY_WINDOW_DAYS - 1),
    );
    // The widest forward reach ADR-013 decision 5 permits. Assembly narrows it
    // per operation and per horizon; reading it here means the slice always
    // contains every locked commitment either operation could ask for.
    const forwardEndDate = shiftIsoDate(
      today,
      ROADMAP_FORWARD_LOCKED_WINDOW_DAYS,
    );

    // Four independent owner-scoped reads, issued together rather than as a
    // waterfall. The plan read is the only one with a write side effect.
    const [goals, memory, completions, planWindow] = await Promise.all([
      (await createGoalRepository()).list(),
      (await createMemoryRepository()).list(today),
      (await createCompletionLog()).list(windowStartDate, today),
      // ADR-017 consequence 3: an owner who has not opened the Plan has no
      // materialized occurrences past their last visit, so a coach reading the
      // window untopped plans around sessions the owner does have. M3-15D
      // accepts that write side effect; M3-15C deliberately does not, because
      // viewing history must not materialize future training.
      readPlanWindowToppedUp(
        await createRollingPlan(),
        windowStartDate,
        forwardEndDate,
      ),
    ]);

    const completedPlanSessionIds = new Set(
      completions
        .map((completion) => completion.planSessionId)
        .filter((id): id is string => id !== null),
    );

    // Kept in the same iteration order as `completions`, and kept as object
    // identities rather than ids, so the selection below can name the exact
    // records it transmitted without the allowlisted type carrying an id.
    const byRecord = new Map<TrainingHistoryCompletion, Completion>();
    const trainingCompletions = completions.map((completion) => {
      const entry = toTrainingHistoryCompletion(completion);
      byRecord.set(entry, completion);
      return entry;
    });

    const training: TrainingHistoryRecords = {
      today,
      // Assembly replaces this with the horizon the owner actually composed
      // against; `load` is not given the compose input and must not invent one.
      horizonEndDate: today,
      completions: trainingCompletions,
      plannedSessions: planWindow.slice.sessions
        // A cancelled entry is neither a commitment nor a missed session: it is
        // training the owner called off, and reporting it as either would be a
        // claim about adherence nobody made.
        .filter((session) => session.status === "active")
        .map((session) =>
          toTrainingHistoryPlannedSession(session, completedPlanSessionIds),
        ),
    };

    return {
      // The id the profile read returned, not the one the caller handed in, so
      // the service's ownership guard compares two independently derived values.
      ownerId: profile.userId,
      today,
      goalCollectionRevision: goals.revision,
      memoryCollectionRevision: memory.revision,
      goals: goals.goals,
      memory: memory.items,
      training,
      timezoneName,
      sources: this.#completionSources(training, byRecord),
    };
  }

  /**
   * M3-08's exact-source rule: a proposal's sources are the completions the
   * coach was actually sent, never the eligible ones a byte or count trim read
   * past. A correction to a transmitted completion conflicts with the proposal;
   * a correction to one that never left does not, and recording it as a source
   * would raise a conflict the owner cannot make sense of.
   *
   * Assembly is what trims, and it runs after this. So the selection is run here
   * with the same accepted limits assembly will use, and the result is exact
   * because the completion side of that selection depends only on `today`, the
   * records, the session cap, and the completion byte sub-budget. The horizon
   * and the plan-commitment limits assembly also passes move plan commitments
   * alone. If that ever stops being true, this over-reports, and the compile
   * will not say so — which is why it is stated here and in the ticket's
   * validation record rather than left to be rediscovered.
   */
  #completionSources(
    training: TrainingHistoryRecords,
    byRecord: Map<TrainingHistoryCompletion, Completion>,
  ): CoachAISourceReference[] {
    const limits = COACH_AI_CONTEXT_LIMITS[this.#operation];
    const selection = selectTrainingHistoryContext(training, {
      maxSessions: limits.maxTrainingSessions,
      maxBytes: limits.bytes.trainingHistoryCompletions,
    });

    return selection.includedCompletions.map((entry) => {
      const completion = byRecord.get(entry);
      if (!completion) throw new CoachAIError("context_invalid");
      return {
        kind: "completion",
        recordId: completion.id,
        revisionNumber: completion.revision,
      };
    });
  }
}

/**
 * Copies exactly the fields ADR-013 decision 4 enumerates, one at a time.
 *
 * There is no spread and no pass-through here on purpose: a spread would carry
 * whatever the completion schema gains next straight into a provider payload,
 * and the allowlist would still look correct while doing it. `undefined` becomes
 * `null` because the allowlisted type states absence as null and a key that
 * disappears from the serialized context is a different fact than one that is
 * present and empty.
 */
function toTrainingHistoryCompletion(
  completion: Completion,
): TrainingHistoryCompletion {
  return {
    localDate: completion.actualLocalDate,
    status: completion.status,
    // An unplanned completion has no planned session, so it has no planned
    // title or sport. Reporting null is honest; deriving one from the logged
    // activities would invent a session the owner never planned.
    title: completion.plannedSnapshot?.title ?? null,
    sport: completion.plannedSnapshot?.sport ?? null,
    durationMinutes: completion.durationMinutes ?? null,
    perceivedEffort: completion.perceivedEffort ?? null,
    feeling: completion.feeling ?? null,
    painReported: completion.painReported,
    illnessReported: completion.illnessReported,
    injuryReported: completion.injuryReported,
    severeFatigueReported: completion.severeFatigueReported,
    note: completion.note ?? null,
    replacementDescription: completion.replacementDescription ?? null,
    activityNames: completion.activities.map((activity) => activity.name),
  };
}

function toTrainingHistoryPlannedSession(
  session: RollingPlanSession,
  completedPlanSessionIds: ReadonlySet<string>,
): TrainingHistoryPlannedSession {
  return {
    localDate: session.localDate,
    title: session.title,
    sport: session.sport,
    isLocked: session.isLocked,
    hasCompletion: completedPlanSessionIds.has(session.id),
  };
}
