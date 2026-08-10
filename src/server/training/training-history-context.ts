import "server-only";

import type {
  CoachAICompletionReference,
  CoachAIMissedSessionReference,
  CoachAIPlanCommitmentReference,
  CoachAITrainingHistory,
} from "@/server/ai/contracts";

/**
 * ADR-013: what training history a coaching AI may read.
 *
 * Deny by default, exactly as ADR-012 does for goals. Everything this module
 * emits is enumerated below field by field, so a column added to a completion
 * later is invisible to a provider until this file and ADR-013 change together.
 *
 * Two reductions are approved here and are *bounded reductions, not denials*
 * (decision 7): per-field truncation of free text (decision 4) and per-count
 * trimming of the window (decision 1). Trimming is disclosed — a coach that
 * silently receives a subset reasons as though it saw everything, which is the
 * failure decision 1 exists to prevent. The whole-context byte ceiling remains
 * a denial and lives in `context.ts`.
 */

/** Decision 1: the last 8 weeks of the owner's local dates. */
export const TRAINING_HISTORY_WINDOW_DAYS = 56;

/**
 * Decision 1's session cap, and decisions 4/5's tuning parameters.
 *
 * ADR-013 records these three as tuning parameters that may be amended without
 * reopening the ADR provided the amendment is recorded there. M3-02 sets them
 * for the first time, and the numbers come from the shared synthetic corpus in
 * `docs/decisions/support/m3-01b-bakeoff/` rather than from a guess:
 *
 * - A session in that corpus serializes to 393-625 bytes, mean 511, with
 *   realistic notes of 60-180 characters.
 * - The ADR's drafted 2,000-character `note` allowance is 2,000 bytes for one
 *   session against a 5,000-byte allocation for the whole window. Twenty
 *   sessions at that allowance is 40,000 bytes — eight times the allocation and
 *   more than the entire context ceiling — so the drafted number cannot coexist
 *   with any session count worth having.
 * - 400 characters is two to six times the longest note in the corpus, and the
 *   explaining sentence comes first, so truncation rarely fires and loses
 *   little when it does.
 */
export const TRAINING_HISTORY_MAX_SESSIONS = 20;
export const COMPLETION_NOTE_MAX_LENGTH = 400;
export const REPLACEMENT_DESCRIPTION_MAX_LENGTH = 240;
export const CORRECTION_REASON_MAX_LENGTH = 240;

/**
 * Decision 5: beyond the horizon the coach reads locked entries only, within a
 * bounded forward window. The ADR requires this to be longer for
 * `create_roadmap` than for `create_seven_day_plan`, because a locked race is
 * what a taper is built toward and a roadmap that cannot see it has nothing to
 * aim at.
 */
export const ROADMAP_FORWARD_LOCKED_WINDOW_DAYS = 180;
export const MAX_PLAN_COMMITMENTS = 12;

/** The current revision of one completed session, already owner-scoped. */
export type TrainingHistoryCompletion = {
  localDate: string;
  status: string;
  title: string | null;
  sport: string | null;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  feeling: string | null;
  painReported: boolean;
  illnessReported: boolean;
  injuryReported: boolean;
  severeFatigueReported: boolean;
  note: string | null;
  replacementDescription: string | null;
  correctionReason: string | null;
  activityNames: string[];
};

export type TrainingHistoryPlannedSession = {
  localDate: string;
  title: string;
  sport: string;
  isLocked: boolean;
  /** True when a completion references this planned session. */
  hasCompletion: boolean;
};

export type TrainingHistoryRecords = {
  today: string;
  horizonEndDate: string;
  /**
   * Current revisions only. Decision 2: the coach reads the head and never the
   * correction trail, because superseded values are ones the owner has
   * explicitly declared wrong. Decision 3: a deleted session is simply absent
   * from this list and has no other representation.
   */
  completions: TrainingHistoryCompletion[];
  plannedSessions: TrainingHistoryPlannedSession[];
};

export type TrainingHistorySelection = {
  history: CoachAITrainingHistory;
  planCommitments: CoachAIPlanCommitmentReference[];
  hasSafetySignal: boolean;
};

export function selectTrainingHistoryContext(
  records: TrainingHistoryRecords,
  limits: {
    windowDays?: number;
    maxSessions?: number;
    /**
     * The byte allocation this source may occupy. Reaching it trims further
     * sessions exactly as the count cap does — a bounded reduction under
     * ADR-013 decisions 1 and 7, disclosed through `sessionsIncluded`, never a
     * denial. History is the one source whose size the owner cannot see or
     * curate, so refusing to generate because they trained a lot would be a
     * refusal they could not act on.
     */
    maxBytes?: number;
    forwardLockedWindowDays?: number;
    maxPlanCommitments?: number;
    maxPlanCommitmentBytes?: number;
  } = {},
): TrainingHistorySelection {
  const windowDays = limits.windowDays ?? TRAINING_HISTORY_WINDOW_DAYS;
  const maxSessions = limits.maxSessions ?? TRAINING_HISTORY_MAX_SESSIONS;
  const forwardDays =
    limits.forwardLockedWindowDays ?? ROADMAP_FORWARD_LOCKED_WINDOW_DAYS;
  const maxCommitments = limits.maxPlanCommitments ?? MAX_PLAN_COMMITMENTS;

  const windowStartDate = addDays(records.today, -(windowDays - 1));
  const windowEndDate = records.today;

  const inWindow = records.completions
    .filter(
      (entry) =>
        entry.localDate >= windowStartDate && entry.localDate <= windowEndDate,
    )
    // Newest first, so a count trim keeps the most recent training rather than
    // the oldest. The gap signal decision 1 protects survives either way,
    // because the window's own start date travels.
    .sort((a, b) => b.localDate.localeCompare(a.localDate));

  const included: TrainingHistoryCompletion[] = [];
  const completions: CoachAICompletionReference[] = [];
  let historyBytes = 0;
  for (const entry of inWindow.slice(0, maxSessions)) {
    const reference = toCompletionReference(entry);
    const cost = byteLength(JSON.stringify(reference)) + 1;
    if (
      limits.maxBytes !== undefined &&
      historyBytes + cost > limits.maxBytes
    ) {
      break;
    }
    historyBytes += cost;
    included.push(entry);
    completions.push(reference);
  }

  // Decision 6: planned sessions inside the same window that produced no
  // completion. Sending only the misses is the whole adherence signal at near
  // zero extra cost, and it preserves which sessions went missing.
  const missed = records.plannedSessions
    .filter(
      (entry) =>
        !entry.hasCompletion &&
        entry.localDate >= windowStartDate &&
        entry.localDate < records.today,
    )
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, maxSessions)
    .map(toMissedReference);

  // Decision 5: every entry inside the horizon with its lock state, and beyond
  // it locked entries only, within the bounded forward window.
  const forwardLimit = addDays(records.today, forwardDays);
  const commitments = records.plannedSessions
    .filter((entry) => {
      if (entry.localDate < records.today) return false;
      if (entry.localDate <= records.horizonEndDate) return true;
      return entry.isLocked && entry.localDate <= forwardLimit;
    })
    .sort((a, b) => a.localDate.localeCompare(b.localDate))
    .slice(0, maxCommitments)
    .map(toPlanCommitmentReference)
    .filter((entry, index, all) => {
      const used = all
        .slice(0, index + 1)
        .reduce(
          (total, item) => total + byteLength(JSON.stringify(item)) + 1,
          0,
        );
      return (
        limits.maxPlanCommitmentBytes === undefined ||
        used <= limits.maxPlanCommitmentBytes
      );
    });

  return {
    history: {
      windowStartDate,
      windowEndDate,
      sessionsInWindow: inWindow.length,
      sessionsIncluded: included.length,
      completions,
      missedPlannedSessions: missed,
    },
    planCommitments: commitments,
    // Decision 7 of M3-02: the flag is reported, never classified. Nothing here
    // infers severity, recovery, or elapsed-time clearance, because the model
    // holds no reliable structured state for any of those.
    hasSafetySignal: included.some(
      (entry) =>
        entry.painReported ||
        entry.illnessReported ||
        entry.injuryReported ||
        entry.severeFatigueReported,
    ),
  };
}

/**
 * Copies exactly the allowlisted fields. Nothing spreads the source record, so
 * a column added to a completion cannot ride along.
 */
function toCompletionReference(
  entry: TrainingHistoryCompletion,
): CoachAICompletionReference {
  return {
    localDate: entry.localDate,
    status: entry.status,
    title: entry.title,
    sport: entry.sport,
    durationMinutes: entry.durationMinutes,
    perceivedEffort: entry.perceivedEffort,
    feeling: entry.feeling,
    painReported: entry.painReported,
    illnessReported: entry.illnessReported,
    injuryReported: entry.injuryReported,
    severeFatigueReported: entry.severeFatigueReported,
    note: truncate(entry.note, COMPLETION_NOTE_MAX_LENGTH),
    replacementDescription: truncate(
      entry.replacementDescription,
      REPLACEMENT_DESCRIPTION_MAX_LENGTH,
    ),
    correctionReason: truncate(
      entry.correctionReason,
      CORRECTION_REASON_MAX_LENGTH,
    ),
    activityNames: entry.activityNames
      .slice(0, 12)
      .map((name) => name.slice(0, 120)),
  };
}

function toMissedReference(
  entry: TrainingHistoryPlannedSession,
): CoachAIMissedSessionReference {
  return {
    localDate: entry.localDate,
    title: entry.title.slice(0, 120),
    sport: entry.sport.slice(0, 80),
  };
}

function toPlanCommitmentReference(
  entry: TrainingHistoryPlannedSession,
): CoachAIPlanCommitmentReference {
  return {
    localDate: entry.localDate,
    title: entry.title.slice(0, 120),
    sport: entry.sport.slice(0, 80),
    isLocked: entry.isLocked,
  };
}

/** Truncates from the front, so the explaining sentence survives. */
function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  const clean = value.trim();
  if (clean.length === 0) return null;
  return clean.length <= max ? clean : clean.slice(0, max);
}

/**
 * Local rather than imported from `context.ts`: that module imports this one,
 * and a cycle between the budget and the source it bounds is a cycle nobody
 * wants to reason about at load time.
 */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
