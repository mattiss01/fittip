import { createHash } from "node:crypto";

import "server-only";

import { isoDateInTimezone, shiftIsoDate } from "@/lib/date/local-date";

import {
  ROLLING_PLAN_CHANGE_SET_LIMIT,
  ROLLING_PLAN_DAILY_SESSION_LIMIT,
  ROLLING_PLAN_WINDOW_DAYS,
  RollingPlanConflictError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
  type ParsedPlanSlice,
  type RollingPlanActivity,
  type RollingPlanAdapter,
  type RollingPlanChangeSet,
  type RollingPlanChangeReceipt,
  type RollingPlanMaterializationReceipt,
  type RollingPlanSeriesEffect,
  type RollingPlanSeriesInput,
  type RollingPlanSession,
  type RollingPlanSkippedOccurrence,
  type RollingPlanSlice,
} from "./rolling-plan";

export type InMemoryRollingPlanOptions = {
  /** The owner's stored zone. Absent means the owner has not confirmed one. */
  timezoneName?: string | null;
  clock?: () => Date;
};

export type InMemoryRollingPlanAdapterHandle = {
  /** Removes the stored zone, as nulling the profile column would. */
  clearTimezone(): void;
};

/** One stored segment: the same columns `rolling_plan_series` holds. */
type StoredSeries = RollingPlanSeriesInput & {
  id: string;
  predecessorSeriesId: string | null;
  sequence: number;
};

export class InMemoryRollingPlanAdapter implements RollingPlanAdapter {
  private planId: string | null = null;
  private revision = 0;
  private sessions = new Map<string, RollingPlanSession>();
  private series = new Map<string, StoredSeries>();
  private recoveryDates = new Set<string>();
  private receipts = new Map<
    string,
    { fingerprint: string; receipt: RollingPlanChangeReceipt }
  >();
  private sequence = 0;
  private timezoneName: string | null;

  constructor(private readonly options: InMemoryRollingPlanOptions = {}) {
    this.timezoneName = options.timezoneName ?? null;
  }

  clearTimezone() {
    this.timezoneName = null;
  }

  async getPlanSlice({
    startDate,
    endDate,
  }: ParsedPlanSlice): Promise<RollingPlanSlice> {
    return {
      planId: this.planId,
      revision: this.revision,
      sessions: [...this.sessions.values()]
        .filter(
          (session) =>
            session.localDate >= startDate && session.localDate <= endDate,
        )
        .sort(
          (left, right) =>
            left.localDate.localeCompare(right.localDate) ||
            left.position - right.position ||
            left.id.localeCompare(right.id),
        )
        .map(cloneSession),
      recoveryDates: [...this.recoveryDates]
        .filter((date) => date >= startDate && date <= endDate)
        .toSorted(),
    };
  }

  async applyChangeSet(
    changeSet: RollingPlanChangeSet,
    expectedPlanRevision: number,
  ) {
    // The zone is read before the replay lookup, matching
    // `apply_rolling_plan_change_set`, which raises PT428 before it looks up an
    // idempotency key. An owner whose stored zone has gone must get the same
    // answer from either adapter, replay or not; the contract pins that.
    const today = this.ownerToday();
    const fingerprint = JSON.stringify({ expectedPlanRevision, ...changeSet });
    const replay = this.receipts.get(changeSet.idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint)
        throw new RollingPlanConflictError();
      return { ...replay.receipt, result: "replayed" as const };
    }
    if (expectedPlanRevision !== this.revision)
      throw new RollingPlanConflictError();

    const next = new Map(
      [...this.sessions].map(([id, session]) => [id, cloneSession(session)]),
    );
    const nextSeries = new Map(
      [...this.series].map(([id, segment]) => [id, cloneSeries(segment)]),
    );
    const nextRecovery = new Set(this.recoveryDates);
    const touchedDates = new Set<string>();
    const seriesEffects: RollingPlanSeriesEffect[] = [];
    let sequence = this.sequence;
    const nextId = (kind: string) => {
      sequence += 1;
      const suffix = sequence.toString(16).padStart(12, "0");
      const kindNibble =
        ({ plan: "1", change: "2", activity: "3" } as Record<string, string>)[
          kind
        ] ?? "4";
      return `00000000-0000-4000-800${kindNibble}-${suffix}`;
    };
    const requirePlannable = (date: string) => {
      if (date < today) throw new RollingPlanRuleError("past-date");
      return date;
    };
    /**
     * ADR-017's removal rule in one place, as the database keeps it in one
     * function: a locked occurrence is kept and left active, a date that has
     * already passed is never in scope, and everything else of that segment
     * from the effective date onward goes, edited or not.
     */
    const sweep = (
      seriesId: string,
      fromDate: string,
      operation: RollingPlanSeriesEffect["operation"],
    ) => {
      let deleted = 0;
      let divergedDeleted = 0;
      let lockedKept = 0;
      for (const session of [...next.values()]) {
        if (
          session.seriesId !== seriesId ||
          session.occurrenceDate === null ||
          session.occurrenceDate < fromDate ||
          session.localDate < today
        ) {
          continue;
        }
        if (session.isLocked) {
          lockedKept += 1;
          continue;
        }
        next.delete(session.id);
        deleted += 1;
        if (session.hasDiverged) divergedDeleted += 1;
      }
      seriesEffects.push({
        seriesId,
        operation,
        deleted,
        divergedDeleted,
        lockedKept,
      });
    };

    for (const change of changeSet.changes) {
      if (change.operation === "set_recovery_day") {
        requirePlannable(change.localDate);
        const labelled = nextRecovery.has(change.localDate);
        if (labelled === change.isRecoveryDay)
          throw new RollingPlanValidationError();
        if (change.isRecoveryDay) nextRecovery.add(change.localDate);
        else nextRecovery.delete(change.localDate);
        continue;
      }
      if (change.operation === "add_series") {
        if (nextSeries.has(change.seriesId))
          throw new RollingPlanValidationError();
        requirePlannable(change.series.startDate);
        sequence += 1;
        nextSeries.set(change.seriesId, {
          ...change.series,
          id: change.seriesId,
          predecessorSeriesId: null,
          sequence,
        });
        continue;
      }
      if (change.operation === "end_series") {
        const segment = nextSeries.get(change.seriesId);
        if (!segment) throw new RollingPlanValidationError();
        requirePlannable(change.effectiveDate);
        const closed = shiftIsoDate(change.effectiveDate, -1);
        if (segment.endDate === closed) throw new RollingPlanValidationError();
        nextSeries.set(change.seriesId, { ...segment, endDate: closed });
        sweep(change.seriesId, change.effectiveDate, "end_series");
        continue;
      }
      if (change.operation === "edit_series") {
        const segment = nextSeries.get(change.seriesId);
        if (!segment) throw new RollingPlanValidationError();
        if (change.effectiveDate === undefined) {
          // No occurrence can precede the segment's own start date, so a
          // segment that still starts today or later has had none.
          if (segment.startDate < today)
            throw new RollingPlanRuleError("series-already-started");
          requirePlannable(change.series.startDate);
          nextSeries.set(change.seriesId, {
            ...segment,
            ...change.series,
            ...(change.series.endDate === undefined ? { endDate: undefined } : {}),
          });
          sweep(
            change.seriesId,
            change.series.startDate < segment.startDate
              ? change.series.startDate
              : segment.startDate,
            "edit_series",
          );
          continue;
        }
        const successorSeriesId = change.successorSeriesId;
        if (
          successorSeriesId === undefined ||
          nextSeries.has(successorSeriesId) ||
          change.effectiveDate <= segment.startDate
        ) {
          throw new RollingPlanValidationError();
        }
        requirePlannable(change.effectiveDate);
        nextSeries.set(change.seriesId, {
          ...segment,
          endDate: shiftIsoDate(change.effectiveDate, -1),
        });
        sequence += 1;
        nextSeries.set(successorSeriesId, {
          ...change.series,
          id: successorSeriesId,
          predecessorSeriesId: change.seriesId,
          sequence,
        });
        sweep(change.seriesId, change.effectiveDate, "edit_series");
        continue;
      }
      const current = next.get(change.sessionId);
      if (change.operation === "add") {
        if (current) throw new RollingPlanValidationError();
        touchedDates.add(requirePlannable(change.session.localDate));
        next.set(change.sessionId, {
          id: change.sessionId,
          ...change.session,
          status: "active",
          cancelledAt: null,
          seriesId: null,
          occurrenceDate: null,
          hasDiverged: false,
          activities: change.session.activities.map((activity) => ({
            ...activity,
            id: nextId("activity"),
          })),
        });
        continue;
      }
      if (!current || current.status !== "active")
        throw new RollingPlanValidationError();
      touchedDates.add(requirePlannable(current.localDate));
      const before = JSON.stringify(current);
      if (change.operation === "edit") {
        Object.assign(current, change.session, {
          activities: change.session.activities.map((activity) => ({
            ...activity,
            id: nextId("activity"),
          })),
        });
      } else if (change.operation === "move") {
        current.localDate = requirePlannable(change.localDate);
        current.position = change.position;
        touchedDates.add(change.localDate);
      } else if (change.operation === "set_lock") {
        current.isLocked = change.isLocked;
      } else {
        current.status = "cancelled";
        current.cancelledAt = "2000-01-01T00:00:00.000Z";
      }
      if (JSON.stringify(current) === before)
        throw new RollingPlanValidationError();
      // ADR-017: an occurrence the owner has changed is diverged from here on.
      if (current.seriesId !== null) current.hasDiverged = true;
    }
    const activeOrders = new Set<string>();
    const activeByDate = new Map<string, number>();
    for (const session of next.values()) {
      if (session.status !== "active") continue;
      const key = `${session.localDate}:${session.position}`;
      if (activeOrders.has(key)) throw new RollingPlanValidationError();
      activeOrders.add(key);
      activeByDate.set(
        session.localDate,
        (activeByDate.get(session.localDate) ?? 0) + 1,
      );
    }
    // The cap is judged on the state the whole change set leaves behind, and
    // only on the dates it touched. A label is not a session and never counts.
    for (const date of touchedDates) {
      if ((activeByDate.get(date) ?? 0) > ROLLING_PLAN_DAILY_SESSION_LIMIT)
        throw new RollingPlanRuleError("daily-session-limit");
    }

    this.planId ??= nextId("plan");
    this.revision += 1;
    this.sessions = next;
    this.series = nextSeries;
    this.recoveryDates = nextRecovery;
    const receipt: RollingPlanChangeReceipt = {
      planId: this.planId,
      planRevision: this.revision,
      changeSetId: nextId("change"),
      result: "applied",
      seriesEffects,
    };
    this.receipts.set(changeSet.idempotencyKey, { fingerprint, receipt });
    this.sequence = sequence;
    return receipt;
  }

  async materializeSeries(
    idempotencyKey: string,
    expectedPlanRevision: number,
  ): Promise<RollingPlanMaterializationReceipt> {
    const today = this.ownerToday();
    const windowEnd = shiftIsoDate(today, ROLLING_PLAN_WINDOW_DAYS - 1);
    const counts = new Map<string, number>();
    const positions = new Map<string, number>();
    const covered = new Set<string>();
    for (const session of this.sessions.values()) {
      if (session.seriesId !== null && session.occurrenceDate !== null) {
        covered.add(`${session.seriesId}|${session.occurrenceDate}`);
      }
      if (
        session.status !== "active" ||
        session.localDate < today ||
        session.localDate > windowEnd
      ) {
        continue;
      }
      counts.set(session.localDate, (counts.get(session.localDate) ?? 0) + 1);
      positions.set(
        session.localDate,
        Math.max(positions.get(session.localDate) ?? -1, session.position),
      );
    }

    const changes: unknown[] = [];
    const skipped: RollingPlanSkippedOccurrence[] = [];
    for (const segment of [...this.series.values()].toSorted(
      (left, right) => left.sequence - right.sequence,
    )) {
      for (const occurrenceDate of seriesDates(segment, today, windowEnd)) {
        if (covered.has(`${segment.id}|${occurrenceDate}`)) continue;
        const held = counts.get(occurrenceDate) ?? 0;
        if (held >= ROLLING_PLAN_DAILY_SESSION_LIMIT) {
          skipped.push({
            seriesId: segment.id,
            occurrenceDate,
            reason: "daily-session-limit",
          });
          continue;
        }
        if (changes.length >= ROLLING_PLAN_CHANGE_SET_LIMIT) {
          skipped.push({
            seriesId: segment.id,
            occurrenceDate,
            reason: "change-set-limit",
          });
          continue;
        }
        const position = (positions.get(occurrenceDate) ?? -1) + 1;
        changes.push({
          operation: "add",
          sessionId: occurrenceId(segment.id, occurrenceDate),
          session: {
            localDate: occurrenceDate,
            position,
            title: segment.title,
            sport: segment.sport,
            ...(segment.intent === undefined ? {} : { intent: segment.intent }),
            ...(segment.expectedDurationMinutes === undefined
              ? {}
              : { expectedDurationMinutes: segment.expectedDurationMinutes }),
            ...(segment.note === undefined ? {} : { note: segment.note }),
            isLocked: false,
            seriesId: segment.id,
            occurrenceDate,
            activities: segment.activities.map((activity) => ({
              ...activity,
              isLocked: false,
            })),
          },
        });
        counts.set(occurrenceDate, held + 1);
        positions.set(occurrenceDate, position);
      }
    }

    // Nothing missing means nothing to write, and the caller learns the current
    // revision instead of being told its own is stale. Two open tabs depend on
    // this, so the revision is compared only when there is work.
    if (changes.length === 0) {
      return {
        planId: this.planId,
        planRevision: this.revision,
        changeSetId: null,
        result: "unchanged",
        createdCount: 0,
        skipped,
      };
    }
    const receipt = await this.applyChangeSet(
      {
        idempotencyKey,
        provenance: "series_expansion",
        changes: changes as RollingPlanChangeSet["changes"],
      },
      expectedPlanRevision,
    );
    // The occurrence identity is written by the materializer alone, so it is
    // stamped here rather than accepted through the parsed change payload.
    for (const change of changes as {
      sessionId: string;
      session: { seriesId: string; occurrenceDate: string };
    }[]) {
      const session = this.sessions.get(change.sessionId);
      if (!session) continue;
      session.seriesId = change.session.seriesId;
      session.occurrenceDate = change.session.occurrenceDate;
    }
    return {
      planId: receipt.planId,
      planRevision: receipt.planRevision,
      changeSetId: receipt.changeSetId,
      result: receipt.result,
      createdCount: changes.length,
      skipped,
    };
  }

  private ownerToday(): string {
    if (!this.timezoneName) throw new RollingPlanTimezoneRequiredError();
    return isoDateInTimezone(
      (this.options.clock ?? (() => new Date()))(),
      this.timezoneName,
    );
  }
}

/**
 * The rule made into dates, bounded by the window it is asked for. Calendar
 * arithmetic only: no instant is ever constructed, so a daylight-saving
 * transition inside the window cannot move or drop an occurrence.
 */
function seriesDates(
  segment: RollingPlanSeriesInput,
  from: string,
  to: string,
): string[] {
  const start = segment.startDate > from ? segment.startDate : from;
  const end =
    segment.endDate !== undefined && segment.endDate < to ? segment.endDate : to;
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftIsoDate(date, 1)) {
    if (segment.frequency === "daily") {
      if (daysBetween(segment.startDate, date) % segment.intervalCount === 0)
        dates.push(date);
      continue;
    }
    const weekdays = segment.weekdays ?? [];
    const elapsedWeeks =
      daysBetween(weekStart(segment.startDate), weekStart(date)) / 7;
    if (
      weekdays.includes(weekday(date)) &&
      elapsedWeeks % segment.intervalCount === 0
    ) {
      dates.push(date);
    }
  }
  return dates;
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function weekday(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
}

/** The Monday of the week holding this date, as `date_trunc('week', ...)` does. */
function weekStart(isoDate: string) {
  return shiftIsoDate(isoDate, -((weekday(isoDate) + 6) % 7));
}

/**
 * Derived from the rule date rather than random, exactly as
 * `rolling_plan_occurrence_id` derives it, so a retried materialization
 * composes a byte-identical request and replays instead of colliding.
 */
function occurrenceId(seriesId: string, occurrenceDate: string) {
  const digest = createHash("sha256")
    .update(`${seriesId}|${occurrenceDate}`)
    .digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function cloneSession(session: RollingPlanSession): RollingPlanSession {
  return {
    ...session,
    activities: session.activities.map((activity: RollingPlanActivity) => ({
      ...activity,
    })),
  };
}

function cloneSeries<T extends RollingPlanSeriesInput>(segment: T): T {
  return {
    ...segment,
    activities: segment.activities.map((activity) => ({ ...activity })),
  };
}
