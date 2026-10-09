import "server-only";

import type {
  CoachAICompletionReference,
  CoachAIMissedSessionReference,
  CoachAIPlanCommitmentReference,
  CoachAIRecurringSessionReference,
  CoachAIWeekdayName,
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
 * - A raw corpus session is 393-625 bytes, mean 511. Through the allowlist in
 *   `toCompletionReference` — which drops the id, the timezone and the revision
 *   number, and reduces activities to names — the 24 corpus sessions serialize
 *   to 323-501 bytes, mean 392. The second figure is the one the byte budget
 *   counts, and `context.ts` sizes the completion sub-budget at 20 x 501.
 * - The ADR's drafted 2,000-character `note` allowance is 2,000 bytes for one
 *   session. Twenty sessions at that allowance is 40,000 bytes for one field —
 *   more than the entire context ceiling — so the drafted number cannot coexist
 *   with any session count worth having.
 * - 400 characters is two to six times the longest note in the corpus, and the
 *   explaining sentence comes first, so truncation rarely fires and loses
 *   little when it does.
 */
export const TRAINING_HISTORY_MAX_SESSIONS = 20;
export const COMPLETION_NOTE_MAX_LENGTH = 400;
export const REPLACEMENT_DESCRIPTION_MAX_LENGTH = 240;

/**
 * Decision 5 as amended on 9 October 2026: beyond the horizon the coach reads
 * the entries no series rule describes - a single session, or an occurrence
 * the owner edited or moved - within a bounded forward window. A race months
 * out is what a taper is built toward, and a roadmap that cannot see it has
 * nothing to aim at. Until that day the window carried locked entries only;
 * Lock is gone (owner), so nothing marks one entry out there above another.
 */
export const FORWARD_PLAN_WINDOW_DAYS = 180;
export const MAX_PLAN_COMMITMENTS = 12;
/**
 * Decision 5 as amended on 2 October 2026: the most recurring series sent as
 * rules. They are counted inside the plan-commitment byte allocation.
 */
export const MAX_RECURRING_SESSIONS = 6;

/** The current revision of one completed session, already owner-scoped. */
export type TrainingHistoryCompletion = {
  localDate: string;
  status: string;
  title: string | null;
  sport: string | null;
  durationMinutes: number | null;
  perceivedEffort: number | null;
  painReported: boolean;
  illnessReported: boolean;
  injuryReported: boolean;
  severeFatigueReported: boolean;
  note: string | null;
  replacementDescription: string | null;
  activityNames: string[];
};

export type TrainingHistoryPlannedSession = {
  localDate: string;
  title: string;
  sport: string;
  /** True when a completion references this planned session. */
  hasCompletion: boolean;
  /**
   * The series whose rule still describes this session: an occurrence that is
   * on its rule date and whose content the owner has not edited. `null` for a
   * one-off, and for an occurrence that was edited or moved.
   */
  ruleSeriesId: string | null;
};

/** One effective-dated series segment, already owner-scoped. */
export type TrainingHistorySeries = {
  id: string;
  title: string;
  sport: string;
  frequency: "daily" | "weekly";
  intervalCount: number;
  /** Weekly only: 0 is Sunday through 6 is Saturday. */
  weekdays: number[] | null;
  startDate: string;
  endDate: string | null;
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
  /**
   * Empty unless the operation sends rules. A source that reads no series
   * simply gets every occurrence as the dated entry it always was.
   */
  series: TrainingHistorySeries[];
};

export type TrainingHistorySelection = {
  history: CoachAITrainingHistory;
  planCommitments: CoachAIPlanCommitmentReference[];
  recurringSessions: CoachAIRecurringSessionReference[];
  hasSafetySignal: boolean;
  /**
   * The input records this selection actually transmitted, in the order it
   * transmitted them. They are the very objects the caller passed in, so a
   * caller holding a map from them to its own rows can say which rows reached
   * a provider without the allowlist ever gaining an id field.
   *
   * That is the whole reason this exists: M3-08's exact-source rule needs the
   * transmitted set, `history.completions` is the redacted form and carries no
   * identity, and giving `TrainingHistoryCompletion` an id would put one field
   * more than ADR-013 enumerates within reach of `toCompletionReference`.
   * Nothing serializes this field; only `history` crosses the boundary.
   */
  includedCompletions: TrainingHistoryCompletion[];
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
    forwardWindowDays?: number;
    maxPlanCommitments?: number;
    /** Shared by the rules and the dated entries, rules first. */
    maxPlanCommitmentBytes?: number;
    /**
     * Zero unless a caller asks for rules. Deny by default: an operation that
     * was never approved to send a recurrence sends none.
     */
    maxRecurringSessions?: number;
  } = {},
): TrainingHistorySelection {
  const windowDays = limits.windowDays ?? TRAINING_HISTORY_WINDOW_DAYS;
  const maxSessions = limits.maxSessions ?? TRAINING_HISTORY_MAX_SESSIONS;
  const forwardDays = limits.forwardWindowDays ?? FORWARD_PLAN_WINDOW_DAYS;
  const maxCommitments = limits.maxPlanCommitments ?? MAX_PLAN_COMMITMENTS;
  const maxRecurring = limits.maxRecurringSessions ?? 0;

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

  // Decision 5 as amended on 9 October 2026: every entry inside the horizon,
  // and beyond it the entries no series rule describes, within the bounded
  // forward window. An unchanged occurrence out there is one of thirteen weeks
  // of identical lines, and the roadmap already has its series as a rule.
  const forwardLimit = addDays(records.today, forwardDays);
  const eligible = records.plannedSessions
    .filter((entry) => {
      if (entry.localDate < records.today) return false;
      if (entry.localDate <= records.horizonEndDate) return true;
      return entry.ruleSeriesId === null && entry.localDate <= forwardLimit;
    })
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const byteBudget = limits.maxPlanCommitmentBytes ?? Number.POSITIVE_INFINITY;
  const costOf = (value: unknown) => byteLength(JSON.stringify(value)) + 1;

  let commitments: CoachAIPlanCommitmentReference[];
  const recurringSessions: CoachAIRecurringSessionReference[] = [];

  if (maxRecurring === 0) {
    // No rules: the nearest eligible entries, then a byte trim.
    commitments = eligible
      .slice(0, maxCommitments)
      .map(toPlanCommitmentReference)
      .filter((entry, index, all) => {
        const used = all
          .slice(0, index + 1)
          .reduce((total, item) => total + costOf(item), 0);
        return used <= byteBudget;
      });
  } else {
    // Decision 5 as amended on 2 and 9 October 2026. One allocation, filled
    // in two steps:
    //
    // 1. Rules, one per series running inside the horizon.
    // 2. Dated entries no sent rule already describes, nearest first.
    //
    // Locked entries were fitted before both until Lock was removed. Without
    // it the nearest entries win, so more single sessions than the list holds
    // cut the furthest one, a race included.
    let used = 0;
    const kept: TrainingHistoryPlannedSession[] = [];

    // A series that only starts after the horizon is the speculation
    // decision 5 already calls noise; one that has ended is history; and one
    // ended from its own first day has an end before its start and describes
    // nothing. Earliest first, so a trim keeps what is already running. A rule
    // too large for what is left is passed over rather than ending the loop,
    // and its occurrences then stay dated entries below.
    const sentSeriesIds = new Set<string>();
    for (const series of records.series
      .filter(
        (entry) =>
          entry.startDate <= records.horizonEndDate &&
          (entry.endDate === null ||
            (entry.endDate >= records.today &&
              entry.endDate >= entry.startDate)),
      )
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
      )
      .slice(0, maxRecurring)) {
      const reference = toRecurringSessionReference(series);
      const cost = costOf(reference);
      if (used + cost > byteBudget) continue;
      used += cost;
      sentSeriesIds.add(series.id);
      recurringSessions.push(reference);
    }

    for (const entry of eligible) {
      if (kept.length >= maxCommitments) break;
      if (
        entry.ruleSeriesId !== null &&
        sentSeriesIds.has(entry.ruleSeriesId)
      ) {
        continue;
      }
      const cost = costOf(toPlanCommitmentReference(entry));
      if (used + cost > byteBudget) break;
      used += cost;
      kept.push(entry);
    }

    commitments = kept.map(toPlanCommitmentReference);
  }

  return {
    includedCompletions: included,
    history: {
      windowStartDate,
      windowEndDate,
      sessionsInWindow: inWindow.length,
      sessionsIncluded: included.length,
      completions,
      missedPlannedSessions: missed,
    },
    planCommitments: commitments,
    recurringSessions,
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
    painReported: entry.painReported,
    illnessReported: entry.illnessReported,
    injuryReported: entry.injuryReported,
    severeFatigueReported: entry.severeFatigueReported,
    note: truncate(entry.note, COMPLETION_NOTE_MAX_LENGTH),
    replacementDescription: truncate(
      entry.replacementDescription,
      REPLACEMENT_DESCRIPTION_MAX_LENGTH,
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
  };
}

const WEEKDAY_NAMES: readonly CoachAIWeekdayName[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Copies exactly the fields the amendment enumerates. The series' intent,
 * note, expected duration and activities are not eligible and are not read.
 */
function toRecurringSessionReference(
  entry: TrainingHistorySeries,
): CoachAIRecurringSessionReference {
  return {
    title: entry.title.slice(0, 120),
    sport: entry.sport.slice(0, 80),
    frequency: entry.frequency,
    intervalCount: entry.intervalCount,
    weekdays:
      entry.frequency === "weekly" && entry.weekdays !== null
        ? entry.weekdays
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            .map((day) => WEEKDAY_NAMES[day])
        : null,
    startDate: entry.startDate,
    endDate: entry.endDate,
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
