import "server-only";

import { isoDateInTimezone } from "@/lib/date/local-date";

import {
  ROLLING_PLAN_DAILY_SESSION_LIMIT,
  RollingPlanConflictError,
  RollingPlanRuleError,
  RollingPlanTimezoneRequiredError,
  RollingPlanValidationError,
  type ParsedPlanSlice,
  type RollingPlanActivity,
  type RollingPlanAdapter,
  type RollingPlanChangeSet,
  type RollingPlanChangeReceipt,
  type RollingPlanSession,
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

export class InMemoryRollingPlanAdapter implements RollingPlanAdapter {
  private planId: string | null = null;
  private revision = 0;
  private sessions = new Map<string, RollingPlanSession>();
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
    const nextRecovery = new Set(this.recoveryDates);
    const touchedDates = new Set<string>();
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
      const current = next.get(change.sessionId);
      if (change.operation === "add") {
        if (current) throw new RollingPlanValidationError();
        touchedDates.add(requirePlannable(change.session.localDate));
        next.set(change.sessionId, {
          id: change.sessionId,
          ...change.session,
          status: "active",
          cancelledAt: null,
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
    this.recoveryDates = nextRecovery;
    const receipt: RollingPlanChangeReceipt = {
      planId: this.planId,
      planRevision: this.revision,
      changeSetId: nextId("change"),
      result: "applied",
    };
    this.receipts.set(changeSet.idempotencyKey, { fingerprint, receipt });
    this.sequence = sequence;
    return receipt;
  }

  private ownerToday(): string {
    if (!this.timezoneName) throw new RollingPlanTimezoneRequiredError();
    return isoDateInTimezone(
      (this.options.clock ?? (() => new Date()))(),
      this.timezoneName,
    );
  }
}

function cloneSession(session: RollingPlanSession): RollingPlanSession {
  return {
    ...session,
    activities: session.activities.map((activity: RollingPlanActivity) => ({
      ...activity,
    })),
  };
}
